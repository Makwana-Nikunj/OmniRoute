import { FREE_MODEL_BUDGETS } from "@omniroute/open-sse/config/freeModelCatalog.data.ts";
import type { MergedEntry } from "./applyFeed";

export interface RadarCatalogMeta {
  version: string;
  generatedAt: string | null;
  tier: string;
  fetchedAt: string;
}

export interface RadarCatalogResult {
  entries: MergedEntry[];
  meta: RadarCatalogMeta | null;
}

export function getRadarCatalog(): RadarCatalogResult {
  return {
    entries: FREE_MODEL_BUDGETS as MergedEntry[],
    meta: null,
  };
}

export function getCatalogWithoutOverlay(): MergedEntry[] {
  return FREE_MODEL_BUDGETS as MergedEntry[];
}

export * from "./referrals";
export * from "./links";
