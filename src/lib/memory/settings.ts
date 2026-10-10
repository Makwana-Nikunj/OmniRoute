/**
 * Memory settings — stubs for lean gateway
 */

export interface MemorySettings {
  enabled: boolean;
  maxTokens: number;
  retentionDays: number;
  strategy: "recent" | "semantic" | "hybrid";
  skillsEnabled: boolean;
  embeddingSource: "remote" | "static" | "transformers" | "auto";
  embeddingProviderModel: string | null;
  customBaseUrl: string | null;
  customModelId: string | null;
  transformersEnabled: boolean;
  staticEnabled: boolean;
  rerankEnabled: boolean;
  rerankProviderModel: string | null;
  vectorStore: "sqlite-vec" | "qdrant" | "auto";
  primaryBackend: string;
  fallbackBackends: string[];
  backendConfigs: Record<string, Record<string, unknown>>;
}

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  enabled: false,
  maxTokens: 2000,
  retentionDays: 30,
  strategy: "hybrid",
  skillsEnabled: true,
  embeddingSource: "auto",
  embeddingProviderModel: null,
  customBaseUrl: null,
  customModelId: null,
  transformersEnabled: false,
  staticEnabled: false,
  rerankEnabled: false,
  rerankProviderModel: null,
  vectorStore: "auto",
  primaryBackend: "sqlite",
  fallbackBackends: [],
  backendConfigs: {},
};

export async function getMemorySettings(): Promise<MemorySettings> {
  return DEFAULT_MEMORY_SETTINGS;
}

export function invalidateMemorySettingsCache(): void {}

export function toMemoryRetrievalConfig(
  _settings: MemorySettings,
  _options: { query?: string }
): unknown {
  return {};
}
