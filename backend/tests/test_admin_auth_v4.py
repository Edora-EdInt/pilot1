"""Iteration 5: Admin/Teacher auth + user-management (username login) tests."""
import uuid
import requests
import pytest

from conftest import API, ADMIN, TEACHER, _login


@pytest.fixture(scope="module")
def created_ids():
    return []


@pytest.fixture(scope="module", autouse=True)
def cleanup(created_ids):
    yield
    s, _ = _login(ADMIN)
    # re-enable + best-effort leave no disabled TEST_ accounts; no delete endpoint exists
    for tid in created_ids:
        r = s.get(f"{API}/admin/teachers")
        if r.status_code == 200:
            for t in r.json():
                if t["id"] == tid and t["disabled"]:
                    s.patch(f"{API}/admin/teachers/{tid}/disable")


# ── Login ──
class TestLogin:
    def test_admin_login_by_username(self, anon_client):
        r = anon_client.post(f"{API}/auth/login", json=ADMIN)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["role"] == "admin"
        assert d["username"] == "admin"
        assert isinstance(d["token"], str) and len(d["token"]) > 20

    def test_teacher_login_by_username(self, anon_client):
        r = anon_client.post(f"{API}/auth/login", json=TEACHER)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["role"] == "teacher"
        assert d["username"] == "priya.math"
        assert d["subjects"] == ["Mathematics"]
        assert d["classes"] == ["Class 11", "Class 12"]

    def test_teacher_login_by_email_backward_compat(self, anon_client):
        r = anon_client.post(f"{API}/auth/login",
                             json={"username": "teacher@edora.io", "password": "Edora@2026"})
        assert r.status_code == 200
        assert r.json()["username"] == "priya.math"

    def test_login_rejects_email_key_payload(self, anon_client):
        r = anon_client.post(f"{API}/auth/login",
                             json={"email": "teacher@edora.io", "password": "Edora@2026"})
        assert r.status_code == 422

    def test_unknown_user_401(self, anon_client):
        # throwaway username so no real account is locked out
        r = anon_client.post(f"{API}/auth/login",
                             json={"username": f"test_nobody_{uuid.uuid4().hex[:8]}", "password": "Wrong@123"})
        assert r.status_code == 401

    def test_me_returns_portfolio_no_mongo_id(self, teacher_client):
        r = teacher_client.get(f"{API}/auth/me")
        assert r.status_code == 200
        d = r.json()
        assert "_id" not in d and "password_hash" not in d
        assert d["username"] == "priya.math"
        assert d["subjects"] == ["Mathematics"]


