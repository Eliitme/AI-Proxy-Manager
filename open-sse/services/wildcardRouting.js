/**
 * Wildcard Model Routing — resolves glob patterns to concrete provider/model targets.
 *
 * Routes are stored in the `wildcard_routes` Postgres table (ordered by priority ASC).
 * Patterns use micromatch glob syntax: "anthropic/*", "openai/gpt-4*", etc.
 *
 * Pattern cache: compiled patterns are cached per userId and invalidated on table write.
 */

import micromatch from "micromatch";

/** @type {Map<string, { routes: Array, ts: number }>} */
const _cache = new Map();
const CACHE_TTL_MS = 5000;

/** Injected DB lookup — set via init() to avoid circular imports */
let _getRoutes = null;

/**
 * Inject DB functions.
 * @param {{ getRoutes: Function }} fns
 */
export function initWildcardRouting({ getRoutes }) {
  _getRoutes = getRoutes;
}

/**
 * Invalidate cached routes for a user (call after create/delete).
 * @param {string|null} userId
 */
export function invalidateWildcardCache(userId) {
  if (userId) {
    _cache.delete(userId);
  } else {
    _cache.clear();
  }
}

/**
 * Resolve a model string against wildcard routes.
 * Returns the target string if matched, or null if no route matches.
 *
 * @param {string} modelStr  — incoming model field from request body
 * @param {string|null} userId
 * @returns {Promise<string|null>}
 */
export async function resolveWildcard(modelStr, userId = null) {
  if (!_getRoutes) return null;

  const routes = await _loadRoutes(userId);
  if (!routes.length) return null;

  for (const route of routes) {
    if (micromatch.isMatch(modelStr, route.pattern)) {
      return route.target;
    }
  }
  return null;
}

async function _loadRoutes(userId) {
  const key = userId || "__global__";
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.routes;
  }
  const routes = await _getRoutes(userId);
  _cache.set(key, { routes, ts: Date.now() });
  return routes;
}
