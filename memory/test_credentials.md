# Edora v2 — Test Credentials

## Teacher (admin of platform)
- Email: `teacher@edora.io`
- Password: `Edora@2026`
- Role: teacher

## Student
- Email: `student@edora.io`
- Password: `Student@2026`
- Role: student
- Note: Students can also join an exam WITHOUT logging in, via the "Take an exam with a code" flow at `/exam`.

## Auth endpoints (JWT httpOnly cookies)
- POST `/api/auth/register`  {name,email,password,role}
- POST `/api/auth/login`     {email,password}
- POST `/api/auth/logout`
- GET  `/api/auth/me`

## Key flows
- Teacher: /dashboard, /generate, /exams, /attempts, /analytics
- Student: /exam (code entry → identity photo → live exam → AI-graded result)
- To test the student flow, first publish an exam as teacher and copy the join code.
