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


def _strip_data_url(b64: str) -> str:
    if not b64:
        return ""
    if "," in b64 and b64.strip().startswith("data:"):
        return b64.split(",", 1)[1]
    return b64


async def assess_identity(photo_b64: str) -> dict:
    """Vision check on the enrolment photo: exactly one live human face?"""
    from emergentintegrations.llm.chat import ImageContent
    img = _strip_data_url(photo_b64)
    if not KEY or not img:
        return {"valid": False, "faces": 0, "confidence": 0.0, "reason": "No photo captured.", "method": "unavailable"}
    try:
        chat = LlmChat(api_key=KEY, session_id=f"identity-{uuid.uuid4()}",
                       system_message="You are an exam identity-verification system. Respond with ONLY compact JSON.").with_model(PROVIDER, MODEL)
        msg = UserMessage(
            text=("Analyse the attached webcam photo of an exam candidate. Determine if it shows exactly ONE "
                  "clearly visible, live human face (not blank, not a photo-of-a-screen/printout, not multiple people). "
                  'Return JSON: {"valid": true/false, "faces": <int>, "confidence": <0..1>, "reason": "<short>"}'),
            file_contents=[ImageContent(img)])
        resp = await chat.send_message(msg)
        data = _extract_json(resp if isinstance(resp, str) else str(resp))
        return {
            "valid": bool(data.get("valid", False)),
            "faces": int(data.get("faces", 0)),
            "confidence": float(data.get("confidence", 0.0)),
            "reason": str(data.get("reason", "")).strip(),
            "method": "ai",
        }
    except Exception as e:
        return {"valid": False, "faces": 0, "confidence": 0.0, "reason": f"error: {e}", "method": "error"}


async def verify_face(reference_b64: str, live_b64: str) -> dict:
    """Compare a live snapshot to the enrolment reference — same person?"""
    from emergentintegrations.llm.chat import ImageContent
    ref = _strip_data_url(reference_b64)
    live = _strip_data_url(live_b64)
    if not KEY or not ref or not live:
        return {"match": True, "confidence": 0.0, "reason": "Verification unavailable.", "method": "unavailable"}
    try:
        chat = LlmChat(api_key=KEY, session_id=f"face-{uuid.uuid4()}",
                       system_message="You are a face-matching system for exam proctoring. Respond with ONLY compact JSON.").with_model(PROVIDER, MODEL)
        msg = UserMessage(
            text=("Two webcam images are attached. Image 1 is the enrolled reference photo taken at exam start. "
                  "Image 2 is a live capture during the exam. Decide if BOTH show the SAME person. "
                  'Return JSON: {"match": true/false, "confidence": <0..1>, "reason": "<short>"}'),
            file_contents=[ImageContent(ref), ImageContent(live)])
        resp = await chat.send_message(msg)
        data = _extract_json(resp if isinstance(resp, str) else str(resp))
        return {
            "match": bool(data.get("match", True)),
            "confidence": float(data.get("confidence", 0.0)),
            "reason": str(data.get("reason", "")).strip(),
            "method": "ai",
        }
    except Exception as e:
        return {"match": True, "confidence": 0.0, "reason": f"error: {e}", "method": "error"}
