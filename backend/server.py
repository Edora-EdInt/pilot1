import os
import random
import string
import secrets
import asyncio
from datetime import datetime, timezone

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from bson import ObjectId

from db import get_db
from models import (RegisterInput, LoginInput, Blueprint, PublishInput,
                    StartAttemptInput, IntegrityEventInput, SubmitInput, now_iso)
from auth import (hash_password, verify_password, create_access_token,
                  create_refresh_token, set_auth_cookies, clear_auth_cookies,
                  get_current_user, require_teacher)
from selector import QuestionSelector
from seed import seed_all
from ai import grade_descriptive, generate_insight

app = FastAPI(title="Edora v2 API")
api = APIRouter(prefix="/api")

_analytics_cache = {"key": None, "insight": ""}


@app.exception_handler(RequestValidationError)
async def validation_handler(request, exc):
    return JSONResponse(status_code=422, content={
        "detail": "Some required fields are missing or invalid. Please review the form and try again."})

INTEGRITY_PENALTY = {
    "tab_switch": 5, "blur": 3, "refresh": 10,
    "fullscreen_exit": 5, "copy": 5, "paste": 5,
}


# ── helpers ──
def gen_code(n=6):
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=n))


def to_oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")


def clean(doc):
    if not doc:
        return doc
    doc = dict(doc)
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    return doc


def sanitize_question(q):
    """Strip answer keys before sending to a student."""
    return {
        "qid": q.get("qid"),
        "question": q.get("question"),
        "options": q.get("options", []),
        "marks": q.get("marks", 1),
        "questionType": q.get("questionType"),
        "difficulty": q.get("difficulty"),
        "objective": q.get("objective", False),
    }


def compute_integrity(events):
    score = 100
    for e in events:
        score -= INTEGRITY_PENALTY.get(e.get("type"), 0)
    return max(0, score)


# ── startup ──
@app.on_event("startup")
async def _startup():
    await seed_all(get_db())


# ── health ──
@api.get("/")
async def root():
    return {"status": "ok", "service": "edora-v2"}


# ── AUTH ──
@api.post("/auth/register")
async def register(body: RegisterInput, response: Response):
    db = get_db()
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    # Public self-registration is always a student. Teacher accounts are
    # provisioned via seeding/admin only (prevents privilege escalation).
    role = "student"
    doc = {"name": body.name, "email": email, "password_hash": hash_password(body.password),
           "role": role, "created_at": now_iso()}
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    set_auth_cookies(response, create_access_token(uid, email, role), create_refresh_token(uid))
    return {"id": uid, "name": body.name, "email": email, "role": role}


@api.post("/auth/login")
async def login(body: LoginInput, request: Request, response: Response):
    db = get_db()
    email = body.email.lower()
    # Account-based lockout (per-IP is unreliable behind the k8s ingress, whose
    # source IP rotates). Key on the normalized email.
    ident = email
    now_ts = datetime.now(timezone.utc).timestamp()
    rec = await db.login_attempts.find_one({"_id": ident})

    locked = bool(rec and rec.get("count", 0) >= 5 and rec.get("locked_until", 0) > now_ts)
    if locked:
        raise HTTPException(status_code=423, detail="Too many failed attempts. Try again in a few minutes.")
    # lock window elapsed -> start counting fresh
    expired = bool(rec and rec.get("count", 0) >= 5 and rec.get("locked_until", 0) <= now_ts)

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        base = 0 if (expired or not rec) else rec.get("count", 0)
        count = base + 1
        await db.login_attempts.update_one(
            {"_id": ident},
            {"$set": {"count": count,
                      "locked_until": now_ts + 900 if count >= 5 else 0}},
            upsert=True)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    await db.login_attempts.delete_one({"_id": ident})
    uid = str(user["_id"])
    set_auth_cookies(response, create_access_token(uid, email, user["role"]),
                     create_refresh_token(uid))
    return {"id": uid, "name": user["name"], "email": email, "role": user["role"]}


