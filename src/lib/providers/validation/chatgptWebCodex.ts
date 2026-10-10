/**
 * Validator for chatgpt-web-codex provider (retired in lean gateway).
 */

export async function validateChatGptWebCodexProvider(_params?: {
  apiKey?: string;
  providerSpecificData?: Record<string, unknown>;
}) {
  return {
    valid: false,
    error: "ChatGPT Web Codex provider is retired in this gateway edition.",
    unsupported: true,
  };
}
