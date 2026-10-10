export async function emitGamificationEvent(_params: {
  apiKeyId: string;
  action: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  // Gamification subsystem disabled in lean gateway
}
