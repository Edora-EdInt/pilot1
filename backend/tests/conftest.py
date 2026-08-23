import os
import requests
import pytest
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

# Login is now username-based (username matches username OR email)
ADMIN = {"username": "admin", "password": "Admin@2026"}
TEACHER = {"username": "priya.math", "password": "Edora@2026"}
STUDENT = {"username": "student@edora.io", "password": "Student@2026"}


def _login(creds):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json=creds, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"Login failed for {creds['username']}: {r.status_code} {r.text[:300]}")
    token = r.json().get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s, r


@pytest.fixture(scope="session")
def api_base():
    return API


@pytest.fixture(scope="session")
def admin_client():
    s, _ = _login(ADMIN)
    return s


@pytest.fixture(scope="session")
def teacher_client():
    s, _ = _login(TEACHER)
    return s


@pytest.fixture(scope="session")
def student_client():
    s, _ = _login(STUDENT)
    return s


@pytest.fixture(scope="session")
def anon_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def blueprint(subject, marks=40, variants=2, seed=None, chapters=None):
    return {
        "name": "TEST_Exam",
        "curriculum": {"board": "CBSE", "grade": 10, "subject": subject,
                       "chapters": chapters or []},
        "config": {"totalMarks": marks, "duration": 90},
        "difficulty": {"easy": 30, "medium": 50, "hard": 20},
        "questionTypes": {"mcq": 20, "assertion": 10, "veryShort": 15,
                          "short": 25, "long": 15, "caseStudy": 15},
        "variants": variants,
        "seed": seed,
    }
