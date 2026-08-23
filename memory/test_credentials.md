# Edora — Test Credentials

## Admin (username + password login)
- Username: `admin`
- Password: `Admin@2026`
- Role: admin → lands on /admin (Manage Teachers)

## Teacher (username + password login — NOT email)
- Username: `priya.math`
- Password: `Edora@2026`
- Role: teacher → /dashboard with Teaching Portfolio (Mathematics · Class 11, Class 12)
- (email teacher@edora.io still accepted as a login identifier for backward compat)

## Student
- No login — joins an exam via join code at /exam.

## Notes
- Login endpoint POST /api/auth/login takes {username, password} (matches username OR email).
- Admin-only: /api/admin/teachers (GET/POST), PUT /api/admin/teachers/{id}, PATCH .../disable, POST .../send-credentials (email is a MOCKED placeholder).
- Auth is Bearer token in localStorage 'edora_token' (no cookies). Account-based brute-force lockout: 5 fails → 423.
