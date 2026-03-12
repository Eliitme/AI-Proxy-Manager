import { getProviderConnections, validateApiKey, updateProviderConnection, getSettings } from "@/lib/localDb";
import { getPool } from "@/lib/db/postgres.js";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { formatRetryAfter, checkFallbackError, isModelLockActive, getEarliestModelLockUntil, getQuotaCooldown } from "open-sse/services/accountFallback.js";
import { resolveProviderId } from "@/shared/constants/providers.js";
import * as log from "../utils/logger.js";

// Per-provider mutex map — only round-robin strategy needs serialization.
// fill-first is deterministic and requires no mutex.
const _providerMutexMap = new Map();

function _acquireProviderMutex(providerId) {
  const current = _providerMutexMap.get(providerId) || Promise.resolve();
  let resolve;
  const next = new Promise(r => { resolve = r; });
  _providerMutexMap.set(providerId, next);
  return { current, resolve };
}

/**
 * Get provider credentials from localDb
 * Filters out unavailable accounts and returns the selected account based on strategy
 * @param {string} provider - Provider name
 * @param {string|null} excludeConnectionId - Connection ID to exclude (for retry with next account)
 * @param {string|null} model - Model name for per-model rate limit filtering
 * @param {string|null} userId - User ID to scope connections (resolved from API key)
 */
export async function getProviderCredentials(provider, excludeConnectionId = null, model = null, userId = null) {
  // Resolve alias to provider ID (e.g., "kc" -> "kilocode")
  const providerId = resolveProviderId(provider);

  const connections = await getProviderConnections({ provider: providerId, isActive: true }, null);
  log.debug("AUTH", `${provider} | total connections: ${connections.length}, excludeId: ${excludeConnectionId || "none"}, model: ${model || "any"}`);

  if (connections.length === 0) {
    log.warn("AUTH", `No credentials for ${provider}`);
    return null;
  }

  // Filter out model-locked and excluded connections
  const availableConnections = connections.filter(c => {
    if (excludeConnectionId && c.id === excludeConnectionId) return false;
    if (isModelLockActive(c, model)) return false;
    return true;
  });

  log.debug("AUTH", `${provider} | available: ${availableConnections.length}/${connections.length}`);
  connections.forEach(c => {
    const excluded = excludeConnectionId && c.id === excludeConnectionId;
    const locked = isModelLockActive(c, model);
    if (excluded || locked) {
      const lockUntil = getEarliestModelLockUntil(c);
      log.debug("AUTH", `  → ${c.id?.slice(0, 8)} | ${excluded ? "excluded" : ""} ${locked ? `modelLocked(${model}) until ${lockUntil}` : ""}`);
    }
  });

  if (availableConnections.length === 0) {
    // Find earliest lock expiry across all connections for retry timing
    const lockedConns = connections.filter(c => isModelLockActive(c, model));
    const expiries = lockedConns.map(c => getEarliestModelLockUntil(c)).filter(Boolean);
    const earliest = expiries.sort()[0] || null;
    if (earliest) {
      const earliestConn = lockedConns[0];
      log.warn("AUTH", `${provider} | all ${connections.length} accounts locked for ${model || "all"} (${formatRetryAfter(earliest)}) | lastError=${earliestConn?.lastError?.slice(0, 50)}`);
      return {
        allRateLimited: true,
        retryAfter: earliest,
        retryAfterHuman: formatRetryAfter(earliest),
        lastError: earliestConn?.lastError || null,
        lastErrorCode: earliestConn?.errorCode || null
      };
    }
    log.warn("AUTH", `${provider} | all ${connections.length} accounts unavailable`);
    return null;
  }

  const settings = await getSettings();
  const strategy = settings.fallbackStrategy || "fill-first";

  let connection;
  if (strategy === "round-robin") {
    // Round-robin needs per-provider serialization to maintain correct rotation.
    const { current: mutexReady, resolve } = _acquireProviderMutex(providerId);
    try {
      await mutexReady;

      // Re-fetch inside the mutex: the pre-mutex list may be stale if another
      // concurrent request updated lastUsedAt / consecutiveUseCount while we waited.
      const freshConnections = await getProviderConnections({ provider: providerId, isActive: true }, null);
      const freshAvailable = freshConnections.filter(c => {
        if (excludeConnectionId && c.id === excludeConnectionId) return false;
        if (isModelLockActive(c, model)) return false;
        return true;
      });

      if (freshAvailable.length === 0) {
        // All locked by the time we got the mutex — return the pre-mutex result
        // (caller will handle the allRateLimited / null path)
        resolve();
        return null;
      }

      const stickyLimit = settings.stickyRoundRobinLimit || 3;

      // Sort by lastUsed (most recent first) to find current candidate
      const byRecency = [...freshAvailable].sort((a, b) => {
        if (!a.lastUsedAt && !b.lastUsedAt) return (a.priority || 999) - (b.priority || 999);
        if (!a.lastUsedAt) return 1;
        if (!b.lastUsedAt) return -1;
        return new Date(b.lastUsedAt) - new Date(a.lastUsedAt);
      });

      const mostRecent = byRecency[0];
      const currentCount = mostRecent?.consecutiveUseCount || 0;

      if (mostRecent && mostRecent.lastUsedAt && currentCount < stickyLimit) {
        // Stay with current account
        connection = mostRecent;
        await updateProviderConnection(connection.id, {
          lastUsedAt: new Date().toISOString(),
          consecutiveUseCount: (connection.consecutiveUseCount || 0) + 1
        });
      } else {
        // Pick the least recently used
        const sortedByOldest = [...freshAvailable].sort((a, b) => {
          if (!a.lastUsedAt && !b.lastUsedAt) return (a.priority || 999) - (b.priority || 999);
          if (!a.lastUsedAt) return -1;
          if (!b.lastUsedAt) return 1;
          return new Date(a.lastUsedAt) - new Date(b.lastUsedAt);
        });

        connection = sortedByOldest[0];

        await updateProviderConnection(connection.id, {
          lastUsedAt: new Date().toISOString(),
          consecutiveUseCount: 1
        });
      }
    } finally {
      resolve();
    }
  } else {
    // fill-first: deterministic — no mutex needed
    connection = availableConnections[0];
  }

  const resolvedProxy = await resolveConnectionProxyConfig(connection.providerSpecificData || {});

  return {
    apiKey: connection.apiKey,
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken,
    projectId: connection.projectId,
    connectionName: connection.displayName || connection.name || connection.email || connection.id,
    copilotToken: connection.providerSpecificData?.copilotToken,
    providerSpecificData: {
      ...(connection.providerSpecificData || {}),
      connectionProxyEnabled: resolvedProxy.connectionProxyEnabled,
      connectionProxyUrl: resolvedProxy.connectionProxyUrl,
      connectionNoProxy: resolvedProxy.connectionNoProxy,
      connectionProxyPoolId: resolvedProxy.proxyPoolId || null,
    },
    connectionId: connection.id,
    // Include current status for optimization check
    testStatus: connection.testStatus,
    lastError: connection.lastError,
    // Pass full connection for clearAccountError to read modelLock_* keys
    _connection: connection
  };
}

