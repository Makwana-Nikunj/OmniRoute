/**
 * Skills injection — stubs for lean gateway
 */

export interface InjectionOptions {
  provider: "openai" | "anthropic" | "google" | "other";
  existingTools?: unknown[];
  apiKeyId: string;
  model?: string;
  sourceFormat?: string;
  targetFormat?: string;
  backgroundReason?: string | null;
  messages?: unknown[];
}

/** No-op skill injection — skills are disabled in lean gateway */
export function injectSkills(options: InjectionOptions): unknown[] {
  return options.existingTools || [];
}
