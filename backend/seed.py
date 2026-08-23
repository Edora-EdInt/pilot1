"""Idempotent seeding: question bank (from data/*.json) + default users."""
import os
import glob
import json
import hashlib
from datetime import datetime, timezone

from auth import hash_password, verify_password

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")

CANON_TYPES = {
    "mcq": "MCQ",
    "multiple choice": "MCQ",
    "assertion reason": "Assertion Reason",
    "assertion-reason": "Assertion Reason",
    "very short answer": "Very Short Answer",
    "short answer": "Short Answer",
    "long answer": "Long Answer",
    "case study": "Case Study",
    "case-based": "Case Study",
}


def _canon_type(t: str) -> str:
    return CANON_TYPES.get((t or "").strip().lower(), (t or "Short Answer").strip())


def _qid(q: dict) -> str:
    key = f'{q.get("subject")}|{q.get("chapter")}|{q.get("question")}'
    return hashlib.md5(key.encode("utf-8")).hexdigest()[:20]


def _normalize(raw: dict) -> dict:
    qtype = _canon_type(raw.get("questionType"))
    q = {
        "board": raw.get("board", "CBSE"),
        "class": int(raw.get("class", 10)),
        "subject": raw.get("subject", "General"),
        "chapter": raw.get("chapter", "General"),
        "difficulty": (raw.get("difficulty") or "Medium").strip().capitalize(),
        "marks": int(raw.get("marks", 1)),
        "questionType": qtype,
        "question": raw.get("question", "").strip(),
        "options": raw.get("options") or [],
        "correctAnswer": (raw.get("correctAnswer") or "").strip(),
        "answer": (raw.get("answer") or raw.get("modelAnswer") or "").strip(),
        "sourceYear": raw.get("sourceYear"),
        "objective": qtype in ("MCQ", "Assertion Reason"),
    }
    q["qid"] = _qid(q)
    return q


def _load_file(path):
    with open(path, "r", encoding="utf-8-sig") as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("questions"), list):
        return data["questions"]
    return []


async def seed_questions(db):
    existing = await db.questions.count_documents({})
    if existing > 0:
        return existing
    seen = set()
    docs = []
    for path in sorted(glob.glob(os.path.join(DATA_DIR, "*.json"))):
        try:
            for raw in _load_file(path):
                if not raw.get("question"):
                    continue
                q = _normalize(raw)
                if q["qid"] in seen:
                    continue
                seen.add(q["qid"])
                docs.append(q)
        except Exception as e:
            print(f"[seed] skip {path}: {e}")
    if docs:
        await db.questions.insert_many(docs)
    print(f"[seed] inserted {len(docs)} questions")
    return len(docs)


async def seed_users(db):
    # Admin (username/password login)
    admin_username = "admin"
    admin_pw = "Admin@2026"
    admin = await db.users.find_one({"username": admin_username})
    if not admin:
        await db.users.insert_one({
            "name": "School Administrator", "username": admin_username,
            "email": "admin@edora.io",
            "password_hash": hash_password(admin_pw), "role": "admin",
            "disabled": False, "created_at": datetime.now(timezone.utc).isoformat(),
        })

    # Sample teacher (username login) — keep email for backward compatibility
    t_email = os.environ.get("TEACHER_EMAIL", "teacher@edora.io")
    teacher = await db.users.find_one({"email": t_email})
    if not teacher:
        await db.users.insert_one({
            "name": "Priya Sharma", "username": "priya.math",
            "email": t_email, "password_hash": hash_password("Teacher@2026"),
            "role": "teacher", "subjects": ["Mathematics"],
            "classes": ["Class 11", "Class 12"], "disabled": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    else:
        # ensure existing teacher has username/portfolio fields for the new model
        patch = {}
        if not teacher.get("username"):
            patch["username"] = "priya.math"
        if teacher.get("subjects") is None:
            patch["subjects"] = ["Mathematics"]
        if teacher.get("classes") is None:
            patch["classes"] = ["Class 11", "Class 12"]
        if "disabled" not in teacher:
            patch["disabled"] = False
        if patch:
            await db.users.update_one({"_id": teacher["_id"]}, {"$set": patch})


async def ensure_indexes(db):
    # Drop legacy non-sparse email index if present, then recreate as sparse.
    try:
        existing = await db.users.index_information()
        if "email_1" in existing and not existing["email_1"].get("sparse"):
            await db.users.drop_index("email_1")
    except Exception:
        pass
    await db.users.create_index("email", unique=True, sparse=True)
    await db.users.create_index("username", unique=True, sparse=True)
    await db.questions.create_index([("subject", 1), ("chapter", 1)])
    await db.questions.create_index("qid", unique=True)
    await db.exams.create_index("code", unique=True)
    await db.attempts.create_index("examCode")


async def seed_all(db):
    await ensure_indexes(db)
    await seed_users(db)
    await seed_questions(db)
