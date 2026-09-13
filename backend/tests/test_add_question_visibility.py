"""End-to-end verification of the new Add Question feature + visibility enforcement.

Focus areas (per review request):
- POST /api/questions creates & validates (objective vs descriptive, visibility whitelist, duplicate).
- GET /api/questions honors class_subject visibility against teacher portfolio.
- POST /api/exams/generate honors class_subject visibility.
- Removed AI endpoint POST /api/questions/generate returns 404.
"""
import os
import time
import uuid
import requests
import pytest

def _base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        # Fallback to frontend/.env for local pytest runs
        try:
            with open("/app/frontend/.env") as fh:
                for line in fh:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except FileNotFoundError:
            pass
    if not url:
        raise RuntimeError("REACT_APP_BACKEND_URL not configured")
    return url.rstrip("/") + "/api"

BASE = _base()


def _login(username, password):
    r = requests.post(f"{BASE}/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, f"login failed {username}: {r.status_code} {r.text}"
    return r.json()["token"]


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def teacher_a_token():
    return _login("priya.math", "Edora@2026")


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin", "Admin@2026")


@pytest.fixture(scope="module")
def teacher_b(admin_token):
    """Create a second teacher with a NON-matching portfolio (Physics / Class 9-10).

    Priya's portfolio is Mathematics / Class 11-12, so Priya's class_subject
    question must NOT be visible to this Physics teacher.
    """
    uname = f"testphy_{uuid.uuid4().hex[:6]}"
    payload = {
        "username": uname, "name": "Test Phy Teacher", "email": f"{uname}@edora.io",
        "password": "Edora@2026", "subjects": ["Physics"], "classes": ["Class 9", "Class 10"],
    }
    r = requests.post(f"{BASE}/admin/teachers", json=payload, headers=_auth(admin_token))
    assert r.status_code in (200, 201), f"create teacher failed: {r.status_code} {r.text}"
    tok = _login(uname, "Edora@2026")
    return {"username": uname, "token": tok}


@pytest.fixture(scope="module")
def teacher_c(admin_token):
    """Second teacher WITH matching portfolio (Mathematics / Class 11)."""
    uname = f"testmath_{uuid.uuid4().hex[:6]}"
    payload = {
        "username": uname, "name": "Test Math Teacher", "email": f"{uname}@edora.io",
        "password": "Edora@2026", "subjects": ["Mathematics"], "classes": ["Class 11"],
    }
    r = requests.post(f"{BASE}/admin/teachers", json=payload, headers=_auth(admin_token))
    assert r.status_code in (200, 201), r.text
    return {"username": uname, "token": _login(uname, "Edora@2026")}


# ---- Create / validate ----

def _mcq_payload(q_text, visibility="all"):
    return {
        "subject": "Mathematics", "chapter": "Sets", "grade": 11,
        "questionType": "MCQ", "difficulty": "Easy", "marks": 1,
        "question": q_text,
        "options": ["1", "2", "3", "4"], "correctAnswer": "A",
        "answer": "", "visibility": visibility,
    }


def test_removed_ai_endpoint_returns_404(teacher_a_token):
    r = requests.post(f"{BASE}/questions/generate", json={}, headers=_auth(teacher_a_token))
    # No POST handler exists for "/questions/generate" or "/questions/{qid}" anymore
    # (AI generation was fully removed) — 404 if unmatched, or 405 if it now only
    # matches the "/questions/{qid}" edit/delete path pattern for other methods.
    assert r.status_code in (404, 405), f"expected 404/405, got {r.status_code}"


def test_create_mcq_bank_wide(teacher_a_token):
    q_text = f"TEST_ALL_{uuid.uuid4().hex[:8]} What is 2+2?"
    r = requests.post(f"{BASE}/questions", json=_mcq_payload(q_text, "all"), headers=_auth(teacher_a_token))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["visibility"] == "all"
    assert data["question"] == q_text
    assert data["objective"] is True
    assert "qid" in data


def test_create_mcq_duplicate_rejected(teacher_a_token):
    q_text = f"TEST_DUP_{uuid.uuid4().hex[:8]} Dup check?"
    p = _mcq_payload(q_text, "all")
    r1 = requests.post(f"{BASE}/questions", json=p, headers=_auth(teacher_a_token))
    assert r1.status_code == 200
    r2 = requests.post(f"{BASE}/questions", json=p, headers=_auth(teacher_a_token))
    assert r2.status_code == 400
    assert "exist" in r2.text.lower()


def test_create_mcq_missing_options_rejected(teacher_a_token):
    p = _mcq_payload(f"TEST_BAD_{uuid.uuid4().hex[:8]}", "all")
    p["options"] = ["only-one", "", "", ""]
    r = requests.post(f"{BASE}/questions", json=p, headers=_auth(teacher_a_token))
    assert r.status_code == 400


def test_create_descriptive_missing_answer_rejected(teacher_a_token):
    p = {
        "subject": "Mathematics", "chapter": "Sets", "grade": 11,
        "questionType": "Short Answer", "difficulty": "Easy", "marks": 2,
        "question": f"TEST_DESC_EMPTY_{uuid.uuid4().hex[:8]}",
        "options": [], "correctAnswer": "", "answer": "  ", "visibility": "all",
    }
    r = requests.post(f"{BASE}/questions", json=p, headers=_auth(teacher_a_token))
    assert r.status_code == 400


def test_invalid_visibility_rejected(teacher_a_token):
    p = _mcq_payload(f"TEST_VIS_{uuid.uuid4().hex[:8]}", "some_bogus_value")
    r = requests.post(f"{BASE}/questions", json=p, headers=_auth(teacher_a_token))
    assert r.status_code in (400, 422)


def test_only_me_visibility_accepted(teacher_a_token):
    q_text = f"TEST_ONLYME_{uuid.uuid4().hex[:8]} Private check?"
    r = requests.post(f"{BASE}/questions", json=_mcq_payload(q_text, "only_me"), headers=_auth(teacher_a_token))
    assert r.status_code == 200, r.text
    assert r.json()["visibility"] == "only_me"


# ---- Visibility enforcement ----

@pytest.fixture(scope="module")
def restricted_question(teacher_a_token):
    q_text = f"TEST_CS_{uuid.uuid4().hex[:8]} Restricted for Math class 11"
    r = requests.post(f"{BASE}/questions", json=_mcq_payload(q_text, "class_subject"), headers=_auth(teacher_a_token))
    assert r.status_code == 200, r.text
    return r.json()


def test_list_questions_owner_sees_restricted(teacher_a_token, restricted_question):
    r = requests.get(f"{BASE}/questions", params={"search": restricted_question["question"]}, headers=_auth(teacher_a_token))
    assert r.status_code == 200
    qids = [q["qid"] for q in r.json()]
    assert restricted_question["qid"] in qids


def test_list_questions_matching_teacher_sees_restricted(teacher_c, restricted_question):
    r = requests.get(f"{BASE}/questions", params={"search": restricted_question["question"]}, headers=_auth(teacher_c["token"]))
    assert r.status_code == 200
    qids = [q["qid"] for q in r.json()]
    assert restricted_question["qid"] in qids, "matching-portfolio teacher must see class_subject question"


def test_list_questions_nonmatching_teacher_hidden(teacher_b, restricted_question):
    r = requests.get(f"{BASE}/questions", params={"search": restricted_question["question"]}, headers=_auth(teacher_b["token"]))
    assert r.status_code == 200
    qids = [q["qid"] for q in r.json()]
    assert restricted_question["qid"] not in qids, "non-matching teacher must NOT see class_subject question"


def test_bank_wide_visible_to_everyone(teacher_a_token, teacher_b):
    q_text = f"TEST_ALL_SHARED_{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{BASE}/questions", json=_mcq_payload(q_text, "all"), headers=_auth(teacher_a_token))
    assert r.status_code == 200
    qid = r.json()["qid"]
    r2 = requests.get(f"{BASE}/questions", params={"search": q_text}, headers=_auth(teacher_b["token"]))
    assert r2.status_code == 200
    assert qid in [q["qid"] for q in r2.json()]


