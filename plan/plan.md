# Question Bank: Compile Fix, Portfolio Hint, Edit/Delete, Close The Visibility Gap, Only Me

A compile-blocking lint error introduced by the last change is fixed first, then the four follow-ups to the "Add Question" feature, in this order (later ones lean on earlier ones):

0. Fix compile error
1. Portfolio Hint
2. Edit & Delete
3. Close The Gap
4. Only Me Option

## 0. Fix compile error
Add Question currently fails to compile: `Definition for rule 'react-hooks/exhaustive-deps' was not found`. A suppression comment on that page refers to a lint rule that isn't registered in this project's setup, which CRA treats as a hard error rather than a warning. Fixed by removing that comment and restructuring the one line it sits on so no suppression is needed at all — same behavior, no more broken build.

## 1. Portfolio Hint
If a teacher's own Teaching Portfolio (their assigned subjects/classes, set by the admin) is empty, the Add Question page shows a small explanatory note: restricted ("class & subject") questions from colleagues won't show up for them until an admin assigns their subjects/classes. Pure display change, no new data.

## 2. Edit & Delete
A teacher can edit or delete a question, but **only one they personally added** through the Add Question form. Questions from the seeded bank or from the old AI Studio (no owner on record) cannot be edited or deleted by anyone through this feature — this keeps the original bank untouched, exactly as promised when Add Question shipped.
- Edit reopens the same form, prefilled, for any field (including the question text itself and its visibility).
- Delete is permanent. This is safe because an exam that already used the question keeps its own saved copy at publish time — deleting or editing the bank entry afterward does not change any exam a student has already taken or will take.

## 3. Close The Gap
This is the current known gap: a "class & subject"-restricted question can still surface outside the two places that currently check for it (building an exam, and the bank browse list).

To close it at low cost, the same restriction check is added to the two places where a restricted question's actual **content** (its text) can be shown to someone: the Practice Generator, and Adaptive practice (both the teacher's sandbox and a live join-code session, which is checked against the portfolio of the teacher who started that session, since the joining student has no portfolio of their own).

**Assumption, open to pushback:** the Insights analytics pages (Chapter Intelligence, Question Trends, Exam Patterns, Bank Health, Class Analytics, AI Insights, the Dashboard weak-chapter alert) are left as-is — they show counts and percentages per chapter/subject, never the question's actual text, so a restricted question only affects a number somewhere, never its content being read by the wrong person. Making every one of those pages fully visibility-aware as well would be a much larger rework (it touches most of the Insights feature) for very little added protection, since no question text is exposed there. If this residual gap (numbers only, never content) isn't acceptable, say so and it gets added to scope, at added cost.

## 4. Only Me Option
Adds the third, private visibility choice to the same picker used today ("Entire question bank" / "Class & subject"). A question marked "Only me" is usable only by the teacher who created it — everywhere the "class & subject" rule is checked (exam building, the bank list, Practice Generator, Adaptive). Built last and after item 3 on purpose: it reuses that same enforcement, so "private" is genuinely private everywhere from day one, instead of leaking through the same gap "class & subject" had until now.
