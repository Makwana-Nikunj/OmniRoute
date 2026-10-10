/**
 * CLI runtime resolution — stubs for lean gateway
 *
 * CLI tools are not available in lean gateway; these stubs return safe defaults
 * so that qoderCli.ts type-checks but never actually executes a CLI.
 */
import os from "os";
import fsSync from "node:fs";
import path from "node:path";

export const CLI_TOOL_IDS = [
  "claude",
  "codex",
  "cursor",
  "copilot",
  "opencode",
  "cline",
  "kilocode",
  "hermes",
  "hermes-agent",
  "openclaw",
  "droid",
  "continue",
  "qwen",
  "antigravity",
  "windsurf",
  "devin",
] as const;

export type CliRuntimeStatus = {
  installed: boolean;
  commandPath?: string;
  version?: string;
  runnable?: boolean;
  command?: string | null;
  reason?: string | null;
};

export function getLookupEnv(): NodeJS.ProcessEnv {
  // Minimal env: just enough that spawn doesn't inherit sensitive values from
  // the parent process. cliRuntime adds PATH/PATHEXT/APPDATA for the real code.
  return {
    ...process.env,
    HOME: os.homedir(),
    PATH: process.env.PATH || "",
    PATHEXT: process.env.PATHEXT || "",
    APPDATA: process.env.APPDATA || "",
  };
}

export async function getCliRuntimeStatus(_tool: string): Promise<CliRuntimeStatus | null> {
  // CLI tools are not installed in lean gateway
  return null;
}

export function getKnownToolPaths(_tool: string): string[] {
  return [];
}

export function shouldUseShellForCommand(_command: string): boolean {
  return false;
}

// ── CLI config-write gate (GHSA-5926-2w35-7h4q) ──────────────────────────────
// Restored for the surviving OAuth apply-local routes, which call the gate
// before writing a CLI auth file. The container-ephemeral detection of the
// original implementation lived in the removed container-dep helpers; the
// flag-only behavior the routes use (no targetPath) is preserved exactly.

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export function isCliConfigWriteAllowed(): boolean {
  return parseBoolean(process.env.CLI_ALLOW_CONFIG_WRITES, true);
}

/**
 * Gate for every CLI-tool config write. Returns a refusal message, or `null`
 * when the write is allowed.
 */
export function ensureCliConfigWriteAllowed(targetPath?: string): string | null {
  if (!isCliConfigWriteAllowed()) {
    return "CLI config writes are disabled (CLI_ALLOW_CONFIG_WRITES=false)";
  }
  if (!targetPath) return null;
  return null;
}

// ── CLI config paths (auth-file writers) ─────────────────────────────────────
// Minimal restoration covering the surviving call sites
// (claudeAuthFile.ts / codexAuthFile.ts read `paths.auth`). $HOME-relative
// resolution honours CLI_CONFIG_HOME when it is an absolute path, matching the
// original getCliConfigHome() contract.

const CLI_CONFIG_PATHS: Record<string, Record<string, string | string[]>> = {
  claude: {
    settings: ".claude/settings.json",
    auth: [".claude/.credentials.json", ".config/claude/credentials.json"],
  },
  codex: {
    config: ".codex/config.toml",
    auth: ".codex/auth.json",
  },
};

export function getCliConfigPaths(toolId: string): Record<string, string> | null {
  const entry = CLI_CONFIG_PATHS[toolId];
  if (!entry) return null;

  const home = getCliConfigHome();
  const resolved: Record<string, string> = {};
  for (const [key, relativePath] of Object.entries(entry)) {
    if (Array.isArray(relativePath)) {
      // First existing candidate wins; otherwise the first entry (the
      // historical default).
      let picked = path.join(home, relativePath[0]);
      for (const candidate of relativePath) {
        const absolute = path.join(home, candidate);
        if (fsSync.existsSync(absolute)) {
          picked = absolute;
          break;
        }
      }
      resolved[key] = picked;
    } else {
      resolved[key] = path.join(home, relativePath);
    }
  }
  return resolved;
}

function getCliConfigHome(): string {
  const override = String(process.env.CLI_CONFIG_HOME || "").trim();
  if (override && path.isAbsolute(override)) return override;
  return os.homedir();
}
