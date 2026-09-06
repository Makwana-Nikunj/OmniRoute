/**
 * Memory retrieval — stubs for lean gateway
 */
import type { Memory } from "./types";
import type { MemorySettings } from "./settings";

export interface RetrievalOptions {
  enabled?: boolean;
  maxTokens?: number;
  retrievalStrategy?: string;
  autoSummarize?: boolean;
  persistAcrossModels?: boolean;
  retentionDays?: number;
  scope?: string;
  query?: string;
}

/** No-op memory retrieval — memory is disabled in lean gateway */
export async function retrieveMemories(
  _apiKeyId: string,
  _config: RetrievalOptions = {}
): Promise<Memory[]> {
  return [];
}
