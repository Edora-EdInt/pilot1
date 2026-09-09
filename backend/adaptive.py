"""Adaptive Live Practice Sessions.

A separate, UNGRADED practice-session feature (join-code based, like a live
quiz) built on the same difficulty-adjustment rule verified in the
teacher-facing Adaptive Demo sandbox (Insights > Assistant > Adaptive Demo).
This intentionally does NOT touch the exams/attempts collections, formal
grading, or integrity/proctoring system — per product decision, it is
skill-building practice only, not a formal exam record.

MCQ-only: correctness must be evaluated instantly server-side to drive
real-time difficulty adjustment (descriptive answers would need AI grading,
which is too slow for a live adaptive loop).
"""
import random
import secrets
import string
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from db import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/adaptive")

LEVELS = ["Easy", "Medium", "Hard"]
STEPS_UP = 2
STEPS_DOWN = 1
START_LEVEL_INDEX = 1


async def require_teacher(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Teacher access required")
    return user


def gen_code(n=6):
    return "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(n))


def now_iso():
    return datetime.now(timezone.utc).isoformat()


class CreateSessionInput(BaseModel):
    board: str = "CBSE"
    klass: int
    subject: str
    chapter: str = ""


class JoinInput(BaseModel):
    code: str
    studentName: str


class AnswerInput(BaseModel):
    code: str
    studentName: str
    qid: str
    selectedAnswer: str


def _clean_q(q):
    if not q:
        return None
    return {"qid": q.get("qid"), "question": q.get("question"), "options": q.get("options", []),
            "marks": q.get("marks"), "chapter": q.get("chapter")}


async def _pick_question(db, session, participant):
    """Pick an unused MCQ at the participant's current difficulty tier.

    Real-data note: this question bank's MCQs are overwhelmingly tagged
    'Easy' (Medium/Hard difficulty is mostly reserved for Short/Long answer
    types, which are excluded here since this feature is MCQ-only). Rather
    than dead-ending a session when a Medium/Hard MCQ tier is empty, fall
    back to any unused MCQ in the same subject/chapter pool — the level
    still tracks the student's real correct/incorrect performance honestly,
    it just means questions may repeat the same tier until richer
    Medium/Hard MCQs exist in the bank."""
    level = LEVELS[participant["levelIndex"]]
    base_filter = {"board": session["board"], "class": session["class"], "subject": session["subject"],
                   "objective": True, "questionType": "MCQ", "qid": {"$nin": participant.get("usedQids", [])}}
    if session.get("chapter"):
        base_filter["chapter"] = session["chapter"]
    docs = [d async for d in db.questions.find({**base_filter, "difficulty": level})]
    if not docs:
        docs = [d async for d in db.questions.find(base_filter)]
    if not docs:
        return None
    return random.choice(docs)


def _new_participant():
    return {"levelIndex": START_LEVEL_INDEX, "correctStreak": 0, "incorrectStreak": 0,
            "totalAnswered": 0, "totalCorrect": 0, "usedQids": [], "log": [],
            "joinedAt": now_iso(), "lastActiveAt": now_iso()}


# ══════════════════════ Teacher: create/manage sessions ══════════════════════
@router.post("/sessions")
async def create_session(body: CreateSessionInput, user=Depends(require_teacher)):
    db = get_db()
    q_filter = {"board": body.board, "class": body.klass, "subject": body.subject,
                "objective": True, "questionType": "MCQ"}
    if body.chapter:
        q_filter["chapter"] = body.chapter
    count = await db.questions.count_documents(q_filter)
    if count < 3:
        raise HTTPException(status_code=400, detail="Not enough MCQ questions for this selection (need at least 3).")

    code = gen_code()
    while await db.adaptive_sessions.find_one({"code": code}):
        code = gen_code()
    doc = {
        "code": code, "teacherUsername": user["username"], "board": body.board, "class": body.klass,
        "subject": body.subject, "chapter": body.chapter or None, "status": "active",
        "createdAt": now_iso(), "closedAt": None, "participants": {},
    }
    await db.adaptive_sessions.insert_one(doc)
    return {"code": code, "board": body.board, "class": body.klass, "subject": body.subject, "chapter": body.chapter or None}


@router.get("/sessions")
async def list_sessions(user=Depends(require_teacher)):
    db = get_db()
    out = []
    async for s in db.adaptive_sessions.find({"teacherUsername": user["username"]}).sort("createdAt", -1).limit(20):
        out.append({"code": s["code"], "board": s["board"], "class": s["class"], "subject": s["subject"],
                    "chapter": s.get("chapter"), "status": s["status"], "createdAt": s["createdAt"],
                    "participantCount": len(s.get("participants", {}))})
    return out


@router.get("/sessions/{code}")
async def session_detail(code: str, user=Depends(require_teacher)):
    db = get_db()
    s = await db.adaptive_sessions.find_one({"code": code.strip().upper(), "teacherUsername": user["username"]})
    if not s:
        raise HTTPException(status_code=404, detail="Session not found.")
    participants = []
    for name, p in s.get("participants", {}).items():
        acc = round(p["totalCorrect"] / p["totalAnswered"] * 100) if p["totalAnswered"] else 0
        participants.append({"name": name, "level": LEVELS[p["levelIndex"]], "totalAnswered": p["totalAnswered"],
                             "totalCorrect": p["totalCorrect"], "accuracyPct": acc, "lastActiveAt": p.get("lastActiveAt")})
    participants.sort(key=lambda p: (-p["totalAnswered"], p["name"]))
    return {"code": s["code"], "board": s["board"], "class": s["class"], "subject": s["subject"],
            "chapter": s.get("chapter"), "status": s["status"], "createdAt": s["createdAt"],
            "participants": participants}


@router.post("/sessions/{code}/close")
async def close_session(code: str, user=Depends(require_teacher)):
    db = get_db()
    res = await db.adaptive_sessions.update_one({"code": code.strip().upper(), "teacherUsername": user["username"]},
                                                {"$set": {"status": "closed", "closedAt": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {"status": "closed"}


# ══════════════════════ Student: join & play (no auth — join-code based, like exam join) ══════════════════════
@router.post("/join")
async def join_session(body: JoinInput):
    db = get_db()
    s = await db.adaptive_sessions.find_one({"code": body.code.strip().upper()})
    if not s:
        raise HTTPException(status_code=404, detail="Session code not found.")
    if s["status"] != "active":
        raise HTTPException(status_code=400, detail="This practice session has been closed by the teacher.")
    name = body.studentName.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Please enter your name.")

    participants = s.get("participants", {})
    p = participants.get(name)
    if not p:
        p = _new_participant()
        await db.adaptive_sessions.update_one({"code": s["code"]}, {"$set": {f"participants.{name}": p}})

    q = await _pick_question(db, s, p)
    return {
        "code": s["code"], "subject": s["subject"], "chapter": s.get("chapter"), "class": s["class"],
        "level": LEVELS[p["levelIndex"]], "totalAnswered": p["totalAnswered"], "totalCorrect": p["totalCorrect"],
        "question": _clean_q(q),
    }


@router.post("/answer")
async def answer_question(body: AnswerInput):
    db = get_db()
    s = await db.adaptive_sessions.find_one({"code": body.code.strip().upper()})
    if not s:
        raise HTTPException(status_code=404, detail="Session code not found.")
    if s["status"] != "active":
        raise HTTPException(status_code=400, detail="This practice session has been closed by the teacher.")
    name = body.studentName.strip()
    p = s.get("participants", {}).get(name)
    if not p:
        raise HTTPException(status_code=404, detail="You haven't joined this session yet.")

    q = await db.questions.find_one({"qid": body.qid})
    if not q:
        raise HTTPException(status_code=404, detail="Question not found.")
    correct_answer = (q.get("correctAnswer") or "").strip().upper()
    given = (body.selectedAnswer or "").strip().upper()
    is_correct = given == correct_answer and given != ""

    previous_level = LEVELS[p["levelIndex"]]
    changed = False
    if is_correct:
        p["correctStreak"] += 1
        p["totalCorrect"] += 1
        if p["levelIndex"] < len(LEVELS) - 1 and p["correctStreak"] >= STEPS_UP:
            p["levelIndex"] += 1; changed = True; p["correctStreak"] = 0
        p["incorrectStreak"] = 0
    else:
        p["incorrectStreak"] += 1
        if p["levelIndex"] > 0 and p["incorrectStreak"] >= STEPS_DOWN:
            p["levelIndex"] -= 1; changed = True; p["incorrectStreak"] = 0
        p["correctStreak"] = 0
    p["totalAnswered"] += 1
    p["usedQids"] = (p.get("usedQids") or []) + [body.qid]
    p["lastActiveAt"] = now_iso()
    p["log"] = ([{"n": p["totalAnswered"], "correct": is_correct, "previousLevel": previous_level,
                 "level": LEVELS[p["levelIndex"]], "changed": changed}] + p.get("log", []))[:50]

    await db.adaptive_sessions.update_one({"code": s["code"]}, {"$set": {f"participants.{name}": p}})

    next_q = await _pick_question(db, s, p)
    return {
        "correct": is_correct, "correctAnswer": correct_answer, "changed": changed,
        "previousLevel": previous_level, "level": LEVELS[p["levelIndex"]],
        "totalAnswered": p["totalAnswered"], "totalCorrect": p["totalCorrect"],
        "question": _clean_q(next_q),
    }