@api.post("/auth/logout")
async def logout(response: Response, user=Depends(get_current_user)):
    clear_auth_cookies(response)
    return {"ok": True}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user


# ── CURRICULUM / BANK ──
@api.get("/curriculum")
async def curriculum(user=Depends(get_current_user)):
    db = get_db()
    pipeline = [{"$group": {"_id": {"subject": "$subject"}, "chapters": {"$addToSet": "$chapter"}}}]
    out = {}
    async for row in db.questions.aggregate(pipeline):
        subject = row["_id"]["subject"]
        out[subject] = sorted([c for c in row["chapters"] if c])
    return {"subjects": sorted(out.keys()), "chapters": out}


@api.get("/questions/stats")
async def questions_stats(user=Depends(require_teacher)):
    db = get_db()
    total = await db.questions.count_documents({})
    by_type, by_diff, by_subject = {}, {}, {}
    async for r in db.questions.aggregate([{"$group": {"_id": "$questionType", "n": {"$sum": 1}}}]):
        by_type[r["_id"]] = r["n"]
    async for r in db.questions.aggregate([{"$group": {"_id": "$difficulty", "n": {"$sum": 1}}}]):
        by_diff[r["_id"]] = r["n"]
    async for r in db.questions.aggregate([{"$group": {"_id": "$subject", "n": {"$sum": 1}}}]):
        by_subject[r["_id"]] = r["n"]
    return {"total": total, "byType": by_type, "byDifficulty": by_diff, "bySubject": by_subject}


# ── EXAM GENERATION (teacher) ──
async def _fetch_pool(bp: dict):
    db = get_db()
    q = {}
    c = bp.get("curriculum", {})
    if c.get("board"):
        q["board"] = c["board"]
    if c.get("grade") is not None:
        q["class"] = int(c["grade"])
    if c.get("subject"):
        q["subject"] = c["subject"]
    if c.get("chapters"):
        q["chapter"] = {"$in": c["chapters"]}
    pool = []
    async for doc in db.questions.find(q):
        d = clean(doc)
        d["id"] = d["qid"]
        pool.append(d)
    return pool


@api.post("/exams/generate")
async def generate_exam(bp: Blueprint, user=Depends(require_teacher)):
    blueprint = bp.model_dump()
    pool = await _fetch_pool(blueprint)
    if not pool:
        raise HTTPException(status_code=400, detail="No questions match the selected curriculum.")
    selector = QuestionSelector(pool)
    variants = selector.select_variants(blueprint, count=max(1, min(bp.variants, 6)),
                                        base_seed=bp.seed)
    return {"variants": variants, "poolSize": len(pool)}


@api.post("/exams/publish")
async def publish_exam(body: PublishInput, user=Depends(require_teacher)):
    db = get_db()
    blueprint = body.blueprint.model_dump()
    if not body.qids:
        raise HTTPException(status_code=400, detail="No questions supplied to publish.")

    # Persist the EXACT questions the teacher previewed (by qid, preserving order).
    qmap = {}
    async for doc in db.questions.find({"qid": {"$in": body.qids}}):
        d = clean(doc)
        qmap[d["qid"]] = d
    questions = [qmap[q] for q in body.qids if q in qmap]
    if not questions:
        raise HTTPException(status_code=400, detail="Selected questions could not be found.")
    total = sum(int(q.get("marks", 1)) for q in questions)

    code = gen_code()
    while await db.exams.find_one({"code": code}):
        code = gen_code()

    exam = {
        "code": code,
        "name": blueprint.get("name", "Untitled Exam"),
        "board": blueprint["curriculum"]["board"],
        "class": blueprint["curriculum"]["grade"],
        "subject": blueprint["curriculum"]["subject"],
        "chapters": blueprint["curriculum"]["chapters"],
        "totalMarks": total,
        "targetMarks": blueprint["config"]["totalMarks"],
        "duration": blueprint["config"]["duration"],
        "variantLabel": body.variantLabel,
        "questions": questions,
        "startTime": body.startTime,
        "endTime": body.endTime,
        "status": "published",
        "publishedAt": now_iso(),
        "createdBy": user["id"],
    }
    await db.exams.insert_one(exam)
    return {"code": code, "name": exam["name"], "variantLabel": body.variantLabel,
            "totalMarks": total, "questionCount": len(questions)}


