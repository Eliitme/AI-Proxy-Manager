/**
 * Request Idempotency — deduplicates identical concurrent/recent requests.
 *
 * Key: SHA-256(method + path + canonically-sorted request body JSON)
 * Two modes:
 *   1. In-flight dedup: if the first request is still running, await its promise
 *   2. Recent response cache: return cached response within TTL after first completed
 *
 * Bounded LRU Map (max 1000 entries) + 10s sweep for expired entries.
 */

import { createHash } from "crypto";

const MAX_ENTRIES = 1000;
const SWEEP_INTERVAL_MS = 10_000;

/** @type {Map<string, { promise?: Promise, response?: Response, resolvedAt?: number }>} */
const _store = new Map();

let _ttlMs = 5000;
let _sweepTimer = null;

/** Start background sweep (called once at module load) */
function _startSweep() {
  if (_sweepTimer) return;
  _sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of _store.entries()) {
      if (v.resolvedAt && now - v.resolvedAt > _ttlMs * 2) {
        _store.delete(k);
      }
    }
  }, SWEEP_INTERVAL_MS);
  if (_sweepTimer.unref) _sweepTimer.unref();
}

_startSweep();

/**
 * Update TTL (called from settings update).
 * @param {number} ms
 */
export function setIdempotencyTtl(ms) {
  _ttlMs = ms;
}

/**
 * Compute idempotency key for a request.
 * @param {string} method
 * @param {string} path
 * @param {any} body — parsed request body object
 * @returns {string} hex SHA-256 hash
 */
export function computeIdempotencyKey(method, path, body) {
  const canonical = JSON.stringify(body, Object.keys(body || {}).sort());
  return createHash("sha256").update(`${method}:${path}:${canonical}`).digest("hex");
}

/**
 * Check if a request has a cached/in-flight duplicate.
 *
 * Returns:
 *   - `{ hit: false }` — no dedup, caller should proceed
 *   - `{ hit: true, response: Response }` — return this response immediately
 *   - `{ hit: true, response: Promise<Response> }` — await this promise
 *
 * @param {string} key
 * @returns {{ hit: boolean, response?: Response|Promise }}
 */
export function checkIdempotency(key) {
  const entry = _store.get(key);
  if (!entry) return { hit: false };

  const now = Date.now();

  // In-flight: first request is still running
  if (entry.promise && !entry.resolvedAt) {
    return { hit: true, response: entry.promise };
  }

  // Completed within TTL
  if (entry.response && entry.resolvedAt && now - entry.resolvedAt <= _ttlMs) {
    return { hit: true, response: entry.response };
  }

  // Expired — remove and treat as miss
  _store.delete(key);
  return { hit: false };
}

/**
 * Register an in-flight request promise.
 * @param {string} key
 * @param {Promise<Response>} promise
 */
export function registerRequest(key, promise) {
  _evictIfNeeded();
  _store.set(key, { promise });

  // When the promise resolves, store the response
  promise.then((res) => {
    const entry = _store.get(key);
    if (entry) {
      entry.response = res;
      entry.resolvedAt = Date.now();
      entry.promise = undefined;
    }
  }).catch(() => {
    _store.delete(key);
  });
}

/**
 * LRU eviction when at capacity.
 */
function _evictIfNeeded() {
  if (_store.size >= MAX_ENTRIES) {
    // Delete the oldest entry (first inserted in Map iteration order)
    const firstKey = _store.keys().next().value;
    if (firstKey) _store.delete(firstKey);
  }
}
