"""Shared 'who can use this question' rule for manually-added questions.

A question's `visibility` field controls who besides its creator can see or
use it:
  - "all" (default, and also implied when the field is missing — every
    seeded/legacy question) — every teacher.
  - "class_subject" — only teachers whose own Teaching Portfolio
    (subjects + classes, set by the admin) matches the question's
    subject + class.
  - "only_me" — only the creating teacher, ever.

This is checked everywhere a restricted question's actual content could be
shown to someone: building an exam, the bank browse list, Practice
Generator, and Adaptive practice (sandbox + live session, the latter
checked against the portfolio of the teacher who started the session).
"""


def _class_digits(classes):
    out = set()
    for c in classes or []:
        digits = "".join(ch for ch in str(c) if ch.isdigit())
        if digits:
            out.add(digits)
    return out


def can_use_question(q: dict, user: dict) -> bool:
    vis = q.get("visibility", "all")
    if vis == "all":
        return True
    if str(q.get("ownerId")) == str(user.get("id")):
        return True
    if vis == "only_me":
        return False
    teacher_subjects = set(user.get("subjects") or [])
    teacher_class_digits = _class_digits(user.get("classes"))
    if not teacher_subjects or not teacher_class_digits:
        return False
    return q.get("subject") in teacher_subjects and str(q.get("class")) in teacher_class_digits
