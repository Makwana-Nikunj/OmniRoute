/**
 * Memory builtin tools — stubs for lean gateway
 */
export const MEMORY_SAVE_TOOL_NAME = "memory_save";
export const MEMORY_UPDATE_TOOL_NAME = "memory_update";
export const MEMORY_SEARCH_TOOL_NAME = "memory_search";
export const MEMORY_DELETE_TOOL_NAME = "memory_delete";

export const MEMORY_BUILTIN_TOOL_NAMES = [
  MEMORY_SAVE_TOOL_NAME,
  MEMORY_UPDATE_TOOL_NAME,
  MEMORY_SEARCH_TOOL_NAME,
  MEMORY_DELETE_TOOL_NAME,
] as const;

/** No-op builtin tool builder — memory/skill builtins are disabled in lean gateway */
export function buildMemoryToolsForProvider(_provider: string, _apiKeyId: string): unknown[] {
  return [];
}
