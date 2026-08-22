"""Edora v2 — iteration 3: dual-mode auth fix + 4 new features
(AI question generation, PDF export, live proctoring, face verification)."""
import base64
import io
import time
import uuid

import pytest
import requests

from conftest import API, TEACHER, STUDENT, blueprint


def _bare():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ── AUTH (dual mode: cookie + bearer token) ──
class TestDualModeAuth:
    def test_login_returns_token_field(self):
        s = _bare()
        r = s.post(f"{API}/auth/login", json=TEACHER, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d.get("token"), str) and len(d["token"]) > 40, d
        assert d["role"] == "teacher"
        assert d["email"] == TEACHER["email"]
        assert "password_hash" not in d

    def test_me_with_bearer_only_no_cookies(self):
        s = _bare()
        token = s.post(f"{API}/auth/login", json=TEACHER, timeout=30).json()["token"]
        clean = requests.Session()  # no cookie jar entries
        clean.headers.update({"Authorization": f"Bearer {token}"})
        r = clean.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "teacher"
        # bearer also works for teacher-guarded endpoints
        assert clean.get(f"{API}/dashboard/stats", timeout=60).status_code == 200

    def test_me_with_cookie_only(self):
        s = _bare()
        r = s.post(f"{API}/auth/login", json=TEACHER, timeout=30)
        assert "access_token" in s.cookies, dict(s.cookies)
        me = s.get(f"{API}/auth/me", timeout=30)
        assert me.status_code == 200 and me.json()["role"] == "teacher"

    def test_register_returns_token_and_student_role(self):
        s = _bare()
        email = f"TEST_v3_{uuid.uuid4().hex[:8]}@edora.io"
        r = s.post(f"{API}/auth/register", json={
            "name": "TEST_V3 User", "email": email, "password": "Passw0rd!", "role": "teacher"}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["role"] == "student"
        assert isinstance(d.get("token"), str) and d["token"]
        clean = requests.Session()
        clean.headers.update({"Authorization": f"Bearer {d['token']}"})
        me = clean.get(f"{API}/auth/me", timeout=30)
        assert me.status_code == 200 and me.json()["email"] == email.lower()

    def test_bad_bearer_token_401(self):
        s = requests.Session()
        s.headers.update({"Authorization": "Bearer not.a.jwt"})
        assert s.get(f"{API}/auth/me", timeout=30).status_code == 401

    def test_logout_clears_cookies(self):
        s = _bare()
        s.post(f"{API}/auth/login", json=STUDENT, timeout=30)
        r = s.post(f"{API}/auth/logout", timeout=30)
        assert r.status_code == 200 and r.json()["ok"] is True
        assert s.get(f"{API}/auth/me", timeout=30).status_code == 401

    def test_brute_force_lockout_423_throwaway_email(self):
        s = _bare()
        email = f"TEST_lock_{uuid.uuid4().hex[:8]}@edora.io"
        codes = []
        for _ in range(6):
            codes.append(s.post(f"{API}/auth/login",
                                json={"email": email, "password": "bad-pass-x"}, timeout=30).status_code)
        assert 423 in codes, f"no lockout, codes={codes}"


# ── shared published exam for feature tests ──
@pytest.fixture(scope="module")
def teacher():
    s = _bare()
    r = s.post(f"{API}/auth/login", json=TEACHER, timeout=30)
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


@pytest.fixture(scope="module")
def exam_code(teacher):
    bp = blueprint("Mathematics", marks=20, variants=1, seed=555111)
    g = teacher.post(f"{API}/exams/generate", json=bp, timeout=120)
    assert g.status_code == 200, g.text
    qids = [q["qid"] for q in g.json()["variants"][0]["questions"]]
    p = teacher.post(f"{API}/exams/publish", json={
        "blueprint": bp, "variantIndex": 0, "variantLabel": "A", "qids": qids}, timeout=90)
    assert p.status_code == 200, p.text
    return p.json()["code"]


# ── AI QUESTION GENERATION ──
class TestQuestionGeneration:
    def test_generate_inserts_into_bank(self, teacher):
        before = teacher.get(f"{API}/questions/stats", timeout=30).json()["total"]
        r = teacher.post(f"{API}/questions/generate", json={
            "subject": "Mathematics", "chapter": "Real Numbers", "questionType": "Short Answer",
            "difficulty": "Medium", "count": 3, "marks": 3}, timeout=180)
        assert r.status_code == 200, r.text[:500]
        d = r.json()
        assert d["generated"] >= 1, d
        assert d["added"] >= 1, d
        assert len(d["questions"]) == d["added"]
        for q in d["questions"]:
            assert "_id" not in q
            assert q["qid"]
            assert q["question"].strip()
            assert q["subject"] == "Mathematics"
            assert q["chapter"] == "Real Numbers"
            assert q["questionType"] == "Short Answer"
            assert q["marks"] == 3
            assert q["aiGenerated"] is True
        after = teacher.get(f"{API}/questions/stats", timeout=30).json()["total"]
        assert after >= before + d["added"], (before, after, d["added"])

    def test_generate_mcq_has_options(self, teacher):
        r = teacher.post(f"{API}/questions/generate", json={
            "subject": "Science", "chapter": "Light – Reflection and Refraction",
            "questionType": "MCQ", "difficulty": "Easy", "count": 2, "marks": 1}, timeout=180)
        assert r.status_code == 200, r.text[:500]
        qs = r.json()["questions"]
        if not qs:
            pytest.skip("all generated MCQs were duplicates of the bank")
        for q in qs:
            assert q["objective"] is True
            assert len(q["options"]) >= 2, q
            assert q["correctAnswer"], q

    def test_generate_requires_teacher(self):
        anon = _bare()
        payload = {"subject": "Mathematics", "chapter": "Real Numbers", "count": 1}
        assert anon.post(f"{API}/questions/generate", json=payload, timeout=60).status_code == 401
        st = _bare()
        st.post(f"{API}/auth/login", json=STUDENT, timeout=30)
        assert st.post(f"{API}/questions/generate", json=payload, timeout=60).status_code == 403

    def test_generate_validation_422(self, teacher):
        r = teacher.post(f"{API}/questions/generate", json={"subject": "Mathematics"}, timeout=30)
        assert r.status_code == 422, r.status_code


# ── PDF EXPORT ──
class TestPdfExport:
    def test_exam_pdf(self, teacher, exam_code):
        r = teacher.get(f"{API}/exams/{exam_code}/pdf", timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert r.headers["content-type"].startswith("application/pdf"), r.headers
        assert r.content[:4] == b"%PDF", r.content[:20]
        assert len(r.content) > 2000, len(r.content)
        assert "attachment" in r.headers.get("content-disposition", "")

    def test_exam_pdf_404(self, teacher):
        assert teacher.get(f"{API}/exams/ZZZZZZ/pdf", timeout=30).status_code == 404

    def test_exam_pdf_guarded(self, exam_code):
        anon = requests.Session()
        assert anon.get(f"{API}/exams/{exam_code}/pdf", timeout=30).status_code == 401
        st = _bare()
        st.post(f"{API}/auth/login", json=STUDENT, timeout=30)
        assert st.get(f"{API}/exams/{exam_code}/pdf", timeout=30).status_code == 403

    def test_attempt_pdf(self, teacher, exam_code):
        s = _bare()
        start = s.post(f"{API}/student/start",
                       json={"code": exam_code, "studentName": "TEST_PdfStudent"}, timeout=60).json()
        aid, tok = start["attemptId"], start["attemptToken"]
        answers = {q["qid"]: ("A" if q.get("objective") else
                              "A concise explanation with the formula and final answer.")
                   for q in start["exam"]["questions"]}
        sub = s.post(f"{API}/student/{aid}/submit", json={"token": tok, "answers": answers}, timeout=300)
        assert sub.status_code == 200, sub.text[:300]
        r = teacher.get(f"{API}/attempts/{aid}/pdf", timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert r.headers["content-type"].startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 2000, len(r.content)
        # guards
        anon = requests.Session()
        assert anon.get(f"{API}/attempts/{aid}/pdf", timeout=30).status_code == 401
        st = _bare()
        st.post(f"{API}/auth/login", json=STUDENT, timeout=30)
        assert st.get(f"{API}/attempts/{aid}/pdf", timeout=30).status_code == 403

    def test_attempt_pdf_bad_id_404(self, teacher):
        assert teacher.get(f"{API}/attempts/not-an-oid/pdf", timeout=30).status_code == 404


# ── LIVE PROCTORING ──
class TestLiveProctoring:
    def test_live_feed_lifecycle(self, teacher, exam_code):
        s = _bare()
        start = s.post(f"{API}/student/start",
                       json={"code": exam_code, "studentName": "TEST_LiveStudent"}, timeout=60).json()
        aid, tok = start["attemptId"], start["attemptToken"]
        s.post(f"{API}/student/{aid}/integrity", json={"type": "tab_switch", "token": tok}, timeout=30)
        r = teacher.get(f"{API}/proctoring/live", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["count"] >= 1
        assert d["count"] == len(d["live"])
        row = next((x for x in d["live"] if x["id"] == aid), None)
        assert row is not None, "started attempt missing from live feed"
        assert row["studentName"] == "TEST_LiveStudent"
        assert row["examCode"] == exam_code
        assert row["tabSwitches"] == 1
        assert row["integrityScore"] == 95
        assert "identityValid" in row and "faceMatch" in row
        assert row["answered"] == 0
        # submit -> disappears
        answers = {q["qid"]: "A" for q in start["exam"]["questions"] if q.get("objective")}
        sub = s.post(f"{API}/student/{aid}/submit", json={"token": tok, "answers": answers}, timeout=300)
        assert sub.status_code == 200, sub.text[:300]
        after = teacher.get(f"{API}/proctoring/live", timeout=30).json()
        assert aid not in [x["id"] for x in after["live"]], "submitted attempt still in live feed"

    def test_live_feed_guarded(self):
        anon = requests.Session()
        assert anon.get(f"{API}/proctoring/live", timeout=30).status_code == 401
        st = _bare()
        st.post(f"{API}/auth/login", json=STUDENT, timeout=30)
        assert st.get(f"{API}/proctoring/live", timeout=30).status_code == 403


# ── FACE VERIFICATION ──
def _png_data_url(color=(200, 140, 120), size=(160, 160)):
    """Small synthetic PNG so the vision endpoints get real image bytes."""
    try:
        from PIL import Image, ImageDraw
    except Exception:
        pytest.skip("PIL not available to synthesize an image")
    img = Image.new("RGB", size, (240, 240, 235))
    d = ImageDraw.Draw(img)
    d.ellipse([40, 30, 120, 130], fill=color)          # head
    d.ellipse([62, 62, 74, 74], fill=(30, 30, 30))     # eyes
    d.ellipse([90, 62, 102, 74], fill=(30, 30, 30))
    d.arc([66, 85, 100, 110], 200, 340, fill=(60, 30, 30), width=3)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


class TestFaceVerification:
    def test_start_without_photo_returns_identity_check_skipped(self, exam_code):
        s = _bare()
        r = s.post(f"{API}/student/start",
                   json={"code": exam_code, "studentName": "TEST_NoPhoto"}, timeout=60)
        assert r.status_code == 200, r.text
        ic = r.json().get("identityCheck")
        assert isinstance(ic, dict), r.json()
        assert set(["valid", "faces", "confidence", "reason"]).issubset(ic.keys()), ic
        assert ic["valid"] is False
        assert ic.get("method") == "skipped"

    def test_start_with_photo_runs_vision_identity_check(self, exam_code):
        s = _bare()
        t0 = time.time()
        r = s.post(f"{API}/student/start", json={
            "code": exam_code, "studentName": "TEST_FacePhoto",
            "photo": _png_data_url()}, timeout=180)
        assert r.status_code == 200, r.text[:400]
        ic = r.json()["identityCheck"]
        print(f"identityCheck={ic} in {time.time()-t0:.1f}s")
        assert ic["method"] == "ai", f"vision LLM did not run: {ic}"
        assert isinstance(ic["valid"], bool)
        assert 0.0 <= ic["confidence"] <= 1.0

    def test_face_check_token_guard_and_match(self, exam_code, teacher):
        s = _bare()
        start = s.post(f"{API}/student/start", json={
            "code": exam_code, "studentName": "TEST_FaceCheck",
            "photo": _png_data_url()}, timeout=180).json()
        aid, tok = start["attemptId"], start["attemptToken"]
        # wrong token -> 403
        bad = s.post(f"{API}/student/{aid}/face-check",
                     json={"type": _png_data_url(), "token": "wrong"}, timeout=180)
        assert bad.status_code == 403, bad.status_code
        # bad attempt id -> 404
        assert s.post(f"{API}/student/not-an-oid/face-check",
                      json={"type": _png_data_url(), "token": tok}, timeout=60).status_code == 404
        # valid -> 200 with match/confidence
        ok = s.post(f"{API}/student/{aid}/face-check",
                    json={"type": _png_data_url(), "token": tok}, timeout=180)
        assert ok.status_code == 200, ok.text[:400]
        d = ok.json()
        assert set(d.keys()) == {"match", "confidence"}, d
        assert isinstance(d["match"], bool)
        assert 0.0 <= d["confidence"] <= 1.0
        print(f"same-face check -> {d}")
        # teacher sees the recorded face check
        att = teacher.get(f"{API}/attempts/{aid}", timeout=30).json()
        assert att.get("faceChecks"), att.keys()
        assert att["faceChecks"][-1]["match"] == d["match"]
        assert "token" not in att

    def test_face_mismatch_penalises_integrity(self, exam_code, teacher):
        s = _bare()
        start = s.post(f"{API}/student/start", json={
            "code": exam_code, "studentName": "TEST_FaceMismatch",
            "photo": _png_data_url(color=(210, 170, 140))}, timeout=180).json()
        aid, tok = start["attemptId"], start["attemptToken"]
        # visibly different "person" (different colour/geometry)
        other = _png_data_url(color=(70, 50, 40), size=(200, 200))
        r = s.post(f"{API}/student/{aid}/face-check",
                   json={"type": other, "token": tok}, timeout=180)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        att = teacher.get(f"{API}/attempts/{aid}", timeout=30).json()
        print(f"mismatch check -> {d}; integrity={att['integrityScore']} "
              f"events={[e['type'] for e in att.get('integrityEvents', [])]}")
        if d["match"] is False:
            assert att["integrityScore"] == 80, att["integrityScore"]
            assert "face_mismatch" in [e["type"] for e in att["integrityEvents"]]
            assert att.get("faceMatch") is False
        else:
            # LLM judged them the same; no penalty expected
            assert att["integrityScore"] == 100
