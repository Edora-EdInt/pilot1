# Edora — AI Examination Platform

## Problem Statement
v1 was a single 14.6k-line HTML file with 7 serious flaws. User asked to FIX ALL 7. Delivered as **v2**: FastAPI + MongoDB backend + React frontend.

## Architecture (v2)
- **Backend** `/app/backend` (FastAPI + MongoDB, JWT httpOnly cookies)
  - `server.py` routes: auth, curriculum, exam generate/publish/list, dashboard, analytics, attempts, student flow.
  - `auth.py` JWT + bcrypt + role guard (`require_teacher`).
  - `selector.py` Python QuestionSelector — 6 question types, seeded randomization, marks top-up, multi-variant diversity + similarity.
  - `ai.py` real LLM grading + insight via Emergent Universal Key (openai gpt-5.4, emergentintegrations).
  - `seed.py` idempotent seed: ~850 CBSE questions from `data/*.json` + teacher/student users.
- **Frontend** `/app/frontend` (React + Tailwind, react-router, sonner, lucide)
  - Pages: Login, Dashboard, GenerateExam, PublishedExams, Attempts, Analytics, StudentExam.
  - Design: "Swiss editorial" — Cabinet Grotesk / IBM Plex Sans / JetBrains Mono; warm earthy palette; mobile-first.

## How the 7 v1 issues were fixed
1. **Fake AI** → real LLM grading of descriptive answers (marks+feedback) + AI analytics insight; dashboard stats are live Mongo aggregations (not hardcoded).
2. **Monolith** → proper FastAPI backend + modular React with a build step.
3. **Security** → no hardcoded 3rd-party keys; JWT auth + role guard; `correctAnswer`/`answer` NEVER sent to students (sanitized payload); server-side scoring; public register forced to `student` (no privilege escalation); per-attempt token guards student mutations; account-based brute-force lockout (423).
4. **Proctoring theater** → integrity events posted & scored SERVER-side; students cannot set/alter their integrity score.
5. **Split-brain storage** → single MongoDB source of truth (Firestore + localStorage removed).
6. **Selector quirks** → honors all 6 types, seeded shuffle (non-deterministic), robust marks top-up to target, real variant diversity (overlap ~0-4%).
7. **UX** → distinctive editorial redesign, responsive, fixed microcopy/greeting.

## Status (2026-08-22) — v2 + iteration 3 COMPLETE & TESTED (64/64 backend, 100% frontend)

### Auth bug fix (login/sign-up)
Root cause: httpOnly `SameSite=None` cookie unreliable behind the Cloudflare/k8s proxy. Fix: **dual-mode auth** — backend also returns a `token`; frontend stores it (localStorage) and sends `Authorization: Bearer` via an axios interceptor (cookie still set as well). Verified both cookie-only and Bearer-only sessions work, plus reload persistence & logout.

### New features (all verified)
1. **Face Verification (real, vision-LLM)** — `assess_identity()` checks the enrolment photo (one live human face); `verify_face()` compares a mid-exam live snapshot to the enrolment photo. Mismatch → `face_mismatch` integrity event (−20) + `faceMatch=false`. Endpoints: `/api/student/start` (returns `identityCheck`), `/api/student/{id}/face-check`. Teacher sees identity/face badges.
2. **PDF Export** — `/api/exams/{code}/pdf` (question paper) and `/api/attempts/{id}/pdf` (graded report) via reportlab; UI download buttons on Published Exams + Attempts drawer.
3. **Live Proctoring** — `/api/proctoring/live` (teacher) + `/proctoring` page polling every 3s; shows active sessions with live integrity, identity/face status, tab-switches; stale/expired sessions filtered out.
4. **AI Question Generation** — `/api/questions/generate` (teacher) + `/studio` page; LLM creates new CBSE questions inserted into the bank (dedup by qid).

### Earlier fixes (iteration 1-2) — all green
JWT roles, generate/publish fidelity (by qid), sanitized student payload, per-attempt tokens, ObjectId guards, account-based brute-force lockout (423), server-authoritative integrity, real AI grading, live dashboard/analytics.

## Backlog / Optional polish (from test reports)
- Auto-expire abandoned in_progress attempts (currently filtered in the live feed by startedAt+duration).
- Split server.py into routers; dedicated FaceCheckInput model; question-approval workflow + delete UI; TTL index on login_attempts.
- Insights: `_answer_rows`/`teaching-recommendations` re-scan all attempts/questions in Python per request (fine at current volume ~900 questions/~90 answers; consider Mongo aggregation if it grows). Practice Generator selection is deterministic (same paper each call) — add shuffling if variety desired.

## Auth & User Management (2026-08-24)
- Roles: **admin** (username `admin`) and **teacher** (username + password, email still accepted for back-compat). No public self-register for teachers — admin creates accounts.
- Admin: `/admin` → Manage Teachers (create/edit/disable, assign subjects+classes, auto-generated temp password + regenerate, "Send Login Credentials" — placeholder UI only, NO real email sent).
- Teacher dashboard shows assigned Teaching Portfolio (subjects × classes) with quick links.
- Auth is Bearer token in localStorage (`edora_token`), not cookies — proxy/CORS behind this preview rejects credentialed cross-origin cookie requests; do not revert to cookie-only auth.
- Account-based brute-force lockout: 5 fails → 423.
- Fully tested: backend 81/81, frontend 100% (iteration 5).

