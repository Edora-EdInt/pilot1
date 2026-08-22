"""AI grading + generation via Emergent Universal LLM key (server-side only)."""
import os
import re
import json
import uuid
from emergentintegrations.llm.chat import LlmChat, UserMessage

KEY = os.environ.get("EMERGENT_LLM_KEY")
PROVIDER = os.environ.get("GRADING_MODEL_PROVIDER", "openai")
MODEL = os.environ.get("GRADING_MODEL_NAME", "gpt-5.4")

GRADER_SYSTEM = (
    "You are a strict but fair CBSE board examiner. You grade a student's written "
    "answer against a model answer. Award partial marks for partially correct or "
    "partially complete answers. Reward correct concepts and penalise factual errors. "
    "Always respond with ONLY a compact JSON object, no prose, no markdown."
)


def _extract_json(text: str) -> dict:
    if not text:
        return {}
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except Exception:
        return {}


async def grade_descriptive(question: str, model_answer: str, student_answer: str, max_marks: int) -> dict:
    """Returns {marks, feedback, confidence, method}."""
    student_answer = (student_answer or "").strip()
    if not student_answer:
        return {"marks": 0, "feedback": "No answer provided.", "confidence": 1.0, "method": "ai"}
    if not KEY:
        return {"marks": 0, "feedback": "AI grader unavailable.", "confidence": 0.0, "method": "unavailable"}

    prompt = (
        f"QUESTION:\n{question}\n\n"
        f"MODEL ANSWER (reference):\n{model_answer}\n\n"
        f"STUDENT ANSWER:\n{student_answer}\n\n"
        f"MAXIMUM MARKS: {max_marks}\n\n"
        f"Grade the student answer. Return JSON exactly like: "
        f'{{"marks": <number 0..{max_marks}>, "feedback": "<one or two sentences>", '
        f'"confidence": <0..1>}}'
    )
    try:
        chat = LlmChat(api_key=KEY, session_id=f"grade-{uuid.uuid4()}",
                       system_message=GRADER_SYSTEM).with_model(PROVIDER, MODEL)
        resp = await chat.send_message(UserMessage(text=prompt))
        data = _extract_json(resp if isinstance(resp, str) else str(resp))
        marks = float(data.get("marks", 0))
        marks = max(0.0, min(float(max_marks), marks))
        return {
            "marks": round(marks, 1),
            "feedback": str(data.get("feedback", "")).strip() or "Graded.",
            "confidence": float(data.get("confidence", 0.7)),
            "method": "ai",
        }
    except Exception as e:
        return {"marks": 0, "feedback": f"Grading error: {e}", "confidence": 0.0, "method": "error"}


async def generate_insight(context: str) -> str:
    if not KEY:
        return ""
    try:
        chat = LlmChat(api_key=KEY, session_id=f"insight-{uuid.uuid4()}",
                       system_message="You are an education analytics assistant. Reply in one short, actionable sentence.").with_model(PROVIDER, MODEL)
        resp = await chat.send_message(UserMessage(text=context))
        return (resp if isinstance(resp, str) else str(resp)).strip()
    except Exception:
        return ""
