/**
 * Built-in deprecated model renames.
 * Maps old model name → recommended replacement.
 * These are the defaults; user overrides are stored in model_deprecation_overrides table.
 */
export const DEPRECATED_MODELS = new Map([
  // OpenAI
  ["gpt-4", "gpt-4o"],
  ["gpt-4-0314", "gpt-4o"],
  ["gpt-4-0613", "gpt-4o"],
  ["gpt-4-32k", "gpt-4o"],
  ["gpt-4-32k-0314", "gpt-4o"],
  ["gpt-4-32k-0613", "gpt-4o"],
  ["gpt-3.5-turbo-0301", "gpt-4o-mini"],
  ["gpt-3.5-turbo-0613", "gpt-4o-mini"],
  ["gpt-3.5-turbo-16k", "gpt-4o-mini"],
  ["gpt-3.5-turbo-16k-0613", "gpt-4o-mini"],
  // Anthropic
  ["claude-2", "claude-3-5-haiku-20241022"],
  ["claude-2.0", "claude-3-5-haiku-20241022"],
  ["claude-2.1", "claude-3-5-haiku-20241022"],
  ["claude-instant-1", "claude-3-5-haiku-20241022"],
  ["claude-instant-1.2", "claude-3-5-haiku-20241022"],
  ["claude-3-opus-20240229", "claude-opus-4-5"],
  // Google
  ["gemini-1.0-pro", "gemini-2.0-flash"],
  ["gemini-1.0-pro-001", "gemini-2.0-flash"],
  ["gemini-pro", "gemini-2.0-flash"],
]);

// Provider alias to ID mapping
const ALIAS_TO_PROVIDER_ID = {
  cc: "claude",
  cx: "codex",
  gc: "gemini-cli",
  qw: "qwen",
  if: "iflow",
  ag: "antigravity",
  gh: "github",
  kr: "kiro",
  cu: "cursor",
  kc: "kilocode",
  kmc: "kimi-coding",
  cl: "cline",
  // API Key providers
  openai: "openai",
  anthropic: "anthropic",
  gemini: "gemini",
  openrouter: "openrouter",
  glm: "glm",
  kimi: "kimi",
  minimax: "minimax",
  "minimax-cn": "minimax-cn",
  ds: "deepseek",
  deepseek: "deepseek",
  groq: "groq",
  xai: "xai",
  mistral: "mistral",
  pplx: "perplexity",
  perplexity: "perplexity",
  together: "together",
  fireworks: "fireworks",
  cerebras: "cerebras",
  cohere: "cohere",
  nvidia: "nvidia",
  nebius: "nebius",
  siliconflow: "siliconflow",
  hyp: "hyperbolic",
  hyperbolic: "hyperbolic",
  dg: "deepgram",
  deepgram: "deepgram",
  aai: "assemblyai",
  assemblyai: "assemblyai",
  nb: "nanobanana",
  nanobanana: "nanobanana",
  ch: "chutes",
  chutes: "chutes",
  cursor: "cursor",
};

/**
 * Resolve provider alias to provider ID
 */
export function resolveProviderAlias(aliasOrId) {
  return ALIAS_TO_PROVIDER_ID[aliasOrId] || aliasOrId;
}

/**
 * Parse model string: "alias/model" or "provider/model" or just alias
 */
export function parseModel(modelStr) {
  if (!modelStr) {
    return { provider: null, model: null, isAlias: false, providerAlias: null };
  }

  // Check if standard format: provider/model or alias/model
  if (modelStr.includes("/")) {
    const firstSlash = modelStr.indexOf("/");
    const providerOrAlias = modelStr.slice(0, firstSlash);
    const model = modelStr.slice(firstSlash + 1);
    const provider = resolveProviderAlias(providerOrAlias);
    return { provider, model, isAlias: false, providerAlias: providerOrAlias };
  }

  // Alias format (model alias, not provider alias)
  return {
    provider: null,
    model: modelStr,
    isAlias: true,
    providerAlias: null,
  };
}

/**
 * Resolve model alias from aliases object
 * Format: { "alias": "provider/model" }
 */
export function resolveModelAliasFromMap(alias, aliases) {
  if (!aliases) return null;

  // Check if alias exists
  const resolved = aliases[alias];
  if (!resolved) return null;

  // Resolved value is "provider/model" format
  if (typeof resolved === "string" && resolved.includes("/")) {
    const firstSlash = resolved.indexOf("/");
    const providerOrAlias = resolved.slice(0, firstSlash);
    return {
      provider: resolveProviderAlias(providerOrAlias),
      model: resolved.slice(firstSlash + 1),
    };
  }

  // Or object { provider, model }
  if (typeof resolved === "object" && resolved.provider && resolved.model) {
    return {
      provider: resolveProviderAlias(resolved.provider),
      model: resolved.model,
    };
  }

  return null;
}

/**
 * Get full model info (parse or resolve)
 * @param {string} modelStr - Model string
 * @param {object|function} aliasesOrGetter - Aliases object or async function to get aliases
 */
export async function getModelInfoCore(modelStr, aliasesOrGetter) {
  const parsed = parseModel(modelStr);

  if (!parsed.isAlias) {
    return {
      provider: parsed.provider,
      model: parsed.model,
    };
  }

  // Get aliases (from object or function)
  const aliases =
    typeof aliasesOrGetter === "function"
      ? await aliasesOrGetter()
      : aliasesOrGetter;

  // Resolve alias
  const resolved = resolveModelAliasFromMap(parsed.model, aliases);
  if (resolved) {
    return resolved;
  }

  // Fallback: infer provider from model name prefix
  return {
    provider: inferProviderFromModelName(parsed.model),
    model: parsed.model,
  };
}

/**
 * Infer provider from model name prefix
 * Used as fallback when no provider prefix or alias is given
 */
function inferProviderFromModelName(modelName) {
  if (!modelName) return "openai";
  const m = modelName.toLowerCase();
  if (m.startsWith("claude-")) return "anthropic";
  if (m.startsWith("gemini-")) return "gemini";
  if (m.startsWith("gpt-")) return "openai";
  if (m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4"))
    return "openai";
  if (m.startsWith("deepseek-")) return "openrouter";
  // Default fallback
  return "openai";
}
