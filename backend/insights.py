"""Insights module.

Ports the 9 analytics pages from the standalone "EdInt Intelligence" project
(github.com/Edora-EdInt/exam-intelligence) onto Edora's REAL MongoDB data
(questions / exams / attempts) instead of that project's own fake JSON
dataset. Teacher-only.

Mapping notes (Edora has no persistent Student/Class-section entities):
  * "student" = the free-text `studentName` a student typed when starting an
    attempt (there are no student accounts in Edora).
  * "class" = an exam's grade (`class` field, e.g. 10/11/12). Edora has no
    section concept, so there is no "10-A" style class id, just the grade.
  * "concept" tags don't exist on questions, so Question Trends operates at
    chapter granularity (the finest tag Edora's question bank actually has).
  * "errorType" (Formula/Calculation/Concept) doesn't exist on graded
    answers, so mistake breakdowns use `questionType` (MCQ/Short/Long/...)
    instead — a real field, rather than inventing a fake taxonomy.
  * Practice Generator returns REAL question text (Edora has real content;
    the source project only had placeholder prompts).
"""
import statistics
import random
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from db import get_db
from auth import get_current_user
from visibility import can_use_question

router = APIRouter(prefix="/api/insights")


async def require_teacher(user: dict = Depends(get_current_user)) -> dict:
    """Strictly teacher-only (unlike auth.require_teacher, which also allows
    admin) — Insights is scoped to teachers per product decision."""
    if user.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Teacher access required")
    return user

# ── tunables (mirrors EdInt Intelligence's config.json defaults) ──
READINESS_BANDS = [
    {"minPct": 80, "label": "Excellent"},
    {"minPct": 65, "label": "Good"},
    {"minPct": 50, "label": "Needs Work"},
    {"minPct": 0, "label": "At Risk"},
]
STRONG_CHAPTER_PCT = 80
WEAK_CHAPTER_PCT = 60
STRUGGLE_CHAPTER_PCT = WEAK_CHAPTER_PCT
BANK_TARGET_QUESTIONS = 10
PRACTICE_WEAKEST_CHAPTERS = 2
PRACTICE_DEFAULT_COUNT = 10
PRACTICE_MAX_COUNT = 30
PRACTICE_DIFFICULTY_WEIGHTS = {"Easy": 20, "Medium": 50, "Hard": 30}


class PracticeGenerateInput(BaseModel):
    studentName: str
    questionCount: int = PRACTICE_DEFAULT_COUNT


# ── small helpers ──
def pct1(earned, possible):
    return round((earned / possible) * 1000) / 10 if possible else 0.0


def readiness_for(score_pct):
    for band in READINESS_BANDS:
        if score_pct >= band["minPct"]:
            return band["label"]
    return READINESS_BANDS[-1]["label"]


def _norm_class(klass):
    try:
        return int(klass)
    except (TypeError, ValueError):
        return klass


def _ckey(d):
    return (d.get("board"), d.get("class"), d.get("subject"), d.get("chapter"))


# ── shared loaders ──
async def _published_exams(db, subject=None, klass=None):
    q = {"status": "published"}
    if subject:
        q["subject"] = subject
    if klass is not None:
        q["class"] = _norm_class(klass)
    return [e async for e in db.exams.find(q)]


async def _answer_rows(db, klass=None):
    """Flatten submitted attempts into per-question answer rows, joined
    against the exam's embedded question docs (for chapter/subject/etc)."""
    exam_q = {"status": "published"}
    if klass is not None:
        exam_q["class"] = _norm_class(klass)
    exams = {e["code"]: e async for e in db.exams.find(exam_q)}
    if not exams:
        return []
    rows = []
    async for a in db.attempts.find({"examCode": {"$in": list(exams.keys())}, "status": "submitted"}):
        exam = exams[a["examCode"]]
        qmap = {q.get("qid"): q for q in exam.get("questions", [])}
        student = (a.get("studentName") or "Unknown").strip()
        for d in a.get("gradedDetails") or []:
            q = qmap.get(d.get("qid"))
            if not q:
                continue
            rows.append({
                "studentName": student, "examCode": exam["code"], "examClass": exam.get("class"),
                "qid": d.get("qid"), "subject": q.get("subject"), "chapter": q.get("chapter"),
                "board": q.get("board"), "difficulty": q.get("difficulty"),
                "questionType": q.get("questionType"),
                "maxMarks": d.get("maxMarks", q.get("marks", 1)), "awarded": float(d.get("awarded", 0)),
                "correct": bool(d.get("correct")),
            })
    return rows


