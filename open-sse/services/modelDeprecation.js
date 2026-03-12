/**
 * Model Deprecation — merges built-in static map with per-user DB overrides.
 *
 * The static DEPRECATED_MODELS map (model.js) defines provider-level renames.
 * User overrides in `model_deprecation_overrides` table take precedence.
 *
 * Per-user override list is cached with a 5s TTL.
 */

import { DEPRECATED_MODELS } from "./model.js";

/** @type {Map<string, { overrides: Map<string,string>, ts: number }>} */
const _cache = new Map();
const CACHE_TTL_MS = 5000;

/** Injected DB function */
let _getOverrides = null;

/**
 * Inject DB function.
 * @param {{ getOverrides: Function }} fns
 *   getOverrides(userId) => Promise<Array<{ fromModel: string, toModel: string }>>
 */
export function initModelDeprecation({ getOverrides }) {
  _getOverrides = getOverrides;
}

/**
 * Invalidate cached overrides for a user (call after create/delete).
 * @param {string|null} userId
 */
export function invalidateModelDeprecationCache(userId) {
  if (userId) {
    _cache.delete(userId);
  } else {
    _cache.clear();
  }
}

/**
 * Rewrite a model string if it is deprecated.
 * User overrides take precedence over the static built-in map.
 *
 * Only rewrites the model portion of a "provider/model" string;
 * the provider prefix is preserved.
 *
 * @param {string} modelStr  — e.g. "gpt-4" or "openai/gpt-4"
 * @param {string|null} userId
 * @returns {Promise<string>} — possibly rewritten model string
 */
export async function rewriteModel(modelStr, userId = null) {
  if (!modelStr) return modelStr;

  // Split provider prefix if present
  let prefix = "";
  let bareModel = modelStr;
  if (modelStr.includes("/")) {
    const slash = modelStr.indexOf("/");
    prefix = modelStr.slice(0, slash + 1);
    bareModel = modelStr.slice(slash + 1);
  }

  // Load user overrides (merge with static map; user overrides win)
  const userOverrides = await _loadOverrides(userId);

  // Check user override first
  if (userOverrides.has(bareModel)) {
    const rewritten = userOverrides.get(bareModel);
    return prefix + rewritten;
  }

  // Check static built-in map
  if (DEPRECATED_MODELS.has(bareModel)) {
    const rewritten = DEPRECATED_MODELS.get(bareModel);
    return prefix + rewritten;
  }

  return modelStr;
}

/**
 * Load and cache user overrides as a Map.
 * @param {string|null} userId
 * @returns {Promise<Map<string,string>>}
 */
async function _loadOverrides(userId) {
  if (!_getOverrides) return new Map();

  const key = userId || "__global__";
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.overrides;
  }

  const rows = await _getOverrides(userId);
  const overrides = new Map(rows.map(r => [r.fromModel, r.toModel]));
  _cache.set(key, { overrides, ts: Date.now() });
  return overrides;
}
