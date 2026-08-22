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

## Status (2026-08-22) — v2 COMPLETE & TESTED
- Backend: 42 pytest cases, all core flows pass (iteration_2). Verified: auth/roles, generate/publish fidelity (by qid), sanitized student payload, token guards, server integrity, real AI grading, account lockout (423), live dashboard/analytics.
- Frontend: 100% of tested flows (teacher generate→publish→share code; student code→exam→AI-graded result; attempts drawer; analytics).

## Credentials
- Teacher: teacher@edora.io / Edora@2026
- Student: student@edora.io / Student@2026 (or self-register; students can also join via code without login)

## Known limitations / Backlog
- Face-match on identity photo not implemented (photo is captured/stored only).
- publish() trusts teacher-supplied qids (teacher-only; could validate against curriculum).
- Selector `questionCount` field accepted but selection is marks-driven.
