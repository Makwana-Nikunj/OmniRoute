/**
 * Server-sent event parsing and provider response reconstruction.
 *
 * SSE parsing uses the WHATWG event-stream algorithm. Response REASSEMBLY is
 * NOT reimplemented here: the OpenAI (chat + Responses), and Anthropic rebuilds
 * delegate to the canonical parsers in
 * `open-sse/handlers/sseReassembly.ts` — the browser-safe split of
 * `open-sse/handlers/sseParser.ts` (this module runs in the client bundle via
 * RequestLoggerDetail -> conversationNormalizer, so it must not import the
 * server-side chain). Those parsers also produce the client-visible response
 * (via chatCore/nonStreamingSse), so the inspector can never show a different
 * final message than the proxy returned (#9500 reasoning-summary handling,
 * #3948 terminal-snapshot preference and cancelled/failed/incomplete status
 * mapping all live only in the canonical parsers). Gemini is the exception —
 * no canonical SSE parser exists, so rebuildGemini below is the single
 * implementation.
 */

import {
  parseSSEToClaudeResponse,
  parseSSEToOpenAIResponse,
  parseSSEToResponsesOutput,
} from "@omniroute/open-sse/handlers/sseReassembly.ts";

export type ApiFormat = "anthropic" | "openai" | "gemini" | "unknown";

export interface SseEvent {
  event?: string;
  data?: string;
  // Parsed JSON payload when `data` was valid JSON.
  json?: unknown;
}

export interface MergedResponse {
  format: ApiFormat;
  message?: unknown;
  raw?: SseEvent[];
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asIndex(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function dispatchSseEvent(
  events: SseEvent[],
  dataLines: string[],
  sawDataField: boolean,
  eventName: string
): void {
  if (!sawDataField) return;

  const data = dataLines.join("\n");
  const event: SseEvent = {};

  if (data !== "[DONE]") {
    try {
      event.json = JSON.parse(data) as unknown;
    } catch {
      // Raw data is still useful to callers when a provider emits a sentinel or malformed JSON.
    }
  }
  // Keep the raw payload only when it could not be parsed (sentinel/malformed):
  // parsed events carry `json`, so retaining `data` too doubles peak memory for
  // every captured stream. chunksToRawSse() re-serializes from `json` when needed.
  if (event.json === undefined) {
    event.data = data;
  }
  if (eventName) event.event = eventName;
  events.push(event);
}

/** Parse a complete `text/event-stream` payload using WHATWG field semantics. */
export function parseSseStream(raw: string): SseEvent[] {
  const input = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const events: SseEvent[] = [];
  let dataLines: string[] = [];
  let eventName = "";
  let sawDataField = false;
  let lineStart = 0;

  const processLine = (line: string): void => {
    if (line.length === 0) {
      dispatchSseEvent(events, dataLines, sawDataField, eventName);
      dataLines = [];
      eventName = "";
      sawDataField = false;
      return;
    }
    if (line.startsWith(":")) return;

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "data") {
      dataLines.push(value);
      sawDataField = true;
    } else if (field === "event") {
      eventName = value;
    }

    // `id`, `retry`, comments, and extension fields do not alter the public event shape.
  };

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);

    if (code !== 0x0a && code !== 0x0d) continue;

    processLine(input.slice(lineStart, index));
    if (code === 0x0d && input.charCodeAt(index + 1) === 0x0a) index += 1;

    lineStart = index + 1;
  }

  // WHATWG does not dispatch an event that lacks its terminating blank line.
  return events;
}

export function detectApiFormat(chunks: SseEvent[]): ApiFormat {
  for (const chunk of chunks) {
    const namedEvent = chunk.event ?? "";
    if (
      namedEvent === "message_start" ||
      namedEvent === "message_delta" ||
      namedEvent === "message_stop" ||
      namedEvent.startsWith("content_block_")
    ) {
      return "anthropic";
    }
    const payload = asRecord(chunk.json);
    if (!payload) continue;

    const type = typeof payload.type === "string" ? payload.type : "";
    if (
      type === "message_start" ||
      type === "message_delta" ||
      type === "message_stop" ||
      type.startsWith("content_block_")
    ) {
      return "anthropic";
    }
    if (Array.isArray(payload.choices) || type.startsWith("response.")) return "openai";
    if (Array.isArray(payload.candidates) || asRecord(payload.usageMetadata)) return "gemini";
  }
  return "unknown";
}

/** Re-serialize parsed events back into a raw SSE payload for the canonical parsers. */
function chunksToRawSse(chunks: SseEvent[]): string {
  return chunks
    .map((chunk) => {
      const data =
        chunk.data ?? (chunk.json !== undefined ? JSON.stringify(chunk.json) : undefined);
      if (data === undefined) return "";
      const name = chunk.event ? `event: ${chunk.event}\n` : "";
      return `${name}data: ${data}\n\n`;
    })
    .join("");
}

/**
 * Reassemble an Anthropic SSE stream into a single message object.
 * Delegates to the canonical parser (chatCore uses the same code path for the
 * client-visible response), preserving this module's public shape.
 */
export function rebuildAnthropic(chunks: SseEvent[]): MergedResponse {
  return {
    format: "anthropic",
    message: parseSSEToClaudeResponse(chunksToRawSse(chunks), ""),
  };
}

/**
 * Reassemble an OpenAI SSE stream. Chat-completions streams (`choices`) go
 * through parseSSEToOpenAIResponse; Responses-API streams (`response.*` events,
 * no `choices`) go through parseSSEToResponsesOutput — both canonical.
 */
export function rebuildOpenAI(chunks: SseEvent[]): MergedResponse {
  const raw = chunksToRawSse(chunks);
  const hasChatChunks = chunks.some((chunk) => Array.isArray(asRecord(chunk.json)?.choices));
  return {
    format: "openai",
    message: hasChatChunks ? parseSSEToOpenAIResponse(raw, "") : parseSSEToResponsesOutput(raw, ""),
  };
}

export function rebuildGemini(chunks: SseEvent[]): MergedResponse {
  const result: JsonRecord = {};
  const candidates = new Map<number, JsonRecord>();
  const parts = new Map<number, unknown[]>();

  for (const chunk of chunks) {
    const payload = asRecord(chunk.json);
    if (!payload) continue;
    for (const [key, value] of Object.entries(payload)) {
      if (key !== "candidates" && value !== undefined) result[key] = value;
    }

    for (const [position, rawCandidate] of asArray(payload.candidates).entries()) {
      const candidate = asRecord(rawCandidate);
      if (!candidate) continue;
      const index = asIndex(candidate.index, position);
      const current = candidates.get(index) ?? { index };
      const content = asRecord(candidate.content);
      const currentParts = parts.get(index) ?? [];
      if (content) currentParts.push(...asArray(content.parts));
      parts.set(index, currentParts);

      for (const [key, value] of Object.entries(candidate)) {
        if (key !== "content" && value !== undefined) current[key] = value;
      }

      if (content) {
        current.content = {
          ...asRecord(current.content),
          ...content,
          parts: currentParts,
        };
      }

      candidates.set(index, current);
    }
  }

  result.candidates = [...candidates.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, candidate]) => candidate);
  return { format: "gemini", message: result };
}

export function mergeStream(chunks: SseEvent[]): MergedResponse {
  const format = detectApiFormat(chunks);
  if (format === "anthropic") return rebuildAnthropic(chunks);
  if (format === "openai") return rebuildOpenAI(chunks);
  if (format === "gemini") return rebuildGemini(chunks);
  return { format: "unknown", raw: chunks };
}
