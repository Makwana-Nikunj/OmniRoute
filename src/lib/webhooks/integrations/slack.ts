/** Slack integration — stub for lean gateway */
import type { WebhookEvent } from "../eventDescriptions";

export function buildSlackPayload(
  event: WebhookEvent,
  data: Record<string, unknown>
): Record<string, unknown> {
  return { text: `[OmniRoute] ${event}: ${JSON.stringify(data)}` };
}
