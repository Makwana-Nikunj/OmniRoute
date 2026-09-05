// Path A gateway scaffold — the OpenAI-compatible /v1/chat/completions route.
//
// This route is intentionally minimal: it parses the request body, resolves the
// model+provider via @omniroute/open-sse's getModelInfoCore, reads one provider
// API key from the GATEWAY_API_KEY env var, and delegates the entire request
// lifecycle to handleChatCore (the same core the upstream OmniRoute uses).
//
// Scope of this scaffold (deliberate):
//   - One provider per process (env-var key).
//   - No combos, no admission, no model aliasing, no quota tracking, no DB.
//   - Errors go through @omniroute/open-sse's `errorResponse` (Hard Rule #12).
//   - No raw err.stack / err.message in the response body.
//
// Module-load boundary (CRITICAL — this is what makes the gate tests runnable):
//   - We import the *narrow* surface (errorResponse, getModelInfoCore, logger)
//     directly via deep paths, NOT the `import "@omniroute/open-sse"` barrel.
//     The barrel re-exports 167 modules and pulls in the full chat lifecycle,
//     which transitively imports @/lib/db/* (provider connections, combos, DB
//     state, OAuth). Loading that here would force the gateway to vendor the
//     entire parent DB layer (117 modules, 148 migrations) just to compile.
//   - handleChatCore is loaded LAZILY, inside the POST handler, AFTER every
//     gate has passed. The gate tests (415 / 500 / 400 invalid_json / 400
//     missing_model / 400 unknown_model) therefore run without ever loading
//     the engine — and the test suite stays offline-friendly (no live
//     GATEWAY_API_KEY required, per Hard Rule #1).
//
// Future work (intentionally NOT in this scaffold):
//   - Lift the full chat lifecycle from src/sse/handlers/chat.ts when we need
//     combos, model aliasing, multi-key rotation, OAuth, admission, etc.
//   - For now, see `_tasks/superpowers/plans/2026-09-05-explore-omniroute-architecture.md`
//     for the map of what lives in src/sse/ vs what lives in open-sse/.

