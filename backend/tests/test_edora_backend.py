"""Edora v2 backend regression suite (iteration 2 — post-fix re-test)."""
import os
import re
import time
import uuid
import pytest
import requests

from conftest import API, TEACHER, STUDENT, blueprint


# ── health ──
def test_health(anon_client):
    r = anon_client.get(f"{API}/", timeout=30)
    assert r.status_code == 200
    assert r.json()["service"] == "edora-v2"


# ── auth ──
class TestAuth:
    def test_login_teacher_sets_httponly_cookies(self, anon_client):
        r = anon_client.post(f"{API}/auth/login", json=TEACHER, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["username"] == TEACHER["username"]
        assert data["role"] == "teacher"
        raw = "; ".join(r.headers.get_all("Set-Cookie")) if hasattr(r.headers, "get_all") \
            else r.headers.get("Set-Cookie", "")
        assert "access_token" in raw
        assert "HttpOnly" in raw
        assert "refresh_token" in r.cookies or "refresh_token" in raw

    def test_login_invalid_password(self, anon_client):
        r = anon_client.post(f"{API}/auth/login",
                             json={"username": TEACHER["username"], "password": "wrong-pass"}, timeout=30)
        assert r.status_code == 401
        assert "detail" in r.json()

    def test_me_requires_auth(self):
        s = requests.Session()
        r = s.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401

    def test_me_teacher(self, teacher_client):
        r = teacher_client.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["role"] == "teacher"
        assert "password_hash" not in d
        assert "_id" not in d
        assert isinstance(d["id"], str)

    def test_bcrypt_hash_format(self):
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        from dotenv import dotenv_values
        env = dotenv_values("/app/backend/.env")

        async def _check():
            c = AsyncIOMotorClient(env["MONGO_URL"])
            return await c[env["DB_NAME"]].users.find_one({"username": TEACHER["username"]})

        u = asyncio.run(_check())
        assert u is not None, "teacher user not seeded"
        assert u["password_hash"].startswith("$2b$"), u["password_hash"][:6]

    def test_brute_force_lockout_423(self):
        """5 consecutive failed logins for the same email must return 423."""
        s = requests.Session()
        email = f"TEST_lock_{uuid.uuid4().hex[:8]}@edora.io"
        codes = []
        for _ in range(6):
            r = s.post(f"{API}/auth/login",
                       json={"username": email, "password": "bad-pass-x"}, timeout=30)
            codes.append(r.status_code)
        assert 423 in codes, f"no 423 lockout, codes={codes}"

    def test_register_cannot_escalate_to_teacher(self):
        """SECURITY: public register with role=teacher must yield a student."""
        s = requests.Session()
        email = f"TEST_esc_{uuid.uuid4().hex[:8]}@edora.io"
        r = s.post(f"{API}/auth/register",
                   json={"name": "TEST_Escalate", "email": email,
                         "password": "Passw0rd!", "role": "teacher"}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["role"] == "student", d
        # the new account must not be able to use teacher endpoints
        me = s.get(f"{API}/auth/me", timeout=30)
        assert me.status_code == 200 and me.json()["role"] == "student"
        assert s.get(f"{API}/dashboard/stats", timeout=30).status_code == 403


class TestRoleGuard:
    @pytest.mark.parametrize("path", ["/dashboard/stats", "/exams", "/attempts",
                                      "/analytics", "/questions/stats"])
    def test_student_blocked_get(self, student_client, path):
        r = student_client.get(f"{API}{path}", timeout=30)
        assert r.status_code == 403, f"{path} -> {r.status_code}"

    def test_student_blocked_generate(self, student_client):
        r = student_client.post(f"{API}/exams/generate",
                                json=blueprint("Mathematics"), timeout=60)
        assert r.status_code == 403

    def test_anon_blocked(self):
        s = requests.Session()
        assert s.get(f"{API}/dashboard/stats", timeout=30).status_code == 401
        assert s.get(f"{API}/curriculum", timeout=30).status_code == 401


# ── curriculum / bank ──
class TestCurriculum:
    def test_curriculum(self, teacher_client):
        r = teacher_client.get(f"{API}/curriculum", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert len(d["subjects"]) > 0
        assert "Mathematics" in d["subjects"]
        assert len(d["chapters"]["Mathematics"]) > 0

    def test_question_stats_six_types(self, teacher_client):
        r = teacher_client.get(f"{API}/questions/stats", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["total"] > 700, d["total"]
        expected = {"MCQ", "Assertion Reason", "Very Short Answer",
                    "Short Answer", "Long Answer", "Case Study"}
        assert expected.issubset(set(d["byType"].keys())), d["byType"]


# ── generation ──
class TestGeneration:
    def test_generate_variants_compliance_and_types(self, teacher_client):
        r = teacher_client.post(f"{API}/exams/generate",
                                json=blueprint("Mathematics", marks=40, variants=3), timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["variants"]) == 3
        assert d["poolSize"] > 0
        types_seen = set()
        for v in d["variants"]:
            assert v["compliance"]["marksMatch"] >= 95, v["compliance"]
            assert v["totalQuestionsSelected"] > 0
            for q in v["questions"]:
                types_seen.add(q["questionType"])
        assert len(types_seen) >= 4, types_seen

    def test_generate_diversity_low_overlap(self, teacher_client):
        r = teacher_client.post(f"{API}/exams/generate",
                                json=blueprint("Mathematics", marks=40, variants=2), timeout=90)
        assert r.status_code == 200
        sim = r.json()["variants"][0]["similarity"]
        assert sim, "no similarity reported"
        assert all(s["overlap"] <= 30 for s in sim), sim

    def test_generate_not_deterministic(self, teacher_client):
        bp = blueprint("Mathematics", marks=40, variants=1)
        a = teacher_client.post(f"{API}/exams/generate", json=bp, timeout=90).json()
        b = teacher_client.post(f"{API}/exams/generate", json=bp, timeout=90).json()
        ida = [q["qid"] for q in a["variants"][0]["questions"]]
        idb = [q["qid"] for q in b["variants"][0]["questions"]]
        assert ida != idb, "same blueprint produced identical paper (deterministic)"

    def test_generate_seed_reproducible(self, teacher_client):
        bp = blueprint("Mathematics", marks=40, variants=1, seed=424242)
        a = teacher_client.post(f"{API}/exams/generate", json=bp, timeout=90).json()
        b = teacher_client.post(f"{API}/exams/generate", json=bp, timeout=90).json()
        assert [q["qid"] for q in a["variants"][0]["questions"]] == \
               [q["qid"] for q in b["variants"][0]["questions"]]

    def test_generate_bad_curriculum_400(self, teacher_client):
        r = teacher_client.post(f"{API}/exams/generate", json=blueprint("NoSuchSubject"), timeout=60)
        assert r.status_code == 400

    def test_generate_flat_payload_422(self, teacher_client):
        """NEW CONTRACT: nested blueprint only; a flat payload must 422 with friendly detail."""
        flat = {"name": "TEST_flat", "subject": "Mathematics", "chapters": [],
                "totalMarks": 40, "duration": 90,
                "difficulty": {"easy": 30, "medium": 50, "hard": 20},
                "questionTypes": {"mcq": 20, "assertion": 10, "veryShort": 15,
                                  "short": 25, "long": 15, "caseStudy": 15},
                "variants": 2, "seed": None}
        r = teacher_client.post(f"{API}/exams/generate", json=flat, timeout=60)
        assert r.status_code == 422, r.text
        assert "detail" in r.json()


# ── publish + security + student flow ──
@pytest.fixture(scope="module")
def published_exam():
    """Publish the exact previewed variant as teacher; returns code + preview."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json=TEACHER, timeout=30)
    assert r.status_code == 200
    bp = blueprint("Mathematics", marks=20, variants=2, seed=987654)
    g = s.post(f"{API}/exams/generate", json=bp, timeout=90)
    assert g.status_code == 200, g.text
    preview = g.json()["variants"][0]
    qids = [q["qid"] for q in preview["questions"]]
    p = s.post(f"{API}/exams/publish",
               json={"blueprint": bp, "variantIndex": 0, "variantLabel": "A", "qids": qids},
               timeout=90)
    assert p.status_code == 200, p.text
    return {"session": s, "code": p.json()["code"], "publish": p.json(),
            "preview": preview, "qids": qids}


class TestPublish:
    def test_publish_returns_code(self, published_exam):
        d = published_exam["publish"]
        assert re.fullmatch(r"[A-Z0-9]{6}", d["code"]), d
        assert d["questionCount"] == len(published_exam["qids"])
        assert d["totalMarks"] > 0

    def test_published_matches_preview(self, published_exam):
        s, code = published_exam["session"], published_exam["code"]
        exam = s.get(f"{API}/exams/{code}", timeout=30).json()
        assert [q["qid"] for q in exam["questions"]] == published_exam["qids"]

    def test_publish_variant_index_1_matches_preview(self, teacher_client):
        bp = blueprint("Mathematics", marks=20, variants=2, seed=13579)
        g = teacher_client.post(f"{API}/exams/generate", json=bp, timeout=90).json()
        v1 = g["variants"][1]
        qids = [q["qid"] for q in v1["questions"]]
        p = teacher_client.post(f"{API}/exams/publish",
                                json={"blueprint": bp, "variantIndex": 1,
                                      "variantLabel": "B", "qids": qids}, timeout=90)
        assert p.status_code == 200, p.text
        exam = teacher_client.get(f"{API}/exams/{p.json()['code']}", timeout=30).json()
        assert [q["qid"] for q in exam["questions"]] == qids
        assert exam["variantLabel"] == "B"

    def test_publish_without_qids_400(self, teacher_client):
        bp = blueprint("Mathematics", marks=20, variants=1)
        r = teacher_client.post(f"{API}/exams/publish",
                                json={"blueprint": bp, "variantIndex": 0, "qids": []}, timeout=60)
        assert r.status_code == 400, r.text

    def test_exam_appears_in_list(self, published_exam):
        s, code = published_exam["session"], published_exam["code"]
        r = s.get(f"{API}/exams", timeout=30)
        assert r.status_code == 200
        assert code in [e["code"] for e in r.json()]

    def test_get_exam_404(self, teacher_client):
        assert teacher_client.get(f"{API}/exams/ZZZZZZ", timeout=30).status_code == 404


class TestStudentSecurity:
    def test_start_hides_answer_keys(self, published_exam):
        s = requests.Session()
        r = s.post(f"{API}/student/start",
                   json={"code": published_exam["code"], "studentName": "TEST_Sec"}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("attemptToken"), "no attemptToken returned"
        for q in d["exam"]["questions"]:
            assert "correctAnswer" not in q, q
            assert "answer" not in q, q
            assert set(q.keys()) <= {"qid", "question", "options", "marks",
                                     "questionType", "difficulty", "objective"}
        assert "correctAnswer" not in r.text

    def test_start_invalid_code_404(self):
        s = requests.Session()
        r = s.post(f"{API}/student/start",
                   json={"code": "BADXXX", "studentName": "TEST_x"}, timeout=30)
        assert r.status_code == 404

    def test_malformed_object_id_returns_404(self, teacher_client, published_exam):
        bad = "not-an-objectid"
        assert teacher_client.get(f"{API}/attempts/{bad}", timeout=30).status_code == 404
        s = requests.Session()
        r1 = s.post(f"{API}/student/{bad}/integrity",
                    json={"type": "copy", "token": "x"}, timeout=30)
        assert r1.status_code == 404, r1.status_code
        r2 = s.post(f"{API}/student/{bad}/submit",
                    json={"token": "x", "answers": {}}, timeout=30)
        assert r2.status_code == 404, r2.status_code

    def test_mutations_require_matching_token(self, published_exam):
        s = requests.Session()
        start = s.post(f"{API}/student/start",
                       json={"code": published_exam["code"],
                             "studentName": "TEST_Token"}, timeout=30).json()
        aid = start["attemptId"]
        # wrong token -> 403
        r = s.post(f"{API}/student/{aid}/integrity",
                   json={"type": "copy", "token": "wrong-token"}, timeout=30)
        assert r.status_code == 403, r.text
        r = s.post(f"{API}/student/{aid}/submit",
                   json={"token": "wrong-token", "answers": {}}, timeout=60)
        assert r.status_code == 403, r.text
        # missing token -> 422 (validation)
        r = s.post(f"{API}/student/{aid}/integrity", json={"type": "copy"}, timeout=30)
        assert r.status_code == 422, r.status_code
        # correct token -> 200
        r = s.post(f"{API}/student/{aid}/integrity",
                   json={"type": "copy", "token": start["attemptToken"]}, timeout=30)
        assert r.status_code == 200, r.text

    def test_student_cannot_set_integrity_score(self, published_exam, teacher_client):
        s = requests.Session()
        start = s.post(f"{API}/student/start",
                       json={"code": published_exam["code"], "studentName": "TEST_Integrity",
                             "integrityScore": 100}, timeout=30).json()
        aid, tok = start["attemptId"], start["attemptToken"]
        for t in ("tab_switch", "copy", "refresh"):
            r = s.post(f"{API}/student/{aid}/integrity", json={"type": t, "token": tok}, timeout=30)
            assert r.status_code == 200, r.text
        assert r.json()["integrityScore"] == 80, r.json()
        att = teacher_client.get(f"{API}/attempts/{aid}", timeout=30).json()
        assert att["integrityScore"] == 80
        assert att["tabSwitches"] == 1
        assert len(att["integrityEvents"]) == 3
        assert "token" not in att, "attempt token leaked to teacher API"


class TestGradingFlow:
    """End-to-end student submission with real LLM grading."""

    @pytest.fixture(scope="class")
    def submission(self, published_exam):
        s = requests.Session()
        start = s.post(f"{API}/student/start",
                       json={"code": published_exam["code"], "studentName": "TEST_Grader"},
                       timeout=30)
        assert start.status_code == 200, start.text
        d = start.json()
        aid, tok = d["attemptId"], d["attemptToken"]
        questions = d["exam"]["questions"]
        answers = {}
        for q in questions:
            if q.get("objective") and q.get("options"):
                answers[q["qid"]] = "A"
            else:
                answers[q["qid"]] = ("The key idea is explained step by step with the relevant "
                                     "formula, substitution and a clear final conclusion.")
        t0 = time.time()
        r = s.post(f"{API}/student/{aid}/submit",
                   json={"token": tok, "answers": answers}, timeout=300)
        return {"attemptId": aid, "token": tok, "resp": r, "elapsed": time.time() - t0,
                "questions": questions}

    def test_submit_scores(self, submission):
        r = submission["resp"]
        assert r.status_code == 200, r.text[:500]
        d = r.json()
        sc = d["score"]
        assert sc["maxMarks"] > 0
        assert 0 <= sc["marksObtained"] <= sc["maxMarks"]
        assert 0 <= sc["percentage"] <= 100
        assert len(d["details"]) == len(submission["questions"])
        assert d["integrityScore"] == 100

    def test_ai_graded_descriptives(self, submission):
        d = submission["resp"].json()
        desc = [x for x in d["details"] if x["method"] != "auto"]
        if not desc:
            pytest.skip("no descriptive questions in this paper")
        assert d["aiGraded"] > 0, f"no AI grading happened: {desc[:2]}"
        for x in desc:
            assert x["method"] == "ai", x
            assert x["feedback"] and "Grading error" not in x["feedback"], x
            assert 0 <= x["awarded"] <= x["maxMarks"]

    def test_objective_graded_server_side(self, submission):
        d = submission["resp"].json()
        auto = [x for x in d["details"] if x["method"] == "auto"]
        for x in auto:
            assert (x["awarded"] == x["maxMarks"]) == x["correct"]

    def test_double_submit_rejected(self, submission):
        s = requests.Session()
        r = s.post(f"{API}/student/{submission['attemptId']}/submit",
                   json={"token": submission["token"], "answers": {}}, timeout=60)
        assert r.status_code == 400, r.status_code

    def test_attempt_visible_to_teacher(self, submission, teacher_client):
        r = teacher_client.get(f"{API}/attempts", timeout=30)
        assert r.status_code == 200
        rows = [a for a in r.json() if a["id"] == submission["attemptId"]]
        assert rows, "attempt missing from teacher list"
        a = rows[0]
        assert a["status"] == "submitted"
        assert a["score"]["maxMarks"] > 0
        assert a["studentName"] == "TEST_Grader"
        detail = teacher_client.get(f"{API}/attempts/{submission['attemptId']}", timeout=30).json()
        assert "_id" not in detail
        assert detail["gradedDetails"]
        assert detail["aiGradedCount"] >= 0

    def test_dashboard_reflects_real_data(self, submission, teacher_client):
        r = teacher_client.get(f"{API}/dashboard/stats", timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert d["questionsInBank"] > 700
        assert d["totalExams"] >= 1
        assert d["submissions"] >= 1
        assert d["avgScore"] > 0
        assert d["activeStudents"] >= 1
        assert isinstance(d["recentExams"], list) and d["recentExams"]

    def test_analytics(self, submission, teacher_client):
        r = teacher_client.get(f"{API}/analytics", timeout=120)
        assert r.status_code == 200
        d = r.json()
        assert d["totalSubmissions"] >= 1
        assert sum(d["scoreDistribution"].values()) == d["totalSubmissions"]
        assert sum(d["integrityDistribution"].values()) == d["totalSubmissions"]
        assert isinstance(d["insight"], str)
        assert d["insight"].strip(), "AI insight empty"

    def test_analytics_insight_cached(self, submission, teacher_client):
        t0 = time.time()
        a = teacher_client.get(f"{API}/analytics", timeout=120).json()
        first = time.time() - t0
        t1 = time.time()
        b = teacher_client.get(f"{API}/analytics", timeout=120).json()
        second = time.time() - t1
        assert a["insight"] == b["insight"], "cached insight changed between calls"
        print(f"analytics timings first={first:.2f}s cached={second:.2f}s")
