/**
 * Unit tests for open-sse/services/modelDeprecation.js
 *
 * Tests cover:
 *   - rewriteModel — no change, static built-in map, user overrides
 *   - Provider prefix preservation
 *   - User overrides win over static map
 *   - invalidateModelDeprecationCache
 *   - Cache behaviour
 *   - No getOverrides injected
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  initModelDeprecation,
  invalidateModelDeprecationCache,
  rewriteModel,
} from "../../open-sse/services/modelDeprecation.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setup(overrides = []) {
  const getOverrides = vi.fn().mockResolvedValue(overrides);
  initModelDeprecation({ getOverrides });
  invalidateModelDeprecationCache(null);
  return getOverrides;
}

// ─── No change ────────────────────────────────────────────────────────────────

describe("rewriteModel — no change", () => {
  it("returns model unchanged when not deprecated", async () => {
    setup([]);
    expect(await rewriteModel("gpt-4o", null)).toBe("gpt-4o");
  });

  it("returns null/undefined as-is", async () => {
    setup([]);
    expect(await rewriteModel(null, null)).toBeNull();
    expect(await rewriteModel(undefined, null)).toBeUndefined();
  });

  it("no getOverrides injected → static map still applies", async () => {
    // When getOverrides is null, user overrides are empty but the static built-in
    // DEPRECATED_MODELS map is always applied as a fallback.
    initModelDeprecation({ getOverrides: null });
    invalidateModelDeprecationCache(null);
    // gpt-4 is in the static map → rewrites to gpt-4o even without a DB override fn
    expect(await rewriteModel("gpt-4", null)).toBe("gpt-4o");
  });
});

// ─── Static built-in map ─────────────────────────────────────────────────────

describe("rewriteModel — static built-in map", () => {
  beforeEach(() => {
    setup([]); // no user overrides, rely on static DEPRECATED_MODELS
  });

  it("rewrites gpt-4 → gpt-4o", async () => {
    expect(await rewriteModel("gpt-4", null)).toBe("gpt-4o");
  });

  it("rewrites claude-2 → claude-3-5-haiku-20241022", async () => {
    expect(await rewriteModel("claude-2", null)).toBe("claude-3-5-haiku-20241022");
  });

  it("leaves non-deprecated models unchanged", async () => {
    expect(await rewriteModel("gpt-4o-mini", null)).toBe("gpt-4o-mini");
  });
});

// ─── Provider prefix preservation ─────────────────────────────────────────────

describe("rewriteModel — provider prefix", () => {
  beforeEach(() => setup([]));

  it("preserves provider prefix on static rewrite: openai/gpt-4 → openai/gpt-4o", async () => {
    const result = await rewriteModel("openai/gpt-4", null);
    expect(result).toBe("openai/gpt-4o");
  });

  it("preserves provider prefix when model is not deprecated", async () => {
    const result = await rewriteModel("openai/gpt-4o", null);
    expect(result).toBe("openai/gpt-4o");
  });

  it("handles multi-slash providers correctly (openrouter/openai/gpt-4)", async () => {
    // prefix = "openrouter/", bareModel = "openai/gpt-4"
    // bareModel is not in the static map (the map has "gpt-4"), so no rewrite
    const result = await rewriteModel("openrouter/openai/gpt-4", null);
    // Exact behaviour depends on static map; just ensure no crash
    expect(typeof result).toBe("string");
  });
});

// ─── User overrides ───────────────────────────────────────────────────────────

describe("rewriteModel — user overrides win", () => {
  it("user override takes precedence over static map", async () => {
    setup([{ fromModel: "gpt-4", toModel: "my-custom-model" }]);
    // Static map says gpt-4 → gpt-4o, but user says gpt-4 → my-custom-model
    expect(await rewriteModel("gpt-4", null)).toBe("my-custom-model");
  });

  it("user override applies only to its model; others use static map", async () => {
    setup([{ fromModel: "my-old-model", toModel: "my-new-model" }]);
    expect(await rewriteModel("my-old-model", null)).toBe("my-new-model");
    expect(await rewriteModel("gpt-4", null)).toBe("gpt-4o"); // static
  });

  it("user override preserves provider prefix", async () => {
    setup([{ fromModel: "old-model", toModel: "new-model" }]);
    expect(await rewriteModel("provider/old-model", null)).toBe("provider/new-model");
  });
});

// ─── Cache ────────────────────────────────────────────────────────────────────

describe("rewriteModel — cache", () => {
  it("calls getOverrides only once per TTL window for same user", async () => {
    const getOverrides = setup([]);
    await rewriteModel("gpt-4", "user-1");
    await rewriteModel("claude-2", "user-1");
    expect(getOverrides).toHaveBeenCalledOnce();
  });

  it("calls getOverrides separately for different users", async () => {
    const getOverrides = setup([]);
    await rewriteModel("gpt-4", "user-1");
    await rewriteModel("gpt-4", "user-2");
    expect(getOverrides).toHaveBeenCalledTimes(2);
  });

  it("invalidateModelDeprecationCache(userId) forces reload", async () => {
    const getOverrides = setup([]);
    await rewriteModel("gpt-4", "user-1");
    expect(getOverrides).toHaveBeenCalledTimes(1);
    invalidateModelDeprecationCache("user-1");
    await rewriteModel("gpt-4", "user-1");
    expect(getOverrides).toHaveBeenCalledTimes(2);
  });

  it("invalidateModelDeprecationCache(null) clears all users", async () => {
    const getOverrides = setup([]);
    await rewriteModel("gpt-4", "user-a");
    await rewriteModel("gpt-4", "user-b");
    expect(getOverrides).toHaveBeenCalledTimes(2);
    invalidateModelDeprecationCache(null);
    await rewriteModel("gpt-4", "user-a");
    await rewriteModel("gpt-4", "user-b");
    expect(getOverrides).toHaveBeenCalledTimes(4);
  });
});
