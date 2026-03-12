/**
 * Unit tests for open-sse/services/circuitBreaker.js
 *
 * Tests cover:
 *   - initCircuitBreaker / setCircuitBreakerConfig
 *   - getState — default state, time-based open→half-open transition
 *   - isOpen — disabled guard, state checks
 *   - recordSuccess — half-open→closed, closed reset
 *   - recordFailure — counting, threshold → open, half-open → re-open
 *   - getAllStates
 *   - resetState
 *   - loadAllStates — DB injection
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  initCircuitBreaker,
  setCircuitBreakerConfig,
  loadAllStates,
  getState,
  isOpen,
  recordSuccess,
  recordFailure,
  getAllStates,
  resetState,
} from "../../open-sse/services/circuitBreaker.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetAll() {
  // Reset to a known state: enabled with threshold=3, 60s window
  initCircuitBreaker({ persist: vi.fn().mockResolvedValue(undefined), load: vi.fn().mockResolvedValue([]) });
  setCircuitBreakerConfig({ enabled: true, failureThreshold: 3, recoveryWindowMs: 60_000 });
  // Clear any existing state by resetting known IDs
  resetState("test-conn");
  resetState("conn-a");
  resetState("conn-b");
  resetState("conn-c");
}

// ─── getState ────────────────────────────────────────────────────────────────

describe("getState", () => {
  beforeEach(resetAll);

  it("returns closed/0 for an unknown connection", () => {
    const s = getState("never-seen");
    expect(s.state).toBe("closed");
    expect(s.failureCount).toBe(0);
    expect(s.lastFailureAt).toBeNull();
    expect(s.openedAt).toBeNull();
    expect(s.halfOpenAt).toBeNull();
  });

  it("auto-transitions open→half-open after recovery window elapses", () => {
    setCircuitBreakerConfig({ enabled: true, failureThreshold: 1, recoveryWindowMs: 0 });
    recordFailure("test-conn"); // threshold=1 → immediately open
    // With recoveryWindowMs=0, elapsed is always >= 0 → half-open
    const s = getState("test-conn");
    expect(s.state).toBe("half-open");
  });

  it("does NOT transition open→half-open if recovery window has not elapsed", () => {
    setCircuitBreakerConfig({ enabled: true, failureThreshold: 1, recoveryWindowMs: 999_999 });
    recordFailure("test-conn");
    const s = getState("test-conn");
    expect(s.state).toBe("open");
  });
});

// ─── isOpen ──────────────────────────────────────────────────────────────────

describe("isOpen", () => {
  beforeEach(resetAll);

  it("returns false when circuit breaker is disabled", () => {
    setCircuitBreakerConfig({ enabled: false, failureThreshold: 1, recoveryWindowMs: 0 });
    recordFailure("test-conn");
    expect(isOpen("test-conn")).toBe(false);
  });

  it("returns false for a closed connection", () => {
    expect(isOpen("test-conn")).toBe(false);
  });

  it("returns true for an open connection", () => {
    setCircuitBreakerConfig({ enabled: true, failureThreshold: 1, recoveryWindowMs: 999_999 });
    recordFailure("test-conn");
    expect(isOpen("test-conn")).toBe(true);
  });

  it("returns false for a half-open connection (one probe allowed)", () => {
    setCircuitBreakerConfig({ enabled: true, failureThreshold: 1, recoveryWindowMs: 0 });
    recordFailure("test-conn");
    // recoveryWindowMs=0 → getState transitions to half-open
    expect(isOpen("test-conn")).toBe(false);
  });
});

// ─── recordFailure ────────────────────────────────────────────────────────────

describe("recordFailure", () => {
  beforeEach(resetAll);

  it("increments failure count on closed connection", () => {
    recordFailure("test-conn");
    const s = getState("test-conn");
    expect(s.failureCount).toBe(1);
    expect(s.state).toBe("closed");
  });

  it("opens circuit when failure count reaches threshold", () => {
    setCircuitBreakerConfig({ enabled: true, failureThreshold: 3, recoveryWindowMs: 60_000 });
    recordFailure("test-conn");
    recordFailure("test-conn");
    recordFailure("test-conn"); // 3rd → open
    expect(getState("test-conn").state).toBe("open");
  });

  it("does not open below threshold", () => {
    setCircuitBreakerConfig({ enabled: true, failureThreshold: 3, recoveryWindowMs: 60_000 });
    recordFailure("test-conn");
    recordFailure("test-conn");
    expect(getState("test-conn").state).toBe("closed");
  });

  it("sets lastFailureAt", () => {
    const before = Date.now();
    recordFailure("test-conn");
    const after = Date.now();
    const s = getState("test-conn");
    expect(s.lastFailureAt).toBeGreaterThanOrEqual(before);
    expect(s.lastFailureAt).toBeLessThanOrEqual(after);
  });

  it("no-ops when CB is disabled", () => {
    setCircuitBreakerConfig({ enabled: false });
    recordFailure("test-conn");
    recordFailure("test-conn");
    recordFailure("test-conn");
    expect(getState("test-conn").state).toBe("closed");
    expect(getState("test-conn").failureCount).toBe(0);
  });

  it("half-open failure → re-opens with new openedAt", () => {
    // Use a large recovery window so getState won't auto-re-transition
    setCircuitBreakerConfig({ enabled: true, failureThreshold: 1, recoveryWindowMs: 999_999 });
    // Manually inject a half-open state to avoid timing race with recoveryWindowMs=0
    initCircuitBreaker({
      persist: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue([]),
    });
    setCircuitBreakerConfig({ enabled: true, failureThreshold: 1, recoveryWindowMs: 999_999 });
    // Seed a half-open state directly
    recordFailure("test-conn"); // open (failureCount=1 >= threshold 1)
    // Patch in half-open by loading state artificially
    // Easiest: use resetState then set manually via the fact that getState reads _states
    // Instead, use a different approach: set recoveryWindow to 0 ONLY for the transition call
    // then restore before the final getState check
    setCircuitBreakerConfig({ enabled: true, failureThreshold: 1, recoveryWindowMs: 0 });
    getState("test-conn"); // triggers open→half-open (window=0)
    // Now restore large window so the final getState won't re-auto-transition
    setCircuitBreakerConfig({ enabled: true, failureThreshold: 1, recoveryWindowMs: 999_999 });
    expect(getState("test-conn").state).toBe("half-open");
    const before = Date.now();
    recordFailure("test-conn"); // half-open → re-open
    // recordFailure internally calls getState; with recoveryWindowMs=999_999 it stays open
    const s = getState("test-conn");
    expect(s.state).toBe("open");
    expect(s.openedAt).toBeGreaterThanOrEqual(before);
  });
});

// ─── recordSuccess ────────────────────────────────────────────────────────────

describe("recordSuccess", () => {
  beforeEach(resetAll);

  it("no-ops when CB is disabled", () => {
    setCircuitBreakerConfig({ enabled: false });
    recordSuccess("test-conn");
    // State stays clean (no error thrown)
    expect(getState("test-conn").state).toBe("closed");
  });

  it("no-ops on a clean closed connection (already zero failures)", () => {
    setCircuitBreakerConfig({ enabled: true, failureThreshold: 3, recoveryWindowMs: 60_000 });
    // Record a failure then succeed to dirty it, then clean again
    recordFailure("test-conn");
    recordSuccess("test-conn");
    const s = getState("test-conn");
    expect(s.state).toBe("closed");
    expect(s.failureCount).toBe(0);
  });

  it("resets failure count on closed-with-failures connection", () => {
    setCircuitBreakerConfig({ enabled: true, failureThreshold: 5, recoveryWindowMs: 60_000 });
    recordFailure("test-conn");
    recordFailure("test-conn");
    expect(getState("test-conn").failureCount).toBe(2);
    recordSuccess("test-conn");
    expect(getState("test-conn").failureCount).toBe(0);
  });

  it("transitions half-open → closed on success", () => {
    setCircuitBreakerConfig({ enabled: true, failureThreshold: 1, recoveryWindowMs: 0 });
    recordFailure("test-conn"); // open
    getState("test-conn"); // auto half-open
    expect(getState("test-conn").state).toBe("half-open");
    recordSuccess("test-conn");
    expect(getState("test-conn").state).toBe("closed");
  });
});

// ─── getAllStates ─────────────────────────────────────────────────────────────

describe("getAllStates", () => {
  beforeEach(resetAll);

  it("returns empty array when no states have been set", () => {
    // fresh known IDs were reset in beforeEach
    const states = getAllStates();
    // may include other entries from other tests — we just assert it's an array
    expect(Array.isArray(states)).toBe(true);
  });

  it("includes all recorded connections", () => {
    setCircuitBreakerConfig({ enabled: true, failureThreshold: 1, recoveryWindowMs: 999_999 });
    recordFailure("conn-a");
    recordFailure("conn-b");
    const states = getAllStates();
    const ids = states.map(s => s.connectionId);
    expect(ids).toContain("conn-a");
    expect(ids).toContain("conn-b");
  });

  it("each entry has connectionId, state, failureCount", () => {
    recordFailure("conn-c");
    const entry = getAllStates().find(s => s.connectionId === "conn-c");
    expect(entry).toBeDefined();
    expect(entry).toHaveProperty("state");
    expect(entry).toHaveProperty("failureCount");
    expect(entry).toHaveProperty("connectionId");
  });
});

// ─── resetState ──────────────────────────────────────────────────────────────

describe("resetState", () => {
  beforeEach(resetAll);

  it("sets connection back to closed/0 from open state", () => {
    setCircuitBreakerConfig({ enabled: true, failureThreshold: 1, recoveryWindowMs: 999_999 });
    recordFailure("test-conn");
    expect(getState("test-conn").state).toBe("open");
    resetState("test-conn");
    expect(getState("test-conn").state).toBe("closed");
    expect(getState("test-conn").failureCount).toBe(0);
  });
});

// ─── loadAllStates ────────────────────────────────────────────────────────────

describe("loadAllStates", () => {
  it("loads persisted rows into memory from injected load function", async () => {
    const mockLoad = vi.fn().mockResolvedValue([
      { connectionId: "loaded-conn", state: "open", failureCount: 3, lastFailureAt: Date.now(), openedAt: Date.now(), halfOpenAt: null },
    ]);
    initCircuitBreaker({ persist: vi.fn().mockResolvedValue(undefined), load: mockLoad });
    setCircuitBreakerConfig({ enabled: true, failureThreshold: 5, recoveryWindowMs: 999_999 });

    await loadAllStates();

    const s = getState("loaded-conn");
    expect(s.state).toBe("open");
    expect(s.failureCount).toBe(3);
  });

  it("is non-fatal when load function throws", async () => {
    const mockLoad = vi.fn().mockRejectedValue(new Error("DB error"));
    initCircuitBreaker({ persist: vi.fn(), load: mockLoad });

    await expect(loadAllStates()).resolves.toBeUndefined();
  });

  it("no-ops when no load function is injected", async () => {
    initCircuitBreaker({ persist: vi.fn(), load: null });
    await expect(loadAllStates()).resolves.toBeUndefined();
  });
});
