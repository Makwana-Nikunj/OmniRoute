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
