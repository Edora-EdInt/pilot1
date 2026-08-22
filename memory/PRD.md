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


## Credentials
- Teacher: teacher@edora.io / Edora@2026
- Student: student@edora.io / Student@2026 (or self-register; students can also join via code without login)

## Known limitations / Backlog
- Face-match on identity photo not implemented (photo is captured/stored only).
- publish() trusts teacher-supplied qids (teacher-only; could validate against curriculum).
- Selector `questionCount` field accepted but selection is marks-driven.
