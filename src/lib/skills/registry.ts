/**
 * Skill registry — stubs for lean gateway
 */
import type { Skill } from "./types";

class SkillRegistry {
  static getInstance(): SkillRegistry {
    return new SkillRegistry();
  }

  list(_apiKeyId: string): Skill[] {
    return [];
  }

  async loadFromDatabase(_apiKeyId: string): Promise<void> {}
}

export const skillRegistry = SkillRegistry.getInstance();
