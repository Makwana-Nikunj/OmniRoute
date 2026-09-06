/**
 * Service API key helpers — stubs for lean gateway
 *
 * Embedded services are not available in lean gateway; this stub generates
 * ephemeral keys without persistence.
 */
import { randomBytes } from "node:crypto";

export function generateServiceApiKey(prefix = "nr"): string {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

export class ServiceApiKeyDecryptError extends Error {
  constructor(tool: string) {
    super(
      `Stored API key for service '${tool}' could not be decrypted. ` +
        `STORAGE_ENCRYPTION_KEY may have changed, the row may be corrupted, ` +
        `or it was written on a different machine. Reinstall the service ` +
        `or rotate the key via POST /api/services/${tool}/rotate-key.`
    );
    this.name = "ServiceApiKeyDecryptError";
  }
}

export async function getOrCreateApiKey(tool: string): Promise<string> {
  // No persistence — return an ephemeral key; the embedded service path is
  // not used in lean gateway.
  const prefix = tool === "9router" ? "nr" : tool === "mux" ? "mx" : tool === "dario" ? "da" : "cp";
  return generateServiceApiKey(prefix);
}

export function maskApiKey(plainKey: string): string {
  const last4 = plainKey.slice(-4);
  return `nr_••••••••${last4}`;
}
