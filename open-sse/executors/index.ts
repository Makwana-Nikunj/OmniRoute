import { SEARCH_PROVIDERS } from "../config/searchRegistry.ts";
import { assertMicrosoftDesignerWebProviderAvailable } from "@/shared/constants/designerWebRetirement";
import { assertRuntimeProviderAvailable } from "@/shared/constants/providerRetirement";
import { assertCommonChatGptWebProviderAvailable } from "@/shared/constants/chatgptWebRetirement";
import { registerLazyExecutor, loadRegisteredExecutor, hasRegisteredExecutor } from "./registry.ts";
// Type-only: pulls no runtime code, keeps DefaultExecutor the only eager class.
import type { BaseExecutor } from "./base.ts";
import { getDefaultExecutor } from "./defaultResolver.ts";

// R0.3 — declarative built-in table, made LAZY by #11220.
//
// The object literal below stays as the single place built-ins are declared
// (compile-time duplicate-key safety; the check:known-symbols gate parses this
// literal from source), but its values are now deferred loaders instead of
// eagerly-constructed instances. At module load every ALIAS is registered in
// declaration order; the class import + construction happen on first use via
// loadRegisteredExecutor() and are cached in the same registry a static
// registration would have populated.
//
// Why: importing this barrel previously pulled all ~100 executor modules and
// constructed every instance at boot — ~0.7–1.2s and ~35MB of heap measured on
// top of the minimal set — even for deployments that use a handful of
// providers. Bundlers split the dynamic imports into on-demand chunks.
//
// Contract preserved (pinned by tests/unit/executor-map-golden.test.ts):
//   - keys and their ORDER are byte-stable
//   - each alias still gets its OWN instance (aliases never share)
//   - ctor arguments are unchanged
const lazyExecutors: Record<string, () => Promise<BaseExecutor>> = {
  antigravity: () => import("./antigravity.ts").then((m) => new m.AntigravityExecutor()),
  agy: () => import("./antigravity.ts").then((m) => new m.AntigravityExecutor()),
  github: () => import("./github.ts").then((m) => new m.GithubExecutor()),
  "ghe-copilot": () => import("./ghe-copilot.ts").then((m) => new m.GheCopilotExecutor()),
  qoder: () => import("./qoder.ts").then((m) => new m.QoderExecutor()),
  kiro: () => import("./kiro.ts").then((m) => new m.KiroExecutor()),
  "amazon-q": () => import("./kiro.ts").then((m) => new m.KiroExecutor("amazon-q")),
  bedrock: () => import("./bedrock.ts").then((m) => new m.BedrockExecutor()),
  codex: () => import("./codex.ts").then((m) => new m.CodexExecutor()),
  "codex-app-server": () =>
    import("./codex-app-server.ts").then(
      (m) => new m.CodexAppServerExecutor({}, "codex-app-server")
    ),
  maxai: () => import("./maxai.ts").then((m) => new m.MaxAiExecutor()),
  uc: () => import("./uc.ts").then((m) => new m.UcExecutor()),
  cursor: () => import("./cursor.ts").then((m) => new m.CursorExecutor()),
  trae: () => import("./trae.ts").then((m) => new m.TraeExecutor()),
  glm: () => import("./glm.ts").then((m) => new m.GlmExecutor("glm")),
  "glm-cn": () => import("./glm.ts").then((m) => new m.GlmExecutor("glm-cn")),
  glmt: () => import("./glm.ts").then((m) => new m.GlmExecutor("glmt")),
  cu: () => import("./cursor.ts").then((m) => new m.CursorExecutor()), // Alias for cursor
  "cursor-api": () => import("./cursor.ts").then((m) => new m.CursorExecutor("cursor-api")),
  cua: () => import("./cursor.ts").then((m) => new m.CursorExecutor("cursor-api")),
  "azure-openai": () => import("./azure-openai.ts").then((m) => new m.AzureOpenAIExecutor()),
  "azure-ai": () => import("./azure-ai.ts").then((m) => new m.AzureAiExecutor()),
  "command-code": () => import("./commandCode.ts").then((m) => new m.CommandCodeExecutor()),
  cmd: () => import("./commandCode.ts").then((m) => new m.CommandCodeExecutor()), // Alias
  gitlab: () => import("./gitlab.ts").then((m) => new m.GitlabExecutor()),
  "gitlab-duo": () => import("./gitlab.ts").then((m) => new m.GitlabExecutor("gitlab-duo")),
  nlpcloud: () => import("./nlpcloud.ts").then((m) => new m.NlpCloudExecutor()),
  oneminai: () => import("./oneminai.ts").then((m) => new m.OneMinAiExecutor()),
  "1min": () => import("./oneminai.ts").then((m) => new m.OneMinAiExecutor()), // Alias
  pollinations: () => import("./pollinations.ts").then((m) => new m.PollinationsExecutor()),
  pol: () => import("./pollinations.ts").then((m) => new m.PollinationsExecutor()), // Alias
  freebuff: () => import("./freebuff.ts").then((m) => new m.FreebuffExecutor()),
  fb: () => import("./freebuff.ts").then((m) => new m.FreebuffExecutor()), // Alias
  "opencode-zen": () => import("./opencode.ts").then((m) => new m.OpencodeExecutor("opencode-zen")),
  "opencode-go": () => import("./opencode.ts").then((m) => new m.OpencodeExecutor("opencode-go")),
  opencode: () => import("./opencode.ts").then((m) => new m.OpencodeExecutor("opencode-zen")), // Alias for opencode-zen
  vertex: () => import("./vertex.ts").then((m) => new m.VertexExecutor()),
  "vertex-partner": () => import("./vertex.ts").then((m) => new m.VertexExecutor()),
  cliproxyapi: () => import("./cliproxyapi.ts").then((m) => new m.CliproxyapiExecutor()),
  cpa: () => import("./cliproxyapi.ts").then((m) => new m.CliproxyapiExecutor()), // Alias
  dario: () => import("./dario.ts").then((m) => new m.DarioExecutor()),
  dr: () => import("./dario.ts").then((m) => new m.DarioExecutor()), // Alias
  "9router": () => import("./ninerouter.ts").then((m) => new m.NineRouterExecutor()),
  nr: () => import("./ninerouter.ts").then((m) => new m.NineRouterExecutor()), // Alias
  "grok-web": () => import("./grok-web.ts").then((m) => new m.GrokWebExecutor()),
  "gemini-business": () =>
    import("./gemini-business.ts").then((m) => new m.GeminiBusinessExecutor()),
  gembiz: () => import("./gemini-business.ts").then((m) => new m.GeminiBusinessExecutor()), // Alias
  "zed-hosted": () => import("./zed-hosted.ts").then((m) => new m.ZedHostedExecutor()),
  zcode: () => import("./zcode.ts").then((m) => new m.ZcodeExecutor()),
  zc: () => import("./zcode.ts").then((m) => new m.ZcodeExecutor()), // Alias
  "veoaifree-web": () => import("./veoaifree-web.ts").then((m) => new m.VeoAIFreeWebExecutor()),
  "veo-free": () => import("./veoaifree-web.ts").then((m) => new m.VeoAIFreeWebExecutor()), // Alias
  huggingchat: () => import("./huggingchat.ts").then((m) => new m.HuggingChatExecutor()),
  hc: () => import("./huggingchat.ts").then((m) => new m.HuggingChatExecutor()), // Alias
  "yuanbao-web": () => import("./yuanbao-web.ts").then((m) => new m.YuanbaoWebExecutor()),
  "tencent-aistudio-web": () =>
    import("./tencent-aistudio-web.ts").then((m) => new m.TencentAIStudioWebExecutor()),
  tasw: () => import("./tencent-aistudio-web.ts").then((m) => new m.TencentAIStudioWebExecutor()), // Alias
  ybw: () => import("./yuanbao-web.ts").then((m) => new m.YuanbaoWebExecutor()), // Alias
  "poe-web": () => import("./poe-web.ts").then((m) => new m.PoeWebExecutor()),
  // #8969: do NOT alias canonical `poe` (API-key / api.poe.com) to PoeWebExecutor.
  // Registry declares executor:"default"; the hard-coded map previously won and
  // routed API-key traffic to GraphQL /api/gql_POST → HTTP 405.
  "venice-web": () => import("./venice-web.ts").then((m) => new m.VeniceWebExecutor()),
  ven: () => import("./venice-web.ts").then((m) => new m.VeniceWebExecutor()), // Alias
  promptql: () => import("./promptql.ts").then((m) => new m.PromptQlExecutor()),
  pql: () => import("./promptql.ts").then((m) => new m.PromptQlExecutor()), // Alias
  "v0-vercel-web": () => import("./v0-vercel-web.ts").then((m) => new m.V0VercelWebExecutor()),
  v0: () => import("./v0-vercel-web.ts").then((m) => new m.V0VercelWebExecutor()), // Alias
  "kimi-coding-apikey": () =>
    import("./kimi.ts").then((m) => new m.KimiExecutor("kimi-coding-apikey")), // Legacy alias
  "kimi-coding": () => import("./kimi.ts").then((m) => new m.KimiExecutor()), // Alias
  moonshot: () => import("./moonshot.ts").then((m) => new m.MoonshotExecutor()),
  kimi: () => import("./moonshot.ts").then((m) => new m.MoonshotExecutor("kimi")), // Hidden legacy Moonshot provider id
  chipotle: () => import("./chipotle.ts").then((m) => new m.ChipotleExecutor()),
  pepper: () => import("./chipotle.ts").then((m) => new m.ChipotleExecutor()), // Alias
  lmarena: () => import("./lmarena.ts").then((m) => new m.LMArenaExecutor()),
  lma: () => import("./lmarena.ts").then((m) => new m.LMArenaExecutor()), // Alias
  "grok-cli": () => import("./grok-cli.ts").then((m) => new m.GrokCliExecutor()),
  gc: () => import("./grok-cli.ts").then((m) => new m.GrokCliExecutor()), // Alias
  "codebuddy-cn": () => import("./codebuddy-cn.ts").then((m) => new m.CodeBuddyCnExecutor()),
  cbcn: () => import("./codebuddy-cn.ts").then((m) => new m.CodeBuddyCnExecutor()), // Alias for codebuddy-cn
  "zenmux-free": () => import("./zenmux-free.ts").then((m) => new m.ZenmuxFreeExecutor()),
  "cloudflare-playground": () =>
    import("./cloudflare-playground.ts").then((m) => new m.CloudflarePlaygroundExecutor()),
  cfp: () => import("./cloudflare-playground.ts").then((m) => new m.CloudflarePlaygroundExecutor()), // Alias for cloudflare-playground
  hyperagent: () => import("./hyperagent.ts").then((m) => new m.HyperAgentExecutor()),
  ha: () => import("./hyperagent.ts").then((m) => new m.HyperAgentExecutor()), // Alias
  zmf: () => import("./zenmux-free.ts").then((m) => new m.ZenmuxFreeExecutor()), // Alias for zenmux-free
  xai: () => import("./xai.ts").then((m) => new m.XaiExecutor()),
  "xai-oauth": () => import("./xai.ts").then((m) => new m.XaiExecutor("xai-oauth")),
  xao: () => import("./xai.ts").then((m) => new m.XaiExecutor("xai-oauth")),
  "clova-studio": () => import("./clova-studio.ts").then((m) => new m.ClovaStudioExecutor()),
  "conol-web": () => import("./conol-web.ts").then((m) => new m.ConolWebExecutor()),
  cnl: () => import("./conol-web.ts").then((m) => new m.ConolWebExecutor()), // Alias
};

