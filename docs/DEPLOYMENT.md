# Deployment guide

Prism is an ordinary Next.js App Router app with three things that need attention when you leave
`localhost`: a long-lived streaming response, a filesystem write for uploads, and in-process state
for rate limits and cancellation. This document covers Vercel, Docker and self-hosted, and says
plainly what degrades in each.

## 1. Prerequisites

- Node.js 20.11+ (22 recommended)
- PostgreSQL 14+ reachable from the app at runtime
- An OpenAI-compatible provider: OpenAI, Qwen (DashScope), OpenRouter, vLLM, LM Studio, or Ollama
- `AUTH_SECRET`: a fresh 32-byte base64 value, `openssl rand -base64 32`

## 2. Configuration

Copy `.env.example` to `.env` (local) or set the same keys in your host's environment UI. The
variables the app actually reads:

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | `postgresql://…`. Non-local hosts get `sslmode=require` added automatically if the URL omits it (`src/lib/db.ts`). Use the **pooled** connection string on Neon/Supabase. |
| `AUTH_SECRET` | yes | JWT signing key for Auth.js sessions. |
| `AI_PROVIDER` | yes | `openai` or `ollama`. Any OpenAI-compatible gateway is `openai`. |
| `OPENAI_API_KEY` | when `AI_PROVIDER=openai` | Server-side only. Never prefixed `NEXT_PUBLIC_`. |
| `OPENAI_BASE_URL` | optional | Defaults to `https://api.openai.com/v1`, or `http://127.0.0.1:11434/v1` for Ollama. |
| `AI_DEFAULT_MODEL` | optional | `gpt-4o-mini` / `qwen2.5:3b` if unset. |
| `AI_MODEL_ALLOWLIST` | optional | Comma-separated ids the picker and API accept. |
| `AI_TIMEOUT_MS` | optional | Upstream timeout, default 120000. |
| `MAX_INPUT_CHARS` | optional | Per-message character ceiling, default 16000. |
| `MAX_UPLOAD_BYTES` | optional | Default 5 MB. Lower it to your host's body limit (Vercel is ~4.5 MB). |
| `UPLOAD_DIR` | optional | Resolved against `process.cwd()`, default `uploads`. |
| `CHAT_RATE_LIMIT_PER_MINUTE` | optional | Default 20 per user. |
| `API_RATE_LIMIT_PER_MINUTE` | optional | Default 120 for the other routes. |

`SEED_EMAIL` / `SEED_PASSWORD` affect only `npm run db:seed`. Change or delete that account before
exposing a seeded database.

## 3. Database and migrations

Migrations are committed under `prisma/migrations/`. Apply them with:

```bash
npm run db:deploy      # prisma migrate deploy
```

Run this **before** or as part of the release, not from a request handler. On Vercel either put it
in the build command (`prisma migrate deploy && prisma generate && next build`) or run it manually
from CI/your terminal against the production URL. `npm install` already regenerates the Prisma
client through `postinstall`, so a generated-client checkout problem is never silent.

## 4. Vercel

1. Import the GitHub repository (framework detection finds Next.js; build command and output
   defaults are correct).
2. Add every variable from section 2 in **Project → Settings → Environment Variables**.
3. Provision Postgres in **Project → Storage** (Neon is the usual pairing) and connect it, which
   injects `DATABASE_URL` for all environments.
4. Set the build command to `prisma migrate deploy && next build` the first time, then move the
   migration step to a deploy hook or CI so a schema change is deliberate.
5. Deploy.

What matters for this app on Vercel:

- **Streaming.** `POST /api/chat` and `/api/chat/regenerate` declare `maxDuration = 60`. On the Hobby
  plan that is the ceiling; a reply that needs longer must be shortened (lower `maxOutputTokens` in
  Settings) or moved to a plan with longer functions. Vercel does not buffer these responses, but
  anything you put in front of the app (your own CDN, a corporate proxy) may.
