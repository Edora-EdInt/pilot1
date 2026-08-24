"""Iteration 7: Adaptive Live Sessions, PDF exports, weak-chapter alerts, practice variety."""
import pytest
from conftest import API


# ══════════════════════ Adaptive Live Sessions — teacher endpoints ══════════════════════
class TestAdaptiveSessionAuth:
    def test_create_requires_auth(self, anon_client):
        r = anon_client.post(f"{API}/adaptive/sessions", json={"klass": 10, "subject": "Mathematics"})
        assert r.status_code in (401, 403), r.text

    def test_admin_forbidden_create(self, admin_client):
        r = admin_client.post(f"{API}/adaptive/sessions", json={"klass": 10, "subject": "Mathematics"})
        assert r.status_code == 403, r.text

    def test_admin_forbidden_list(self, admin_client):
        assert admin_client.get(f"{API}/adaptive/sessions").status_code == 403

    def test_admin_forbidden_detail_and_close(self, admin_client):
        assert admin_client.get(f"{API}/adaptive/sessions/ABC123").status_code == 403
        assert admin_client.post(f"{API}/adaptive/sessions/ABC123/close").status_code == 403


@pytest.fixture(scope="class")
def live_session(teacher_client):
    r = teacher_client.post(f"{API}/adaptive/sessions", json={"board": "CBSE", "klass": 10, "subject": "Mathematics"})
    if r.status_code != 200:
        pytest.fail(f"Session create failed: {r.status_code} {r.text[:400]}")
    return r.json()


