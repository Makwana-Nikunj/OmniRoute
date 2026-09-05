// Path A gateway scaffold — tests for the OpenAI-compatible /v1/chat/completions route.
//
// Scope (Hard Rule #8 — always include tests when changing production code):
//   - Gate 1: non-JSON content-type returns 415 (no env, no body parsing).
//   - Gate 2: missing GATEWAY_API_KEY returns 500 (no upstream call attempted).
//   - Gate 3: invalid JSON body returns 400.
//   - Gate 4: missing `model` field returns 400.
//   - Gate 5: unresolvable model returns 400 (proves getModelInfoCore is wired
//     into the route and that an unknown model fails BEFORE upstream is hit,
//     keeping the test offline-friendly).
//
// Out of scope for this scaffold (future work):
//   - Happy-path end-to-end call against a real provider. That needs either
//     (a) a live GATEWAY_API_KEY in CI (not done here — no secrets in tests
//     per Hard Rule #1), or (b) a vitest suite with an HTTP-level stub of
//     the upstream provider. The upstream test suite uses vitest for the
//     MCP / autoCombo / cache layers; the same harness can host a future
//     `gateway/tests/integration/chat-completions.test.ts`.

import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

// Import the route AFTER the `before` hook guarantees the env starts from a
// clean state. The route reads GATEWAY_API_KEY at request time, not at module
// load, so dynamic import works regardless of import order — but the dynamic
// import here also keeps tsx's module cache from holding a stale snapshot.
const { POST, OPTIONS } = await import("../../src/app/api/v1/chat/completions/route.ts");

const ORIGINAL_API_KEY = process.env.GATEWAY_API_KEY;
const ORIGINAL_PROVIDER = process.env.GATEWAY_PROVIDER;

before(() => {
  // Start every test with NO gateway env set. Individual tests opt in by
  // setting the env var before calling POST. This keeps Gate 2 deterministic.
  delete process.env.GATEWAY_API_KEY;
  delete process.env.GATEWAY_PROVIDER;
});

beforeEach(() => {
  // Reset between tests — the last test's env should not leak.
  delete process.env.GATEWAY_API_KEY;
  delete process.env.GATEWAY_PROVIDER;
});

after(() => {
  // Restore the operator's original env so we don't pollute sibling suites
  // in the same node process.
  if (ORIGINAL_API_KEY === undefined) {
    delete process.env.GATEWAY_API_KEY;
  } else {
    process.env.GATEWAY_API_KEY = ORIGINAL_API_KEY;
  }
  if (ORIGINAL_PROVIDER === undefined) {
    delete process.env.GATEWAY_PROVIDER;
  } else {
    process.env.GATEWAY_PROVIDER = ORIGINAL_PROVIDER;
  }
});

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
  };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new Request("http://localhost/v1/chat/completions", init);
}

describe("OPTIONS preflight", () => {
  it("returns 204 with CORS headers", async () => {
    const res = await OPTIONS();
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
  });
});

describe("POST gate logic", () => {
  it("returns 415 when Content-Type is not application/json", async () => {
    const req = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello",
    });
    const res = await POST(req);
    assert.equal(res.status, 415);
    const body = (await res.json()) as { error?: { code?: string } };
    assert.equal(body.error?.code, "unsupported_media_type");
  });

  it("returns 500 when GATEWAY_API_KEY is not set", async () => {
    // Env is already empty in beforeEach; assert it for clarity.
    assert.equal(process.env.GATEWAY_API_KEY, undefined);
    const res = await POST(makeRequest({ model: "openai/gpt-4o-mini", messages: [] }));
    assert.equal(res.status, 500);
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    // Status-derived default (intentional: a missing server env var is a server-
    // side misconfiguration, not a client error). We let the default ride rather
    // than invent a new safe identifier.
    assert.equal(body.error?.code, "internal_server_error");
    // Hard Rule #12 — no raw err.stack in the body.
    assert.ok(!String(body.error?.message ?? "").includes("at "));
  });

  it("returns 400 when the body is not valid JSON", async () => {
    process.env.GATEWAY_API_KEY = "test-key-not-real-1234567890";
    const req = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json{",
    });
    const res = await POST(req);
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: { code?: string } };
    // `invalid_request` is on the errorResponse() safe-identifier allowlist;
    // arbitrary identifiers would be silently replaced by the status default.
    assert.equal(body.error?.code, "invalid_request");
  });

  it("returns 400 when the body is a JSON primitive, not an object", async () => {
    process.env.GATEWAY_API_KEY = "test-key-not-real-1234567890";
    const res = await POST(makeRequest("just a string"));
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: { code?: string } };
    assert.equal(body.error?.code, "invalid_request");
  });

  it("returns 400 when `model` is missing", async () => {
    process.env.GATEWAY_API_KEY = "test-key-not-real-1234567890";
    const res = await POST(makeRequest({ messages: [{ role: "user", content: "hi" }] }));
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: { code?: string } };
    assert.equal(body.error?.code, "invalid_request");
  });

  it("returns 400 when the model cannot be resolved by getModelInfoCore", async () => {
    // getModelInfoCore returns { provider: null, ... } for unknown bare model
    // ids (no slash) — it never throws. The route hard-fails on null provider
    // BEFORE calling handleChatCore, proving the resolver is wired in AND
    // that an unknown model fails BEFORE any upstream HTTP call.
    process.env.GATEWAY_API_KEY = "test-key-not-real-1234567890";
    const res = await POST(
      makeRequest({
        model: "definitely-not-a-real-model-xyz123",
        messages: [{ role: "user", content: "hi" }],
      })
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: { code?: string } };
    // `model_not_found` is on the safe-identifier allowlist.
    assert.equal(body.error?.code, "model_not_found");
  });
});