def _chapter_rows_from_answers(rows):
    """Aggregate answer rows into per-chapter mastery, weakest first."""
    acc = {}
    for r in rows:
        key = _ckey({"board": r["board"], "class": r["examClass"], "subject": r["subject"], "chapter": r["chapter"]})
        e = acc.setdefault(key, {"board": r["board"], "class": r["examClass"], "subject": r["subject"],
                                  "chapter": r["chapter"], "marksEarned": 0.0, "marksPossible": 0.0,
                                  "answers": 0, "students": set()})
        e["marksEarned"] += r["awarded"]
        e["marksPossible"] += r["maxMarks"]
        e["answers"] += 1
        e["students"].add(r["studentName"])
    out = []
    for e in acc.values():
        out.append({
            "board": e["board"], "class": e["class"], "subject": e["subject"], "chapter": e["chapter"],
            "marksEarned": round(e["marksEarned"], 1), "marksPossible": e["marksPossible"],
            "answers": e["answers"], "studentsAssessed": len(e["students"]),
            "masteryPct": pct1(e["marksEarned"], e["marksPossible"]),
        })
    out.sort(key=lambda r: (r["masteryPct"], r["chapter"] or ""))
    return out


def _classify(chapters):
    strong = [c for c in chapters if c["masteryPct"] >= STRONG_CHAPTER_PCT]
    weak = [c for c in chapters if c["masteryPct"] < WEAK_CHAPTER_PCT]
    return strong, weak


def _compute_weightage(exams):
    per_chapter = {}
    for e in exams:
        totals = {}
        for qd in e.get("questions", []):
            k = _ckey(qd)
            totals[k] = totals.get(k, 0) + int(qd.get("marks", 1))
        exam_total = int(e.get("totalMarks", 0)) or sum(totals.values())
        for k, marks in totals.items():
            entry = per_chapter.setdefault(k, {"marks": [], "shares": []})
            entry["marks"].append(marks)
            entry["shares"].append(round(marks / exam_total * 1000) / 10 if exam_total else 0)
    out = {}
    for k, entry in per_chapter.items():
        marks = entry["marks"]
        out[k] = {
            "examsAppearedIn": len(marks), "minMarks": min(marks), "maxMarks": max(marks),
            "avgMarks": round(statistics.mean(marks) * 10) / 10,
            "avgSharePct": round(statistics.mean(entry["shares"]) * 10) / 10 if entry["shares"] else None,
        }
    return out


# ══════════════════════ meta ══════════════════════
@router.get("/meta")
async def insights_meta(user=Depends(require_teacher)):
    db = get_db()
    subjects = await db.questions.distinct("subject")
    boards = await db.questions.distinct("board")
    classes = await db.questions.distinct("class")
    return {
        "subjects": sorted(s for s in subjects if s),
        "boards": sorted(b for b in boards if b),
        "classes": sorted((c for c in classes if c is not None), key=lambda x: int(x)),
    }


# ══════════════════════ 1. Chapter Intelligence ══════════════════════
@router.get("/chapters")
async def list_chapters(subject: str = "", klass: str = "", board: str = "", user=Depends(require_teacher)):
    db = get_db()
    match = {}
    if subject: match["subject"] = subject
    if klass: match["class"] = _norm_class(klass)
    if board: match["board"] = board
    pipeline = [
        {"$match": match},
        {"$group": {"_id": {"board": "$board", "class": "$class", "subject": "$subject", "chapter": "$chapter"},
                     "questionCount": {"$sum": 1}, "totalMarksCoverage": {"$sum": "$marks"}}},
    ]
    out = []
    async for r in db.questions.aggregate(pipeline):
        out.append({**r["_id"], "questionCount": r["questionCount"], "totalMarksCoverage": r["totalMarksCoverage"]})
    out.sort(key=lambda c: (c["subject"] or "", c["chapter"] or ""))
    return out


@router.get("/chapters/stats")
async def chapter_stats(board: str, klass: str, subject: str, chapter: str, user=Depends(require_teacher)):
    db = get_db()
    q = {"board": board, "class": _norm_class(klass), "subject": subject, "chapter": chapter}
    questions = [d async for d in db.questions.find(q)]
    if not questions:
        raise HTTPException(status_code=404, detail="No questions found for this chapter.")

    def distribution(key, keys):
        out = []
        for k in keys:
            count = sum(1 for x in questions if x.get(key) == k)
            out.append({"key": k, "count": count,
                        "pct": round(count / len(questions) * 1000) / 10 if questions else 0})
        return out

    types = sorted({x.get("questionType") for x in questions if x.get("questionType")})
    return {
        "chapter": {"board": board, "class": _norm_class(klass), "subject": subject, "chapter": chapter},
        "questionCount": len(questions),
        "totalMarks": sum(int(x.get("marks", 1)) for x in questions),
        "typeDistribution": distribution("questionType", types),
        "difficultyDistribution": distribution("difficulty", ["Easy", "Medium", "Hard"]),
    }


