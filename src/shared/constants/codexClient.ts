// Stub — CLI tools not available in lean gateway
export const DEFAULT_CODEX_CLIENT_VERSION = "0.149.0";
export const CODEX_CLI_RS_ORIGINATOR = "codex_cli_rs";

export function getCodexCliRsHeaders(
  _version = DEFAULT_CODEX_CLIENT_VERSION
): Record<string, string> {
  return {
    "User-Agent": `${CODEX_CLI_RS_ORIGINATOR}/${DEFAULT_CODEX_CLIENT_VERSION}`,
    originator: CODEX_CLI_RS_ORIGINATOR,
  };
}