def test_exam_generate_excludes_restricted_for_nonmatching(teacher_b, restricted_question):
    """Non-matching teacher generating a Physics exam must never surface Priya's Math restricted qid.
       We generate on their own portfolio (Physics/Class 9) — restricted qid subject mismatch AND vis
       filter both apply, so it must not appear."""
    body = {"subject": "Physics", "grade": 9, "chapter": None,
            "totalMarks": 10, "questionCount": 5,
            "difficultyMix": {"Easy": 1.0, "Medium": 0.0, "Hard": 0.0},
            "typeMix": {"MCQ": 1.0}, "variantCount": 1}
    r = requests.post(f"{BASE}/exams/generate", json=body, headers=_auth(teacher_b["token"]))
    # May 400 if no physics pool — that's fine, main check is that it doesn't leak.
    if r.status_code == 200:
        for variant in r.json().get("variants", []):
            qids = [q["qid"] for q in variant.get("questions", [])]
            assert restricted_question["qid"] not in qids


# ---- Filters ----

def test_list_questions_subject_filter(teacher_a_token):
    r = requests.get(f"{BASE}/questions", params={"subject": "Mathematics"}, headers=_auth(teacher_a_token))
    assert r.status_code == 200
    for q in r.json():
        assert q["subject"] == "Mathematics"


