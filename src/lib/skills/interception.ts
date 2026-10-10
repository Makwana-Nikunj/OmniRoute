/**
 * Skills interception — stubs for lean gateway
 */

export interface ExecutionContext {
  apiKeyId: string;
  sessionId: string;
  requestId: string;
  builtinToolNames?: string[];
  customSkillExecutionEnabled?: boolean;
  provider?: string;
  model?: string;
}

/** No-op tool call interception — skills are disabled in lean gateway */
export async function handleToolCallExecution(
  response: unknown,
  _modelId: string,
  _context: ExecutionContext
): Promise<unknown> {
  return response;
}
