/**
 * Skills interception — lean-gateway minimal builtin executor.
 *
 * The lean gateway deleted the skills framework (executor/registry/builtins),
 * but chatCore still rewrites native `web_search` tools into the synthetic
 * `omniroute_web_search` fallback tool. Restored from the pre-lean-gateway
 * implementation (git 0642cfc70^) and reduced to the web_search builtin:
 * without an executor the fallback tool call is never executed and the final
 * response carries a stranded tool_call (review finding on 736b9c6fd).
 *
 * The web_fetch builtin is intentionally NOT restored — its implementation
 * lived in the deleted webFetchExecution module — so chatCore must not rewrite
 * web_fetch tools; canExecuteBuiltinTool() reports that.
 */
import { OMNIROUTE_WEB_SEARCH_FALLBACK_TOOL_NAME } from "@omniroute/open-sse/services/webSearchFallback.ts";
import { executeWebSearch } from "@/lib/search/executeWebSearch";
import { sanitizeErrorMessage } from "@omniroute/open-sse/utils/error.ts";

export interface ExecutionContext {
  apiKeyId: string;
  sessionId: string;
  requestId: string;
  builtinToolNames?: string[];
  customSkillExecutionEnabled?: boolean;
  provider?: string;
  model?: string;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Whether the lean gateway can actually execute a builtin fallback tool.
 * chatCore uses this to decide whether rewriting a native tool into its
 * synthetic fallback form is safe — advertising a tool nothing can execute
 * strands the model's tool call in the final response.
 */
export function canExecuteBuiltinTool(toolName: string): boolean {
  return toolName === OMNIROUTE_WEB_SEARCH_FALLBACK_TOOL_NAME;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArguments(args: unknown): Record<string, unknown> {
  if (isRecord(args)) return args;
  if (typeof args !== "string") return {};
  try {
    const parsed = JSON.parse(args);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Responses-shaped containers (`output: [...]`, directly or under `.response`). */
function getResponsesOutputContainer(
  response: unknown
): {
  root: Record<string, unknown>;
  responseRoot: Record<string, unknown>;
  output: unknown[];
} | null {
  if (!isRecord(response)) return null;
  if (Array.isArray(response.output)) {
    return { root: response, responseRoot: response, output: response.output };
  }
  if (isRecord(response.response) && Array.isArray(response.response.output)) {
    return {
      root: response,
      responseRoot: response.response,
      output: response.response.output,
    };
  }
  return null;
}

/**
 * Pull fallback tool calls out of an OpenAI chat-completions body
 * (`tool_calls` / `choices[].message.tool_calls`) or a Responses-shaped body
 * (`output[]` function_call items).
 */
export function extractFallbackToolCalls(response: unknown): ToolCall[] {
  const calls: ToolCall[] = [];

  const pushCall = (raw: unknown) => {
    if (!isRecord(raw)) return;
    // Chat shape: { id, function: { name, arguments } }
    if (isRecord(raw.function)) {
      const name = raw.function.name;
      if (typeof name === "string" && name) {
        calls.push({
          id: typeof raw.id === "string" && raw.id ? raw.id : `call_${calls.length}`,
          name,
          arguments: parseArguments(raw.function.arguments),
        });
      }
      return;
    }
    // Responses shape: { id, type: "function_call", name, arguments }
    if (raw.type === "function_call" && typeof raw.name === "string" && raw.name) {
      calls.push({
        id: typeof raw.id === "string" && raw.id ? raw.id : `call_${calls.length}`,
        name: raw.name,
        arguments: parseArguments(raw.arguments),
      });
    }
  };

  if (!isRecord(response)) return calls;
  if (Array.isArray(response.tool_calls)) response.tool_calls.forEach(pushCall);
  if (Array.isArray(response.choices)) {
    for (const choice of response.choices) {
      if (
        isRecord(choice) &&
        isRecord(choice.message) &&
        Array.isArray(choice.message.tool_calls)
      ) {
        choice.message.tool_calls.forEach(pushCall);
      }
    }
  }
  const container = getResponsesOutputContainer(response);
  if (container) container.output.forEach(pushCall);

  return calls;
}

/**
 * Build a native Responses API `web_search_call` output item from an executed
 * web-search fallback call. OpenAI Responses clients (Codex CLI, pi-web-access)
 * expect the response to carry a `web_search_call` item with `action.sources`;
 * without it they only receive the internal function_call round-trip and cannot
 * consume the search results.
 */
export function buildWebSearchCallItem(
  call: ToolCall,
  result: unknown
): Record<string, unknown> | null {
  if (call.name !== OMNIROUTE_WEB_SEARCH_FALLBACK_TOOL_NAME) return null;
  const record = isRecord(result) ? result : null;
  if (!record || record.success !== true) return null;

  const results = Array.isArray(record.results) ? record.results : [];
  const sources = results
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const url = typeof entry.url === "string" ? entry.url : "";
      if (!url) return null;
      const title = typeof entry.title === "string" && entry.title ? entry.title : url;
      const caption =
        typeof entry.snippet === "string" && entry.snippet
          ? entry.snippet
          : typeof entry.display_url === "string"
            ? entry.display_url
            : "";
      return { title, url, caption };
    })
    .filter((source): source is { title: string; url: string; caption: string } => source !== null);

  return {
    id: `ws_${call.id}`,
    type: "web_search_call",
    status: "completed",
    action: {
      type: "web_search",
      query: typeof record.query === "string" ? record.query : "",
      sources,
    },
  };
}

/** Injectable search backend — defaults to the real executeWebSearch. */
export interface InterceptionDeps {
  executeWebSearch?: typeof executeWebSearch;
}

async function executeWebSearchFallback(
  call: ToolCall,
  context: ExecutionContext,
  runSearch: typeof executeWebSearch
): Promise<Record<string, unknown>> {
  const args = call.arguments;
  const query = typeof args.query === "string" ? args.query : "";
  if (!query.trim()) {
    return { success: false, error: "Missing required field: query" };
  }

  const { data } = await runSearch({
    query,
    provider: typeof args.provider === "string" ? args.provider : undefined,
    max_results: typeof args.max_results === "number" ? args.max_results : undefined,
    limit: typeof args.limit === "number" ? args.limit : undefined,
    search_type:
      args.search_type === "news" || args.search_type === "x" || args.search_type === "web"
        ? args.search_type
        : undefined,
    country: typeof args.country === "string" ? args.country : undefined,
    language: typeof args.language === "string" ? args.language : undefined,
    time_range:
      args.time_range === "any" ||
      args.time_range === "day" ||
      args.time_range === "week" ||
      args.time_range === "month" ||
      args.time_range === "year"
        ? args.time_range
        : undefined,
    apiKeyId: context.apiKeyId || null,
  });

  return data as unknown as Record<string, unknown>;
}

export async function handleToolCallExecution(
  response: unknown,
  _modelId: string,
  context: ExecutionContext,
  deps: InterceptionDeps = {}
): Promise<unknown> {
  const toolCalls = extractFallbackToolCalls(response).filter((call) =>
    canExecuteBuiltinTool(call.name)
  );

  if (toolCalls.length === 0) {
    return response;
  }

  const runSearch = deps.executeWebSearch ?? executeWebSearch;
  const results = await Promise.all(
    toolCalls.map(async (call) => {
      try {
        const result = await executeWebSearchFallback(call, context, runSearch);
        return { id: call.id, result };
      } catch (err) {
        const safeError =
          sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) ||
          "Web search execution failed";
        return { id: call.id, result: { success: false, error: safeError } };
      }
    })
  );

  const resultById = new Map(results.map((r) => [r.id, r.result]));

  const responsesOutput = getResponsesOutputContainer(response);
  if (responsesOutput) {
    const functionOutputs = results.map((result) => ({
      type: "function_call_output",
      call_id: result.id,
      output: JSON.stringify(result.result),
    }));
    const webSearchCalls = toolCalls
      .map((call) => buildWebSearchCallItem(call, resultById.get(call.id)))
      .filter((item): item is Record<string, unknown> => item !== null);

    const mergedOutput = [...responsesOutput.output, ...functionOutputs, ...webSearchCalls];
    if (responsesOutput.root === responsesOutput.responseRoot) {
      return { ...responsesOutput.root, output: mergedOutput };
    }
    return {
      ...responsesOutput.root,
      response: { ...responsesOutput.responseRoot, output: mergedOutput },
    };
  }

  // Chat-completions shape: expose the executed results as tool_results so the
  // client can continue the tool-call round-trip with real search output.
  return {
    ...(isRecord(response) ? response : {}),
    tool_results: results.map((r) => ({
      tool_call_id: r.id,
      output: JSON.stringify(r.result),
    })),
  };
}