/**
 * Mark account+model as unavailable — locks modelLock_${model} in DB.
 * All errors (429, 401, 5xx, etc.) lock per model, not per account.
 * @param {string} connectionId
 * @param {number} status - HTTP status code from upstream
 * @param {string} errorText
 * @param {string|null} provider
 * @param {string|null} model - The specific model that triggered the error
 * @returns {{ shouldFallback: boolean, cooldownMs: number }}
 */
export async function markAccountUnavailable(connectionId, status, errorText, provider = null, model = null) {
  // Determine fallback behaviour without reading the DB.
  // backoffLevel=0 probe: for non-backoff errors cooldown is fixed regardless of level.
  const probeResult = checkFallbackError(status, errorText, 0);
  if (!probeResult.shouldFallback) return { shouldFallback: false, cooldownMs: 0 };

  const reason = typeof errorText === "string" ? errorText.slice(0, 100) : "Provider error";
  const isBackoffError = probeResult.newBackoffLevel != null;
  const modelLockKey = model ? `modelLock_${model}` : "modelLock___all";

  const pool = await getPool();

  // For non-backoff errors the cooldown is fixed — compute expiry before the query.
  // For backoff errors we need the DB-incremented level, so we pass the base cooldown
  // values into SQL and let Postgres compute the expiry timestamp directly.
  // This collapses both writes into a single round-trip with no race window.
  const fixedCooldownMs = probeResult.cooldownMs; // used when !isBackoffError
  const baseCooldownMs  = 1000;                   // BACKOFF_CONFIG.base
  const maxCooldownMs   = 120000;                 // BACKOFF_CONFIG.max

  const res = await pool.query(
    `UPDATE provider_connections
     SET
       backoff_level    = CASE WHEN $1 THEN LEAST(COALESCE(backoff_level, 0) + 1, 15)
                               ELSE COALESCE(backoff_level, 0) END,
       test_status      = 'unavailable',
       last_error       = $2,
       error_code       = $3,
       last_error_at    = NOW(),
       updated_at       = NOW(),
       provider_specific_data = COALESCE(provider_specific_data, '{}'::jsonb) || jsonb_build_object(
         $4::text,
         CASE WHEN $1 THEN
           -- backoff error: expiry = NOW() + LEAST(base * 2^(new_level-1), max)
           to_jsonb((NOW() + (
             LEAST($5::numeric * POWER(2, LEAST(COALESCE(backoff_level, 0), 14)), $6::numeric)
           ) * interval '1 millisecond')::text)
         ELSE
           -- fixed cooldown error
           to_jsonb((NOW() + ($7::numeric * interval '1 millisecond'))::text)
         END
       )
     WHERE id = $8
     RETURNING backoff_level`,
    [isBackoffError, reason, status, modelLockKey,
     baseCooldownMs, maxCooldownMs, fixedCooldownMs,
     connectionId]
  );

  if (res.rowCount === 0) {
    log.warn("AUTH", `markAccountUnavailable: connection ${connectionId.slice(0, 8)} not found`);
    return { shouldFallback: true, cooldownMs: probeResult.cooldownMs };
  }

  const newBackoffLevel = res.rows[0].backoff_level;

  // Recalculate cooldownMs from the actual persisted backoff level for the return value.
  const cooldownMs = isBackoffError
    ? getQuotaCooldown(newBackoffLevel - 1)
    : probeResult.cooldownMs;

  log.warn("AUTH", `${connectionId.slice(0, 8)} locked ${modelLockKey} for ${Math.round(cooldownMs / 1000)}s [${status}] backoffLevel=${newBackoffLevel}`);

  if (provider && status && reason) {
    console.error(`❌ ${provider} [${status}]: ${reason}`);
  }

  return { shouldFallback: true, cooldownMs };
}

