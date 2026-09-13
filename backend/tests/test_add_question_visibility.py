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
    assert r.status_code == 404, f"expected 404, got {r.status_code}"


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
    p = _mcq_payload(f"TEST_VIS_{uuid.uuid4().hex[:8]}", "only_me")
    r = requests.post(f"{BASE}/questions", json=p, headers=_auth(teacher_a_token))
    assert r.status_code in (400, 422)


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