@api.get("/exams")
async def list_exams(user=Depends(require_teacher)):
    db = get_db()
    out = []
    async for doc in db.exams.find().sort("publishedAt", -1):
        e = clean(doc)
        attempts = await db.attempts.count_documents({"examCode": e["code"]})
        submitted = await db.attempts.count_documents({"examCode": e["code"], "status": "submitted"})
        avg = 0
        cur = db.attempts.aggregate([
            {"$match": {"examCode": e["code"], "status": "submitted"}},
            {"$group": {"_id": None, "avg": {"$avg": "$score.percentage"}}}])
        async for r in cur:
            avg = round(r["avg"] or 0, 1)
        out.append({
            "code": e["code"], "name": e["name"], "subject": e["subject"],
            "class": e["class"], "totalMarks": e["totalMarks"],
            "duration": e["duration"], "variantLabel": e.get("variantLabel"),
            "questionCount": len(e.get("questions", [])), "status": e["status"],
            "publishedAt": e["publishedAt"], "attempts": attempts,
            "submitted": submitted, "avgScore": avg,
        })
    return out


@api.get("/exams/{code}")
async def get_exam(code: str, user=Depends(require_teacher)):
    db = get_db()
    exam = await db.exams.find_one({"code": code})
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    return clean(exam)


# ── DASHBOARD (teacher) ──
@api.get("/dashboard/stats")
async def dashboard_stats(user=Depends(require_teacher)):
    db = get_db()
    total_exams = await db.exams.count_documents({})
    questions_in_bank = await db.questions.count_documents({})
    active_students = len(await db.attempts.distinct("studentName"))
    submitted = await db.attempts.count_documents({"status": "submitted"})

    avg_score = 0
    async for r in db.attempts.aggregate([
        {"$match": {"status": "submitted"}},
        {"$group": {"_id": None, "avg": {"$avg": "$score.percentage"}}}]):
        avg_score = round(r["avg"] or 0, 1)

    ai_graded = 0
    async for r in db.attempts.aggregate([
        {"$match": {"status": "submitted"}},
        {"$group": {"_id": None, "n": {"$sum": "$aiGradedCount"}}}]):
        ai_graded = r["n"] or 0

    recent = []
    async for doc in db.exams.find().sort("publishedAt", -1).limit(5):
        e = clean(doc)
        subs = await db.attempts.count_documents({"examCode": e["code"], "status": "submitted"})
        avg = 0
        async for r in db.attempts.aggregate([
            {"$match": {"examCode": e["code"], "status": "submitted"}},
            {"$group": {"_id": None, "avg": {"$avg": "$score.percentage"}}}]):
            avg = round(r["avg"] or 0, 1)
        recent.append({"code": e["code"], "name": e["name"], "subject": e["subject"],
                       "students": subs, "avgScore": avg, "status": e["status"],
                       "publishedAt": e["publishedAt"]})

    return {
        "totalExams": total_exams,
        "activeStudents": active_students,
        "questionsInBank": questions_in_bank,
        "avgScore": avg_score,
        "submissions": submitted,
        "aiGraded": ai_graded,
        "recentExams": recent,
    }


