/** Telegram integration — stub for lean gateway */
import type { WebhookEvent } from "../eventDescriptions";

const TG_API = "https://api.telegram.org";

export function buildTelegramUrl(botToken: string): string {
  return `${TG_API}/bot${botToken}/sendMessage`;
}

export function buildTelegramPayload(
  event: WebhookEvent,
  data: Record<string, unknown>,
  _chatId: string
): Record<string, unknown> {
  return {
    text: `[OmniRoute] ${event}: ${JSON.stringify(data)}`,
    parse_mode: "Markdown",
  };
}
