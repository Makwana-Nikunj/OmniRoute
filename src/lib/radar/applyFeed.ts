import type { FreeModelBudget } from "@omniroute/open-sse/config/freeModelCatalog.ts";

export type MergedEntry = FreeModelBudget & {
  enabled?: boolean;
  origin?: "baseline" | "feed";
  provenance?: "omniroute-curated" | "radar-community" | "radar-live";
};
