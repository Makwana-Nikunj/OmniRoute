/**
 * Memory injection — stubs for lean gateway
 */
import type { Memory } from "./types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
}

export interface InjectMemoryOptions {
  cacheSafe?: boolean;
}

/**
 * Format retrieved memories into a single context line.
 * Restored from the pre-lean-gateway implementation (memory injection itself
 * stays a no-op in the lean build; the codex-responses-ws route still formats
 * memories for its system message when a backend returns them).
 */
export function formatMemoryContext(memories: Memory[]): string {
  if (!memories || memories.length === 0) return "";

  const content = memories
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join("\n");

  return content ? `Memory context: ${content}` : "";
}

/** No-op memory injection — memory is disabled in lean gateway */
export function injectMemory(
  request: ChatRequest,
  _memories: Memory[],
  _provider?: string | null,
  _options?: InjectMemoryOptions
): ChatRequest {
  return request;
}

export function shouldInjectMemory(
  _request: ChatRequest,
  _config?: { enabled?: boolean }
): boolean {
  return false;
}
