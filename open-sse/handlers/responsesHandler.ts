import { CORS_HEADERS } from "../utils/cors.ts";
/**
 * Responses API Handler for Workers
 * Converts Chat Completions to Codex Responses API format
 */

import { handleChatCore } from "./chatCore.ts";
import { convertResponsesApiFormat } from "../translator/helpers/responsesApiHelper.ts";
import { collectResponsesCustomToolNames } from "../translator/request/openai-responses/additionalTools.ts";
import { createResponsesApiTransformStream } from "../transformer/responsesTransformer.ts";
import { createSseHeartbeatTransform, HEARTBEAT_SHAPES } from "../utils/sseHeartbeat.ts";
import { SSE_HEARTBEAT_INTERVAL_MS } from "../config/constants.ts";
import { synthesizeOpenAiSseFromJson } from "../utils/jsonToSse.ts";

/**
 * Handle /v1/responses request
 * @param {object} options
 * @param {object} options.body - Request body (Responses API format)
 * @param {object} options.modelInfo - { provider, model }
 * @param {object} options.credentials - Provider credentials
 * @param {object} options.log - Logger instance (optional)
 * @param {function} options.onCredentialsRefreshed - Callback when credentials are refreshed
 * @param {function} options.onRequestSuccess - Callback when request succeeds
 * @param {function} options.onDisconnect - Callback when client disconnects
 * @param {string} options.connectionId - Connection ID for usage tracking
 * @param {AbortSignal} [options.signal] - Abort signal for request/disconnect cleanup
 * @returns {Promise<{success: boolean, response?: Response, status?: number, error?: string}>}
 */
export async function handleResponsesCore({
  body,
  modelInfo,
  credentials,
  log,
  onCredentialsRefreshed,
  onRequestSuccess,
  onDisconnect,
  connectionId,
  signal,
}) {
  const inputItems = Array.isArray(body?.input) ? body.input : [];
  const customToolNames = collectResponsesCustomToolNames(body?.tools, inputItems);
  const originalStreamRequested = body?.stream === true;

  // Convert Responses API format to Chat Completions format
  const convertedBody = convertResponsesApiFormat(
    body,
    credentials,
    modelInfo?.provider,
    modelInfo?.model
  );

  // The handler contract is upstream streaming + SSE transformation, regardless
  // of the client's stream flag (the Responses shim always emits SSE). The one
  // exception — the web_search fallback, which must execute non-streaming — is
  // applied inside chatCore (it forces stream:false on its own body only when
  // the fallback actually fires and the client asked for stream:true), and the
  // JSON it produces is converted back to SSE below via originalStreamRequested.
  convertedBody.stream = true;

  // Call chat core handler
  // isOpenAIResponsesClient tells chatCore the inbound client speaks the OpenAI
  // Responses API even though the converted body is chat-shaped (sourceFormat
  // detects as plain OpenAI). Without it, chatCore's web_search-fallback
  // non-streaming forcing never fires on this path: upstream receives stream:true
  // for a request whose web_search tool was rewritten to the fallback, and a
  // stream:true client gets a raw SSE upstream stream instead of the assembled
  // JSON (converted back to SSE below).
  const result = await handleChatCore({
    body: convertedBody,
    modelInfo,
    credentials,
    log,
    onCredentialsRefreshed,
    onRequestSuccess,
    onDisconnect,
    clientRawRequest: null,
    isOpenAIResponsesClient: true,
    connectionId,
    userAgent: null,
    comboName: null,
    onStreamFailure: null,
  });

  // handleChatCore's union includes a bare Response (early returns that never
  // reach the {success, response} envelope). Peel it off first so the envelope
  // checks below are reading a shape that actually has those fields — the
  // outcome is unchanged, a bare Response was already returned as-is.
  if (result instanceof Response) {
    return result;
  }
  if (!result.success || !result.response) {
    return result;
  }

  let response = result.response;
  let contentType = response.headers.get("Content-Type") || "";

  // If the client requested stream: true, but we got JSON (e.g. because web_search fallback forced stream:false), convert it back to an SSE stream
  if (
    originalStreamRequested &&
    response.status === 200 &&
    !contentType.includes("text/event-stream")
  ) {
    const text = await response.text();
    const synthesizedStream = synthesizeOpenAiSseFromJson(text);
    if (synthesizedStream) {
      const rebuiltHeaders = new Headers(response.headers);
      rebuiltHeaders.delete("Content-Length");
      rebuiltHeaders.set("Content-Type", "text/event-stream");
      response = new Response(synthesizedStream, {
        status: response.status,
        statusText: response.statusText,
        headers: rebuiltHeaders,
      });
      contentType = "text/event-stream";
      // Update result.response so subsequent references are correct if needed
      result.response = response;
    } else {
      // Rebuild consumed body
      const rebuiltResponse = new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      result.response = rebuiltResponse;
      return result;
    }
  }

  // If not SSE or error, return as-is
  if (!contentType.includes("text/event-stream") || response.status !== 200) {
    return result;
  }

  // Transform SSE stream to Responses API format (no logging in worker)
  const transformStream = createResponsesApiTransformStream(null, undefined, { customToolNames });
  const transformedBody = response.body.pipeThrough(transformStream).pipeThrough(
    createSseHeartbeatTransform({
      signal,
      intervalMs: SSE_HEARTBEAT_INTERVAL_MS,
      shape: HEARTBEAT_SHAPES.OPENAI_RESPONSES_IN_PROGRESS,
    })
  );

  return {
    success: true,
    response: new Response(transformedBody, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    }),
  };
}
