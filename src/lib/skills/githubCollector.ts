/**
 * GitHub Skill Collector — stubs for lean gateway
 */

export interface GitHubSkillRepo {
  fullName: string;
  htmlUrl: string;
  description: string;
  stars: number;
  forks: number;
  topics: string[];
  score: number;
  hasSkillFile: boolean;
  isAwesome: boolean;
  updatedAt: string | null;
  license: string | null;
}

export async function searchGitHubSkills(
  _options: { token?: string; minStars?: number; maxResults?: number } = {}
): Promise<{ repos: GitHubSkillRepo[]; errors: string[] }> {
  return { repos: [], errors: [] };
}
