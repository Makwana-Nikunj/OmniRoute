import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-bug1-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const { handleResponsesCore } = await import("../../open-sse/handlers/responsesHandler.ts");
const { getDbInstance } = await import("../../src/lib/db/core.ts");

const originalFetch = globalThis.fetch;

test.after(() => {
  globalThis.fetch = originalFetch;
  try {
    const db = getDbInstance();
    if (db) {
      db.pragma("wal_checkpoint(TRUNCATE)");
      db.close();
    }
  } catch {}
  try {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  } catch {}
});

function noopLog() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

test("Bug 1: web_search fallback requested with stream: true returns correctly streamed responses", async () => {
  globalThis.fetch = async (req: string | URL | Request, init?: RequestInit) => {
    const r = req instanceof Request ? req : new Request(req, init);
    const bodyStr = await r.text();
    const body = JSON.parse(bodyStr || "{}");

    // Simulate non-streaming response that chatCore generates for web_search fallback
    assert.equal(
      body.stream,
      false,
      "Upstream should see stream: false due to web_search fallback in chatCore"
    );

    return new Response(
      JSON.stringify({
        id: "chatcmpl-fallback",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "gpt-4",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Web search result content",
              tool_calls: [],
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  };

  const body = {
    stream: true,
    model: "openai/gpt-4",
    tools: [{ type: "web_search" }],
    input: [
      { type: "message", role: "user", content: [{ type: "input_text", text: "search query" }] },
    ],
  };

  const result = await handleResponsesCore({
    body,
    modelInfo: { provider: "openai", model: "gpt-4" },
    credentials: { "openai:apiKey": "test" },
    log: noopLog(),
    onCredentialsRefreshed: () => {},
    onRequestSuccess: () => {},
    onDisconnect: () => {},
    connectionId: "test",
    signal: new AbortController().signal,
  });

  assert.equal(result.success, true);
  const response = result.response as Response;
  const cType = response.headers.get("content-type") || "";

  assert.ok(cType.includes("text/event-stream"), "Final response must be SSE stream, not JSON");

  // Consume stream
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }

  assert.ok(text.includes("response.created"), "Should contain response.created event");
  assert.ok(text.includes("response.output_item.added"), "Should contain output item added");
  assert.ok(text.includes("response.completed"), "Should contain response.completed event");
  assert.ok(text.includes("Web search result content"), "Stream should carry the content");
});

test("Bug 1 follow-up: web_search fallback with stream:false is NOT forced non-streaming", async () => {
  // Regression: the non-streaming forcing must only apply to clients that asked
  // for a stream. A stream:false Responses client must keep the pre-existing
  // contract (upstream streams, handler emits SSE) instead of receiving an
  // OpenAI chat-completions JSON body from /v1/responses.
  const chunks = [
    {
      id: "chatcmpl-bug1b",
      object: "chat.completion.chunk",
      choices: [
        {
          index: 0,
          delta: { role: "assistant", content: "Web search result content" },
          finish_reason: null,
        },
      ],
    },
    {
      id: "chatcmpl-bug1b",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    },
  ];

  globalThis.fetch = async (req: string | URL | Request, init?: RequestInit) => {
    const r = req instanceof Request ? req : new Request(req, init);
    if (!r.url.includes("/chat/completions")) {
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    }
    const body = JSON.parse((await r.text()) || "{}");
    // stream:false clients must NOT be forced non-streaming by the fallback
    assert.equal(body.stream, true, "stream:false client must still stream upstream");
    const sse =
      chunks.map((c) => `data: ${JSON.stringify(c)}`).join("\n\n") + "\n\ndata: [DONE]\n\n";
    return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  };

  const result = await handleResponsesCore({
    body: {
      model: "openai/gpt-4",
      stream: false,
      tools: [{ type: "web_search" }],
      input: [
        { type: "message", role: "user", content: [{ type: "input_text", text: "search query" }] },
      ],
    },
    modelInfo: { provider: "openai", model: "gpt-4" },
    credentials: { "openai:apiKey": "test" },
    log: noopLog(),
    onCredentialsRefreshed: () => {},
    onRequestSuccess: () => {},
    onDisconnect: () => {},
    connectionId: "test",
    signal: new AbortController().signal,
  });

  assert.equal(result.success, true);
  const response = result.response as Response;
  const cType = response.headers.get("content-type") || "";
  assert.ok(cType.includes("text/event-stream"), `stream:false client must get SSE, got ${cType}`);
});
