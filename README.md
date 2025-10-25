# Thirra AI Server

A minimal Express API with PocketBase auth and OpenRouter-powered chat streaming. It serves REST endpoints under `/api`, supports cookie or Bearer authentication, and streams NDJSON responses for chat.

## Quick Start
- Requirements: Node 18+ (global `fetch`), a running PocketBase instance.
- Setup:
  1) `cp .env.example .env` and fill values
  2) `npm install`
  3) Development: `npm run rundev` (opens testing UI)
  4) Production: `npm start`
- Default base URL: `http://localhost:4000`
- API base: `http://localhost:4000/api`

## Environment
Required
- `PORT` — server port (default `4000`)
- `NODE_ENV` — `development` or `production`
- `POCKETBASE_URL` — e.g., `http://127.0.0.1:8090`
- `OPENROUTER_API_KEY` — your OpenRouter key (format `sk-or-v1...`)

Optional
- `APP_BASE_URL` — override base URL (defaults to `http://localhost:${PORT}`)
- `OPENROUTER_BASE_URL` — default `https://openrouter.ai/api/v1`
- `OPENROUTER_MODEL` — default `openai/gpt-4o-mini`
- `OPENROUTER_EMBED_MODEL` — default `openai/text-embedding-3-large`
- `OPENROUTER_LIGHTWEIGHT_MODEL` — fallback to `OPENROUTER_MODEL` if unset
- `RECENT_MESSAGE_COUNT`, `RAG_TOP_K`, `RETRIEVAL_CHUNK_MAX_CHARS`, `PROMPT_CHAR_BUDGET`, `SUMMARY_CAP_CHARS`
- `CHUNK_SIZE`, `CHUNK_OVERLAP`, `MAX_HISTORY_CHARS`, `COMPRESSED_RECENT_CHARS`, `MAX_CONTEXT_TOKENS`

Notes
- Config reads environment variables with sensible defaults (see `.env.example`). Adjust via `.env` or edit `app/src/config/config.js`.

## Authentication
- Cookie session (set on login) or `Authorization: Bearer <token>`
- Middleware tries cookie first, then Bearer fallback

## API Endpoints
Auth
- `POST /api/auth/signup` — `{ email, password, name }` → `201 { id, email, name, instruction }`
- `POST /api/auth/login` — `{ email, password }` → `200 { token, user }` and sets cookie
- `POST /api/auth/logout` → `200 { success: true }` (auth required)
- `GET /api/auth/me` → `200 { user }` (auth required)

Users
- `GET /api/users/me` → `200 { user }`
- `PATCH /api/users/me` — `{ name?, instruction? }` → `200 { id, email, name, instruction }`
- `PATCH /api/users/me/password` — `{ oldPassword, newPassword }` → `200 { success: true }`
- `DELETE /api/users/me` → `204 No Content`

Conversations
- `GET /api/conversations` → `200 { items: [{ id, title, updated }] }`
- `GET /api/conversations/:id` → `200 { conversation, turns }`

Chat (NDJSON streaming)
- `POST /api/chat/stream`
  - Start new: omit `conversationId`; provide `prompt`
  - Append: include `{ conversationId, prompt }`
  - Attachments: multipart `user_attachments` (max 10). Text-like files are included as context for that turn.
  - Events: `init` (conversation meta), `chunk` (text), `final` (payload), `error`

Unified Chat (title + summary + response)
- `POST /api/unified-chat/unified` — streams unified output; new conversations auto-title if `conversationId` omitted
- `POST /api/unified-chat/compatible` — backward-compatible streaming that uses unified service but only the response

Attachments
- Download (PocketBase): `${POCKETBASE_URL}/api/files/turns/<turnId>/<filename>`

## Dev Utilities
Run ad-hoc tests (no formal runner configured):
- `node app/src/dev/testUnifiedOutput.js`
- `node app/src/dev/testMemoryConfig.js`
- `node app/src/dev/testPromptBudget.js`
- `node app/src/dev/testUnifiedIntegration.js`

## OpenRouter Check (curl)
- Basic check:
  ```
  curl -s -X POST "https://openrouter.ai/api/v1/chat/completions" \
    -H "Authorization: Bearer $OPENROUTER_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"hello"}]}'
  ```
- If `401`, verify the key uses the OpenRouter format and your server has a valid key.

## Errors
- `401` → `{ error: 'Unauthorized' }`
- `400` → `{ error: '<message>' }` (e.g., missing `prompt`, `oldPassword/newPassword`)
- `500`/`502` → `{ error: 'OpenRouter request failed' }` or `{ error: 'Server error' }`