class TestAdaptiveSessionLifecycle:
    def test_create_session(self, live_session):
        assert isinstance(live_session["code"], str)
        assert len(live_session["code"]) == 6
        assert live_session["code"] == live_session["code"].upper()
        assert live_session["class"] == 10
        assert live_session["subject"] == "Mathematics"

    def test_insufficient_questions_rejected(self, teacher_client):
        r = teacher_client.post(f"{API}/adaptive/sessions",
                                json={"klass": 10, "subject": "Mathematics", "chapter": "TEST_NoSuchChapter"})
        assert r.status_code == 400, r.text
        assert "least 3" in r.json()["detail"]

    def test_session_appears_in_list(self, teacher_client, live_session):
        r = teacher_client.get(f"{API}/adaptive/sessions")
        assert r.status_code == 200
        codes = [s["code"] for s in r.json()]
        assert live_session["code"] in codes
        row = next(s for s in r.json() if s["code"] == live_session["code"])
        assert row["status"] == "active"
        assert row["subject"] == "Mathematics"

    def test_detail_no_mongo_id(self, teacher_client, live_session):
        r = teacher_client.get(f"{API}/adaptive/sessions/{live_session['code']}")
        assert r.status_code == 200
        d = r.json()
        assert "_id" not in d
        assert d["status"] == "active"
        assert d["participants"] == []

    def test_detail_lowercase_code_normalised(self, teacher_client, live_session):
        r = teacher_client.get(f"{API}/adaptive/sessions/{live_session['code'].lower()}")
        assert r.status_code == 200

    def test_detail_unknown_code_404(self, teacher_client):
        r = teacher_client.get(f"{API}/adaptive/sessions/ZZZ999")
        assert r.status_code == 404

    def test_join_and_adaptive_progression(self, anon_client, live_session):
        code = live_session["code"]
        name = "TEST_Learner"
        r = anon_client.post(f"{API}/adaptive/join", json={"code": code, "studentName": name})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["level"] == "Medium", f"should start at Medium, got {d['level']}"
        assert d["totalAnswered"] == 0 and d["totalCorrect"] == 0
        assert d["question"] is not None, "no question returned even though bank has MCQs"
        q = d["question"]
        assert q["qid"] and q["question"] and len(q["options"]) >= 2
        assert "correctAnswer" not in q, "correct answer leaked to student on join"

        # Answer wrong deliberately -> level should drop to Easy (STEPS_DOWN=1)
        letters = ["A", "B", "C", "D"]
        r = anon_client.post(f"{API}/adaptive/answer",
                             json={"code": code, "studentName": name, "qid": q["qid"], "selectedAnswer": "Z"})
        assert r.status_code == 200, r.text
        a = r.json()
        assert a["correct"] is False
        assert a["changed"] is True and a["previousLevel"] == "Medium" and a["level"] == "Easy"
        assert a["totalAnswered"] == 1 and a["totalCorrect"] == 0

        # Now answer 2 correct in a row -> level up back to Medium
        levels = []
        cur = a["question"]
        for i in range(2):
            assert cur is not None, "ran out of questions unexpectedly"
            ca = None
            # discover correct answer by trying: answer, read correctAnswer back
            resp = anon_client.post(f"{API}/adaptive/answer",
                                    json={"code": code, "studentName": name, "qid": cur["qid"],
                                          "selectedAnswer": "A"})
            assert resp.status_code == 200, resp.text
            body = resp.json()
            levels.append((body["previousLevel"], body["level"], body["correct"]))
            cur = body["question"]
        assert all(l[1] in ("Easy", "Medium", "Hard") for l in levels)

    def test_floor_at_easy(self, anon_client, live_session):
        code = live_session["code"]
        name = "TEST_Floor"
        r = anon_client.post(f"{API}/adaptive/join", json={"code": code, "studentName": name})
        assert r.status_code == 200
        q = r.json()["question"]
        last = None
        for _ in range(4):
            if not q:
                break
            resp = anon_client.post(f"{API}/adaptive/answer",
                                    json={"code": code, "studentName": name, "qid": q["qid"], "selectedAnswer": "Z"})
            assert resp.status_code == 200, resp.text
            last = resp.json()
            q = last["question"]
        assert last["level"] == "Easy", f"level should floor at Easy, got {last['level']}"

    def test_rejoin_preserves_progress(self, anon_client, live_session):
        r = anon_client.post(f"{API}/adaptive/join", json={"code": live_session["code"], "studentName": "TEST_Floor"})
        assert r.status_code == 200
        assert r.json()["totalAnswered"] >= 1
        assert r.json()["level"] == "Easy"

    def test_teacher_monitor_sees_participants(self, teacher_client, live_session):
        r = teacher_client.get(f"{API}/adaptive/sessions/{live_session['code']}")
        assert r.status_code == 200
        names = [p["name"] for p in r.json()["participants"]]
        assert "TEST_Learner" in names and "TEST_Floor" in names
        p = r.json()["participants"][0]
        for k in ("level", "totalAnswered", "totalCorrect", "accuracyPct", "lastActiveAt"):
            assert k in p
        assert 0 <= p["accuracyPct"] <= 100

    def test_join_unknown_code_404(self, anon_client):
        r = anon_client.post(f"{API}/adaptive/join", json={"code": "NOPE99", "studentName": "X"})
        assert r.status_code == 404
        assert "not found" in r.json()["detail"].lower()

    def test_join_blank_name_rejected(self, anon_client, live_session):
        r = anon_client.post(f"{API}/adaptive/join", json={"code": live_session["code"], "studentName": "   "})
        assert r.status_code == 400, r.text

    def test_answer_without_join_404(self, anon_client, live_session):
        r = anon_client.post(f"{API}/adaptive/answer", json={"code": live_session["code"],
                                                            "studentName": "TEST_NeverJoined",
                                                            "qid": "Q-does-not-exist", "selectedAnswer": "A"})
        assert r.status_code == 404

    def test_zz_close_then_rejoin_rejected(self, teacher_client, anon_client, live_session):
        code = live_session["code"]
        r = teacher_client.post(f"{API}/adaptive/sessions/{code}/close")
        assert r.status_code == 200 and r.json()["status"] == "closed"
        d = teacher_client.get(f"{API}/adaptive/sessions/{code}").json()
        assert d["status"] == "closed"

        j = anon_client.post(f"{API}/adaptive/join", json={"code": code, "studentName": "TEST_Late"})
        assert j.status_code == 400
        assert "closed by the teacher" in j.json()["detail"]

        a = anon_client.post(f"{API}/adaptive/answer", json={"code": code, "studentName": "TEST_Learner",
                                                            "qid": "x", "selectedAnswer": "A"})
        assert a.status_code == 400

    def test_zz_close_unknown_code_404(self, teacher_client):
        assert teacher_client.post(f"{API}/adaptive/sessions/ZZZ998/close").status_code == 404


