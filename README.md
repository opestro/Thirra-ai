# Thirra-ai

Quick Setup (.env)
- Create a `.env` file in the project root with:
  - `PORT=4000`
  - `NODE_ENV=development`
  - `POCKETBASE_URL=http://127.0.0.1:8090`

Base URL
- API base: `http://localhost:4000/api`
- Use cookies (set on login) or `Authorization: Bearer <token>`

Auth
- `POST /auth/signup` — Body: `{ email, password, name }` → `201 { id, email, name, instruction }`
- `POST /auth/login` — Body: `{ email, password }` → `200 { token, user }` and sets cookie
- `POST /auth/logout` → `200 { success: true }`
- `GET /auth/me` → `200 { user }`

Profile
- `GET /users/me` → `200 { user }`
- `PATCH /users/me` — Body: `{ name?, instruction? }` → `200 { id, email, name, instruction }`
  - Do not send `email` (email changes are disabled)
- `PATCH /users/me/password` — Body: `{ oldPassword, newPassword }` → `200 { success: true }`
- `DELETE /users/me` → `204 No Content`

Conversations
- `GET /conversations` → `200 { items: [{ id, title, updated }] }`
- `GET /conversations/:id` → `200 { conversation, turns }`

Chat
- `POST /chat` → `201 { conversation, turn }`
  - Start new: JSON `{ prompt }`
  - Append: JSON `{ conversationId, prompt }`
  - Uploads: multipart `user_attachments` (up to 10 files)

Attachments
- Download: `http://127.0.0.1:8090/api/files/turns/<turnId>/<filename>`

Errors (simple)
- `401` → `{ error: 'Unauthorized' }` (no cookie/token)
- `400` → `{ error: '<message>' }` (e.g., `prompt required`, `conversationId required`, `oldPassword and newPassword are required`)
- `500` → `{ error: 'Server error' }`

Copy-Paste Examples (curl)
- Login: `curl -X POST -H 'Content-Type: application/json' -c cookies.txt -d '{"email":"user@example.com","password":"secret"}' http://localhost:4000/api/auth/login`
- Me: `curl -b cookies.txt http://localhost:4000/api/auth/me`
- Update profile: `curl -X PATCH -H 'Content-Type: application/json' -b cookies.txt -d '{"name":"New Name","instruction":"Your prompt"}' http://localhost:4000/api/users/me`
- Change password: `curl -X PATCH -H 'Content-Type: application/json' -b cookies.txt -d '{"oldPassword":"old","newPassword":"newPass123"}' http://localhost:4000/api/users/me/password`
- Start chat: `curl -X POST -H 'Content-Type: application/json' -b cookies.txt -d '{"prompt":"Hello"}' http://localhost:4000/api/chat`
- Append chat: `curl -X POST -H 'Content-Type: application/json' -b cookies.txt -d '{"conversationId":"<id>","prompt":"Continue"}' http://localhost:4000/api/chat`