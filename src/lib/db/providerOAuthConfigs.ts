/**
 * src/lib/db/providerOAuthConfigs.ts — Custom provider OAuth client credentials.
 */

import { getDbInstance } from "./core";
import { backupDbFile } from "./backup";
import { encrypt, decrypt } from "./encryption";

export interface ProviderOAuthConfigRecord {
  provider: string;
  clientId: string;
  clientSecret: string | null;
  updatedAt: string;
}

interface ProviderOAuthConfigDbRow {
  provider: string;
  client_id: string;
  client_secret: string | null;
  updated_at: string;
}

export function getProviderOAuthConfig(provider: string): ProviderOAuthConfigRecord | null {
  if (!provider) return null;
  const db = getDbInstance();
  const normalized = provider.toLowerCase().trim();
  const row = db
    .prepare("SELECT * FROM provider_oauth_configs WHERE provider = ?")
    .get(normalized) as ProviderOAuthConfigDbRow | undefined;

  if (!row) return null;

  return {
    provider: row.provider,
    clientId: row.client_id,
    clientSecret: row.client_secret ? (decrypt(row.client_secret) ?? row.client_secret) : null,
    updatedAt: row.updated_at,
  };
}

export function setProviderOAuthConfig(
  provider: string,
  clientId: string,
  clientSecret?: string | null
): void {
  if (!provider) return;
  const db = getDbInstance();
  const normalized = provider.toLowerCase().trim();
  const now = new Date().toISOString();
  const encryptedSecret = clientSecret ? (encrypt(clientSecret) ?? clientSecret) : null;

  db.prepare(
    `INSERT INTO provider_oauth_configs (provider, client_id, client_secret, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(provider) DO UPDATE SET
       client_id = excluded.client_id,
       client_secret = excluded.client_secret,
       updated_at = excluded.updated_at`
  ).run(normalized, clientId.trim(), encryptedSecret, now);

  backupDbFile("pre-write");
}

export function deleteProviderOAuthConfig(provider: string): boolean {
  if (!provider) return false;
  const db = getDbInstance();
  const normalized = provider.toLowerCase().trim();
  const result = db
    .prepare("DELETE FROM provider_oauth_configs WHERE provider = ?")
    .run(normalized);
  backupDbFile("pre-write");
  return (result.changes ?? 0) > 0;
}

export function listProviderOAuthConfigs(): Array<{
  provider: string;
  clientId: string;
  hasClientSecret: boolean;
  maskedClientSecret: string | null;
  updatedAt: string;
}> {
  const db = getDbInstance();
  const rows = db
    .prepare("SELECT * FROM provider_oauth_configs ORDER BY provider ASC")
    .all() as ProviderOAuthConfigDbRow[];

  return rows.map((r) => {
    const rawSecret = r.client_secret ? (decrypt(r.client_secret) ?? r.client_secret) : null;
    let masked: string | null = null;
    if (rawSecret && rawSecret.length > 4) {
      masked = `${rawSecret.slice(0, 3)}...${rawSecret.slice(-4)}`;
    } else if (rawSecret) {
      masked = "****";
    }

    return {
      provider: r.provider,
      clientId: r.client_id,
      hasClientSecret: Boolean(rawSecret),
      maskedClientSecret: masked,
      updatedAt: r.updated_at,
    };
  });
}
