# Edora — AI Examination Platform (v1)

## Problem Statement
Import and understand the codebase for Version 1 of Edora's assessment engine. Get it running/previewable in the browser (demo mode is acceptable) and produce a critical review of design gaps ("what is bad and ugly").

## Architecture (as-is, v1)
- **Single-file frontend**: `index.html` (~14,600 lines) containing ALL HTML + CSS + JS. No build step, no framework, vanilla JS.
- **`services/`** (the actual "assessment engine"):
  - `questionBank.js` — `QuestionBank` class: filter/search/stats over questions (data-source agnostic).
  - `questionSelector.js` — `QuestionSelector` class: blueprint-driven greedy selection, multi-variant generation, slot diagnostics, similarity/overlap analysis, compliance scoring.
  - `firebase.js` — Firestore persistence (exams, submissions) + inline base64 photo storage. **Hardcoded Firebase config committed to repo.**
- **`data/`** — static CBSE Class 10 question banks (`questions_cbse_class10.js` loaded globally; several JSON banks: maths, english, sst, it402).
- **Persistence**: split between Firestore and browser `localStorage`/`sessionStorage` (legacy `edint_` key prefixes).
- **Auth**: Google Identity Services (OAuth, placeholder client ID) + "Continue as Guest (Demo)" bypass. Dashboard gate is a sessionStorage flag only.

## Views
Login, Dashboard, Generate Exam, Exam Preview (variants), Published Exams, Student Exam View (code entry → photo → instructions → live exam → result), Integrity Dashboard, Students, Analytics, Question Intelligence, Chapter Intelligence, Reports (jsPDF/CSV export).

## Run Setup (in this environment)
- Repo is a static site; the env's expected `frontend`/`backend` folders did not exist.
- Added a zero-dependency Node static server at `/app/frontend/server.js` (+ `package.json`) served by the existing `frontend` supervisor program on port 3000, serving repo root so `services/` and `data/` relative paths resolve.
- Verified: login, demo login, dashboard, generate-exam all render.

## Status (2026-08-22)
- [DONE] Imported & understood codebase.
- [DONE] App running/previewable via demo mode on port 3000.
- [DONE] Critical design-gap review delivered (see chat summary / below).

## Key Findings — What's Bad/Ugly (v1)
1. **"AI" is marketing-only** — zero LLM/AI calls anywhere. Auto-grading = exact-match MCQ only; descriptive answers graded manually. Dashboard "AI Engine Insights" numbers are hardcoded.
2. **Monolithic 14.6k-line index.html** — no modules/components/tests; git history is dozens of whole-file "Add files via upload" uploads.
3. **Security** — Firebase keys committed; no visible Firestore rules (open read/write); `correctAnswer` shipped to client (answers visible in DevTools); auth is decorative; demo mode = full admin.
4. **Proctoring is theater** — client-side tab-switch/blur/refresh counting; integrityScore = 100 − penalties; trivially bypassable; photo "verification" stores a selfie but does no face match.
5. **Split-brain storage** — Firestore + localStorage fallback with legacy `edint_` prefixes; inconsistent source of truth across devices.
6. **Selector limitations** — collapses 5 question types into 3 (caseStudy→Long, numerical→Short); greedy marks-first packing with fragile remainder patching; deterministic (no shuffle) so same blueprint = identical paper; variant diversity limited by bank size.
7. **UX** — generic indigo-on-white "AI slop" aesthetic; stray/broken microcopy on login ("student?"); desktop-first.

## Backlog / Next (proposed)
- P0: Introduce a real backend/API + move `correctAnswer` and grading server-side; lock down Firestore rules.
- P0: Real auth (JWT or Google OAuth) instead of sessionStorage gate.
- P1: Add genuine AI (LLM) for descriptive answer evaluation and question generation.
- P1: Break monolith into modules/components; add a build step.
- P2: Server-enforced proctoring; real identity/face verification.
