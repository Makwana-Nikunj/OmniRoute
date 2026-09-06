/**
 * Skills types — stubs for lean gateway
 */
export interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  apiKeyId: string;
  enabled: boolean;
  mode?: "on" | "off" | "auto";
  tags?: string[];
  installCount?: number;
}
