import { test, describe } from "node:test";
import assert from "node:assert/strict";

const { buildResponseTurns } = await import("../../src/mitm/inspector/conversationNormalizer.ts");
const { parseSSEToClaudeResponse, parseSSEToOpenAIResponse, parseSSEToResponsesOutput } =
  await import("../../open-sse/handlers/sseParser.ts");

type Turn = { role: string; blocks: Array<{ type: string; text?: string }> };

function sseRequest(body: string) {
  return {
    id: "req_parity_1",
    source: "http-proxy",
    timestamp: new Date().toISOString(),
    method: "POST",
    host: "api.openai.com",
    path: "/v1/responses",
    requestHeaders: {},
    requestBody: null,
    requestSize: 0,
    responseHeaders: { "content-type": "text/event-stream" },
    responseBody: body,
    responseSize: body.length,
    status: 200,
  } as never;
}

function turnText(turns: Turn[]): string {
  return turns
    .flatMap((turn) => turn.blocks)
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
}

const RESPONSES_SSE = [
  'data: {"type":"response.created","response":{"id":"resp_1","object":"response","output":[]}}',
  'data: {"type":"response.output_item.added","output_index":0,"item":{"id":"msg_1","type":"message","role":"assistant","content":[]}}',
  'data: {"type":"response.content_part.added","output_index":0,"content_index":0,"part":{"type":"output_text","text":""}}',
  'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"Hello world"}',
  'data: {"type":"response.completed","response":{"id":"resp_1","status":"completed"}}',
  "data: [DONE]",
  "",
].join("\n\n");

const OPENAI_CHAT_SSE = [
  'data: {"id":"c1","model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello world"}}]}',
  'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
  "data: [DONE]",
  "",
].join("\n\n");

const ANTHROPIC_SSE = [
  'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1"}}',
  'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}',
  'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello world"}}',
  'event: message_stop\ndata: {"type":"message_stop"}',
  "",
].join("\n\n");

describe("inspector conversation normalizer — canonical parser parity", () => {
  // The inspector reassembly delegates to open-sse/handlers/sseParser.ts; these
  // tests pin the parity so a future divergence between what the inspector shows
  // and what the proxy actually returned is caught here.
  test("Responses API SSE matches the canonical responses output", () => {
    const canonical = parseSSEToResponsesOutput(RESPONSES_SSE, "") as {
      output: Array<{ content: Array<{ text: string }> }>;
    };
    const canonicalText = canonical.output[0].content[0].text;

    const turns = buildResponseTurns(sseRequest(RESPONSES_SSE)) as Turn[];
    assert.equal(turnText(turns), canonicalText);
    assert.equal(turnText(turns), "Hello world");
    assert.equal(turns[0].role, "assistant");
  });

  test("OpenAI chat SSE matches the canonical chat completion", () => {
    const canonical = parseSSEToOpenAIResponse(OPENAI_CHAT_SSE, "") as {
      choices: Array<{ message: { content: string } }>;
    };

    const turns = buildResponseTurns(sseRequest(OPENAI_CHAT_SSE)) as Turn[];
    assert.equal(turnText(turns), canonical.choices[0].message.content);
    assert.equal(turnText(turns), "Hello world");
  });

  test("Anthropic SSE matches the canonical claude message", () => {
    const canonical = parseSSEToClaudeResponse(ANTHROPIC_SSE, "") as {
      content: Array<{ text: string }>;
    };
    const canonicalText = canonical.content.map((block) => block.text).join("");

    const turns = buildResponseTurns(sseRequest(ANTHROPIC_SSE)) as Turn[];
    assert.equal(turnText(turns), canonicalText);
    assert.equal(turnText(turns), "Hello world");
  });
});
