import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-skills-interception-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const { canExecuteBuiltinTool, handleToolCallExecution } =
  await import("../../src/lib/skills/interception.ts");
const { OMNIROUTE_WEB_SEARCH_FALLBACK_TOOL_NAME } =
  await import("../../open-sse/services/webSearchFallback.ts");
const { OMNIROUTE_WEB_FETCH_FALLBACK_TOOL_NAME } =
  await import("../../open-sse/services/webFetchInterception.ts");
const { resetDbInstance } = await import("../../src/lib/db/core.ts");

const CONTEXT = { apiKeyId: "ak_test", sessionId: "sess_1", requestId: "req_1" };

// Fake search backend (repo convention: no module mocking — inject via deps)
const fakeSearch = async (input: { query: string }) => ({
  cached: false,
  data: {
    success: true,
    query: input.query,
    results: [{ url: "https://example.com", title: "Example", snippet: "A snippet" }],
  },
});

const throwingSearch = async () => {
  throw new Error("upstream search returned 429");
};

const deps = { executeWebSearch: fakeSearch as never };

function webSearchCall(id = "call_ws_1") {
  return {
    type: "function",
    id,
    function: {
      name: OMNIROUTE_WEB_SEARCH_FALLBACK_TOOL_NAME,
      arguments: JSON.stringify({ query: "omniroute docs" }),
    },
  };
}

describe("skills interception (lean gateway)", () => {
  test("canExecuteBuiltinTool maps the restored web_search executor only", () => {
    assert.equal(canExecuteBuiltinTool(OMNIROUTE_WEB_SEARCH_FALLBACK_TOOL_NAME), true);
    // web_fetch's implementation lived in the deleted webFetchExecution module,
    // so chatCore must not rewrite web_fetch into its synthetic fallback form.
    assert.equal(canExecuteBuiltinTool(OMNIROUTE_WEB_FETCH_FALLBACK_TOOL_NAME), false);
    assert.equal(canExecuteBuiltinTool("totally_unknown_tool"), false);
  });

  test("executes the web_search fallback and appends function_call_output + web_search_call", async () => {
    // Regression: the no-op stub left the synthetic fallback tool call stranded
    // in the final response with nothing executing it.
    const response = {
      id: "resp_1",
      output: [
        {
          type: "function_call",
          id: "call_ws_1",
          name: OMNIROUTE_WEB_SEARCH_FALLBACK_TOOL_NAME,
          arguments: JSON.stringify({ query: "omniroute docs" }),
        },
      ],
    };

    const result = (await handleToolCallExecution(response, "openai/gpt-4", CONTEXT, deps)) as {
      output: Array<Record<string, unknown>>;
    };

    assert.equal(result.output.length, 3);
    const functionOutput = result.output[1];
    assert.equal(functionOutput.type, "function_call_output");
    assert.equal(functionOutput.call_id, "call_ws_1");
    const output = JSON.parse(String(functionOutput.output));
    assert.equal(output.success, true);
    assert.equal(output.results[0].url, "https://example.com");

    const webSearchCallItem = result.output[2];
    assert.equal(webSearchCallItem.type, "web_search_call");
    assert.equal(webSearchCallItem.id, "ws_call_ws_1");
    const action = webSearchCallItem.action as { type: string; query: string; sources: unknown[] };
    assert.equal(action.query, "omniroute docs");
    assert.equal(action.sources.length, 1);
  });

  test("executes chat-shaped tool_calls and appends tool_results", async () => {
    const response = {
      id: "chatcmpl_1",
      choices: [{ index: 0, message: { role: "assistant", tool_calls: [webSearchCall()] } }],
    };

    const result = (await handleToolCallExecution(response, "openai/gpt-4", CONTEXT, deps)) as {
      choices: Array<{ message: { tool_calls: unknown[] } }>;
      tool_results: Array<{ tool_call_id: string; output: string }>;
    };

    assert.equal(result.tool_results.length, 1);
    assert.equal(result.tool_results[0].tool_call_id, "call_ws_1");
    const parsed = JSON.parse(result.tool_results[0].output);
    assert.equal(parsed.success, true);
    // Original assistant message preserved
    assert.equal(result.choices[0].message.tool_calls.length, 1);
  });

  test("wraps nested Responses containers (response.output)", async () => {
    const response = {
      response: {
        id: "resp_nested",
        output: [
          {
            type: "function_call",
            id: "call_nested",
            name: OMNIROUTE_WEB_SEARCH_FALLBACK_TOOL_NAME,
            arguments: JSON.stringify({ query: "nested query" }),
          },
        ],
      },
    };

    const result = (await handleToolCallExecution(response, "openai/gpt-4", CONTEXT, deps)) as {
      response: { output: Array<Record<string, unknown>> };
    };

    assert.equal(result.response.output.length, 3);
    assert.equal(result.response.output[1].type, "function_call_output");
    assert.equal(result.response.output[2].type, "web_search_call");
  });

  test("forwards responses with no executable fallback tool calls untouched", async () => {
    const response = {
      id: "chatcmpl_2",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            tool_calls: [
              { type: "function", id: "call_exec", function: { name: "exec", arguments: "{}" } },
            ],
          },
        },
      ],
    };

    const result = await handleToolCallExecution(response, "openai/gpt-4", CONTEXT, deps);
    assert.equal(result, response);
  });

  test("returns a sanitized failure result when the search backend throws", async () => {
    const response = {
      id: "chatcmpl_3",
      choices: [
        { index: 0, message: { role: "assistant", tool_calls: [webSearchCall("call_x")] } },
      ],
    };

    const result = (await handleToolCallExecution(response, "openai/gpt-4", CONTEXT, {
      executeWebSearch: throwingSearch as never,
    })) as { tool_results: Array<{ output: string }> };

    const parsed = JSON.parse(result.tool_results[0].output);
    assert.equal(parsed.success, false);
    assert.equal(parsed.error, "upstream search returned 429");
  });

  test("rejects a missing query without calling the search backend", async () => {
    const response = {
      id: "chatcmpl_4",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            tool_calls: [
              {
                type: "function",
                id: "call_bad",
                function: { name: OMNIROUTE_WEB_SEARCH_FALLBACK_TOOL_NAME, arguments: "{}" },
              },
            ],
          },
        },
      ],
    };

    const result = (await handleToolCallExecution(response, "openai/gpt-4", CONTEXT, deps)) as {
      tool_results: Array<{ output: string }>;
    };

    const parsed = JSON.parse(result.tool_results[0].output);
    assert.equal(parsed.success, false);
    assert.ok(parsed.error.includes("query"));
    assert.ok(!parsed.error.includes("/"), "error must not leak filesystem paths");
  });
});

test.after(() => {
  // Close any DB handle opened by the import chain before removing the temp dir
  try {
    resetDbInstance();
  } catch {}
  try {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {}
});
