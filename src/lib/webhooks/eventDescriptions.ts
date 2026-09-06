/**
 * Webhook event types — stubs for lean gateway
 */
export type WebhookEvent = "request.completed" | "request.failed" | "quota.exceeded" | "test.ping";

export const WEBHOOK_EVENT_VALUES = [
  "request.completed",
  "request.failed",
  "quota.exceeded",
  "test.ping",
] as const;

export interface EventDescription {
  label: string;
  description: string;
  emoji: string;
  exampleData: Record<string, unknown>;
}

export const EVENT_DESCRIPTIONS: Record<WebhookEvent, EventDescription> = {
  "request.completed": {
    label: "Request Completed",
    emoji: "✅",
    description: "Triggered when an upstream request completes successfully (HTTP 2xx).",
    exampleData: {
      model: "claude-opus-4-7",
      provider: "claude",
      latencyMs: 1240,
      tokensIn: 142,
      tokensOut: 38,
    },
  },
  "request.failed": {
    label: "Request Failed",
    emoji: "❌",
    description: "Triggered when an upstream request fails (HTTP 4xx/5xx).",
    exampleData: {
      model: "claude-opus-4-7",
      provider: "claude",
      latencyMs: 340,
      error: "upstream 503",
    },
  },
  "quota.exceeded": {
    label: "Quota Exceeded",
    emoji: "⚠️",
    description: "Triggered when an API key exceeds its usage quota.",
    exampleData: { apiKeyId: "key_xxx", quotaType: "monthly", limit: 100000, used: 100001 },
  },
  "test.ping": {
    label: "Test Ping",
    emoji: "🔔",
    description: "Triggered when a webhook is tested.",
    exampleData: { test: true, timestamp: new Date().toISOString() },
  },
};
