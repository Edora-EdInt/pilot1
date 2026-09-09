# Wrapping Up the Code-Quality Review Fixes on a 20-Credit Budget

## Context
Budget has been tightened further: 20 credits for this cleanup, keeping the remaining ~15-20 in reserve for a separate feature afterward. This plan narrows scope down to only the highest-severity findings from the code-quality report — everything else moves to backlog.

## What will be fixed in this pass (security-critical only)
1. **MD5 usage in `backend/seed.py`** — replaced with a safe alternative for its actual purpose (deterministic ID/hash generation during seeding, not a password hash). One isolated file, low risk.
2. **Insecure randomness for actual secrets** — anywhere a join code, token, or similar secret-like value is generated with plain `random` (in `server.py` / `adaptive.py`), it will be switched to Python's `secrets` module. Randomness used for non-secret purposes (shuffling practice questions, picking reproducible exam variants in `selector.py`) is left untouched — not a security issue, changing it would be pure churn.
3. **Empty `catch` blocks** in `StudentExam.js` and `LiveProctoring.js` — kept silent for the user (so face-check/polling doesn't spam error popups) but logged for debugging. Two small, contained edits.

These three are picked because they're the report's actual **security** findings — the rest are code-quality/style suggestions, not vulnerabilities or bugs.

## What moves to backlog (not touched in this pass)
- React Hook dependency warnings on the Insights pages — real but lint-level, not a functional break; needs careful attention across 6 files, too costly for this budget.
- The list-key review (most flagged spots were already found to be safe static lists on inspection).
- Moving auth tokens off `localStorage` to httpOnly cookies — highest-risk item, previously broke login under this environment's CORS setup.
- All refactor/complexity, memoization, and TypeScript-migration suggestions — cleanliness only, no bug impact.

## Verification approach (to fit 20 credits)
A couple of targeted `curl` checks against the changed backend endpoints (seeding still works, join-code generation still works) plus a quick visual check that the two frontend pages still load and behave the same. No full test-suite/testing-agent run — that's the trade-off for staying in budget on a change this small and contained.

## Outcome
Only the report's genuine security findings get fixed and spot-checked. Everything else (hook warnings, key warnings, auth storage, style/refactor suggestions) stays as an open backlog item for whenever there's budget to do it properly.