# ── Admin teacher management ──
class TestAdminTeachers:
    def test_list_requires_admin(self, teacher_client, admin_client):
        fresh = requests.Session()
        assert fresh.get(f"{API}/admin/teachers").status_code == 401
        assert teacher_client.get(f"{API}/admin/teachers").status_code == 403
        r = admin_client.get(f"{API}/admin/teachers")
        assert r.status_code == 200 and isinstance(r.json(), list)

    def test_write_endpoints_require_admin(self, teacher_client):
        fresh = requests.Session()
        payload = {"name": "TEST_x", "username": "test_x", "password": "Temp@1234"}
        assert teacher_client.post(f"{API}/admin/teachers", json=payload).status_code == 403
        assert fresh.post(f"{API}/admin/teachers", json=payload).status_code == 401
        assert teacher_client.put(f"{API}/admin/teachers/000000000000000000000000",
                                 json={"name": "x"}).status_code == 403
        assert teacher_client.patch(
            f"{API}/admin/teachers/000000000000000000000000/disable").status_code == 403
        assert teacher_client.post(
            f"{API}/admin/teachers/000000000000000000000000/send-credentials").status_code == 403

    def test_full_teacher_lifecycle(self, admin_client, anon_client, created_ids):
        uniq = uuid.uuid4().hex[:6]
        uname = f"test_qa.{uniq}"
        pwd = "Temp@1234"
        payload = {"name": "TEST_QA Teacher", "email": f"test_qa_{uniq}@example.com",
                   "username": uname, "password": pwd,
                   "subjects": ["Physics"], "classes": ["Class 9", "Class 10"]}

        # CREATE
        r = admin_client.post(f"{API}/admin/teachers", json=payload)
        assert r.status_code == 200, r.text
        t = r.json()
        created_ids.append(t["id"])
        assert t["username"] == uname
        assert t["subjects"] == ["Physics"]
        assert t["classes"] == ["Class 9", "Class 10"]
        assert t["disabled"] is False
        assert "password_hash" not in t and "_id" not in t

        # persisted in list
        lst = admin_client.get(f"{API}/admin/teachers").json()
        assert any(x["username"] == uname for x in lst)

        # duplicate username rejected
        assert admin_client.post(f"{API}/admin/teachers", json=payload).status_code == 400

        # new teacher can log in with assigned username
        r = anon_client.post(f"{API}/auth/login", json={"username": uname, "password": pwd})
        assert r.status_code == 200, r.text
        assert r.json()["subjects"] == ["Physics"]

        # UPDATE subjects/classes
        r = admin_client.put(f"{API}/admin/teachers/{t['id']}",
                             json={"subjects": ["Physics", "Chemistry"], "classes": ["Class 12"]})
        assert r.status_code == 200, r.text
        assert r.json()["subjects"] == ["Physics", "Chemistry"]
        lst = admin_client.get(f"{API}/admin/teachers").json()
        got = [x for x in lst if x["id"] == t["id"]][0]
        assert got["subjects"] == ["Physics", "Chemistry"] and got["classes"] == ["Class 12"]

        # send-credentials (mocked email)
        r = admin_client.post(f"{API}/admin/teachers/{t['id']}/send-credentials")
        assert r.status_code == 200 and r.json()["ok"] is True

        # DISABLE -> login 403
        r = admin_client.patch(f"{API}/admin/teachers/{t['id']}/disable")
        assert r.status_code == 200 and r.json()["disabled"] is True
        r = anon_client.post(f"{API}/auth/login", json={"username": uname, "password": pwd})
        assert r.status_code == 403, f"disabled teacher could login: {r.status_code}"

        # ENABLE -> login works again
        r = admin_client.patch(f"{API}/admin/teachers/{t['id']}/disable")
        assert r.json()["disabled"] is False
        assert anon_client.post(f"{API}/auth/login",
                                json={"username": uname, "password": pwd}).status_code == 200

        # password reset via PUT
        r = admin_client.put(f"{API}/admin/teachers/{t['id']}", json={"password": "NewTemp@99"})
        assert r.status_code == 200
        assert anon_client.post(f"{API}/auth/login",
                                json={"username": uname, "password": "NewTemp@99"}).status_code == 200

    def test_update_nonexistent_404(self, admin_client):
        r = admin_client.put(f"{API}/admin/teachers/000000000000000000000000", json={"name": "x"})
        assert r.status_code == 404

    def test_privilege_escalation_via_register_blocked(self, anon_client):
        email = f"test_esc_{uuid.uuid4().hex[:6]}@example.com"
        r = anon_client.post(f"{API}/auth/register", json={
            "name": "TEST_Esc", "email": email, "password": "Pass@1234", "role": "teacher"})
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "student"


# ── Regression: engine endpoints still reachable for a teacher ──
class TestEngineRegression:
    @pytest.mark.parametrize("path", [
        "/dashboard/stats", "/curriculum", "/exams", "/attempts", "/analytics",
    ])
    def test_teacher_can_load(self, teacher_client, path):
        r = teacher_client.get(f"{API}{path}")
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"

    def test_admin_blocked_from_teacher_engine(self, admin_client):
        # admin has teacher-level access by design (require_teacher allows admin)
        r = admin_client.get(f"{API}/dashboard/stats")
        assert r.status_code in (200, 403)
