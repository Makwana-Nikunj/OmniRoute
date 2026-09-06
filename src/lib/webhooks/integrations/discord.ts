/** Discord integration — stub for lean gateway */
import type { WebhookEvent } from "../eventDescriptions";

export function buildDiscordPayload(
  event: WebhookEvent,
  data: Record<string, unknown>
): Record<string, unknown> {
  return { content: `[OmniRoute] ${event}: ${JSON.stringify(data)}` };
}
