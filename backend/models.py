from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel, Field, EmailStr


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Auth ──
class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    role: str = "student"  # "teacher" | "student"


class LoginInput(BaseModel):
    username: str
    password: str


class TeacherCreateInput(BaseModel):
    name: str
    email: str = ""
    username: str
    password: str = Field(min_length=4)
    subjects: List[str] = []
    classes: List[str] = []


class TeacherUpdateInput(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    subjects: Optional[List[str]] = None
    classes: Optional[List[str]] = None
    password: Optional[str] = None


# ── Exam blueprint ──
class Curriculum(BaseModel):
    board: str = "CBSE"
    grade: int = 10
    subject: str
    chapters: List[str] = []


class ExamConfig(BaseModel):
    totalMarks: int = 80
    duration: int = 180
    questionCount: int = 0


class Blueprint(BaseModel):
    name: str = "Untitled Exam"
    curriculum: Curriculum
    config: ExamConfig
    difficulty: Dict[str, int] = {"easy": 30, "medium": 50, "hard": 20}
    questionTypes: Dict[str, int] = {
        "mcq": 20, "veryShort": 15, "short": 25, "long": 20, "caseStudy": 15, "assertion": 5
    }
    variants: int = 1
    seed: Optional[int] = None


class PublishInput(BaseModel):
    blueprint: Blueprint
    variantIndex: int = 0
    variantLabel: str = "A"
    qids: List[str] = []
    startTime: Optional[str] = None
    endTime: Optional[str] = None


# ── Student attempt ──
class StartAttemptInput(BaseModel):
    code: str
    studentName: str
    photo: Optional[str] = None  # base64 data URL (identity capture)


class SaveAnswerInput(BaseModel):
    questionId: str
    answer: str


class IntegrityEventInput(BaseModel):
    type: str  # tab_switch | blur | refresh | fullscreen_exit | copy | paste
    token: str
    at: str = Field(default_factory=now_iso)


class SubmitInput(BaseModel):
    token: str
    answers: Dict[str, str] = {}


class QuestionGenInput(BaseModel):
    subject: str
    chapter: str
    questionType: str = "Short Answer"
    difficulty: str = "Medium"
    count: int = 5
    marks: int = 3
    board: str = "CBSE"
    grade: int = 10
