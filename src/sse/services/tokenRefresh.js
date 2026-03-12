// Re-export from open-sse with local logger
import * as log from "../utils/logger.js";
import { updateProviderConnection } from "../../lib/localDb.js";
import {
  getProjectIdForConnection,
  invalidateProjectId,
  removeConnection,
} from "open-sse/services/projectId.js";
import {
  TOKEN_EXPIRY_BUFFER_MS as BUFFER_MS,
  refreshAccessToken as _refreshAccessToken,
  refreshClaudeOAuthToken as _refreshClaudeOAuthToken,
  refreshGoogleToken as _refreshGoogleToken,
  refreshQwenToken as _refreshQwenToken,
  refreshCodexToken as _refreshCodexToken,
  refreshIflowToken as _refreshIflowToken,
  refreshGitHubToken as _refreshGitHubToken,
  refreshCopilotToken as _refreshCopilotToken,
  getAccessToken as _getAccessToken,
  refreshTokenByProvider as _refreshTokenByProvider,
  formatProviderCredentials as _formatProviderCredentials,
  getAllAccessTokens as _getAllAccessTokens
} from "open-sse/services/tokenRefresh.js";

export const TOKEN_EXPIRY_BUFFER_MS = BUFFER_MS;

// ─── Re-exports wrapped with local logger ─────────────────────────────────────

export const refreshAccessToken = (provider, refreshToken, credentials) =>
  _refreshAccessToken(provider, refreshToken, credentials, log);

export const refreshClaudeOAuthToken = (refreshToken) =>
  _refreshClaudeOAuthToken(refreshToken, log);

export const refreshGoogleToken = (refreshToken, clientId, clientSecret) =>
  _refreshGoogleToken(refreshToken, clientId, clientSecret, log);

export const refreshQwenToken = (refreshToken) =>
  _refreshQwenToken(refreshToken, log);

export const refreshCodexToken = (refreshToken) =>
  _refreshCodexToken(refreshToken, log);

export const refreshIflowToken = (refreshToken) =>
  _refreshIflowToken(refreshToken, log);

export const refreshGitHubToken = (refreshToken) =>
  _refreshGitHubToken(refreshToken, log);

export const refreshCopilotToken = (githubAccessToken) =>
  _refreshCopilotToken(githubAccessToken, log);

export const getAccessToken = (provider, credentials) =>
  _getAccessToken(provider, credentials, log);

export const refreshTokenByProvider = (provider, credentials) =>
  _refreshTokenByProvider(provider, credentials, log);

export const formatProviderCredentials = (provider, credentials) =>
  _formatProviderCredentials(provider, credentials, log);

export const getAllAccessTokens = (userInfo) =>
  _getAllAccessTokens(userInfo, log);

// ─── Lifecycle hook ───────────────────────────────────────────────────────────

/**
 * Call this when a connection is fully closed / removed.
 * Aborts any in-flight projectId fetch and evicts its cache entry,
 * preventing the module-level Maps from accumulating stale entries.
 *
 * @param {string} connectionId
 */
