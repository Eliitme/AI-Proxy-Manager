/**
 * Unit tests for open-sse/services/comboStrategy.js
 *
 * Tests cover:
 *   - selectComboModel — ordered strategy
 *   - selectComboModel — round-robin strategy (distribution, modulo cycling)
 *   - selectComboModel — weighted strategy (probability distribution)
 *   - selectComboModel — cost-optimized strategy
 *   - skipModels filtering
 *   - empty pool / empty models edge cases
 *   - setPricingLookup injection
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  selectComboModel,
  setPricingLookup,
} from "../../open-sse/services/comboStrategy.js";

// Mock circuit breaker to avoid side-effects from initCircuitBreaker state
vi.mock("../../open-sse/services/circuitBreaker.js", () => ({
  isOpen: vi.fn(() => false),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCombo(overrides = {}) {
  return {
    id: "combo-" + Math.random().toString(36).slice(2),
    strategy: "ordered",
    models: ["model-a", "model-b", "model-c"],
    weights: undefined,
    ...overrides,
  };
}

// ─── ordered strategy ─────────────────────────────────────────────────────────

describe("selectComboModel — ordered", () => {
  it("returns first model in pool", async () => {
    const combo = makeCombo({ strategy: "ordered", models: ["model-a", "model-b"] });
    expect(await selectComboModel(combo)).toBe("model-a");
  });

  it("returns null when models list is empty", async () => {
    const combo = makeCombo({ strategy: "ordered", models: [] });
    expect(await selectComboModel(combo)).toBeNull();
  });

  it("skips models in skipModels set", async () => {
    const combo = makeCombo({ strategy: "ordered", models: ["model-a", "model-b", "model-c"] });
    const result = await selectComboModel(combo, { skipModels: new Set(["model-a"]) });
    expect(result).toBe("model-b");
  });

  it("returns null when all models are in skipModels", async () => {
    const combo = makeCombo({ strategy: "ordered", models: ["model-a"] });
    const result = await selectComboModel(combo, { skipModels: new Set(["model-a"]) });
    expect(result).toBeNull();
  });

  it("default strategy is ordered when strategy is undefined", async () => {
    const combo = makeCombo({ strategy: undefined, models: ["model-x", "model-y"] });
    expect(await selectComboModel(combo)).toBe("model-x");
  });
});

// ─── round-robin strategy ─────────────────────────────────────────────────────

describe("selectComboModel — round-robin", () => {
  it("cycles through all models across consecutive calls", async () => {
    // Use a unique combo ID so the counter is fresh
    const combo = makeCombo({ strategy: "round-robin", models: ["m1", "m2", "m3"] });
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(await selectComboModel(combo));
    }
    // Should cycle m1, m2, m3, m1, m2, m3
    expect(results[0]).toBe("m1");
    expect(results[1]).toBe("m2");
    expect(results[2]).toBe("m3");
    expect(results[3]).toBe("m1");
    expect(results[4]).toBe("m2");
    expect(results[5]).toBe("m3");
  });

  it("different combo IDs have independent counters", async () => {
    const combo1 = makeCombo({ strategy: "round-robin", models: ["a", "b"] });
    const combo2 = makeCombo({ strategy: "round-robin", models: ["x", "y"] });
    expect(await selectComboModel(combo1)).toBe("a");
    expect(await selectComboModel(combo2)).toBe("x");
    expect(await selectComboModel(combo1)).toBe("b");
    expect(await selectComboModel(combo2)).toBe("y");
  });

  it("skips models in skipModels set during round-robin", async () => {
    const combo = makeCombo({ strategy: "round-robin", models: ["a", "b", "c"] });
    // Skip "a" — should still pick from b, c
    const result = await selectComboModel(combo, { skipModels: new Set(["a"]) });
    expect(["b", "c"]).toContain(result);
  });
});

// ─── weighted strategy ────────────────────────────────────────────────────────

describe("selectComboModel — weighted", () => {
  it("returns one of the eligible models", async () => {
    const combo = makeCombo({
      strategy: "weighted",
      models: ["cheap", "expensive"],
      weights: [9, 1],
    });
    const result = await selectComboModel(combo);
    expect(["cheap", "expensive"]).toContain(result);
  });

  it("heavily-weighted model is selected most of the time (probabilistic)", async () => {
    const combo = makeCombo({
      strategy: "weighted",
      models: ["dominant", "rare"],
      weights: [99, 1],
    });
    const counts = { dominant: 0, rare: 0 };
    for (let i = 0; i < 100; i++) {
      const r = await selectComboModel(combo);
      counts[r] = (counts[r] || 0) + 1;
    }
    // With weight 99:1, dominant should win at least 80% of the time
    expect(counts.dominant).toBeGreaterThan(80);
  });

  it("falls back to equal probability when no weights provided", async () => {
    const combo = makeCombo({
      strategy: "weighted",
      models: ["a", "b"],
      weights: undefined,
    });
    // Should not throw; returns one of the models
    const result = await selectComboModel(combo);
    expect(["a", "b"]).toContain(result);
  });

  it("falls back to equal probability when weights length mismatches models", async () => {
    const combo = makeCombo({
      strategy: "weighted",
      models: ["a", "b", "c"],
      weights: [1, 2], // only 2 weights for 3 models
    });
    const result = await selectComboModel(combo);
    expect(["a", "b", "c"]).toContain(result);
  });
});

// ─── cost-optimized strategy ──────────────────────────────────────────────────

describe("selectComboModel — cost-optimized", () => {
  beforeEach(() => {
    setPricingLookup(null);
  });

  it("returns first model when no pricing lookup is set", async () => {
    const combo = makeCombo({
      strategy: "cost-optimized",
      models: ["provider/expensive", "provider/cheap"],
    });
    // No pricing → falls back to pool[0]
    expect(await selectComboModel(combo)).toBe("provider/expensive");
  });

  it("selects cheapest model based on injected pricing", async () => {
    const pricing = {
      "provider/cheap": { inputCost: 0.0001, outputCost: 0.0002 },
      "provider/mid": { inputCost: 0.001, outputCost: 0.002 },
      "provider/expensive": { inputCost: 0.01, outputCost: 0.02 },
    };
    setPricingLookup(async (provider, model) => pricing[`${provider}/${model}`] ?? null);

    const combo = makeCombo({
      strategy: "cost-optimized",
      models: ["provider/expensive", "provider/mid", "provider/cheap"],
    });
    expect(await selectComboModel(combo)).toBe("provider/cheap");
  });

  it("falls back to pool[0] when pricing returns null for all models", async () => {
    setPricingLookup(async () => null);
    const combo = makeCombo({
      strategy: "cost-optimized",
      models: ["a/m1", "b/m2"],
    });
    expect(await selectComboModel(combo)).toBe("a/m1");
  });

  it("ignores models without a slash separator (no provider prefix)", async () => {
    setPricingLookup(async () => ({ inputCost: 0.001, outputCost: 0.001 }));
    const combo = makeCombo({
      strategy: "cost-optimized",
      models: ["no-slash-model", "provider/real-model"],
    });
    // no-slash-model → Infinity cost; provider/real-model is cheaper
    const result = await selectComboModel(combo);
    expect(result).toBe("provider/real-model");
  });
});

// ─── skipModels edge cases ────────────────────────────────────────────────────

describe("selectComboModel — skipModels", () => {
  it("returns null when all models are skipped", async () => {
    const combo = makeCombo({ models: ["a", "b"], strategy: "ordered" });
    const result = await selectComboModel(combo, { skipModels: new Set(["a", "b"]) });
    expect(result).toBeNull();
  });

  it("does not include skipped model in round-robin rotation", async () => {
    const combo = makeCombo({ strategy: "round-robin", models: ["a", "b"] });
    const results = new Set();
    for (let i = 0; i < 10; i++) {
      const r = await selectComboModel(combo, { skipModels: new Set(["a"]) });
      if (r) results.add(r);
    }
    expect(results.has("a")).toBe(false);
    expect(results.has("b")).toBe(true);
  });
});
