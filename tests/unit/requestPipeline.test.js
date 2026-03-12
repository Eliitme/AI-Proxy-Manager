/**
 * Unit tests for open-sse/middleware/requestPipeline.js
 *
 * Tests cover:
 *   - runRequestPipeline — full happy-path (all steps pass through)
 *   - Step 1: IP filter — blocked IP short-circuits with 403
 *   - Step 2: Idempotency — hit short-circuits with cached response
 *   - Step 3: Model deprecation — rewrites body.model
 *   - Step 4: Wildcard routing — resolves model to concrete target
 *   - Step 5: Background task — sets isBackgroundTask + overrides model
 *   - Step 6: Quota preflight — populates excludedConnections
 *   - Step 7: Cache read — signature hit short-circuits; semantic hit short-circuits
 *   - writeBackCache — writes to sig + semantic caches when enabled
 *   - registerIdempotencyRequest — delegates to registerRequest
 *   - Step ordering: IP → idempotency → deprecation → wildcard → bg → quota → cache
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock all service dependencies before importing the pipeline ──────────────

vi.mock("../../open-sse/services/ipFilter.js", () => ({
  checkIpFilter: vi.fn(),
  initIpFilter: vi.fn(),
}));

vi.mock("../../open-sse/services/idempotency.js", () => ({
  computeIdempotencyKey: vi.fn(() => "idem-key-123"),
  checkIdempotency: vi.fn(() => ({ hit: false })),
  registerRequest: vi.fn(),
}));

vi.mock("../../open-sse/services/modelDeprecation.js", () => ({
  rewriteModel: vi.fn(async (model) => model),
  initModelDeprecation: vi.fn(),
  invalidateModelDeprecationCache: vi.fn(),
}));

vi.mock("../../open-sse/services/wildcardRouting.js", () => ({
  resolveWildcard: vi.fn(async () => null),
  initWildcardRouting: vi.fn(),
  invalidateWildcardCache: vi.fn(),
}));

vi.mock("../../open-sse/services/backgroundTaskDetector.js", () => ({
  isBackgroundTask: vi.fn(() => false),
}));

vi.mock("../../open-sse/services/quotaPreflight.js", () => ({
  getExcludedConnections: vi.fn(async () => new Set()),
  initQuotaPreflight: vi.fn(),
}));

vi.mock("../../open-sse/services/requestCache.js", () => ({
  checkSignatureCache: vi.fn(() => ({ hit: false })),
  checkSemanticCache: vi.fn(() => ({ hit: false })),
  writeSignatureCache: vi.fn(),
  writeSemanticCache: vi.fn(),
  serializeResponse: vi.fn(async (res) => ({
    body: await res.clone().text(),
    headers: {},
    status: res.status,
  })),
  entryToResponse: vi.fn((entry) => new Response(entry.body, { status: entry.status, headers: entry.headers })),
}));

import {
  runRequestPipeline,
  writeBackCache,
  registerIdempotencyRequest,
} from "../../open-sse/middleware/requestPipeline.js";

import { checkIpFilter } from "../../open-sse/services/ipFilter.js";
import { computeIdempotencyKey, checkIdempotency, registerRequest } from "../../open-sse/services/idempotency.js";
import { rewriteModel } from "../../open-sse/services/modelDeprecation.js";
import { resolveWildcard } from "../../open-sse/services/wildcardRouting.js";
import { isBackgroundTask } from "../../open-sse/services/backgroundTaskDetector.js";
import {
  checkSignatureCache,
  checkSemanticCache,
  writeSignatureCache,
  writeSemanticCache,
  serializeResponse,
  entryToResponse,
} from "../../open-sse/services/requestCache.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(headers = {}) {
  return {
    headers: {
      get: (key) => headers[key.toLowerCase()] ?? null,
    },
  };
}

function makeCtx(overrides = {}) {
  return {
    request: makeRequest({ "x-forwarded-for": "1.2.3.4" }),
    body: { model: "gpt-4o", messages: [{ role: "user", content: "hello" }], stream: false },
    userId: "user-test",
    method: "POST",
    path: "/v1/chat/completions",
    settings: {},
    excludedConnections: new Set(),
    isBackgroundTask: false,
    ...overrides,
  };
}

function makeSettings(overrides = {}) {
  return {
    ipFilterEnabled: true,
    idempotencyEnabled: false,
    signatureCacheEnabled: false,
    semanticCacheEnabled: false,
    backgroundTaskRoutingEnabled: false,
    quotaPreflightEnabled: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: all checks pass through
  checkIpFilter.mockResolvedValue({ blocked: false });
  checkIdempotency.mockReturnValue({ hit: false });
  rewriteModel.mockImplementation(async (model) => model);
  resolveWildcard.mockResolvedValue(null);
  isBackgroundTask.mockReturnValue(false);
  checkSignatureCache.mockReturnValue({ hit: false });
  checkSemanticCache.mockReturnValue({ hit: false });
  computeIdempotencyKey.mockReturnValue("idem-key-123");
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("runRequestPipeline — happy path", () => {
  it("returns done=false with ctx when all steps pass", async () => {
    const ctx = makeCtx({ settings: makeSettings() });
    const result = await runRequestPipeline(ctx);
    expect(result.done).toBe(false);
    expect(result.ctx).toBeDefined();
  });

  it("ctx is returned unchanged when no rewrites occur", async () => {
    const ctx = makeCtx({ settings: makeSettings(), body: { model: "gpt-4o", stream: false } });
    const result = await runRequestPipeline(ctx);
    expect(result.ctx.body.model).toBe("gpt-4o");
  });
});

// ─── Step 1: IP filter ────────────────────────────────────────────────────────

describe("runRequestPipeline — Step 1: IP filter", () => {
  it("short-circuits with 403 when IP is blocked", async () => {
    checkIpFilter.mockResolvedValue({ blocked: true, reason: "Denied" });
    const ctx = makeCtx({ settings: makeSettings({ ipFilterEnabled: true }) });
    const result = await runRequestPipeline(ctx);
    expect(result.done).toBe(true);
    expect(result.response.status).toBe(403);
    const body = await result.response.json();
    expect(body.error).toBe("Denied");
  });

  it("uses default 'Forbidden' reason when reason is absent", async () => {
    checkIpFilter.mockResolvedValue({ blocked: true, reason: null });
    const ctx = makeCtx({ settings: makeSettings({ ipFilterEnabled: true }) });
    const result = await runRequestPipeline(ctx);
    const body = await result.response.json();
    expect(body.error).toBe("Forbidden");
  });

  it("skips IP filter when ipFilterEnabled is false", async () => {
    checkIpFilter.mockResolvedValue({ blocked: true, reason: "Blocked" });
    const ctx = makeCtx({ settings: makeSettings({ ipFilterEnabled: false }) });
    const result = await runRequestPipeline(ctx);
    // Should NOT short-circuit even though checkIpFilter says blocked
    // because the setting disables the filter
    expect(checkIpFilter).not.toHaveBeenCalled();
    expect(result.done).toBe(false);
  });

  it("skips IP filter when no IP header is present", async () => {
    const ctx = makeCtx({
      request: makeRequest({}), // no x-forwarded-for, no x-real-ip
      settings: makeSettings({ ipFilterEnabled: true }),
    });
    const result = await runRequestPipeline(ctx);
    expect(checkIpFilter).not.toHaveBeenCalled();
    expect(result.done).toBe(false);
  });

  it("uses x-real-ip header as fallback", async () => {
    checkIpFilter.mockResolvedValue({ blocked: false });
    const ctx = makeCtx({
      request: makeRequest({ "x-real-ip": "10.0.0.1" }),
      settings: makeSettings({ ipFilterEnabled: true }),
    });
    await runRequestPipeline(ctx);
    expect(checkIpFilter).toHaveBeenCalledWith("10.0.0.1", expect.anything());
  });

  it("extracts first IP from comma-separated x-forwarded-for", async () => {
    checkIpFilter.mockResolvedValue({ blocked: false });
    const ctx = makeCtx({
      request: makeRequest({ "x-forwarded-for": "5.5.5.5, 10.0.0.1" }),
      settings: makeSettings({ ipFilterEnabled: true }),
    });
    await runRequestPipeline(ctx);
    expect(checkIpFilter).toHaveBeenCalledWith("5.5.5.5", expect.anything());
  });
});

// ─── Step 2: Idempotency ──────────────────────────────────────────────────────

describe("runRequestPipeline — Step 2: Idempotency", () => {
  it("skips idempotency check when idempotencyEnabled is false", async () => {
    const ctx = makeCtx({ settings: makeSettings({ idempotencyEnabled: false }) });
    await runRequestPipeline(ctx);
    expect(checkIdempotency).not.toHaveBeenCalled();
  });

  it("skips idempotency check for streaming requests", async () => {
    const ctx = makeCtx({
      body: { model: "gpt-4o", stream: true },
      settings: makeSettings({ idempotencyEnabled: true }),
    });
    await runRequestPipeline(ctx);
    expect(checkIdempotency).not.toHaveBeenCalled();
  });

  it("short-circuits when idempotency cache returns a Response hit", async () => {
    const cachedResponse = new Response('{"cached":true}', { status: 200 });
    checkIdempotency.mockReturnValue({ hit: true, response: cachedResponse });
    const ctx = makeCtx({ settings: makeSettings({ idempotencyEnabled: true }) });
    const result = await runRequestPipeline(ctx);
    expect(result.done).toBe(true);
    expect(result.response).toBeInstanceOf(Response);
  });

  it("short-circuits when idempotency cache returns a Promise hit", async () => {
    const cachedResponse = new Response('{"cached":true}', { status: 200 });
    checkIdempotency.mockReturnValue({ hit: true, response: Promise.resolve(cachedResponse) });
    const ctx = makeCtx({ settings: makeSettings({ idempotencyEnabled: true }) });
    const result = await runRequestPipeline(ctx);
    expect(result.done).toBe(true);
  });

  it("stores _idempotencyKey on ctx when idempotency is enabled", async () => {
    computeIdempotencyKey.mockReturnValue("my-idem-key");
    checkIdempotency.mockReturnValue({ hit: false });
    const ctx = makeCtx({ settings: makeSettings({ idempotencyEnabled: true }) });
    const result = await runRequestPipeline(ctx);
    expect(result.ctx._idempotencyKey).toBe("my-idem-key");
  });
});

// ─── Step 3: Model deprecation ────────────────────────────────────────────────

describe("runRequestPipeline — Step 3: Model deprecation", () => {
  it("rewrites body.model when rewriteModel returns a new name", async () => {
    rewriteModel.mockResolvedValue("gpt-4o");
    const ctx = makeCtx({
      body: { model: "gpt-4", stream: false },
      settings: makeSettings(),
    });
    const result = await runRequestPipeline(ctx);
    expect(result.ctx.body.model).toBe("gpt-4o");
  });

  it("leaves body.model unchanged when rewriteModel returns the same value", async () => {
    rewriteModel.mockResolvedValue("gpt-4o");
    const ctx = makeCtx({
      body: { model: "gpt-4o", stream: false },
      settings: makeSettings(),
    });
    const result = await runRequestPipeline(ctx);
    expect(result.ctx.body.model).toBe("gpt-4o");
  });

  it("skips model rewrite when body has no model", async () => {
    const ctx = makeCtx({
      body: { stream: false, messages: [] },
      settings: makeSettings(),
    });
    await runRequestPipeline(ctx);
    expect(rewriteModel).not.toHaveBeenCalled();
  });

  it("calls rewriteModel with userId", async () => {
    rewriteModel.mockResolvedValue("gpt-4o");
    const ctx = makeCtx({
      body: { model: "gpt-4", stream: false },
      userId: "uid-abc",
      settings: makeSettings(),
    });
    await runRequestPipeline(ctx);
    expect(rewriteModel).toHaveBeenCalledWith("gpt-4", "uid-abc");
  });
});

// ─── Step 4: Wildcard routing ─────────────────────────────────────────────────

describe("runRequestPipeline — Step 4: Wildcard routing", () => {
  it("rewrites body.model when resolveWildcard returns a target", async () => {
    resolveWildcard.mockResolvedValue("openai/gpt-4o");
    const ctx = makeCtx({
      body: { model: "gpt-*", stream: false },
      settings: makeSettings(),
    });
    const result = await runRequestPipeline(ctx);
    expect(result.ctx.body.model).toBe("openai/gpt-4o");
  });

  it("leaves body.model unchanged when resolveWildcard returns null", async () => {
    resolveWildcard.mockResolvedValue(null);
    const ctx = makeCtx({
      body: { model: "gpt-4o", stream: false },
      settings: makeSettings(),
    });
    const result = await runRequestPipeline(ctx);
    expect(result.ctx.body.model).toBe("gpt-4o");
  });

  it("wildcard step sees the model rewritten by deprecation step", async () => {
    rewriteModel.mockResolvedValue("gpt-4-turbo");
    resolveWildcard.mockResolvedValue(null);
    const ctx = makeCtx({
      body: { model: "gpt-4", stream: false },
      settings: makeSettings(),
    });
    await runRequestPipeline(ctx);
    expect(resolveWildcard).toHaveBeenCalledWith("gpt-4-turbo", expect.anything());
  });
});

// ─── Step 5: Background task ──────────────────────────────────────────────────

describe("runRequestPipeline — Step 5: Background task", () => {
  it("skips background task step when backgroundTaskRoutingEnabled is false", async () => {
    const ctx = makeCtx({ settings: makeSettings({ backgroundTaskRoutingEnabled: false }) });
    await runRequestPipeline(ctx);
    expect(isBackgroundTask).not.toHaveBeenCalled();
  });

  it("skips background task step when backgroundTaskModel is not set", async () => {
    const ctx = makeCtx({
      settings: makeSettings({ backgroundTaskRoutingEnabled: true, backgroundTaskModel: undefined }),
    });
    await runRequestPipeline(ctx);
    expect(isBackgroundTask).not.toHaveBeenCalled();
  });

  it("sets ctx.isBackgroundTask=true and overrides model when detected", async () => {
    isBackgroundTask.mockReturnValue(true);
    const ctx = makeCtx({
      body: { model: "gpt-4o", stream: false },
      settings: makeSettings({
        backgroundTaskRoutingEnabled: true,
        backgroundTaskModel: "gpt-3.5-turbo",
      }),
    });
    const result = await runRequestPipeline(ctx);
    expect(result.ctx.isBackgroundTask).toBe(true);
    expect(result.ctx.body.model).toBe("gpt-3.5-turbo");
  });

  it("sets ctx.isBackgroundTask=false and does not override model when not detected", async () => {
    isBackgroundTask.mockReturnValue(false);
    const ctx = makeCtx({
      body: { model: "gpt-4o", stream: false },
      settings: makeSettings({
        backgroundTaskRoutingEnabled: true,
        backgroundTaskModel: "gpt-3.5-turbo",
      }),
    });
    const result = await runRequestPipeline(ctx);
    expect(result.ctx.isBackgroundTask).toBe(false);
    expect(result.ctx.body.model).toBe("gpt-4o");
  });
});

// ─── Step 6: Quota preflight ──────────────────────────────────────────────────

describe("runRequestPipeline — Step 6: Quota preflight", () => {
  it("initializes excludedConnections to empty Set when quotaPreflightEnabled is false", async () => {
    const ctx = makeCtx({ settings: makeSettings({ quotaPreflightEnabled: false }) });
    const result = await runRequestPipeline(ctx);
    expect(result.ctx.excludedConnections).toBeInstanceOf(Set);
    expect(result.ctx.excludedConnections.size).toBe(0);
  });

  it("preserves existing excludedConnections Set when quotaPreflightEnabled is true", async () => {
    const existing = new Set(["conn-1"]);
    const ctx = makeCtx({
      excludedConnections: existing,
      settings: makeSettings({ quotaPreflightEnabled: true }),
    });
    const result = await runRequestPipeline(ctx);
    expect(result.ctx.excludedConnections).toBe(existing);
  });
});

// ─── Step 7: Cache read ───────────────────────────────────────────────────────

describe("runRequestPipeline — Step 7: Cache read", () => {
  const CACHED_ENTRY = { body: '{"cached":true}', headers: {}, status: 200 };

  it("skips cache read for streaming requests", async () => {
    const ctx = makeCtx({
      body: { model: "gpt-4o", stream: true },
      settings: makeSettings({ signatureCacheEnabled: true }),
    });
    await runRequestPipeline(ctx);
    expect(checkSignatureCache).not.toHaveBeenCalled();
    expect(checkSemanticCache).not.toHaveBeenCalled();
  });

  it("short-circuits on signature cache hit", async () => {
    checkSignatureCache.mockReturnValue({ hit: true, entry: CACHED_ENTRY });
    entryToResponse.mockReturnValue(new Response(CACHED_ENTRY.body, { status: 200 }));
    const ctx = makeCtx({
      body: { model: "gpt-4o", stream: false },
      userId: "u1",
      settings: makeSettings({ signatureCacheEnabled: true }),
    });
    const result = await runRequestPipeline(ctx);
    expect(result.done).toBe(true);
    expect(entryToResponse).toHaveBeenCalledWith(CACHED_ENTRY);
  });

  it("skips signature cache when signatureCacheEnabled is false", async () => {
    const ctx = makeCtx({
      body: { model: "gpt-4o", stream: false },
      settings: makeSettings({ signatureCacheEnabled: false }),
    });
    await runRequestPipeline(ctx);
    expect(checkSignatureCache).not.toHaveBeenCalled();
  });

  it("skips signature cache when userId is null", async () => {
    const ctx = makeCtx({
      userId: null,
      body: { model: "gpt-4o", stream: false },
      settings: makeSettings({ signatureCacheEnabled: true }),
    });
    await runRequestPipeline(ctx);
    expect(checkSignatureCache).not.toHaveBeenCalled();
  });

  it("short-circuits on semantic cache hit (temperature=0)", async () => {
    checkSemanticCache.mockReturnValue({ hit: true, entry: CACHED_ENTRY });
    entryToResponse.mockReturnValue(new Response(CACHED_ENTRY.body, { status: 200 }));
    const ctx = makeCtx({
      body: { model: "gpt-4o", stream: false, temperature: 0, messages: [] },
      userId: "u1",
      settings: makeSettings({ semanticCacheEnabled: true }),
    });
    const result = await runRequestPipeline(ctx);
    expect(result.done).toBe(true);
  });

  it("skips semantic cache when temperature is not 0", async () => {
    const ctx = makeCtx({
      body: { model: "gpt-4o", stream: false, temperature: 0.7 },
      userId: "u1",
      settings: makeSettings({ semanticCacheEnabled: true }),
    });
    await runRequestPipeline(ctx);
    expect(checkSemanticCache).not.toHaveBeenCalled();
  });

  it("skips semantic cache when semanticCacheEnabled is false", async () => {
    const ctx = makeCtx({
      body: { model: "gpt-4o", stream: false, temperature: 0 },
      userId: "u1",
      settings: makeSettings({ semanticCacheEnabled: false }),
    });
    await runRequestPipeline(ctx);
    expect(checkSemanticCache).not.toHaveBeenCalled();
  });
});

// ─── writeBackCache ────────────────────────────────────────────────────────────

describe("writeBackCache", () => {
  it("writes to signature cache when signatureCacheEnabled is true", async () => {
    const ctx = makeCtx({ body: { model: "gpt-4o", stream: false }, userId: "u1" });
    const res = new Response('{"ok":true}', { status: 200 });
    serializeResponse.mockResolvedValue({ body: '{"ok":true}', headers: {}, status: 200 });
    await writeBackCache(ctx, res, makeSettings({ signatureCacheEnabled: true }));
    expect(writeSignatureCache).toHaveBeenCalledOnce();
  });

  it("writes to semantic cache when semanticCacheEnabled is true and temperature=0", async () => {
    const ctx = makeCtx({
      body: { model: "gpt-4o", stream: false, temperature: 0, messages: [], system: "" },
      userId: "u1",
    });
    const res = new Response('{"ok":true}', { status: 200 });
    serializeResponse.mockResolvedValue({ body: '{"ok":true}', headers: {}, status: 200 });
    await writeBackCache(ctx, res, makeSettings({ semanticCacheEnabled: true }));
    expect(writeSemanticCache).toHaveBeenCalledOnce();
  });

  it("does not write semantic cache when temperature != 0", async () => {
    const ctx = makeCtx({
      body: { model: "gpt-4o", stream: false, temperature: 0.8 },
      userId: "u1",
    });
    const res = new Response('{"ok":true}', { status: 200 });
    serializeResponse.mockResolvedValue({ body: '{"ok":true}', headers: {}, status: 200 });
    await writeBackCache(ctx, res, makeSettings({ semanticCacheEnabled: true }));
    expect(writeSemanticCache).not.toHaveBeenCalled();
  });

  it("skips all writes when userId is null", async () => {
    const ctx = makeCtx({ userId: null, body: { model: "gpt-4o", stream: false } });
    const res = new Response('{"ok":true}', { status: 200 });
    await writeBackCache(ctx, res, makeSettings({ signatureCacheEnabled: true, semanticCacheEnabled: true }));
    expect(writeSignatureCache).not.toHaveBeenCalled();
    expect(writeSemanticCache).not.toHaveBeenCalled();
  });

  it("skips all writes when body.stream is true", async () => {
    const ctx = makeCtx({ userId: "u1", body: { model: "gpt-4o", stream: true } });
    const res = new Response("data: ...", { status: 200 });
    await writeBackCache(ctx, res, makeSettings({ signatureCacheEnabled: true }));
    expect(writeSignatureCache).not.toHaveBeenCalled();
  });

  it("does not throw when serializeResponse throws (non-fatal)", async () => {
    serializeResponse.mockRejectedValue(new Error("serialize fail"));
    const ctx = makeCtx({ body: { model: "gpt-4o", stream: false }, userId: "u1" });
    const res = new Response('{"ok":true}', { status: 200 });
    await expect(
      writeBackCache(ctx, res, makeSettings({ signatureCacheEnabled: true }))
    ).resolves.toBeUndefined();
  });
});

// ─── registerIdempotencyRequest ────────────────────────────────────────────────

describe("registerIdempotencyRequest", () => {
  it("calls registerRequest with the idempotency key", () => {
    const ctx = { _idempotencyKey: "abc-123" };
    const promise = Promise.resolve(new Response("ok"));
    registerIdempotencyRequest(ctx, promise);
    expect(registerRequest).toHaveBeenCalledWith("abc-123", promise);
  });

  it("does not call registerRequest when ctx has no _idempotencyKey", () => {
    const ctx = { _idempotencyKey: undefined };
    registerIdempotencyRequest(ctx, Promise.resolve());
    expect(registerRequest).not.toHaveBeenCalled();
  });
});

// ─── Step ordering verification ───────────────────────────────────────────────

describe("runRequestPipeline — step ordering", () => {
  it("IP block fires before idempotency check", async () => {
    checkIpFilter.mockResolvedValue({ blocked: true, reason: "IP blocked" });
    checkIdempotency.mockReturnValue({ hit: true, response: new Response("cached") });
    const ctx = makeCtx({
      settings: makeSettings({ ipFilterEnabled: true, idempotencyEnabled: true }),
    });
    const result = await runRequestPipeline(ctx);
    expect(result.response.status).toBe(403);
    expect(checkIdempotency).not.toHaveBeenCalled();
  });

  it("idempotency hit fires before model deprecation", async () => {
    checkIdempotency.mockReturnValue({ hit: true, response: new Response("cached") });
    const ctx = makeCtx({
      settings: makeSettings({ idempotencyEnabled: true }),
    });
    await runRequestPipeline(ctx);
    expect(rewriteModel).not.toHaveBeenCalled();
  });

  it("model after all rewrites (deprecation + wildcard + bg) is what the cache sees", async () => {
    // deprecation: gpt-4 → gpt-4-turbo
    // wildcard: gpt-4-turbo → openai/gpt-4-turbo
    // bg task: override → bg-model
    rewriteModel.mockResolvedValue("gpt-4-turbo");
    resolveWildcard.mockResolvedValue("openai/gpt-4-turbo");
    isBackgroundTask.mockReturnValue(true);

    const ctx = makeCtx({
      body: { model: "gpt-4", stream: false, temperature: 0 },
      userId: "u1",
      settings: makeSettings({
        backgroundTaskRoutingEnabled: true,
        backgroundTaskModel: "bg-model",
        signatureCacheEnabled: true,
      }),
    });
    const result = await runRequestPipeline(ctx);
    // ctx.body.model should be bg-model (background step overwrites wildcard result)
    expect(result.ctx.body.model).toBe("bg-model");
    // Signature cache was checked with the bg-model body
    const sigCacheCallArg = checkSignatureCache.mock.calls[0][1];
    const parsed = JSON.parse(sigCacheCallArg);
    expect(parsed.model).toBe("bg-model");
  });
});
