# Thirra-ai

Quick Setup (.env)
- Copy `.env.example` to `.env` and fill in values:
  - `PORT=4000`
  - `NODE_ENV=development` (or `production`)
  - `POCKETBASE_URL=http://127.0.0.1:8090`
  - `OPENROUTER_API_KEY=<YOUR_OPENROUTER_KEY>`
  - `OPENROUTER_MODEL=openai/gpt-4o-mini` (or any OpenRouter-supported model)
  - `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`
  - See `.env.example` for optional tuning vars (prompt budget, summarization, embeddings, RAG).

Scripts (Dev/Prod)
- `npm run rundev` — launches the server in development mode and auto-opens the testing UI at `http://localhost:4000/`.
- `npm start` — runs the server in production mode; testing UI is disabled and only the API is served at `http://localhost:4000/api`.

Optional Env (tuning)
- `OPENROUTER_EMBED_MODEL` — embeddings model, defaults to `openai/text-embedding-3-large`
- `RECENT_MESSAGE_COUNT` — history messages to keep recent, defaults to `3`
- `SUMMARY_CAP_CHARS` — trim summary chars when budget is tight, defaults to `600`
- `PROMPT_CHAR_BUDGET` — total prompt char budget, defaults to `4500`
- `RAG_TOP_K` — number of top similar chunks to include, defaults to `2`
- `RETRIEVAL_CHUNK_MAX_CHARS` — max chars per retrieved chunk, defaults to `450`

Notes
- For LangChain `ChatOpenAI`, set `baseURL` via `configuration.baseURL` (top-level `baseURL` is ignored by the library).
- The server includes OpenRouter-recommended headers (`HTTP-Referer`, `X-Title`).

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

Chat (LLM via OpenRouter + LangChain Memory)
- `POST /chat` → `201 { conversation, turn }`
  - Start new: JSON `{ prompt }` → creates a conversation and seeds memory with the first turn
- `POST /chat/stream` → NDJSON stream (`init`, `chunk`, `final`)
  - Start new: JSON `{ prompt }` or multipart form with `user_attachments` to stream assistant text
  - Append: JSON `{ conversationId, prompt }` or multipart form with `user_attachments`

OpenRouter Setup & Verification
- Ensure `.env` variables:
  - `OPENROUTER_API_KEY` (format starts with `sk-or-v1`)
  - `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`
  - `OPENROUTER_MODEL=openai/gpt-4o-mini` (or any supported)
- Quick test with curl:
  - `curl -s -X POST "https://openrouter.ai/api/v1/chat/completions" -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"hello"}]}'`
- If you see `401` errors, verify the key is an OpenRouter key (not an OpenAI key) and that your server is pointing to `OPENROUTER_BASE_URL`. The API returns a clearer message on 401.
  - Append: JSON `{ conversationId, prompt }` → uses full conversation history for coherent replies
  - Uploads: multipart `user_attachments` (up to 10 files); text-like files are included in context for that turn
- Memory: Conversation history is loaded from PocketBase each call and passed via LangChain. The user's `instruction` (from profile) is included in the system prompt.
- Env required: `OPENROUTER_API_KEY`; optional `OPENROUTER_MODEL`, `OPENROUTER_BASE_URL`

Attachments
- Download: `http://127.0.0.1:8090/api/files/turns/<turnId>/<filename>`

Errors (simple)
- `401` → `{ error: 'Unauthorized' }` (no cookie/token)
- `400` → `{ error: '<message>' }` (e.g., `prompt required`, `conversationId required`, `oldPassword and newPassword are required`)
- `500`/`502` → `{ error: 'OpenRouter request failed' }` or `{ error: 'Server error' }`

Copy-Paste Examples (curl)
- Login: `curl -X POST -H 'Content-Type: application/json' -c cookies.txt -d '{"email":"user@example.com","password":"secret"}' http://localhost:4000/api/auth/login`
- Me: `curl -b cookies.txt http://localhost:4000/api/auth/me`
- Update profile: `curl -X PATCH -H 'Content-Type: application/json' -b cookies.txt -d '{"name":"New Name","instruction":"Your prompt"}' http://localhost:4000/api/users/me`
- Change password: `curl -X PATCH -H 'Content-Type: application/json' -b cookies.txt -d '{"oldPassword":"old","newPassword":"newPass123"}' http://localhost:4000/api/users/me/password`
- Start chat: `curl -X POST -H 'Content-Type: application/json' -b cookies.txt -d '{"prompt":"Hello"}' http://localhost:4000/api/chat`
- Append chat: `curl -X POST -H 'Content-Type: application/json' -b cookies.txt -d '{"conversationId":"<id>","prompt":"Continue"}' http://localhost:4000/api/chat`