export function releaseConnection(connectionId) {
  if (!connectionId) return;
  removeConnection(connectionId);
  log.debug("TOKEN_REFRESH", "Released connection resources", { connectionId });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Compute an ISO expiry timestamp from a relative expiresIn (seconds).
 * @param {number} expiresIn
 * @returns {string}
 */
function toExpiresAt(expiresIn) {
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

/**
 * Providers that carry a real Google project ID.
 * @param {string} provider
 * @returns {boolean}
 */
function needsProjectId(provider) {
  return provider === "antigravity" || provider === "gemini-cli";
}

/**
 * Non-blocking: fetch the project ID for a connection after a token refresh and
 * persist it to localDb.  Invalidates the stale cached value first so the fetch
 * always retrieves a fresh one.
 *
 * @param {string} provider
 * @param {string} connectionId
 * @param {string} accessToken
 */
function _refreshProjectId(provider, connectionId, accessToken) {
  if (!needsProjectId(provider) || !connectionId || !accessToken) return;

  // Evict the stale cached entry so getProjectIdForConnection does a real fetch
  invalidateProjectId(connectionId);

  getProjectIdForConnection(connectionId, accessToken)
    .then((projectId) => {
      if (!projectId) return;
      updateProviderCredentials(connectionId, { projectId }).catch((err) => {
        log.debug("TOKEN_REFRESH", "Failed to persist refreshed projectId", {
          connectionId,
          error: err?.message ?? err,
        });
      });
    })
    .catch((err) => {
      log.debug("TOKEN_REFRESH", "Failed to fetch projectId after token refresh", {
        connectionId,
        error: err?.message ?? err,
      });
    });
}

// ─── Local-specific: persist credentials to localDb ──────────────────────────

/**
 * Persist updated credentials for a connection to localDb.
 * Only fields that are present in `newCredentials` are written.
 *
 * @param {string} connectionId
 * @param {object} newCredentials
 * @returns {Promise<boolean>}
 */
export async function updateProviderCredentials(connectionId, newCredentials) {
  try {
    const updates = {};

    if (newCredentials.accessToken)         updates.accessToken  = newCredentials.accessToken;
    if (newCredentials.refreshToken)        updates.refreshToken = newCredentials.refreshToken;
    if (newCredentials.expiresIn) {
      updates.expiresAt = toExpiresAt(newCredentials.expiresIn);
      updates.expiresIn = newCredentials.expiresIn;
    }
    if (newCredentials.providerSpecificData) {
      updates.providerSpecificData = {
        ...(newCredentials.existingProviderSpecificData || {}),
        ...newCredentials.providerSpecificData,
      };
    }
    if (newCredentials.projectId)            updates.projectId = newCredentials.projectId;

    const result = await updateProviderConnection(connectionId, updates);
    log.info("TOKEN_REFRESH", "Credentials updated in localDb", {
      connectionId,
      success: !!result
    });
    return !!result;
  } catch (error) {
    log.error("TOKEN_REFRESH", "Error updating credentials in localDb", {
      connectionId,
      error: error.message,
    });
    return false;
  }
}

// ─── Token refresh deduplication ─────────────────────────────────────────────
// Prevents thundering herd: if N concurrent requests share the same connection
// and the token is near-expiry, only the first refresh call goes to the upstream;
// all others await the same Promise and receive the refreshed credentials.
const _refreshInFlight = new Map();

// ─── Local-specific: proactive token refresh ─────────────────────────────────

/**
 * Check whether the provider token (and, for GitHub, the Copilot token) is
 * about to expire and refresh it proactively.
 * Concurrent calls for the same connectionId share a single upstream refresh.
 *
 * @param {string} provider
 * @param {object} credentials
 * @returns {Promise<object>} updated credentials object
 */
export async function checkAndRefreshToken(provider, credentials) {
  let creds = { ...credentials };

  const connectionId = creds.connectionId;

  // ── 1. Regular access-token expiry ────────────────────────────────────────
  if (creds.expiresAt) {
    const expiresAt = new Date(creds.expiresAt).getTime();
    const now       = Date.now();
    const remaining = expiresAt - now;

    if (remaining < TOKEN_EXPIRY_BUFFER_MS) {
      log.info("TOKEN_REFRESH", "Token expiring soon, refreshing proactively", {
        provider,
        expiresIn: Math.round(remaining / 1000),
      });

      // Deduplicate: reuse any in-flight refresh for this connection.
      // The promise resolves to { newCreds } so all waiters get the same tokens,
      // but only the creator persists to DB (avoiding N concurrent identical writes).
      const dedupeKey = `access:${connectionId}`;
      let refreshPromise = _refreshInFlight.get(dedupeKey);
      const isCreator = !refreshPromise;
      if (!refreshPromise) {
        refreshPromise = getAccessToken(provider, creds).finally(() => {
          _refreshInFlight.delete(dedupeKey);
        });
        _refreshInFlight.set(dedupeKey, refreshPromise);
      }

      const newCreds = await refreshPromise;
      if (newCreds?.accessToken) {
        const mergedCreds = {
          ...newCreds,
          existingProviderSpecificData: creds.providerSpecificData,
        };

        // Only the creator persists — waiters skip the DB write (same data already written)
        if (isCreator) await updateProviderCredentials(connectionId, mergedCreds);

        creds = {
          ...creds,
          accessToken:  newCreds.accessToken,
          refreshToken: newCreds.refreshToken ?? creds.refreshToken,
          providerSpecificData: newCreds.providerSpecificData
            ? { ...creds.providerSpecificData, ...newCreds.providerSpecificData }
            : creds.providerSpecificData,
          expiresAt:    newCreds.expiresIn
            ? toExpiresAt(newCreds.expiresIn)
            : creds.expiresAt,
        };

        // Non-blocking: refresh projectId with the new access token
        _refreshProjectId(provider, connectionId, creds.accessToken);
      }
    }
  }

  // ── 2. GitHub Copilot token expiry ────────────────────────────────────────
  if (provider === "github" && creds.providerSpecificData?.copilotTokenExpiresAt) {
    const copilotExpiresAt = creds.providerSpecificData.copilotTokenExpiresAt * 1000;
    const now              = Date.now();
    const remaining        = copilotExpiresAt - now;

    if (remaining < TOKEN_EXPIRY_BUFFER_MS) {
      log.info("TOKEN_REFRESH", "Copilot token expiring soon, refreshing proactively", {
        provider,
        expiresIn: Math.round(remaining / 1000),
      });

      // Deduplicate Copilot token refresh for the same connection.
      const dedupeKey = `copilot:${connectionId}`;
      let refreshPromise = _refreshInFlight.get(dedupeKey);
      if (!refreshPromise) {
        refreshPromise = refreshCopilotToken(creds.accessToken).finally(() => {
          _refreshInFlight.delete(dedupeKey);
        });
        _refreshInFlight.set(dedupeKey, refreshPromise);
      }

      const copilotToken = await refreshPromise;
      if (copilotToken) {
        const updatedSpecific = {
          ...creds.providerSpecificData,
          copilotToken:          copilotToken.token,
          copilotTokenExpiresAt: copilotToken.expiresAt,
        };

        await updateProviderCredentials(connectionId, {
          providerSpecificData: updatedSpecific,
        });

        creds.providerSpecificData = updatedSpecific;
      }
    }
  }

  return creds;
}

// ─── Local-specific: combined GitHub + Copilot refresh ───────────────────────

/**
 * Refresh the GitHub OAuth token and immediately exchange it for a fresh
 * Copilot token.
 *
 * @param {object} credentials  – must contain `refreshToken`
 * @returns {Promise<object|null>} merged credentials or the raw GitHub credentials on Copilot failure
 */
export async function refreshGitHubAndCopilotTokens(credentials) {
  const newGitHubCreds = await refreshGitHubToken(credentials.refreshToken);
  if (!newGitHubCreds?.accessToken) return newGitHubCreds;

  const copilotToken = await refreshCopilotToken(newGitHubCreds.accessToken);
  if (!copilotToken) return newGitHubCreds;

  return {
    ...newGitHubCreds,
    providerSpecificData: {
      copilotToken:          copilotToken.token,
      copilotTokenExpiresAt: copilotToken.expiresAt,
    },
  };
}
