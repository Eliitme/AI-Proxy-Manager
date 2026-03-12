/**
 * Request Pipeline — composes all middleware steps in order before dispatch.
 *
 * Middleware execution order:
 *   1. IP filter          — block banned IPs; enforce allowlists
 *   2. Idempotency check  — return cached/in-flight duplicate response
 *   3. Model deprecation  — rewrite deprecated model names
 *   4. Wildcard routing   — resolve glob patterns to concrete targets
 *   5. Background task    — detect and re-route batch/CI requests
 *   6. Quota preflight    — annotate ctx.excludedConnections (soft hint)
 *   7. Cache read         — return cached response for deterministic requests
 *
 * After all steps, the caller dispatches the actual upstream request.
 * For non-streaming success responses, the caller calls writeBackCache().
 *
 * @typedef {Object} PipelineCtx
 * @property {Request}      request             — Web Request object
 * @property {Object}       body                — Parsed + mutable request body
 * @property {string|null}  userId              — Authenticated user ID
 * @property {string}       method              — HTTP method
 * @property {string}       path                — Request pathname
 * @property {Object}       settings            — Current settings snapshot
 * @property {Set<string>}  excludedConnections — Populated by quota preflight
 * @property {boolean}      isBackgroundTask    — Set by background task step
 */

import { checkIpFilter } from "../services/ipFilter.js";
import { computeIdempotencyKey, checkIdempotency, registerRequest } from "../services/idempotency.js";
import { rewriteModel } from "../services/modelDeprecation.js";
import { resolveWildcard } from "../services/wildcardRouting.js";
import { isBackgroundTask } from "../services/backgroundTaskDetector.js";
import { getExcludedConnections, initQuotaPreflight } from "../services/quotaPreflight.js";
import {
  checkSignatureCache,
  checkSemanticCache,
  writeSignatureCache,
  writeSemanticCache,
  serializeResponse,
  entryToResponse,
} from "../services/requestCache.js";

// ─── Quota preflight: stub snapshot getter (no server-side quota data yet) ───
// Quota data is currently fetched client-side via the /api/providers/me route.
// The preflight returns an empty exclusion set unless a server-side snapshot
// function is injected via setQuotaSnapshotGetter().
let _quotaSnapshotGetter = null;
initQuotaPreflight({ getSnapshot: (provider, id) => _quotaSnapshotGetter?.(provider, id) ?? null });

/**
 * Inject a server-side quota snapshot getter (optional).
 * @param {Function} fn  — (provider: string, connectionId: string) => { percentUsed: number } | null
 */
export function setQuotaSnapshotGetter(fn) {
  _quotaSnapshotGetter = fn;
}

/**
 * Run all pre-dispatch middleware steps.
 *
 * Returns either:
 *   - `{ done: true, response: Response }` — short-circuit; return this response immediately
 *   - `{ done: false, ctx: PipelineCtx }` — continue to dispatch
 *
 * @param {PipelineCtx} ctx
 * @returns {Promise<{ done: boolean, response?: Response, ctx?: PipelineCtx }>}
 */
export async function runRequestPipeline(ctx) {
  const { request, body, userId, method, path, settings } = ctx;

  // ── Step 1: IP Filter ──────────────────────────────────────────────────────
  if (settings?.ipFilterEnabled !== false) {
    const ip = _extractIp(request);
    if (ip) {
      const { blocked, reason } = await checkIpFilter(ip, userId);
      if (blocked) {
        return {
          done: true,
          response: new Response(JSON.stringify({ error: reason || "Forbidden" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          }),
        };
      }
    }
  }

  // ── Step 2: Idempotency Check ──────────────────────────────────────────────
  const isStreaming = body?.stream === true;
  if (!isStreaming && settings?.idempotencyEnabled) {
    const iKey = computeIdempotencyKey(method, path, body);
    ctx._idempotencyKey = iKey;
    const { hit, response } = checkIdempotency(iKey);
    if (hit) {
      const resolved = await Promise.resolve(response);
      // Clone the response to allow multiple reads
      return { done: true, response: resolved instanceof Response ? resolved.clone() : resolved };
    }
  }

  // ── Step 3: Model Deprecation Rewrite ─────────────────────────────────────
  if (body?.model) {
    const rewritten = await rewriteModel(body.model, userId);
    if (rewritten !== body.model) {
      ctx.body = { ...body, model: rewritten };
    }
  }

  // ── Step 4: Wildcard Resolution ────────────────────────────────────────────
  if (ctx.body?.model) {
    const target = await resolveWildcard(ctx.body.model, userId);
    if (target) {
      ctx.body = { ...ctx.body, model: target };
    }
  }

  // ── Step 5: Background Task Detection ─────────────────────────────────────
  if (settings?.backgroundTaskRoutingEnabled && settings?.backgroundTaskModel) {
    const bgTask = isBackgroundTask(request, ctx.body);
    ctx.isBackgroundTask = bgTask;
    if (bgTask) {
      ctx.body = { ...ctx.body, model: settings.backgroundTaskModel };
    }
  }

  // ── Step 6: Quota Preflight ────────────────────────────────────────────────
  if (settings?.quotaPreflightEnabled) {
    // provider and connectionIds are not known here yet (resolved later in getProviderCredentials)
    // We pass an empty list — quota preflight will be re-evaluated in getProviderCredentials
    ctx.excludedConnections = ctx.excludedConnections || new Set();
  } else {
    ctx.excludedConnections = new Set();
  }

  // ── Step 7: Cache Read ─────────────────────────────────────────────────────
  if (!isStreaming) {
    const bodyJson = JSON.stringify(ctx.body);

    // Signature cache (full body hash)
    if (settings?.signatureCacheEnabled && userId) {
      const { hit, entry } = checkSignatureCache(userId, bodyJson);
      if (hit) {
        return { done: true, response: entryToResponse(entry) };
      }
    }

    // Semantic cache (messages+system hash, temperature=0 only)
    if (settings?.semanticCacheEnabled && userId && ctx.body?.temperature === 0) {
      const messages = ctx.body?.messages || [];
      const system = ctx.body?.system || "";
      const { hit, entry } = checkSemanticCache(userId, messages, system);
      if (hit) {
        return { done: true, response: entryToResponse(entry) };
      }
    }
  }

  return { done: false, ctx };
}

/**
 * Write a successful non-streaming response to the cache.
 * Call this after a successful upstream response.
 *
 * @param {PipelineCtx} ctx
 * @param {Response} response
 * @param {Object} settings
 * @returns {Promise<void>}
 */
export async function writeBackCache(ctx, response, settings) {
  const { body, userId } = ctx;
  if (!userId) return;
  if (body?.stream) return;

  try {
    const bodyJson = JSON.stringify(body);
    const serialized = await serializeResponse(response);

    if (settings?.signatureCacheEnabled) {
      writeSignatureCache(userId, bodyJson, serialized);
    }

    if (settings?.semanticCacheEnabled && body?.temperature === 0) {
      const messages = body?.messages || [];
      const system = body?.system || "";
      writeSemanticCache(userId, messages, system, serialized);
    }
  } catch {
    // Non-fatal: cache write failure should not affect the response
  }
}

/**
 * Register an idempotency promise for the current request (call before dispatch).
 * @param {PipelineCtx} ctx
 * @param {Promise<Response>} promise
 */
export function registerIdempotencyRequest(ctx, promise) {
  if (ctx._idempotencyKey) {
    registerRequest(ctx._idempotencyKey, promise);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract client IP from request headers.
 * @param {Request} request
 * @returns {string|null}
 */
function _extractIp(request) {
  if (!request?.headers) return null;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return null;
}
