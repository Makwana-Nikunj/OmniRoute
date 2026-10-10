/**
 * Service-boundary re-exports for the chatgpt-web-codex admin/dashboard API
 * routes (src/app/api/providers/**).
 *
 * Provides safe stubs / credential encoders for the retired chatgpt-web-codex provider.
 */

export type ChatGptWebCodexSecrets = {
  cookie?: string;
  storageState?: Record<string, unknown>;
  runtimeKey?: string;
};

const VERSION = 2;

function normalizedCookie(value: string): string {
  return value.trim().replace(/^cookie\s*:\s*/i, "");
}

export function encodeChatGptWebCodexSecrets(secrets: ChatGptWebCodexSecrets): string {
  const cookie = secrets.cookie ? normalizedCookie(secrets.cookie) : "";
  const storageState = secrets.storageState;
  if (!cookie && (!storageState || typeof storageState !== "object")) {
    return "";
  }
  return JSON.stringify({
    version: VERSION,
    ...(storageState ? { storageState } : { cookie }),
    ...(secrets.runtimeKey?.trim() ? { runtimeKey: secrets.runtimeKey.trim() } : {}),
  });
}

export function decodeChatGptWebCodexSecrets(value: string): ChatGptWebCodexSecrets {
  const trimmed = value?.trim?.() || "";
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed.storageState && typeof parsed.storageState === "object") {
      return {
        storageState: parsed.storageState as Record<string, unknown>,
        ...(typeof parsed.runtimeKey === "string" ? { runtimeKey: parsed.runtimeKey } : {}),
      };
    }
    if (typeof parsed.cookie === "string") {
      return {
        cookie: normalizedCookie(parsed.cookie),
        ...(typeof parsed.runtimeKey === "string" ? { runtimeKey: parsed.runtimeKey } : {}),
      };
    }
  } catch {
    return { cookie: normalizedCookie(trimmed) };
  }
  return { cookie: normalizedCookie(trimmed) };
}

export function finalizeValidatedChatGptWebCodexSecrets(
  encodedCredential: string,
  _validationId?: string
): { encodedCredential: string; storageState: Record<string, unknown> } {
  return { encodedCredential, storageState: {} };
}

export async function getChatGptWebCodexDoctorStatus(_connection: unknown) {
  return {
    browser: { ready: false, mode: "unavailable" },
    storageState: { ready: false },
    login: { ready: false },
    temporaryChats: { ready: false },
    tunnelBinary: { ready: false },
    tunnel: { ready: false, processRunning: false, healthy: false, detail: "retired" },
    connector: { ready: false },
    toolRoundtrip: { ready: false },
    runtime: { brokers: 0, workers: 0 },
    lease: null,
    solAvailable: false,
    proAvailable: false,
    recovery: { interactiveLoginRequired: false },
    lastError: null,
  };
}