/**
 * Clear account error status on successful request.
 * - Clears modelLock_${model} (the model that just succeeded)
 * - Lazy-cleans any other expired modelLock_* keys
 * - Resets error state only if no active locks remain
 * @param {string} connectionId
 * @param {object} currentConnection - credentials object (has _connection) or raw connection
 * @param {string|null} model - model that succeeded
 */
export async function clearAccountError(connectionId, currentConnection, model = null) {
  const conn = currentConnection._connection || currentConnection;
  const now = Date.now();
  const allLockKeys = Object.keys(conn).filter(k => k.startsWith("modelLock_"));

  if (!conn.testStatus && !conn.lastError && allLockKeys.length === 0) return;

  // Keys to clear: current model's lock + all expired locks
  const keysToClear = allLockKeys.filter(k => {
    if (model && k === `modelLock_${model}`) return true; // succeeded model
    if (model && k === "modelLock___all") return true;    // account-level lock
    const expiry = conn[k];
    return expiry && new Date(expiry).getTime() <= now;   // expired
  });

  if (keysToClear.length === 0 && conn.testStatus !== "unavailable" && !conn.lastError) return;

  // Check if any active locks remain after clearing
  const remainingActiveLocks = allLockKeys.filter(k => {
    if (keysToClear.includes(k)) return false;
    const expiry = conn[k];
    return expiry && new Date(expiry).getTime() > now;
  });

  const clearObj = Object.fromEntries(keysToClear.map(k => [k, null]));

  // Only reset error state if no active locks remain
  if (remainingActiveLocks.length === 0) {
    Object.assign(clearObj, { testStatus: "active", lastError: null, lastErrorAt: null, backoffLevel: 0 });
  }

  await updateProviderConnection(connectionId, clearObj);
  log.info("AUTH", `Account ${connectionId.slice(0, 8)} cleared lock for model=${model || "__all"}`);
}

/**
 * Extract API key from request headers
 */
export function extractApiKey(request) {
  // Check Authorization header first
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Check Anthropic x-api-key header
  const xApiKey = request.headers.get("x-api-key");
  if (xApiKey) {
    return xApiKey;
  }

  return null;
}

/**
 * Validate API key and return key object with userId
 * @param {string} apiKey - The API key to validate
 * @returns {Promise<object|null>} Key object with userId, or null if invalid
 */
export async function isValidApiKey(apiKey) {
  if (!apiKey) return null;
  const keyObj = await validateApiKey(apiKey);
  return keyObj || null;
}
