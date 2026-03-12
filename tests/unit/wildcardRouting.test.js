/**
 * Unit tests for open-sse/services/wildcardRouting.js
 *
 * Tests cover:
 *   - resolveWildcard — no routes, exact match, glob patterns
 *   - Priority ordering
 *   - invalidateWildcardCache
 *   - Cache TTL behaviour
 *   - No getRoutes injected
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  initWildcardRouting,
  invalidateWildcardCache,
  resolveWildcard,
} from "../../open-sse/services/wildcardRouting.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setup(routes) {
  const getRoutes = vi.fn().mockResolvedValue(routes);
  initWildcardRouting({ getRoutes });
  invalidateWildcardCache(null);
  return getRoutes;
}

// ─── No routes ────────────────────────────────────────────────────────────────

describe("resolveWildcard — no routes", () => {
  it("returns null when route list is empty", async () => {
    setup([]);
    expect(await resolveWildcard("gpt-4", null)).toBeNull();
  });

  it("returns null when no getRoutes is injected", async () => {
    initWildcardRouting({ getRoutes: null });
    invalidateWildcardCache(null);
    expect(await resolveWildcard("gpt-4", null)).toBeNull();
  });
});

// ─── Exact match ──────────────────────────────────────────────────────────────

describe("resolveWildcard — exact match", () => {
  it("returns target for exact model name", async () => {
    setup([{ pattern: "gpt-4", target: "openai/gpt-4o", priority: 10 }]);
    expect(await resolveWildcard("gpt-4", null)).toBe("openai/gpt-4o");
  });

  it("returns null for non-matching model", async () => {
    setup([{ pattern: "gpt-4", target: "openai/gpt-4o", priority: 10 }]);
    expect(await resolveWildcard("claude-3", null)).toBeNull();
  });
});

// ─── Glob patterns ────────────────────────────────────────────────────────────

describe("resolveWildcard — glob patterns", () => {
  beforeEach(() => invalidateWildcardCache(null));

  it("matches wildcard suffix (gpt-4*)", async () => {
    setup([{ pattern: "gpt-4*", target: "openai/gpt-4o", priority: 10 }]);
    expect(await resolveWildcard("gpt-4-turbo", null)).toBe("openai/gpt-4o");
    expect(await resolveWildcard("gpt-4o", null)).toBe("openai/gpt-4o");
    expect(await resolveWildcard("gpt-4", null)).toBe("openai/gpt-4o");
  });

  it("matches provider/* glob", async () => {
    setup([{ pattern: "anthropic/*", target: "cc/claude-opus-4", priority: 10 }]);
    expect(await resolveWildcard("anthropic/claude-3-5-sonnet", null)).toBe("cc/claude-opus-4");
    expect(await resolveWildcard("anthropic/anything", null)).toBe("cc/claude-opus-4");
  });

  it("does not match unrelated provider", async () => {
    setup([{ pattern: "anthropic/*", target: "cc/claude-opus-4", priority: 10 }]);
    expect(await resolveWildcard("openai/gpt-4", null)).toBeNull();
  });

  it("matches double-wildcard ** across path segments", async () => {
    setup([{ pattern: "openai/**", target: "openrouter/openai/gpt-4o", priority: 10 }]);
    expect(await resolveWildcard("openai/gpt-4/preview", null)).toBe("openrouter/openai/gpt-4o");
  });
});

// ─── Priority ordering ────────────────────────────────────────────────────────

describe("resolveWildcard — priority ordering", () => {
  it("returns the first matching route (lower priority value wins)", async () => {
    // Routes should be pre-sorted by priority ASC from DB; we simulate that
    setup([
      { pattern: "gpt-*", target: "target-priority-5", priority: 5 },
      { pattern: "gpt-4*", target: "target-priority-10", priority: 10 },
    ]);
    const result = await resolveWildcard("gpt-4o", null);
    expect(result).toBe("target-priority-5");
  });

  it("falls through to second route if first doesn't match", async () => {
    setup([
      { pattern: "claude-*", target: "target-priority-5", priority: 5 },
      { pattern: "gpt-*", target: "target-priority-10", priority: 10 },
    ]);
    expect(await resolveWildcard("gpt-4", null)).toBe("target-priority-10");
  });
});

// ─── Cache ────────────────────────────────────────────────────────────────────

describe("resolveWildcard — cache", () => {
  it("calls getRoutes only once per TTL window for same user", async () => {
    const getRoutes = setup([]);
    await resolveWildcard("gpt-4", "user-1");
    await resolveWildcard("gpt-4o", "user-1");
    expect(getRoutes).toHaveBeenCalledOnce();
  });

  it("calls getRoutes separately for different users", async () => {
    const getRoutes = setup([]);
    await resolveWildcard("gpt-4", "user-1");
    await resolveWildcard("gpt-4", "user-2");
    expect(getRoutes).toHaveBeenCalledTimes(2);
  });

  it("invalidateWildcardCache(userId) forces reload for that user only", async () => {
    const getRoutes = setup([]);
    await resolveWildcard("gpt-4", "user-1");
    await resolveWildcard("gpt-4", "user-2");
    expect(getRoutes).toHaveBeenCalledTimes(2);

    invalidateWildcardCache("user-1");
    await resolveWildcard("gpt-4", "user-1"); // re-fetch
    await resolveWildcard("gpt-4", "user-2"); // still cached
    expect(getRoutes).toHaveBeenCalledTimes(3);
  });

  it("invalidateWildcardCache(null) clears all", async () => {
    const getRoutes = setup([]);
    await resolveWildcard("gpt-4", "user-a");
    invalidateWildcardCache(null);
    await resolveWildcard("gpt-4", "user-a");
    expect(getRoutes).toHaveBeenCalledTimes(2);
  });
});