import { errorResponse } from "@omniroute/open-sse/utils/error.ts";
import { logger as openSseLogger } from "@omniroute/open-sse/utils/logger.ts";
import { getModelInfoCore } from "@omniroute/open-sse/services/model.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function readEnv(name: string): string | null {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  // Gate 1 — Content-Type must be application/json. Mirrors OpenAI/Anthropic.
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().split(";")[0].trim().startsWith("application/json")) {
    return new Response(
      JSON.stringify({
        error: {
          message: "Content-Type must be application/json",
          type: "invalid_request_error",
          code: "unsupported_media_type",
        },
      }),
      { status: 415, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  // Gate 2 — Provider credentials must be configured. Hard fail (no silent stub).
  // The 500 + status-derived `internal_server_error` is intentional: this is a
  // server-side misconfiguration, not a client error. The errorResponse() helper
  // routes custom `code` values through SAFE_PUBLIC_ERROR_IDENTIFIERS, so we let
  // the status-derived default ride instead of inventing a new identifier.
  const apiKey = readEnv("GATEWAY_API_KEY");
  if (!apiKey) {
    return errorResponse(
      500,
      "GATEWAY_API_KEY is not configured. Set it to a provider API key before starting the gateway."
    );
  }
  const provider = readEnv("GATEWAY_PROVIDER") ?? "openai";

  // Gate 3 — Parse the body exactly once. A streaming body that the executor
  // converts internally to SSE/JSON will reuse this parsed object. We pass
  // `invalid_request` / `invalid_request_error` as the code — those are
  // already on the safe-identifier allowlist inside errorResponse(); arbitrary
  // strings like `invalid_json` would be silently replaced by the status-
  // derived default (`bad_request`).
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Request body must be valid JSON", {
      type: "invalid_request_error",
      code: "invalid_request",
    });
  }
  if (!body || typeof body !== "object") {
    return errorResponse(400, "Request body must be a JSON object", {
      type: "invalid_request_error",
      code: "invalid_request",
    });
  }

  const bodyObj = body as Record<string, unknown>;
  const modelStr = typeof bodyObj.model === "string" ? bodyObj.model : null;
  if (!modelStr) {
    return errorResponse(400, "`model` is required and must be a string", {
      type: "invalid_request_error",
      code: "invalid_request",
    });
  }

  // Resolve `provider/model/extendedContext` from the model string. We pass
  // `null` for aliases because the scaffold does not maintain a DB-backed
  // alias table; a future iteration can lift the upstream `getCombosCached`
  // alias map from src/sse/handlers/chat.ts. `model_not_found` is on the
  // errorResponse() safe-identifier allowlist; an arbitrary `unknown_model`
  // would be silently replaced by the status-derived default.
  let resolved;
  try {
    resolved = await getModelInfoCore(modelStr, null);
  } catch (err) {
    return errorResponse(400, `Could not resolve model "${modelStr}": ${String(err)}`, {
      type: "invalid_request_error",
      code: "model_not_found",
    });
  }
  // getModelInfoCore never throws for unknown models — it returns
  // { provider: null, model, extendedContext, errorType, errorMessage }.
  // Hard-fail here so we never hand a null-provider to handleChatCore.
  if (!resolved.provider) {
    return errorResponse(
      400,
      typeof resolved.errorMessage === "string"
        ? resolved.errorMessage
        : `Model "${modelStr}" could not be resolved to a known provider`,
      { type: "invalid_request_error", code: "model_not_found" }
    );
  }

  // Gate 6 — Load the engine lazily. handleChatCore transitively imports
  // @/lib/db/* (provider connections, combos, DB state, OAuth), which is the
  // parent app's full DB layer. By loading it only AFTER every gate has
  // passed, the gate tests (and any client whose request fails on Gate 1-5)
  // never trigger that load — keeping the scaffold testable without vendoring
  // the parent's DB.
  const { handleChatCore } = await import("@omniroute/open-sse/handlers/chatCore.ts");

  const log = openSseLogger("GATEWAY");
  const credentials = {
    apiKey,
    connectionId: null,
    providerSpecificData: null,
  };

  // Delegate the entire request lifecycle to open-sse. handleChatCore handles
  // protocol translation (OpenAI <-> Claude <-> Gemini wire formats), retries,
  // and returns a Response we can return directly to the client.
  let result;
  try {
    result = await handleChatCore({
      body: { ...bodyObj, model: `${resolved.provider}/${resolved.model}` },
      modelInfo: {
        provider: resolved.provider,
        model: resolved.model,
        extendedContext: resolved.extendedContext,
      },
      credentials,
      log,
      // We pass the original model string back so the executor preserves the
      // caller's intent (e.g. user wrote "openai/gpt-4o" — keep the slash
      // form for round-trip parity). The body above already includes the
      // normalized form so the executor can match.
      clientRawRequest: { headers: Object.fromEntries(request.headers.entries()) },
      // No admission, no combo, no quota tracking in this scaffold.
      isCombo: false,
      skipUpstreamRetry: false,
      // We want streaming when the client asks for it, otherwise JSON.
      // handleChatCore honors body.stream directly.
    });
  } catch (err) {
    // Hard Rule #12 — never put raw err.stack / err.message in the response.
    return errorResponse(500, "Upstream call failed", {
      type: "upstream_error",
      code: "handle_chat_core_threw",
    });
  }

  if (!result || result.success !== true || !result.response) {
    return errorResponse(
      typeof result?.status === "number" ? result.status : 502,
      typeof result?.error === "string" ? result.error : "Upstream provider returned no response",
      { type: "upstream_error", code: "no_response" }
    );
  }

  // The result.response is a fully-formed Response with the right headers
  // (SSE Content-Type for streaming, application/json for non-streaming).
  // Re-emit CORS so browsers can call the route cross-origin.
  const headers = new Headers(result.response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(result.response.body, {
    status: result.response.status,
    statusText: result.response.statusText,
    headers,
  });
}
