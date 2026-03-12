/**
 * Circuit Breaker — per-provider-connection state machine.
 *
 * States:
 *   closed    — normal operation; failures are counted
 *   open      — connection is skipped; requests not forwarded
 *   half-open — one test request allowed; resets if succeeds, re-opens if fails
 *
 * Configuration is read lazily from the settings table (injected via setConfig).
 * State is kept in-memory (O(1) lookup) and persisted to DB only on transitions.
 */

/** @typedef {{ state: 'closed'|'open'|'half-open', failureCount: number, lastFailureAt: number|null, openedAt: number|null, halfOpenAt: number|null }} CBState */

/** @type {Map<string, CBState>} */
const _states = new Map();

/** @type {{ enabled: boolean, failureThreshold: number, recoveryWindowMs: number }} */
let _config = {
  enabled: false,
  failureThreshold: 5,
  recoveryWindowMs: 60_000,
};

/** DB persistence functions — injected to avoid circular imports */
let _persistFn = null;
let _loadFn = null;

/**
 * Inject DB functions after module load (called from pgLocalDb init).
 * @param {{ persist: Function, load: Function }} fns
 */
export function initCircuitBreaker({ persist, load }) {
  _persistFn = persist;
  _loadFn = load;
}

/**
 * Update runtime config (called when settings change).
 * @param {{ enabled?: boolean, failureThreshold?: number, recoveryWindowMs?: number }} cfg
 */
export function setCircuitBreakerConfig(cfg) {
  _config = { ..._config, ...cfg };
}

/**
 * Load all persisted states from DB into memory.
 * Should be called once on startup.
 */
export async function loadAllStates() {
  if (!_loadFn) return;
  try {
    const rows = await _loadFn();
    for (const row of rows) {
      _states.set(row.connectionId, {
        state: row.state,
        failureCount: row.failureCount,
        lastFailureAt: row.lastFailureAt,
        openedAt: row.openedAt,
        halfOpenAt: row.halfOpenAt,
      });
    }
  } catch (_) {
    // Non-fatal: start with empty in-memory state
  }
}

/**
 * Get current state for a connection, resolving time-based transitions.
 * @param {string} connectionId
 * @returns {CBState}
 */
export function getState(connectionId) {
  let s = _states.get(connectionId);
  if (!s) return { state: 'closed', failureCount: 0, lastFailureAt: null, openedAt: null, halfOpenAt: null };

  // Auto-transition open → half-open if recovery window has elapsed
  if (s.state === 'open' && s.openedAt != null) {
    const elapsed = Date.now() - s.openedAt;
    if (elapsed >= _config.recoveryWindowMs) {
      s = { ...s, state: 'half-open', halfOpenAt: Date.now() };
      _states.set(connectionId, s);
      _persist(connectionId, s);
    }
  }
  return s;
}

/**
 * Returns true if the connection is in 'open' state (requests should be skipped).
 * Half-open allows one test request through.
 * @param {string} connectionId
 * @returns {boolean}
 */
export function isOpen(connectionId) {
  if (!_config.enabled) return false;
  const s = getState(connectionId);
  return s.state === 'open';
}

/**
 * Record a successful request for a connection.
 * Transitions: half-open → closed; closed resets failure count.
 * @param {string} connectionId
 */
export function recordSuccess(connectionId) {
  if (!_config.enabled) return;
  const s = getState(connectionId);
  if (s.state === 'closed' && s.failureCount === 0) return; // already clean, nothing to do

  const next = { state: 'closed', failureCount: 0, lastFailureAt: null, openedAt: null, halfOpenAt: null };
  _states.set(connectionId, next);
  _persist(connectionId, next);
}

/**
 * Record a failed request for a connection.
 * Transitions: closed → open (when threshold reached); half-open → open.
 * @param {string} connectionId
 */
export function recordFailure(connectionId) {
  if (!_config.enabled) return;
  const s = getState(connectionId);
  const now = Date.now();

  let next;
  if (s.state === 'half-open') {
    // Test request failed → re-open
    next = { ...s, state: 'open', openedAt: now, halfOpenAt: null, lastFailureAt: now };
  } else if (s.state === 'open') {
    // Already open — just update failure timestamp
    next = { ...s, failureCount: s.failureCount + 1, lastFailureAt: now };
  } else {
    // closed — increment failure count
    const newCount = (s.failureCount || 0) + 1;
    if (newCount >= _config.failureThreshold) {
      next = { state: 'open', failureCount: newCount, lastFailureAt: now, openedAt: now, halfOpenAt: null };
    } else {
      next = { ...s, state: 'closed', failureCount: newCount, lastFailureAt: now };
    }
  }

  _states.set(connectionId, next);
  _persist(connectionId, next);
}

/**
 * Get all states (for dashboard display).
 * @returns {Array<{ connectionId: string } & CBState>}
 */
export function getAllStates() {
  const result = [];
  for (const [connectionId, s] of _states.entries()) {
    result.push({ connectionId, ...getState(connectionId) });
  }
  return result;
}

/**
 * Reset state for a connection (admin action).
 * @param {string} connectionId
 */
export function resetState(connectionId) {
  const next = { state: 'closed', failureCount: 0, lastFailureAt: null, openedAt: null, halfOpenAt: null };
  _states.set(connectionId, next);
  _persist(connectionId, next);
}

function _persist(connectionId, state) {
  if (!_persistFn) return;
  _persistFn(connectionId, state).catch(() => {}); // fire and forget
}
