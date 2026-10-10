/**
 * src/lib/db/providerStates.ts — First-class provider enable/disable state.
 */

import { getDbInstance } from "./core";
import { backupDbFile } from "./backup";

interface ProviderStateRow {
  provider: string;
  is_enabled: number;
  updated_at: string;
}

const _providerStateCache = new Map<string, { enabled: boolean; timestamp: number }>();
const CACHE_TTL_MS = 5000;

export function invalidateProviderStateCache(): void {
  _providerStateCache.clear();
}

/**
 * Returns whether a provider is enabled. Defaults to true if no explicit row exists.
 */
export function isProviderEnabled(provider: string): boolean {
  if (!provider) return false;
  const normalized = provider.toLowerCase().trim();
  const cached = _providerStateCache.get(normalized);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.enabled;
  }

  try {
    const db = getDbInstance();
    const row = db
      .prepare("SELECT is_enabled FROM provider_states WHERE provider = ?")
      .get(normalized) as ProviderStateRow | undefined;
    const enabled = row ? row.is_enabled === 1 : true;
    _providerStateCache.set(normalized, { enabled, timestamp: now });
    return enabled;
  } catch {
    return true;
  }
}

/**
 * Sets the enabled state of a provider.
 */
export function setProviderEnabled(provider: string, enabled: boolean): void {
  if (!provider) return;
  const normalized = provider.toLowerCase().trim();
  const db = getDbInstance();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO provider_states (provider, is_enabled, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(provider) DO UPDATE SET is_enabled = excluded.is_enabled, updated_at = excluded.updated_at`
  ).run(normalized, enabled ? 1 : 0, now);

  _providerStateCache.set(normalized, { enabled, timestamp: Date.now() });
  backupDbFile("pre-write");
}

/**
 * Lists all explicit provider enable/disable states.
 */
export function listProviderStates(): Record<string, boolean> {
  const db = getDbInstance();
  const rows = db
    .prepare("SELECT provider, is_enabled FROM provider_states")
    .all() as ProviderStateRow[];
  const result: Record<string, boolean> = {};
  for (const row of rows) {
    result[row.provider] = row.is_enabled === 1;
  }
  return result;
}
