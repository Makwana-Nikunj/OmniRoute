import type { MitmTarget } from "../types";

const HOSTS = ["api.anthropic.com"];
const ENDPOINTS = ["/v1/messages"];
const INSTRUCTIONS = ["1. Install OmniRoute's root certificate", "2. Start the MITM proxy"];

export const KIRO_TARGET: MitmTarget = {
  id: "kiro",
  name: "Kiro IDE",
  icon: "code_blocks",
  color: "#8B5CF6",
  hosts: HOSTS,
  port: 443,
  endpointPatterns: ENDPOINTS,
  defaultModels: [],
  setupTutorial: {
    steps: INSTRUCTIONS,
    detection: { command: "which kiro", platform: "all" },
  },
  handler: () => Promise.reject(new Error("MITM handlers are retired in this build")),
  riskNoticeKey: "providers.riskNotice.oauth",
};

export const KIRO_MITM_PROFILE: MitmTarget & {
  description: string;
  targetHost: string;
  targetPort: number;
  localPort: number;
  userAgentPattern: string | null;
  apiEndpoints: string[];
  authHeader: string;
  instructions: string[];
  referenceIde: string;
} = {
  ...KIRO_TARGET,
  description:
    "Intercepts Kiro IDE requests to api.anthropic.com and routes them through OmniRoute.",
  targetHost: HOSTS[0],
  targetPort: 443,
  localPort: 20130,
  userAgentPattern: null,
  apiEndpoints: ENDPOINTS,
  authHeader: "x-api-key",
  instructions: INSTRUCTIONS,
  referenceIde: "antigravity",
};