# ---- Only Me visibility ----

@pytest.fixture(scope="module")
def only_me_question(teacher_a_token):
    q_text = f"TEST_ONLYME2_{uuid.uuid4().hex[:8]} Only me for real"
    r = requests.post(f"{BASE}/questions", json=_mcq_payload(q_text, "only_me"), headers=_auth(teacher_a_token))
    assert r.status_code == 200, r.text
    return r.json()


def test_only_me_visible_to_owner(teacher_a_token, only_me_question):
    r = requests.get(f"{BASE}/questions", params={"search": only_me_question["question"]}, headers=_auth(teacher_a_token))
    assert r.status_code == 200
    assert only_me_question["qid"] in [q["qid"] for q in r.json()]


def test_only_me_hidden_from_matching_portfolio_teacher(teacher_c, only_me_question):
    """Unlike class_subject, a MATCHING-portfolio teacher must still NOT see an only_me question."""
    r = requests.get(f"{BASE}/questions", params={"search": only_me_question["question"]}, headers=_auth(teacher_c["token"]))
    assert r.status_code == 200
    assert only_me_question["qid"] not in [q["qid"] for q in r.json()]


# ---- Edit & Delete (owner-only) ----

def test_owner_can_edit_own_question(teacher_a_token):
    q_text = f"TEST_EDIT_{uuid.uuid4().hex[:8]} original text"
    created = requests.post(f"{BASE}/questions", json=_mcq_payload(q_text, "all"), headers=_auth(teacher_a_token)).json()
    updated_text = f"TEST_EDIT_{uuid.uuid4().hex[:8]} updated text"
    payload = _mcq_payload(updated_text, "class_subject")
    r = requests.put(f"{BASE}/questions/{created['qid']}", json=payload, headers=_auth(teacher_a_token))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["question"] == updated_text
    assert d["visibility"] == "class_subject"
    # old qid (derived from old text) no longer resolves; searching by new text does
    r2 = requests.get(f"{BASE}/questions", params={"search": updated_text}, headers=_auth(teacher_a_token))
    assert d["qid"] in [q["qid"] for q in r2.json()]


def test_non_owner_cannot_edit(teacher_a_token, teacher_b):
    q_text = f"TEST_EDIT_GUARD_{uuid.uuid4().hex[:8]}"
    created = requests.post(f"{BASE}/questions", json=_mcq_payload(q_text, "all"), headers=_auth(teacher_a_token)).json()
    r = requests.put(f"{BASE}/questions/{created['qid']}", json=_mcq_payload(q_text + "_x", "all"), headers=_auth(teacher_b["token"]))
    assert r.status_code == 403


def test_cannot_edit_ownerless_seeded_question(teacher_a_token):
    # Find a real bank question with no owner on record (seeded / old AI-generated).
    r = requests.get(f"{BASE}/questions", params={"subject": "Mathematics"}, headers=_auth(teacher_a_token))
    seeded = next((q for q in r.json() if not q.get("ownerId")), None)
    if seeded is None:
        pytest.skip("no ownerless Mathematics question found in current bank snapshot")
    r2 = requests.put(f"{BASE}/questions/{seeded['qid']}", json=_mcq_payload("TEST_SHOULD_NOT_APPLY", "all"), headers=_auth(teacher_a_token))
    assert r2.status_code == 403