// Bootstrap: declare every built-in alias in the ExecutorRegistry. Duplicate
// aliases fail at module load, exactly as loudly as a duplicate object key
// would have failed at lint time. Instances materialize on first use (#11220).
for (const [alias, load] of Object.entries(lazyExecutors)) {
  registerLazyExecutor(alias, load);
}

// #6699 — providers that exist ONLY as Cloud Agent task-API entries
// (CLOUD_AGENT_PROVIDERS / staticModels "Available Models" catalog) and have no
// chat-completions REGISTRY entry anywhere in open-sse/. Without this guard,
// getExecutor() silently falls through to DefaultExecutor's
// `PROVIDERS[provider] || PROVIDERS.openai` fallback, sending the user's real
// provider key to OpenAI's endpoint (mislabeled as coming from the provider the
// user actually selected). Starting with just "jules" (the reported case);
// "devin" and "codex-cloud" share the same structural gap and are left for a
// follow-up once their own chat-routing behavior is confirmed.
const CHAT_UNSUPPORTED_CLOUD_AGENT_PROVIDERS = new Set(["jules"]);

// #10274 — providers that exist ONLY as /v1/search endpoint entries
// (SEARCH_PROVIDERS in open-sse/config/searchRegistry.ts) and have no chat-completions
// REGISTRY entry anywhere in open-sse/. Without this guard, getExecutor() silently falls
// through to DefaultExecutor's `PROVIDERS[provider] || PROVIDERS.openai` fallback, sending
// the user's real search API key (e.g. a Tavily `tvly-...` key) to OpenAI's endpoint and
// surfacing OpenAI's own "Incorrect API key provided" error for a provider the user believes
// is the search provider. The set is DERIVED from SEARCH_PROVIDERS so adding a new search
// provider without updating this guard fails the regression test automatically. Search
// providers must be executed through /v1/search, never the chat-completions path.
const CHAT_UNSUPPORTED_SEARCH_PROVIDERS = new Set(Object.keys(SEARCH_PROVIDERS));

