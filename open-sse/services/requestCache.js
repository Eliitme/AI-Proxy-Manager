/**
 * Request Cache — two-level in-memory LRU cache for deterministic responses.
 *
 * Signature cache: keyed on full body hash. TTL: configurable (default 60s). Max: 500.
 * Semantic  cache: keyed on messages+system hash (temperature=0 only). TTL: default 300s. Max: 200.
 *
 * Both caches store { body: string, headers: Object, status: number, timestamp: number }.
 * Serialised to avoid sharing mutable Response objects across requests.
 */

import { createHash } from "crypto";

// ─── LRU Map implementation ───────────────────────────────────────────────────

class LRUCache {
  constructor(maxSize) {
    this._max = maxSize;
    this._map = new Map(); // key → { value, ts }
  }

  get(key) {
    const entry = this._map.get(key);
    if (!entry) return undefined;
    // Move to end (most recently used)
    this._map.delete(key);
    this._map.set(key, entry);
    return entry;
  }

  set(key, value) {
    if (this._map.has(key)) this._map.delete(key);
    else if (this._map.size >= this._max) {
      // Evict oldest (first in Map)
      this._map.delete(this._map.keys().next().value);
    }
    this._map.set(key, value);
  }

  delete(key) { this._map.delete(key); }
  clear() { this._map.clear(); }
  get size() { return this._map.size; }
}

// ─── Cache instances ──────────────────────────────────────────────────────────

const _sigCache = new LRUCache(500);
const _semCache = new LRUCache(200);

let _sigTtlMs = 60_000;
let _semTtlMs = 300_000;

// Hit/miss counters (for stats endpoint)
const _stats = { sigHits: 0, sigMisses: 0, semHits: 0, semMisses: 0 };

/**
 * Update TTL settings (called when settings change).
 * @param {{ signatureCacheTtlMs?: number, semanticCacheTtlMs?: number }} opts
 */
export function setCacheTtls({ signatureCacheTtlMs, semanticCacheTtlMs } = {}) {
  if (signatureCacheTtlMs != null) _sigTtlMs = signatureCacheTtlMs;
  if (semanticCacheTtlMs != null) _semTtlMs = semanticCacheTtlMs;
}

/**
 * Flush both caches (admin action).
 */
export function flushAll() {
  _sigCache.clear();
  _semCache.clear();
}

/**
 * Get cache stats.
 * @returns {{ sigSize: number, semSize: number, sigHits: number, sigMisses: number, semHits: number, semMisses: number }}
 */
export function getCacheStats() {
  return { sigSize: _sigCache.size, semSize: _semCache.size, ..._stats };
}

// ─── Signature cache ──────────────────────────────────────────────────────────

/**
 * Check the signature cache.
 * @param {string} userId
 * @param {string} bodyJson  — canonical JSON string of request body
 * @returns {{ hit: boolean, entry?: Object }}
 */
export function checkSignatureCache(userId, bodyJson) {
  const key = _hashKey(userId + bodyJson);
  const entry = _sigCache.get(key);
  if (!entry) { _stats.sigMisses++; return { hit: false }; }
  if (Date.now() - entry.ts > _sigTtlMs) {
    _sigCache.delete(key);
    _stats.sigMisses++;
    return { hit: false };
  }
  _stats.sigHits++;
  return { hit: true, entry: entry.value };
}

/**
 * Write to signature cache.
 * @param {string} userId
 * @param {string} bodyJson
 * @param {{ body: string, headers: Object, status: number }} responseData
 */
export function writeSignatureCache(userId, bodyJson, responseData) {
  const key = _hashKey(userId + bodyJson);
  _sigCache.set(key, { value: responseData, ts: Date.now() });
}

// ─── Semantic cache ───────────────────────────────────────────────────────────

/**
 * Check the semantic cache.
 * Only applicable when temperature === 0 and stream !== true.
 *
 * @param {string} userId
 * @param {any[]} messages
 * @param {string} [systemPrompt]
 * @returns {{ hit: boolean, entry?: Object }}
 */
export function checkSemanticCache(userId, messages, systemPrompt = "") {
  const key = _hashKey(userId + JSON.stringify(messages) + systemPrompt);
  const entry = _semCache.get(key);
  if (!entry) { _stats.semMisses++; return { hit: false }; }
  if (Date.now() - entry.ts > _semTtlMs) {
    _semCache.delete(key);
    _stats.semMisses++;
    return { hit: false };
  }
  _stats.semHits++;
  return { hit: true, entry: entry.value };
}

/**
 * Write to semantic cache.
 */
export function writeSemanticCache(userId, messages, systemPrompt = "", responseData) {
  const key = _hashKey(userId + JSON.stringify(messages) + systemPrompt);
  _semCache.set(key, { value: responseData, ts: Date.now() });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _hashKey(str) {
  return createHash("sha256").update(str).digest("hex");
}

/**
 * Reconstruct a Response from a cached entry.
 * @param {{ body: string, headers: Object, status: number }} entry
 * @returns {Response}
 */
export function entryToResponse(entry) {
  return new Response(entry.body, {
    status: entry.status,
    headers: { ...entry.headers, "x-cache": "HIT" },
  });
}

/**
 * Serialize a Response for caching (non-streaming only).
 * @param {Response} response
 * @returns {Promise<{ body: string, headers: Object, status: number }>}
 */
export async function serializeResponse(response) {
  const body = await response.clone().text();
  const headers = {};
  for (const [k, v] of response.headers.entries()) {
    headers[k] = v;
  }
  return { body, headers, status: response.status };
}