def test_owner_can_delete_own_question(teacher_a_token):
    q_text = f"TEST_DELETE_{uuid.uuid4().hex[:8]}"
    created = requests.post(f"{BASE}/questions", json=_mcq_payload(q_text, "all"), headers=_auth(teacher_a_token)).json()
    r = requests.delete(f"{BASE}/questions/{created['qid']}", headers=_auth(teacher_a_token))
    assert r.status_code == 200
    r2 = requests.get(f"{BASE}/questions", params={"search": q_text}, headers=_auth(teacher_a_token))
    assert created["qid"] not in [q["qid"] for q in r2.json()]


def test_non_owner_cannot_delete(teacher_a_token, teacher_b):
    q_text = f"TEST_DELETE_GUARD_{uuid.uuid4().hex[:8]}"
    created = requests.post(f"{BASE}/questions", json=_mcq_payload(q_text, "all"), headers=_auth(teacher_a_token)).json()
    r = requests.delete(f"{BASE}/questions/{created['qid']}", headers=_auth(teacher_b["token"]))
    assert r.status_code == 403


# ---- Closing the gap: Adaptive Demo sandbox + Adaptive live session ----

def test_adaptive_sandbox_hides_restricted_from_nonmatching_teacher(teacher_b, restricted_question):
    r = requests.get(f"{BASE}/insights/adaptive/questions",
                     params={"board": "CBSE", "klass": "11", "subject": "Mathematics", "chapter": "Sets"},
                     headers=_auth(teacher_b["token"]))
    if r.status_code == 404:
        return  # no eligible questions at all for this teacher's view — trivially cannot leak
    all_qids = [q["qid"] for lvl in r.json()["levels"].values() for q in lvl]
    assert restricted_question["qid"] not in all_qids


def test_adaptive_sandbox_shows_restricted_to_matching_teacher(teacher_c, restricted_question):
    r = requests.get(f"{BASE}/insights/adaptive/questions",
                     params={"board": "CBSE", "klass": "11", "subject": "Mathematics", "chapter": "Sets", "perLevel": 5000},
                     headers=_auth(teacher_c["token"]))
    assert r.status_code == 200, r.text
    all_qids = [q["qid"] for lvl in r.json()["levels"].values() for q in lvl]
    assert restricted_question["qid"] in all_qids


def test_adaptive_live_session_never_serves_restricted_to_nonmatching_session(admin_token, teacher_a_token, teacher_b, restricted_question):
    """teacher_b (Physics/Class9-10 portfolio) starts a Math/Class11 session anyway
    (nothing stops a teacher from running a session outside their own portfolio) —
    Priya's class_subject-restricted Math/Class11 question must never surface in it,
    even though the session's subject/class matches the question's subject/class."""
    # Guarantee >= 3 bank-wide MCQs in this exact chapter so create_session succeeds
    # and the pool has real content to serve alongside the restricted one.
    bankwide_qids = []
    for i in range(3):
        q_text = f"TEST_LIVE_POOL_{uuid.uuid4().hex[:8]}_{i}"
        r = requests.post(f"{BASE}/questions", json=_mcq_payload(q_text, "all"), headers=_auth(teacher_a_token))
        assert r.status_code == 200, r.text
        bankwide_qids.append(r.json()["qid"])

    created = requests.post(f"{BASE}/adaptive/sessions",
                            json={"board": "CBSE", "klass": 11, "subject": "Mathematics", "chapter": "Sets"},
                            headers=_auth(teacher_b["token"]))
    assert created.status_code == 200, created.text
    code = created.json()["code"]

    student_name = f"TEST_student_{uuid.uuid4().hex[:6]}"
    seen_qids = set()
    joined = requests.post(f"{BASE}/adaptive/join", json={"code": code, "studentName": student_name})
    assert joined.status_code == 200, joined.text
    q = joined.json()["question"]
    for _ in range(8):
        if not q:
            break
        seen_qids.add(q["qid"])
        ans = requests.post(f"{BASE}/adaptive/answer",
                            json={"code": code, "studentName": student_name, "qid": q["qid"], "selectedAnswer": "A"})
        assert ans.status_code == 200, ans.text
        q = ans.json()["question"]

    assert restricted_question["qid"] not in seen_qids, "restricted question leaked into a non-matching teacher's live session"
    assert seen_qids, "sanity: session should have served at least one bank-wide question"