# ══════════════════════ 2. Question Trends (chapter-level) ══════════════════════
@router.get("/question-trends")
async def question_trends(subject: str = "", user=Depends(require_teacher)):
    db = get_db()
    qfilter = {"subject": subject} if subject else {}
    bank_count = {}
    async for r in db.questions.aggregate([
        {"$match": qfilter},
        {"$group": {"_id": {"board": "$board", "class": "$class", "subject": "$subject", "chapter": "$chapter"},
                     "n": {"$sum": 1}}}]):
        bank_count[_ckey(r["_id"])] = r["n"]

    exams = await _published_exams(db, subject=subject or None)
    exams.sort(key=lambda e: e.get("publishedAt") or "")
    half = -(-len(exams) // 2)  # ceil
    early_codes = {e["code"] for e in exams[:half]}

    appearances = {}
    for e in exams:
        seen = set()
        for qd in e.get("questions", []):
            k = _ckey(qd)
            if k in seen:
                continue
            seen.add(k)
            entry = appearances.setdefault(k, {"early": 0, "late": 0, "total": 0})
            entry["total"] += 1
            entry["early" if e["code"] in early_codes else "late"] += 1

    items = []
    for k, entry in appearances.items():
        board, klass, subj, chapter = k
        early, late = entry["early"], entry["late"]
        if early == 0:
            direction, delta = ("up" if late > 0 else "flat"), None
        else:
            delta = round((late - early) / early * 100)
            direction = "up" if delta > 8 else "down" if delta < -8 else "flat"
        items.append({
            "chapter": chapter, "subject": subj, "board": board, "class": klass,
            "bankQuestions": bank_count.get(k, 0), "appearances": entry["total"],
            "direction": direction, "deltaPct": delta,
        })
    items.sort(key=lambda x: (-x["appearances"], x["chapter"] or ""))
    for i, item in enumerate(items, 1):
        item["rank"] = i
    return {"items": items[:20], "examsCovered": len(exams)}


# ══════════════════════ 3. Exam Patterns (chapter weightage) ══════════════════════
@router.get("/chapter-weightage")
async def chapter_weightage(subject: str = "", user=Depends(require_teacher)):
    db = get_db()
    exams = await _published_exams(db, subject=subject or None)
    weight_map = _compute_weightage(exams)
    items = []
    for k, w in weight_map.items():
        board, klass, subj, chapter = k
        items.append({"board": board, "class": klass, "subject": subj, "chapter": chapter, **w})
    items.sort(key=lambda x: (-x["avgMarks"], -x["examsAppearedIn"], x["chapter"] or ""))
    return {"items": items, "examsCovered": len(exams)}


# ══════════════════════ 4. Question Bank Health ══════════════════════
@router.get("/bank-health")
async def bank_health(user=Depends(require_teacher)):
    db = get_db()
    chapters = {}
    async for r in db.questions.aggregate([
        {"$group": {"_id": {"board": "$board", "class": "$class", "subject": "$subject", "chapter": "$chapter"},
                     "n": {"$sum": 1}}}]):
        chapters[_ckey(r["_id"])] = r["n"]

    total_questions = sum(chapters.values())
    completeness = []
    for k, count in chapters.items():
        board, klass, subj, chapter = k
        pct = min(100, round(count / BANK_TARGET_QUESTIONS * 100))
        completeness.append({"board": board, "class": klass, "subject": subj, "chapter": chapter,
                              "questionCount": count, "targetQuestions": BANK_TARGET_QUESTIONS, "percent": pct})
    completeness.sort(key=lambda c: (c["percent"], c["chapter"] or ""))

    coverage_map = {}
    for k, count in chapters.items():
        board, klass, subj, chapter = k
        ce = coverage_map.setdefault((board, klass), {"board": board, "class": klass, "chapterCount": 0, "questionCount": 0})
        ce["chapterCount"] += 1
        ce["questionCount"] += count
    coverage = sorted(coverage_map.values(), key=lambda c: (c["board"] or "", c["class"] or 0))

    n_chapters = len(chapters)
    subjects = {k[2] for k in chapters}
    totals = {
        "questions": total_questions, "chapters": n_chapters, "subjects": len(subjects),
        "boardClassCombinations": len(coverage_map),
        "avgQuestionsPerChapter": round(total_questions / n_chapters * 10) / 10 if n_chapters else 0,
        "overallCompletenessPct": min(100, round(total_questions / (n_chapters * BANK_TARGET_QUESTIONS) * 100)) if n_chapters else 0,
    }
    return {"totals": totals, "coverage": coverage, "completeness": completeness, "targetQuestions": BANK_TARGET_QUESTIONS}


# ══════════════════════ 5. Student Profiles ══════════════════════
@router.get("/students")
async def list_students(klass: str = "", user=Depends(require_teacher)):
    db = get_db()
    rows = await _answer_rows(db, klass=klass or None)
    if not rows:
        return []
    agg = {}
    for r in rows:
        e = agg.setdefault(r["studentName"], {"marksEarned": 0.0, "marksPossible": 0.0, "exams": set()})
        e["marksEarned"] += r["awarded"]; e["marksPossible"] += r["maxMarks"]; e["exams"].add(r["examCode"])
    out = [{"name": name, "examsTaken": len(e["exams"]), "scorePct": pct1(e["marksEarned"], e["marksPossible"])}
           for name, e in agg.items()]
    out.sort(key=lambda s: s["name"])
    return out


@router.get("/students/{name}/summary")
async def student_summary(name: str, user=Depends(require_teacher)):
    db = get_db()
    rows = [r for r in await _answer_rows(db) if r["studentName"].lower() == name.strip().lower()]
    if not rows:
        raise HTTPException(status_code=404, detail="No graded attempts found for this student.")
    earned = sum(r["awarded"] for r in rows)
    possible = sum(r["maxMarks"] for r in rows)
    score_pct = pct1(earned, possible)
    chapters = {_ckey({"board": r["board"], "class": r["examClass"], "subject": r["subject"], "chapter": r["chapter"]}) for r in rows}
    return {
        "name": rows[0]["studentName"],
        "totals": {
            "answers": len(rows), "correct": sum(1 for r in rows if r["correct"]),
            "incorrect": sum(1 for r in rows if not r["correct"]),
            "marksAwarded": round(earned, 1), "marksPossible": possible, "scorePct": score_pct,
            "examsTaken": len({r["examCode"] for r in rows}), "chaptersTouched": len(chapters),
        },
        "readiness": readiness_for(score_pct),
    }


@router.get("/students/{name}/chapter-mastery")
async def student_chapter_mastery(name: str, user=Depends(require_teacher)):
    db = get_db()
    rows = [r for r in await _answer_rows(db) if r["studentName"].lower() == name.strip().lower()]
    if not rows:
        raise HTTPException(status_code=404, detail="No graded attempts found for this student.")
    chapters = _chapter_rows_from_answers(rows)
    strong, weak = _classify(chapters)
    return {"name": rows[0]["studentName"], "chapters": chapters, "strongAreas": strong, "needsImprovement": weak,
            "strongChapterPct": STRONG_CHAPTER_PCT, "weakChapterPct": WEAK_CHAPTER_PCT}


@router.get("/students/{name}/type-breakdown")
async def student_type_breakdown(name: str, user=Depends(require_teacher)):
    """Mistake breakdown by question type — replaces the source project's
    fictional Formula/Calculation/Concept error taxonomy (Edora doesn't tag
    that), using the real `questionType` field instead."""
    db = get_db()
    rows = [r for r in await _answer_rows(db) if r["studentName"].lower() == name.strip().lower()]
    if not rows:
        raise HTTPException(status_code=404, detail="No graded attempts found for this student.")
    mistakes = [r for r in rows if not r["correct"]]
    types = sorted({r["questionType"] for r in rows if r["questionType"]})
    breakdown = []
    for t in types:
        count = sum(1 for m in mistakes if m["questionType"] == t)
        breakdown.append({"type": t, "count": count,
                           "pct": round(count / len(mistakes) * 1000) / 10 if mistakes else 0})
    breakdown.sort(key=lambda b: -b["count"])
    most_common = breakdown[0] if breakdown and breakdown[0]["count"] > 0 else None
    return {"totals": {"totalAnswers": len(rows), "correctAnswers": len(rows) - len(mistakes), "mistakes": len(mistakes)},
            "breakdown": breakdown, "mostCommon": most_common}


# ══════════════════════ 6. Class Analytics ══════════════════════
@router.get("/classes")
async def list_classes(user=Depends(require_teacher)):
    db = get_db()
    exams = await _published_exams(db)
    classes = sorted({e.get("class") for e in exams if e.get("class") is not None}, key=lambda x: int(x))
    out = []
    for klass in classes:
        rows = await _answer_rows(db, klass=klass)
        out.append({"class": klass, "studentCount": len({r["studentName"] for r in rows})})
    return out


@router.get("/classes/{klass}/analytics")
async def class_analytics(klass: str, user=Depends(require_teacher)):
    db = get_db()
    rows = await _answer_rows(db, klass=klass)
    if not rows:
        raise HTTPException(status_code=404, detail=f"No graded attempts found for class {klass}.")
    students = {}
    for r in rows:
        e = students.setdefault(r["studentName"], {"marksEarned": 0.0, "marksPossible": 0.0, "answers": 0})
        e["marksEarned"] += r["awarded"]; e["marksPossible"] += r["maxMarks"]; e["answers"] += 1
    roster = []
    for name, e in students.items():
        score_pct = pct1(e["marksEarned"], e["marksPossible"])
        roster.append({"name": name, "scorePct": score_pct, "marksAwarded": round(e["marksEarned"], 1),
                        "marksPossible": e["marksPossible"], "answers": e["answers"],
                        "readiness": readiness_for(score_pct)})
    roster.sort(key=lambda s: (-s["scorePct"], s["name"]))

    readiness_mix = [{"label": band["label"], "count": sum(1 for s in roster if s["readiness"] == band["label"])}
                      for band in READINESS_BANDS]

    chapters = _chapter_rows_from_answers(rows)
    strong, weak = _classify(chapters)
    earned = sum(r["awarded"] for r in rows); possible = sum(r["maxMarks"] for r in rows)
    totals = {
        "students": len(roster), "answers": len(rows),
        "examsCovered": len({r["examCode"] for r in rows}), "chaptersAssessed": len(chapters),
        "marksAwarded": round(earned, 1), "marksPossible": possible, "aggregateScorePct": pct1(earned, possible),
        "meanStudentScorePct": round(sum(s["scorePct"] for s in roster) / len(roster) * 10) / 10 if roster else 0,
    }
    return {"class": _norm_class(klass), "totals": totals, "readinessMix": readiness_mix,
            "roster": roster, "chapters": chapters, "strongAreas": strong, "needsImprovement": weak}


# ══════════════════════ 7. AI Insights (rules-based, no LLM) ══════════════════════
async def _teaching_recommendations(db, klass):
    rows = await _answer_rows(db, klass=klass)
    if not rows:
        return {"items": [], "struggleThreshold": STRUGGLE_CHAPTER_PCT, "weightageAboveMedianAvgMarks": None}
    chapters = _chapter_rows_from_answers(rows)
    exams = await _published_exams(db, klass=klass)
    weight_map = _compute_weightage(exams)

    considered = [c for c in chapters
                  if _ckey({"board": c["board"], "class": c["class"], "subject": c["subject"], "chapter": c["chapter"]}) in weight_map]
    if not considered:
        return {"items": [], "struggleThreshold": STRUGGLE_CHAPTER_PCT, "weightageAboveMedianAvgMarks": None}
    median_weight = statistics.median([
        weight_map[_ckey({"board": c["board"], "class": c["class"], "subject": c["subject"], "chapter": c["chapter"]})]["avgMarks"]
        for c in considered])

    per_student_chapter = {}
    for r in rows:
        key = (_ckey({"board": r["board"], "class": r["examClass"], "subject": r["subject"], "chapter": r["chapter"]}), r["studentName"])
        e = per_student_chapter.setdefault(key, {"earned": 0.0, "possible": 0.0})
        e["earned"] += r["awarded"]; e["possible"] += r["maxMarks"]

    questions_by_chapter = {}
    async for q in db.questions.find({}):
        k = _ckey(q)
        bucket = questions_by_chapter.setdefault(k, {"Easy": 0, "Medium": 0, "Hard": 0})
        d = q.get("difficulty")
        if d in bucket:
            bucket[d] += 1

    items, sort_keys = [], []
    for c in considered:
        if c["masteryPct"] >= STRUGGLE_CHAPTER_PCT:
            continue
        k = _ckey({"board": c["board"], "class": c["class"], "subject": c["subject"], "chapter": c["chapter"]})
        w = weight_map[k]
        if not (w["avgMarks"] > median_weight):
            continue
        student_pcts = [pct1(v["earned"], v["possible"]) for (ck, _sname), v in per_student_chapter.items() if ck == k]
        below = [p for p in student_pcts if p < STRUGGLE_CHAPTER_PCT]
        students_below_pct = round(len(below) / len(student_pcts) * 1000) / 10 if student_pcts else 0

        mix = questions_by_chapter.get(k, {"Easy": 0, "Medium": 0, "Hard": 0})
        bank_count = sum(mix.values())
        difficulty_mix = [{"level": lvl, "count": mix.get(lvl, 0),
                           "pct": round(mix.get(lvl, 0) / bank_count * 1000) / 10 if bank_count else 0}
                          for lvl in ["Hard", "Medium", "Easy"]]

        severity = "high" if (c["masteryPct"] < STRUGGLE_CHAPTER_PCT - 10 or students_below_pct >= 60) else "medium"
        action = ("Schedule remedial re-teaching sessions before proceeding"
                  if c["masteryPct"] < STRUGGLE_CHAPTER_PCT - 15 else "Conduct a targeted practice session")

        items.append({
            "chapter": c["chapter"], "subject": c["subject"], "board": c["board"], "class": c["class"],
            "headline": f"Students are struggling with {c['chapter']}",
            "classAverageMasteryPct": c["masteryPct"],
            "reasons": [
                {"label": "Class average mastery", "value": f"{c['masteryPct']}%",
                 "detail": f"below {STRUGGLE_CHAPTER_PCT}% threshold"},
                {"label": "Students below threshold", "value": f"{students_below_pct}%",
                 "detail": f"{len(below)} of {len(student_pcts)} assessed students"},
                {"label": "Exam weightage", "value": f"{w['avgMarks']} avg marks",
                 "detail": f"above median of {median_weight} across assessed chapters ({w['examsAppearedIn']} exams)"},
            ],
            "difficultyMix": difficulty_mix, "severity": severity, "recommendedAction": action,
        })
        sort_keys.append((c["masteryPct"], -w["avgMarks"]))
    order = sorted(range(len(items)), key=lambda i: sort_keys[i])
    items = [items[i] for i in order]
    return {"items": items, "struggleThreshold": STRUGGLE_CHAPTER_PCT,
            "weightageAboveMedianAvgMarks": median_weight, "evaluatedChapters": len(considered)}


@router.get("/classes/{klass}/teaching-recommendations")
async def teaching_recommendations(klass: str, user=Depends(require_teacher)):
    return await _teaching_recommendations(get_db(), klass)


@router.get("/classes/{klass}/students-at-risk")
async def students_at_risk(klass: str, user=Depends(require_teacher)):
    db = get_db()
    rows = await _answer_rows(db, klass=klass)
    if not rows:
        return {"items": [], "topBand": READINESS_BANDS[0]["label"]}
    top_band = READINESS_BANDS[0]["label"]
    by_student = {}
    for r in rows:
        by_student.setdefault(r["studentName"], []).append(r)

    items = []
    for name, srows in by_student.items():
        earned = sum(r["awarded"] for r in srows); possible = sum(r["maxMarks"] for r in srows)
        score_pct = pct1(earned, possible)
        readiness = readiness_for(score_pct)
        if readiness == top_band:
            continue
        chapters = _chapter_rows_from_answers(srows)
        weak_chapters = [c for c in chapters if c["masteryPct"] < WEAK_CHAPTER_PCT][:2]
        mistakes = [r for r in srows if not r["correct"]]
        type_counts = {}
        for m in mistakes:
            t = m["questionType"]
            if t: type_counts[t] = type_counts.get(t, 0) + 1
        dominant = max(type_counts.items(), key=lambda kv: kv[1]) if type_counts else None
        items.append({
            "name": name, "scorePct": score_pct, "readiness": readiness,
            "missedMarksPct": pct1(possible - earned, possible),
            "weakChapters": [{"chapter": c["chapter"], "masteryPct": c["masteryPct"]} for c in weak_chapters],
            "dominantMistakeType": {"type": dominant[0], "count": dominant[1]} if dominant else None,
        })
    items.sort(key=lambda x: (x["scorePct"], x["name"]))
    return {"items": items, "topBand": top_band}


@router.get("/classes/{klass}/mistake-profile")
async def mistake_profile(klass: str, user=Depends(require_teacher)):
    db = get_db()
    rows = await _answer_rows(db, klass=klass)
    if not rows:
        return {"subjects": [], "totals": {"answersAnalyzed": 0, "mistakes": 0}}
    by_subject = {}
    for r in rows:
        e = by_subject.setdefault(r["subject"], {"answers": 0, "mistakes": 0, "types": {}})
        e["answers"] += 1
        if not r["correct"]:
            e["mistakes"] += 1
            t = r["questionType"]
            if t: e["types"][t] = e["types"].get(t, 0) + 1
    subjects = []
    for subj, e in by_subject.items():
        types = sorted(
            [{"type": t, "count": c, "pctOfMistakes": round(c / e["mistakes"] * 1000) / 10 if e["mistakes"] else 0}
             for t, c in e["types"].items()], key=lambda x: -x["count"])
        subjects.append({
            "subject": subj, "answersAnalyzed": e["answers"], "mistakes": e["mistakes"],
            "mistakeDensityPct": pct1(e["mistakes"], e["answers"]),
            "types": types, "dominantType": types[0] if types else None,
        })
    subjects.sort(key=lambda s: -s["mistakes"])
    return {"subjects": subjects, "totals": {"answersAnalyzed": len(rows), "mistakes": sum(s["mistakes"] for s in subjects)}}


# ══════════════════════ 8. Practice Generator ══════════════════════
@router.post("/practice/generate")
async def practice_generate(body: PracticeGenerateInput, user=Depends(require_teacher)):
    db = get_db()
    all_rows = await _answer_rows(db)
    rows = [r for r in all_rows if r["studentName"].lower() == body.studentName.strip().lower()]
    if not rows:
        raise HTTPException(status_code=404, detail="No graded attempts found for this student.")
    chapters = _chapter_rows_from_answers(rows)
    focus = chapters[:PRACTICE_WEAKEST_CHAPTERS]
    focus_keys = {_ckey({"board": c["board"], "class": c["class"], "subject": c["subject"], "chapter": c["chapter"]}) for c in focus}
    correct_qids = {r["qid"] for r in rows if r["correct"] and r.get("qid")}

    count = max(1, min(int(body.questionCount or PRACTICE_DEFAULT_COUNT), PRACTICE_MAX_COUNT))
    pool = []
    if focus_keys:
        or_clauses = [{"board": k[0], "class": k[1], "subject": k[2], "chapter": k[3]} for k in focus_keys]
        pool = [q async for q in db.questions.find({"$or": or_clauses})]
    eligible = [q for q in pool if q.get("qid") not in correct_qids and can_use_question(q, user)]

    buckets = {"Easy": [], "Medium": [], "Hard": []}
    for q in eligible:
        buckets.setdefault(q.get("difficulty", "Medium"), []).append(q)
    for bucket in buckets.values():
        random.shuffle(bucket)

    weight_sum = sum(PRACTICE_DIFFICULTY_WEIGHTS.values())
    quota = {lvl: int(count * w / weight_sum) for lvl, w in PRACTICE_DIFFICULTY_WEIGHTS.items()}
    leftover = count - sum(quota.values())
    for lvl in ["Medium", "Hard", "Easy"]:
        if leftover <= 0: break
        quota[lvl] += 1; leftover -= 1

    selected = []
    for lvl in ["Easy", "Medium", "Hard"]:
        selected.extend(buckets.get(lvl, [])[:quota[lvl]])
    selected_ids = {q.get("qid") for q in selected}
    shortfall = count - len(selected)
    if shortfall > 0:
        remaining = [q for q in eligible if q.get("qid") not in selected_ids]
        random.shuffle(remaining)
        selected.extend(remaining[:shortfall])
    random.shuffle(selected)

    def clean_q(q):
        return {"qid": q.get("qid"), "question": q.get("question"), "subject": q.get("subject"),
                "chapter": q.get("chapter"), "difficulty": q.get("difficulty"),
                "questionType": q.get("questionType"), "marks": q.get("marks"),
                "options": q.get("options", []) if q.get("objective") else []}

    return {
        "student": rows[0]["studentName"],
        "focusChapters": [{"chapter": c["chapter"], "subject": c["subject"], "masteryPct": c["masteryPct"]} for c in focus],
        "questions": [clean_q(q) for q in selected],
        "totals": {"requested": count, "delivered": len(selected), "eligiblePoolSize": len(eligible),
                   "excludedAlreadyCorrect": len([q for q in pool if q.get("qid") in correct_qids])},
    }


# ══════════════════════ 9. Adaptive Demo ══════════════════════
@router.get("/adaptive/questions")
async def adaptive_questions(board: str = "CBSE", klass: str = "10", subject: str = "", chapter: str = "",
                             perLevel: int = 5, user=Depends(require_teacher)):
    db = get_db()
    q = {"board": board, "class": _norm_class(klass)}
    if subject: q["subject"] = subject
    if chapter: q["chapter"] = chapter
    docs = [d async for d in db.questions.find(q) if can_use_question(d, user)]
    if not docs:
        raise HTTPException(status_code=404, detail="No questions found for this selection.")
    buckets = {"Easy": [], "Medium": [], "Hard": []}
    for d in docs:
        buckets.setdefault(d.get("difficulty", "Medium"), []).append(d)
    out = {}
    for lvl in ["Easy", "Medium", "Hard"]:
        out[lvl] = [{"qid": d.get("qid"), "question": d.get("question"), "marks": d.get("marks"),
                    "questionType": d.get("questionType")} for d in buckets.get(lvl, [])[:perLevel]]
    return {"levels": out}


# ══════════════════════ Weak Chapter Alerts (dashboard) ══════════════════════
@router.get("/alerts")
async def insights_alerts(user=Depends(require_teacher)):
    """Cross-class high-priority struggling-chapter alerts for the logged-in
    teacher's own assigned classes/subjects, for a Dashboard badge."""
    db = get_db()
    teacher_classes = user.get("classes") or []
    teacher_subjects = set(user.get("subjects") or [])
    klasses = []
    for c in teacher_classes:
        digits = "".join(ch for ch in str(c) if ch.isdigit())
        if digits:
            klasses.append(digits)
    if not klasses:
        klasses = [str(c) for c in await db.exams.distinct("class", {"status": "published"})]

    items = []
    seen = set()
    for klass in sorted(set(klasses)):
        data = await _teaching_recommendations(db, klass)
        for it in data.get("items", []):
            if it["severity"] != "high":
                continue
            if teacher_subjects and it["subject"] not in teacher_subjects:
                continue
            key = (it["board"], it["class"], it["subject"], it["chapter"])
            if key in seen:
                continue
            seen.add(key)
            items.append(it)
    items.sort(key=lambda x: x["classAverageMasteryPct"])
    return {"count": len(items), "items": items[:5]}


# ══════════════════════ PDF export ══════════════════════
def _esc(s):
    return (str(s or "")).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _pdf_response(build_fn, filename):
    from io import BytesIO
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
    from fastapi.responses import Response as FResponse

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm,
                            leftMargin=18 * mm, rightMargin=18 * mm, title=filename)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="EdTitle", fontName="Helvetica-Bold", fontSize=18, spaceAfter=4))
    styles.add(ParagraphStyle(name="EdMeta", fontName="Helvetica", fontSize=9, textColor="#5C5C54", spaceAfter=2))
    styles.add(ParagraphStyle(name="EdSection", fontName="Helvetica-Bold", fontSize=12, spaceBefore=12, spaceAfter=6))
    styles.add(ParagraphStyle(name="EdQ", fontName="Helvetica", fontSize=10.5, spaceAfter=6, leading=15))
    styles.add(ParagraphStyle(name="EdSmall", fontName="Helvetica", fontSize=9, textColor="#5C5C54", spaceAfter=8, leading=13))
    flow = []
    build_fn(flow, styles, {"Paragraph": Paragraph, "Spacer": Spacer, "HR": HRFlowable})
    doc.build(flow)
    buf.seek(0)
    return FResponse(content=buf.read(), media_type="application/pdf",
                     headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/classes/{klass}/analytics/pdf")
async def class_analytics_pdf(klass: str, user=Depends(require_teacher)):
    db = get_db()
    data = await class_analytics(klass, user)

    def build(flow, styles, F):
        flow.append(F["Paragraph"](f"Class {data['class']} — Performance Report", styles["EdTitle"]))
        flow.append(F["Paragraph"](
            f"Generated for a teacher review or parent meeting · {data['totals']['students']} students · "
            f"{data['totals']['examsCovered']} exams covered", styles["EdMeta"]))
        flow.append(F["HR"](width="100%", thickness=1, color="#E5E5E0", spaceBefore=6, spaceAfter=6))

        flow.append(F["Paragraph"]("Summary", styles["EdSection"]))
        t = data["totals"]
        flow.append(F["Paragraph"](
            f"Average score: <b>{t['aggregateScorePct']}%</b> &nbsp;&nbsp; Mean student score: <b>{t['meanStudentScorePct']}%</b> "
            f"&nbsp;&nbsp; Answers analyzed: {t['answers']} &nbsp;&nbsp; Chapters assessed: {t['chaptersAssessed']}", styles["EdQ"]))

        flow.append(F["Paragraph"]("Readiness mix", styles["EdSection"]))
        for b in data["readinessMix"]:
            flow.append(F["Paragraph"](f"{_esc(b['label'])}: {b['count']} student(s)", styles["EdSmall"]))

        flow.append(F["Paragraph"]("Roster (sorted by score)", styles["EdSection"]))
        for r in data["roster"]:
            flow.append(F["Paragraph"](
                f"<b>{_esc(r['name'])}</b> — {r['scorePct']}% ({_esc(r['readiness'])}) &nbsp;&nbsp; "
                f"{r['marksAwarded']}/{r['marksPossible']} marks", styles["EdQ"]))

        flow.append(F["Paragraph"]("Needs improvement", styles["EdSection"]))
        if not data["needsImprovement"]:
            flow.append(F["Paragraph"]("None — no chapter is currently below the 60% class-mastery threshold.", styles["EdSmall"]))
        for c in data["needsImprovement"][:15]:
            flow.append(F["Paragraph"](f"{_esc(c['chapter'])} ({_esc(c['subject'])}) — {c['masteryPct']}%", styles["EdSmall"]))

    return _pdf_response(build, f"Edora_Class{klass}_Analytics.pdf")


@router.get("/classes/{klass}/ai-report/pdf")
async def ai_insights_pdf(klass: str, user=Depends(require_teacher)):
    db = get_db()
    revise = await _teaching_recommendations(db, klass)
    risk = await students_at_risk(klass, user)
    mistakes = await mistake_profile(klass, user)

    def build(flow, styles, F):
        flow.append(F["Paragraph"](f"Class {klass} — AI Insights Report", styles["EdTitle"]))
        flow.append(F["Paragraph"](
            "Rules-based analysis of real graded attempts — every finding traces back to a stated rule, no free-form AI chat.",
            styles["EdMeta"]))
        flow.append(F["HR"](width="100%", thickness=1, color="#E5E5E0", spaceBefore=6, spaceAfter=6))

        flow.append(F["Paragraph"]("Chapters to revise before boards", styles["EdSection"]))
        if not revise["items"]:
            flow.append(F["Paragraph"]("No struggling chapters match the rules for this class right now.", styles["EdSmall"]))
        for it in revise["items"]:
            flow.append(F["Paragraph"](
                f"<b>{_esc(it['chapter'])}</b> ({_esc(it['subject'])}) — {it['classAverageMasteryPct']}% mastery, "
                f"<font color='#D95D39'>{it['severity'].upper()} PRIORITY</font>", styles["EdQ"]))
            flow.append(F["Paragraph"](_esc(it["recommendedAction"]), styles["EdSmall"]))

        flow.append(F["Paragraph"]("Students needing attention", styles["EdSection"]))
        if not risk["items"]:
            flow.append(F["Paragraph"]("Every student in this class is in the top readiness band.", styles["EdSmall"]))
        for r in risk["items"][:15]:
            weak = ", ".join(f"{w['chapter']} ({w['masteryPct']}%)" for w in r["weakChapters"]) or "—"
            flow.append(F["Paragraph"](
                f"<b>{_esc(r['name'])}</b> — {r['scorePct']}% ({_esc(r['readiness'])}) &nbsp; Weakest: {_esc(weak)}", styles["EdSmall"]))

        flow.append(F["Paragraph"]("Mistake profile by subject", styles["EdSection"]))
        if not mistakes["subjects"]:
            flow.append(F["Paragraph"]("No mistake data available for this class.", styles["EdSmall"]))
        for s in mistakes["subjects"]:
            flow.append(F["Paragraph"](
                f"<b>{_esc(s['subject'])}</b> — {s['mistakes']} mistakes in {s['answersAnalyzed']} answers "
                f"({s['mistakeDensityPct']}% density), dominant: {_esc(s['dominantType']['type']) if s['dominantType'] else '—'}",
                styles["EdSmall"]))

    return _pdf_response(build, f"Edora_Class{klass}_AI_Insights.pdf")