@api.get("/analytics")
async def analytics(user=Depends(require_teacher)):
    db = get_db()
    buckets = {"0-40": 0, "40-60": 0, "60-75": 0, "75-90": 0, "90-100": 0}
    integrity = {"clean": 0, "minor": 0, "flagged": 0}
    scores = []
    async for a in db.attempts.find({"status": "submitted"}):
        p = (a.get("score") or {}).get("percentage", 0)
        scores.append(p)
        if p < 40: buckets["0-40"] += 1
        elif p < 60: buckets["40-60"] += 1
        elif p < 75: buckets["60-75"] += 1
        elif p < 90: buckets["75-90"] += 1
        else: buckets["90-100"] += 1
        isc = a.get("integrityScore", 100)
        if isc >= 90: integrity["clean"] += 1
        elif isc >= 70: integrity["minor"] += 1
        else: integrity["flagged"] += 1

    exam_perf = []
    async for doc in db.exams.find():
        e = clean(doc)
        avg = 0
        async for r in db.attempts.aggregate([
            {"$match": {"examCode": e["code"], "status": "submitted"}},
            {"$group": {"_id": None, "avg": {"$avg": "$score.percentage"}}}]):
            avg = round(r["avg"] or 0, 1)
        if avg:
            exam_perf.append({"name": e["name"], "subject": e["subject"], "avgScore": avg})
    exam_perf.sort(key=lambda x: -x["avgScore"])

    insight = ""
    if scores:
        avg = round(sum(scores) / len(scores), 1)
        cache_key = f"{len(scores)}:{avg}:{buckets}:{integrity}"
        if _analytics_cache["key"] == cache_key:
            insight = _analytics_cache["insight"]
        else:
            insight = await generate_insight(
                f"Across {len(scores)} graded exam attempts the average score is {avg}% with "
                f"score distribution {buckets} and integrity {integrity}. Give one actionable insight for a teacher.")
            _analytics_cache["key"] = cache_key
            _analytics_cache["insight"] = insight
    return {"scoreDistribution": buckets, "integrityDistribution": integrity,
            "examPerformance": exam_perf[:8], "totalSubmissions": len(scores),
            "insight": insight}


@api.get("/attempts")
async def list_attempts(user=Depends(require_teacher)):
    db = get_db()
    out = []
    async for doc in db.attempts.find().sort("submittedAt", -1):
        a = clean(doc)
        a.pop("photo", None)
        a.pop("token", None)
        out.append({
            "id": a["id"], "examCode": a["examCode"], "studentName": a["studentName"],
            "status": a["status"], "score": a.get("score"),
            "integrityScore": a.get("integrityScore", 100),
            "tabSwitches": a.get("tabSwitches", 0),
            "submittedAt": a.get("submittedAt"), "startedAt": a.get("startedAt"),
        })
    return out


@api.get("/attempts/{attempt_id}")
async def get_attempt(attempt_id: str, user=Depends(require_teacher)):
    db = get_db()
    a = await db.attempts.find_one({"_id": to_oid(attempt_id)})
    if not a:
        raise HTTPException(status_code=404, detail="Attempt not found")
    a = clean(a)
    a.pop("token", None)
    return a


# ── STUDENT FLOW ──
@api.post("/student/start")
async def student_start(body: StartAttemptInput):
    db = get_db()
    exam = await db.exams.find_one({"code": body.code.upper().strip()})
    if not exam:
        raise HTTPException(status_code=404, detail="Invalid exam code")
    token = secrets.token_urlsafe(24)
    attempt = {
        "examCode": exam["code"], "examName": exam["name"],
        "studentName": body.studentName.strip(), "photo": body.photo,
        "startedAt": now_iso(), "answers": {}, "integrityEvents": [],
        "integrityScore": 100, "tabSwitches": 0, "status": "in_progress",
        "duration": exam["duration"], "token": token,
    }
    res = await db.attempts.insert_one(attempt)
    return {
        "attemptId": str(res.inserted_id),
        "attemptToken": token,
        "exam": {
            "code": exam["code"], "name": exam["name"], "subject": exam["subject"],
            "duration": exam["duration"], "totalMarks": exam["totalMarks"],
            "questions": [sanitize_question(q) for q in exam.get("questions", [])],
        },
    }


async def _load_attempt_authorized(attempt_id: str, token: str):
    db = get_db()
    a = await db.attempts.find_one({"_id": to_oid(attempt_id)})
    if not a:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if a.get("token") != token:
        raise HTTPException(status_code=403, detail="Invalid attempt token")
    return a