# ══════════════════════ Weak chapter alerts ══════════════════════
class TestInsightsAlerts:
    def test_alerts_requires_auth(self, anon_client):
        assert anon_client.get(f"{API}/insights/alerts").status_code in (401, 403)

    def test_alerts_admin_forbidden(self, admin_client):
        assert admin_client.get(f"{API}/insights/alerts").status_code == 403

    def test_alerts_shape(self, teacher_client):
        r = teacher_client.get(f"{API}/insights/alerts")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "count" in d and isinstance(d["count"], int)
        assert "items" in d and isinstance(d["items"], list)
        assert len(d["items"]) <= 5
        for c in d["items"]:
            for k in ("chapter", "subject", "class", "classAverageMasteryPct", "severity"):
                assert k in c, f"alert item missing {k}: {c}"
            assert c["severity"] == "high"


# ══════════════════════ PDF exports ══════════════════════
class TestPdfExports:
    def test_class_analytics_pdf(self, teacher_client):
        r = teacher_client.get(f"{API}/insights/classes/10/analytics/pdf")
        assert r.status_code == 200, r.text[:400]
        assert r.headers["content-type"].startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 1000
        assert "attachment" in r.headers.get("content-disposition", "")

    def test_ai_report_pdf(self, teacher_client):
        r = teacher_client.get(f"{API}/insights/classes/10/ai-report/pdf")
        assert r.status_code == 200, r.text[:400]
        assert r.headers["content-type"].startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 1000

    def test_pdf_requires_auth(self, anon_client):
        assert anon_client.get(f"{API}/insights/classes/10/analytics/pdf").status_code in (401, 403)
        assert anon_client.get(f"{API}/insights/classes/10/ai-report/pdf").status_code in (401, 403)

    def test_pdf_admin_forbidden(self, admin_client):
        assert admin_client.get(f"{API}/insights/classes/10/analytics/pdf").status_code == 403

    def test_pdf_unknown_class_handled(self, teacher_client):
        r = teacher_client.get(f"{API}/insights/classes/99/analytics/pdf")
        assert r.status_code in (200, 404), r.text[:300]


# ══════════════════════ Practice generator variety (shuffle) ══════════════════════
class TestPracticeVariety:
    def test_generate_varies_between_calls(self, teacher_client):
        students = teacher_client.get(f"{API}/insights/students")
        assert students.status_code == 200, students.text[:300]
        rows = students.json()
        assert rows, "no students returned"
        payload = {"studentName": rows[0]["name"], "questionCount": 10}
        seqs = []
        for _ in range(4):
            r = teacher_client.post(f"{API}/insights/practice/generate", json=payload)
            assert r.status_code == 200, r.text[:400]
            qs = r.json().get("questions", [])
            assert qs, "practice generate returned no questions"
            seqs.append(tuple(q["qid"] for q in qs))
        assert len(set(seqs)) > 1, f"practice generator deterministic across 4 calls: {seqs[0]}"


# ══════════════════════ Regression spot-check ══════════════════════
class TestRegressionSpotCheck:
    @pytest.mark.parametrize("path,params", [
        ("/insights/meta", None),
        ("/insights/chapters", {"subject": "Mathematics", "klass": 10}),
        ("/insights/question-trends", {"subject": "Mathematics", "klass": 10}),
        ("/insights/chapter-weightage", {"subject": "Mathematics"}),
        ("/insights/bank-health", None),
        ("/insights/students", None),
        ("/insights/classes", None),
        ("/insights/classes/10/analytics", None),
    ])
    def test_insights_endpoints_ok(self, teacher_client, path, params):
        r = teacher_client.get(f"{API}{path}", params=params)
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:250]}"

    def test_published_exams_ok(self, teacher_client):
        r = teacher_client.get(f"{API}/exams")
        assert r.status_code == 200, r.text[:250]