export async function getExecutor(provider: string): Promise<BaseExecutor> {
  assertMicrosoftDesignerWebProviderAvailable(provider);
  assertRuntimeProviderAvailable(provider);
  assertCommonChatGptWebProviderAvailable(provider);
  const loaded = await loadRegisteredExecutor(provider);
  if (loaded) return loaded;
  if (CHAT_UNSUPPORTED_CLOUD_AGENT_PROVIDERS.has(provider)) {
    const err = new Error(
      `Provider "${provider}" is a cloud-agent provider and does not support direct chat completions; use the Cloud Agents task API instead.`
    );
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  if (CHAT_UNSUPPORTED_SEARCH_PROVIDERS.has(provider)) {
    const err = new Error(
      `Provider "${provider}" is a search provider and does not support chat completions; use the /v1/search endpoint instead.`
    );
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  return getDefaultExecutor(provider);
}

export function hasSpecializedExecutor(provider: string): boolean {
  return hasRegisteredExecutor(provider);
}

export { registerExecutor, registerLazyExecutor, listExecutorAliases } from "./registry.ts";
// Value re-export: base.ts is already eager (DefaultExecutor extends it), and
// scripts/check/check-known-symbols.ts reads this export from the module.
export { BaseExecutor } from "./base.ts";
export { DefaultExecutor } from "./default.ts";