## Insights (EdInt Intelligence port) — 2026-08-24
Ported all 9 analytics pages from the standalone `github.com/Edora-EdInt/exam-intelligence` project into Edora as ONE teacher-only feature, using Edora's REAL Mongo data (not that project's fake JSON). Assessment engine/blueprint/question-generation/exam workflow were NOT touched.
- **Backend**: `/app/backend/insights.py` (new file, ~460 lines) — `/api/insights/*`, gated by a local strict `require_teacher` (admin explicitly rejected 403, unlike the shared app-wide `auth.require_teacher` which allows admin). Wired into `server.py` via one import + `include_router`.
- **Frontend**: `/app/frontend/src/pages/insights/` — 9 pages + shared `PracticeResult.js`. New grouped sidebar section in `Layout.js` (3 labeled sub-groups: Question Intelligence, Student Performance, Assistant) below existing teacher nav; admin nav unchanged. 9 new routes in `App.js` under `TeacherRoute`.
- **Mapping decisions** (Edora has no persistent Student/Class-section entities, unlike the source project):
  - "student" = free-text `studentName` typed at attempt start (no student accounts exist in Edora).
  - "class" = an exam's `class` (grade 9/10/11/12) — no section concept.
  - "concept" trends → chapter-level trends (questions have no concept tag).
  - "errorType" (Formula/Calculation/Concept) → real `questionType` (MCQ/Short/Long/etc) breakdowns instead of a fabricated taxonomy.
  - Practice Generator returns REAL question text from the bank (source project only had placeholders).
- **Pages**: Chapter Intelligence, Question Trends, Exam Patterns, Question Bank Health, Student Profiles, Class Analytics, AI Insights (3 rules-based presets, NOT an LLM chat), Practice Generator, Adaptive Demo (client-side engine: 2 correct → level up, 1 incorrect → level down).
- **Tested**: backend 39/39 new pytest cases (`/app/backend/tests/test_insights.py`) + 81/81 regression, frontend 9/9 pages pass after fixing (a) Adaptive Demo reset dead-end when a difficulty bucket is empty, (b) duplicate React keys / ambiguous same-named chapters across classes in Bank Health + other list views, (c) admin now correctly 403'd from `/api/insights/*`.

## Insights follow-ups (2026-08-24, same day)
User picked 4 next-action items; all 4 built and tested (156/1 backend pytest, 100% frontend):
- **PDF export**: `/api/insights/classes/{klass}/analytics/pdf` and `.../ai-report/pdf` (reportlab, teacher-only) + "Download PDF" buttons on Class Analytics and AI Insights pages.
- **Weak Chapter Alerts**: `/api/insights/alerts` (teacher-scoped to their own subjects/classes) + red banner on Dashboard linking to AI Insights when count > 0.
- **Practice variety**: `practice/generate` now shuffles difficulty buckets + final list (was deterministic before).
- **Adaptive Live Session** (`backend/adaptive.py`, new `adaptive_sessions` Mongo collection) — per explicit user clarification, this is a SEPARATE UNGRADED join-code practice quiz, NOT a formal exam type; does not touch exams/attempts/integrity/proctoring. MCQ-only (server-side instant grading needed for real-time difficulty adjustment). Teacher launches from Insights > Adaptive Demo > "Live Session" tab (`AdaptiveLiveSession.js`, polls every 4s to monitor live participants); students join at the new public route `/practice` (`AdaptivePractice.js`, no login, mirrors `/exam`'s public pattern) with a code + name. Same 2-correct-up/1-incorrect-down rule as the teacher sandbox.
  - **Real-data constraint**: 343/344 MCQs in the bank are tagged difficulty=Easy (Medium/Hard is used almost exclusively for Short/Long answer types). `_pick_question` falls back to any unused MCQ in-pool when the exact tier is empty, so sessions rarely dead-end — Medium/Hard level badges may still mostly serve Easy-tagged content until more difficulty-varied MCQs exist in the bank. This is intentional/documented, not a bug.
  - Fixed a string-comparison bug found during build (`"Easy" > "Medium"` is lexicographic, not level order) in the student-facing level-up/down message.
  - Fixed post-testing: clipboard copy-code now has a try/catch + toast fallback; Class Analytics strong/weak chapter lists capped to 8 with "+N more" and a low-sample-size hint.


## Credentials
See `/app/memory/test_credentials.md` for current admin/teacher login (username + password based, not email-first).

## Known limitations / Backlog
- Face-match on identity photo not implemented (photo is captured/stored only).
- publish() trusts teacher-supplied qids (teacher-only; could validate against curriculum).
- Selector `questionCount` field accepted but selection is marks-driven.
