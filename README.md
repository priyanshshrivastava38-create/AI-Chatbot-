# Prism — real-time AI chatbot

A production chat product, not a demo: replies stream token-by-token from a real LLM over
Server-Sent Events, every conversation is persisted per user, and the whole surface — history,
search, rename, delete, regenerate, stop, attachments, export, preferences, usage — is wired to a
working backend.

```
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui
Prisma 7 + PostgreSQL · Auth.js v5 (credentials, JWT) · SSE streaming · OpenAI-compatible provider
```

## What it does

**Chat**
- Genuine streaming: the provider's chunks are forwarded as they arrive. Nothing is simulated with
  timers, and the transcript grows while you watch it.
- Stop mid-generation, regenerate the last answer, retry after a failure. A stopped or failed turn
  keeps the partial text and is stored as `CANCELLED` / `FAILED` rather than discarded.
- Cancellation is bidirectional: the client aborts the fetch, the server aborts the upstream call,
  and `POST /api/chat/stop` cancels a run in flight on the same instance.
- Markdown, LaTeX, syntax-highlighted code blocks with copy buttons, per-message timestamps, token
  counts and latency, day dividers, auto-scroll that yields when you scroll up, suggested follow-ups.

**Conversations**
- Independent conversations per user, created lazily, auto-titled from your first question.
- Sidebar with search across titles and message bodies, inline rename, delete, relative timestamps,
  grouped by day.
- Export any conversation as Markdown or JSON.

**Composer**
- Multiline, Enter to send (configurable), Shift+Enter for a newline, `/` to focus, Esc to stop.
- Drag-and-drop or attach text files (validated: extension, MIME, size, binary sniffing), with
  per-file chips and a character budget indicator.

**Settings**
- Default model, temperature, max output tokens, system prompt, Enter-to-send.
- Usage analytics: 14-day token/message chart and a per-model breakdown.
- Keyboard shortcut reference. Dark, light and system themes.

## Architecture

| Area | Where |
| --- | --- |
| Streaming turn pipeline (persist → stream → finalize) | `src/lib/ai/run-turn.ts`, `src/lib/ai/stream-response.ts` |
| Provider client (OpenAI SDK, any compatible base URL) | `src/lib/ai/provider.ts` |
| Context window assembly + rolling summary | `src/lib/ai/context.ts`, `src/lib/tokens.ts` |
| Auto titles and follow-up suggestions | `src/lib/ai/auxiliary.ts` |
| Cancellation registry | `src/lib/ai/active-runs.ts` |
| Auth, ownership-scoped queries, validation, rate limits | `src/lib/auth.ts`, `src/lib/conversations.ts`, `src/lib/validation.ts`, `src/lib/rate-limit.ts` |
| HTTP surface | `src/app/api/**/route.ts` |
| Chat UI | `src/components/chat/*`, `src/hooks/use-chat.ts` |
| Data model | `prisma/schema.prisma` + `prisma/migrations/` |

Every query is scoped by the session user id: another user's conversation id returns `404`, not
`403`, so ids cannot be probed. API keys live only in server environment variables and never reach
the client bundle; the logger redacts anything that looks like a secret.

## Quick start

Requirements: Node 20+, a PostgreSQL 14+ server (Docker is fine), and either an OpenAI-compatible
API key or a local [Ollama](https://ollama.com) install.

```bash
npm install
cp .env.example .env          # then edit: DATABASE_URL + AUTH_SECRET at minimum
npm run db:migrate            # creates the schema and the Prisma client
npm run db:seed               # optional: demo@example.com / Demo1234
npm run dev                   # http://localhost:3000
```

`AUTH_SECRET` comes from `openssl rand -base64 32`. `.env.example` documents every variable.

### Point it at a model

**Local Ollama (no key, free, what this repo was developed against)**

```bash
ollama pull qwen2.5:3b
```
```env
AI_PROVIDER=ollama
OPENAI_BASE_URL=http://127.0.0.1:11434/v1
AI_DEFAULT_MODEL=qwen2.5:3b
```

**OpenAI**

```env
AI_PROVIDER=openai
OPENAI_API_KEY=***
AI_DEFAULT_MODEL=gpt-4o-mini
```

**Qwen (Alibaba Cloud Model Studio / DashScope)** — the same OpenAI-compatible path, no code change:

```env
AI_PROVIDER=openai
OPENAI_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
OPENAI_API_KEY=***
AI_DEFAULT_MODEL=qwen-plus
AI_MODEL_ALLOWLIST=qwen-turbo,qwen-plus,qwen-max
```

Use `https://dashscope.aliyuncs.com/compatible-mode/v1` for a China-region key. `AI_MODEL_ALLOWLIST`
is optional but recommended: it restricts which ids the model picker offers and the API accepts.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server (Turbopack) |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Unit tests (`node:test` via `tsx`, no database needed) |
| `npm run lint` / `npm run typecheck` | ESLint (Next 16 React Compiler rules) and `tsc --noEmit` |
| `npm run db:migrate` / `db:deploy` | Create/apply migrations in development / production |
| `npm run db:generate` / `db:studio` | Regenerate the Prisma client, browse data |
| `npm run db:seed` | Upsert the demo account and a welcome conversation |

## Verifying it yourself

1. Register at `/register`, sign in, and send a message — watch the reply arrive token by token.
2. Press stop mid-reply; the partial answer stays and is labelled as stopped.
3. Reload the page: the transcript, the auto-generated title and the model choice all come back.
4. Open a second conversation with `⌘K`, then switch back — drafts and scroll position behave.
5. Request `/api/conversations/<someone-else's-id>` with no session cookie: `401`; with another
   user's cookie: `404`.
6. Send an empty message: `422` with a field-level message, no stack trace.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Enter` / `Shift+Enter` | Send / newline (Enter-to-send is toggleable in Settings) |
| `⌘/Ctrl+K` | New chat |
| `⌘/Ctrl+B` | Toggle the sidebar |
| `⌘/Ctrl+,` | Settings |
| `/` | Focus the composer |
| `Esc` | Stop generating |

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Vercel, Docker and self-hosted notes — including
what changes when the filesystem is read-only and when requests are spread over instances.
The full HTTP contract, SSE frame format and error envelope live in [docs/API.md](docs/API.md).

## Data model

`User` → `Conversation` → `Message` (role, `status`, model, token usage, latency, suggested
follow-ups) and `Attachment` (extracted text plus a unique storage key), plus one `Preference` row
per user. Indexes cover the hot paths: conversations by `(userId, updatedAt DESC)`, messages by
`(conversationId, createdAt)` and `(createdAt)`, attachments by `userId`, `conversationId` and
`messageId`. `User.email` and `Preference.userId` are unique. Long transcripts are kept inside the
model's context window by trimming oldest turns first and folding them into a rolling summary stored
on the conversation.
