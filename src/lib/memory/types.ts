/**
 * Memory system type definitions — stubs for lean gateway
 */
export enum MemoryType {
  FACTUAL = "factual",
  EPISODIC = "episodic",
  PROCEDURAL = "procedural",
  SEMANTIC = "semantic",
}

export interface Memory {
  id: string;
  apiKeyId: string;
  sessionId: string;
  type: MemoryType;
  key: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  accessCount: number;
  lastAccessedAt: Date | null;
}
