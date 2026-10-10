import { sanitizeErrorMessage } from "../utils/error.ts";

/**
 * Extract a provider error message from a buffered SSE stream that carries an
 * error-only chunk (`data: {"error":...}`) and no content chunks.
 *
 * Some executors always return `text/event-stream` even on failure (e.g. the
 * Devin/Windsurf CLI executors emit `data: {"error":{"message":"Devin CLI not
 * found..."}}`). Those chunks have no `choices`/Claude/Responses content, so the
 * content parsers (parseSSEToOpenAIResponse etc.) correctly return `null`. Without
 * this helper the caller would replace the real upstream error with a generic
 * "Invalid SSE response" 502, swallowing the actionable message (#3324).
 *
 * Provider-agnostic: matches any `data:` chunk that has an `error` field but no
 * `choices` array. The returned message is always run through sanitizeErrorMessage
 * so stack traces / absolute source paths never leak (Hard Rule #12). Returns
 * `null` when no error-only chunk is present (so valid-content streams are left
 * to the normal parsers).
 */
export function extractSSEErrorMessage(rawSSE: unknown): string | null {
  const lines = String(rawSSE || "").split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      continue; // Ignore malformed lines and keep scanning.
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const record = parsed as Record<string, unknown>;

    // A chunk with content (choices) is not an error-only chunk — defer to the
    // normal content parsers so the valid-SSE path is never short-circuited.
    if (Array.isArray(record.choices)) continue;

    const err = record.error;
    if (err == null) continue;

    let message = "";
    if (typeof err === "string") {
      message = err;
    } else if (typeof err === "object" && !Array.isArray(err)) {
      const errRecord = err as Record<string, unknown>;
      if (typeof errRecord.message === "string") {
        message = errRecord.message;
      } else {
        message = JSON.stringify(err);
      }
    } else {
      message = String(err);
    }

    const sanitized = sanitizeErrorMessage(message);
    if (sanitized) return sanitized;
  }

  return null;
}

export {
  parseSSEToOpenAIResponse,
  parseSSEToClaudeResponse,
  parseSSEToResponsesOutput,
} from "./sseReassembly.ts";