- **Uploads.** The serverless filesystem is read-only, so the byte copy under `UPLOAD_DIR` is
  best-effort: if the write fails the app logs `upload.disk_write_failed` and continues, because the
  model reads `Attachment.extractedText` from the database. Attachments therefore work in chat, but
  the original file is not retrievable later. If you need the bytes, store them in Vercel Blob or S3
  and change `storeUpload`/`resolveUploadPath` — those two functions are the only filesystem callers.
- **Request body limit.** Uploads larger than the platform's body cap fail before your code runs;
  set `MAX_UPLOAD_BYTES` below it so the UI rejects them with a clear message instead.
- **Rate limits and cancellation are per instance.** `src/lib/rate-limit.ts` and
  `src/lib/ai/active-runs.ts` keep Maps in process memory. With several concurrent instances the
  effective limit is per instance, and `POST /api/chat/stop` may reach an instance that does not own
  the run. Client-side abort still works everywhere: the chat route passes `request.signal` into the
  provider call, so when the browser drops the stream the upstream request is cancelled and the
  partial answer is persisted. Move both Maps to Redis/Upstash if you scale past one instance.
- **Auth.** `src/lib/auth.ts` sets `trustHost: true`, so Auth.js resolves its origin from
  `X-Forwarded-Host`; no `AUTH_URL` is needed. Sessions are JWTs (30 days) with no database session
  table, so no adapter or edge-runtime workaround is required.
- **Cold starts.** The first request after idleness pays Prisma connect + provider handshake. The
  provider error mapping says "Could not reach the AI provider" rather than a bare status when that
  happens against a local Ollama — which is exactly the case that cannot work from Vercel: a
  `127.0.0.1` base URL points at the function's own network namespace. Use a hosted provider in
  production.

## 5. Docker / self-hosted

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
```

```bash
docker build -t prism .
docker run -p 3000:3000 --env-file .env -v prism-uploads:/app/uploads prism
```

Behind nginx/Caddy, disable buffering for the SSE routes and raise the read timeout:

```nginx
location /api/chat {
  proxy_buffering off;
  proxy_read_timeout 300s;
  proxy_pass http://127.0.0.1:3000;
}
```

Here `UPLOAD_DIR` genuinely persists, so uploads keep their original bytes. Run a single app
instance, or move the rate-limit and active-run Maps to Redis, before exposing the service to many
users — the code comments say the same thing.

## 6. Secrets and logging

- Never prefix a provider key with `NEXT_PUBLIC_`; the only client-visible config comes from
  `/api/models` and `/api/preferences`.
- `src/lib/log.ts` emits structured JSON and redacts values that look like keys or bearer tokens, so
  shipping stdout to a log aggregator is safe. Do not add request bodies to logs: they contain user
  prompts.
- Rotating `AUTH_SECRET` signs every existing session out — that is the intended effect.

## 7. Post-deploy smoke test

1. `/register` a new account, then sign out and back in through `/login`.
2. Send a message and confirm the reply grows token by token (not all at once).
3. Press stop mid-reply: the partial text stays and is labelled as stopped.
4. Reload the conversation: title, messages, model choice and scroll behaviour survive.
5. Regenerate the last answer, then check Settings → Usage shows the tokens you spent.
6. Attach a `.txt` file and confirm its content reaches the model; attach a `.png` and confirm a
   clear rejection.
7. Export the conversation as Markdown and JSON.
8. With a second account, request the first account's conversation id — expect `404`.
9. Without a session, request `/api/conversations` — expect `401`.
10. Send an empty message — expect `422` with a field message and no stack trace.
11. Search the sidebar for a word that only appears inside a message body.
12. Toggle dark/light and shrink to a phone viewport; the sidebar becomes a sheet and the composer
    stays reachable.

## 8. Rollback

Roll back the deployment, then run the previous migration set only if it is backward compatible —
the schema adds columns (`summary`, `summaryCovers`, `suggestedFollowUps`) that older code ignores,
so the safe order is: redeploy the old build first, decide about the schema afterwards.
