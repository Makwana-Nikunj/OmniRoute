# gateway — Path A scaffold (embed `@omniroute/open-sse`)

A **minimal Next.js 16 app** that exposes a single OpenAI-compatible route,
`/v1/chat/completions`, and delegates the entire request lifecycle to
`@omniroute/open-sse`'s `handleChatCore()`.

## What this is (and is not)

**This IS:**
- A `path A` scaffold proving that `open-sse/` can be embedded in a fresh
  Next.js app and called from a single route.
- A test target for the "one provider, no DB, no dashboard" minimal slice.
- An architectural baseline for future Path A iterations (combo routing,
  DB-backed aliases, multi-key rotation, OAuth, admission, etc.).

**This IS NOT:**
- A runnable end-to-end gateway as-is. The full chat lifecycle
  (`handleChatCore`) transitively imports 167 modules in `open-sse/`
  and ~117 modules in `src/lib/`, `src/shared/`, and `src/domain/` — so
  the happy path needs the full project tree on disk. The route IS
  wired correctly; the deep `open-sse → @/lib/*` coupling means a
  truly standalone embed (no sibling `src/`) needs a Path B fork.
- A replacement for the main `OmniRoute` server. It shares zero
  code with the dashboard, auth, or DB layer.

## Quick start

```bash
cd gateway
npm install
GATEWAY_API_KEY=sk-... GATEWAY_PROVIDER=openai npm run dev
# → http://localhost:20128
```

The first call:

```bash
curl -X POST http://localhost:20128/v1/chat/completions \
  -H "content-type: application/json" \
  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'
```

## Environment

| Var | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GATEWAY_API_KEY` | yes | — | Single provider key the gateway uses for every request |
| `GATEWAY_PROVIDER` | no | `openai` | Resolves the `model` prefix when not in the body |

## Gate behavior

The route fails fast and returns sanitized JSON for every gate:

| Status | Trigger | Why |
| --- | --- | --- |
| `204` | `OPTIONS /v1/chat/completions` | CORS preflight |
| `415` | Content-Type ≠ `application/json` | OpenAI/Anthropic contract |
| `500` | `GATEWAY_API_KEY` unset | Server misconfiguration, never a silent stub |
| `400` | Body is not valid JSON | Parse-once, fail-loud |
| `400` | Body is not a JSON object | Parse-once, fail-loud |
| `400` | `model` field missing or not a string | Required for `getModelInfoCore` |
| `400` | `model` cannot be resolved | Hard fail before any upstream HTTP call |

All error responses go through `errorResponse()` from
`@omniroute/open-sse/utils/error.ts` (Hard Rule #12 — no raw `err.stack` /
`err.message` in the body, no arbitrary error codes that bypass the
safe-identifier allowlist).

## Testing

```bash
cd gateway
node --import tsx/esm --test tests/unit/chat-completions-route.test.ts
```

7 tests cover: CORS preflight, Content-Type gate, env-var gate, JSON
parse gate, missing-model gate, and unknown-model gate. None of the tests
require a live `GATEWAY_API_KEY` — the unknown-model test deliberately
exercises a path that fails BEFORE any upstream call.

The lazy `await import("@omniroute/open-sse/handlers/chatCore.ts")` is
load-bearing: it keeps the engine (167+ transitive imports) out of the
test boot path. Gate tests run without ever loading the engine.

## File layout

```
gateway/
├── .gitignore
├── README.md
├── next.config.mjs
├── package.json
├── package-lock.json
├── tsconfig.json
├── src/app/api/v1/chat/completions/
│   └── route.ts
└── tests/unit/
    └── chat-completions-route.test.ts
```

## Future work (intentionally NOT in this scaffold)

- Lift the full chat lifecycle from `src/sse/handlers/chat.ts` so
  combos, model aliasing, multi-key rotation, OAuth refresh, admission,
  and quota tracking all work.
- Add a DB-backed alias table so `getModelInfoCore` can resolve user-
  defined short names.
- Multi-tenant API key validation (currently every request is a
  single shared provider key).
- SSE keepalive wrapping (the upstream executor does it; the route
  just needs to forward).
