import type { MitmTarget } from "../types";

const HOSTS = [
  "daily-cloudcode-pa.googleapis.com",
  "cloudcode-pa.googleapis.com",
  "daily-cloudcode-pa.sandbox.googleapis.com",
  "autopush-cloudcode-pa.sandbox.googleapis.com",
];

const ENDPOINTS = [
  "/v1internal:generateContent",
  "/v1internal:streamGenerateContent",
  "/v1internal:loadCodeAssist",
  "/v1internal:onboardUser",
];

const INSTRUCTIONS = [
  "1. Install OmniRoute's root certificate",
  "2. Start the MITM proxy via Dashboard or CLI",
];

export const ANTIGRAVITY_TARGET: MitmTarget = {
  id: "antigravity",
  name: "Antigravity IDE",
  icon: "rocket_launch",
  color: "#4F46E5",
  hosts: HOSTS,
  port: 443,
  endpointPatterns: ENDPOINTS,
  defaultModels: [],
  setupTutorial: {
    steps: INSTRUCTIONS,
    detection: { command: "which antigravity", platform: "all" },
  },
  handler: () => Promise.reject(new Error("MITM handlers are retired in this build")),
  riskNoticeKey: "providers.riskNotice.oauth",
};

export const ANTIGRAVITY_MITM_PROFILE: MitmTarget & {
  description: string;
  targetHost: string;
  targetPort: number;
  localPort: number;
  userAgentPattern: string | null;
  apiEndpoints: string[];
  authHeader: string;
  additionalHosts: string[];
  instructions: string[];
} = {
  ...ANTIGRAVITY_TARGET,
  description:
    "Intercepts Antigravity IDE requests to cloudcode-pa.googleapis.com and routes them through OmniRoute.",
  targetHost: HOSTS[0],
  targetPort: 443,
  localPort: 443,
  userAgentPattern: null,
  apiEndpoints: ENDPOINTS,
  authHeader: "authorization",
  additionalHosts: HOSTS.slice(1),
  instructions: INSTRUCTIONS,
};
