/**
 * Quota Preflight — soft exclusion of provider connections that are quota-exhausted.
 *
 * Reads the in-memory quota snapshot cache (populated by the /api/quota polling endpoint).
 * Does NOT block requests — returns an exclusion Set that getProviderCredentials uses
 * as a soft hint (falls back to full pool if all connections are excluded).
 */

/** Injected quota snapshot getter — set via init() */
let _getQuotaSnapshot = null;

/**
 * Inject the quota snapshot accessor.
 * @param {{ getSnapshot: Function }} fns
 *   getSnapshot(provider, connectionId) => { percentUsed?: number } | null
 */
export function initQuotaPreflight({ getSnapshot }) {
  _getQuotaSnapshot = getSnapshot;
}

/**
 * Build a Set of connectionIds whose quota is at 100% used (0% remaining).
 *
 * @param {string} provider
 * @param {string[]} connectionIds
 * @returns {Set<string>}
 */
export function getExcludedConnections(provider, connectionIds) {
  if (!_getQuotaSnapshot) return new Set();

  const excluded = new Set();
  for (const id of connectionIds) {
    try {
      const snapshot = _getQuotaSnapshot(provider, id);
      if (snapshot && snapshot.percentUsed >= 100) {
        excluded.add(id);
      }
    } catch {
      // Non-fatal: skip this connection check
    }
  }
  return excluded;
}
