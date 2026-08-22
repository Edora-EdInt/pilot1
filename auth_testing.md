# Auth Testing (Edora v2)

## MongoDB
- DB: `edora_v2`, collection `users`. Admin has role "teacher", bcrypt hash starts with `$2b$`.
- Index: users.email unique.

## API
```
curl -c cookies.txt -X POST $URL/api/auth/login -H "Content-Type: application/json" -d '{"email":"teacher@edora.io","password":"Edora@2026"}'
curl -b cookies.txt $URL/api/auth/me
```
Login sets httpOnly `access_token` + `refresh_token` cookies; /me returns the user.
Role guard: teacher-only endpoints (e.g. /api/dashboard/stats, /api/exams/generate) return 403 for students.
