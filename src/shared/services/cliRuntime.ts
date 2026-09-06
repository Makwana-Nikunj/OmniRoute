/**
 * CLI runtime resolution — stubs for lean gateway
 *
 * CLI tools are not available in lean gateway; these stubs return safe defaults
 * so that qoderCli.ts type-checks but never actually executes a CLI.
 */
import os from "os";

export type CliRuntimeStatus = {
  installed: boolean;
  commandPath?: string;
  version?: string;
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