@api.post("/student/{attempt_id}/integrity")
async def record_integrity(attempt_id: str, body: IntegrityEventInput):
    db = get_db()
    a = await _load_attempt_authorized(attempt_id, body.token)
    if a["status"] != "in_progress":
        raise HTTPException(status_code=400, detail="Attempt not active")
    events = a.get("integrityEvents", [])
    events.append({"type": body.type, "at": body.at})
    tab = sum(1 for e in events if e["type"] == "tab_switch")
    score = compute_integrity(events)
    await db.attempts.update_one({"_id": to_oid(attempt_id)}, {"$set": {
        "integrityEvents": events, "integrityScore": score, "tabSwitches": tab,
    }})
    return {"ok": True, "integrityScore": score}


@api.post("/student/{attempt_id}/submit")
async def student_submit(attempt_id: str, body: SubmitInput):
    db = get_db()
    a = await _load_attempt_authorized(attempt_id, body.token)
    if a["status"] == "submitted":
        raise HTTPException(status_code=400, detail="Already submitted")
    exam = await db.exams.find_one({"code": a["examCode"]})
    questions = exam.get("questions", [])
    answers = body.answers or {}

    marks_obtained = 0.0
    max_marks = 0
    details = [None] * len(questions)  # preserve original question order
    ai_count = 0

    grade_tasks = []
    grade_slots = []  # (index, meta)
    for i, q in enumerate(questions):
        qid = q.get("qid")
        max_q = int(q.get("marks", 1))
        max_marks += max_q
        student_ans = (answers.get(qid) or "").strip()
        if q.get("objective"):
            correct = (q.get("correctAnswer") or "").strip().upper()
            given = student_ans.upper()
            ok = given == correct and given != ""
            awarded = max_q if ok else 0
            marks_obtained += awarded
            details[i] = {
                "qid": qid, "question": q.get("question"),
                "type": q.get("questionType"), "maxMarks": max_q,
                "studentAnswer": student_ans or "—", "correctAnswer": correct or "—",
                "awarded": awarded, "correct": ok, "method": "auto",
                "feedback": "Correct" if ok else "Incorrect",
            }
        else:
            grade_tasks.append(grade_descriptive(q.get("question", ""), q.get("answer", ""),
                                                  student_ans, max_q))
            grade_slots.append((i, {"qid": qid, "question": q.get("question"),
                                    "type": q.get("questionType"), "maxMarks": max_q,
                                    "studentAnswer": student_ans or "—"}))

    if grade_tasks:
        results = await asyncio.gather(*grade_tasks, return_exceptions=True)
        for (i, meta), r in zip(grade_slots, results):
            if isinstance(r, Exception) or not isinstance(r, dict):
                r = {"marks": 0, "feedback": "Grading error.", "confidence": 0.0, "method": "error"}
            awarded = float(r.get("marks", 0))
            marks_obtained += awarded
            if r.get("method") == "ai":
                ai_count += 1
            details[i] = {**meta, "correctAnswer": "(AI graded vs model answer)",
                          "awarded": round(awarded, 1), "correct": awarded >= meta["maxMarks"] * 0.5,
                          "method": r.get("method", "ai"), "feedback": r.get("feedback", ""),
                          "confidence": r.get("confidence")}

    percentage = round((marks_obtained / max_marks) * 100, 1) if max_marks else 0
    integrity_score = compute_integrity(a.get("integrityEvents", []))

    score = {"marksObtained": round(marks_obtained, 1), "maxMarks": max_marks, "percentage": percentage}
    await db.attempts.update_one({"_id": to_oid(attempt_id)}, {"$set": {
        "answers": answers, "status": "submitted", "submittedAt": now_iso(),
        "score": score, "gradedDetails": details, "integrityScore": integrity_score,
        "aiGradedCount": ai_count,
    }})
    return {"score": score, "integrityScore": integrity_score,
            "details": details, "aiGraded": ai_count}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
