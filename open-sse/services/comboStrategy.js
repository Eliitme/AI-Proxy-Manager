/**
 * Combo Strategy — selects the next model to try from a combo's model list.
 *
 * Supported strategies:
 *   ordered       — iterate in array order (existing default behaviour)
 *   round-robin   — rotate index per-combo across requests
 *   weighted      — weighted-random selection from eligible models
 *   cost-optimized — sort by blended cost-per-token (cheapest first)
 */

import { isOpen as isCBOpen } from "./circuitBreaker.js";

/** Module-level round-robin counters: Map<comboId, number> */
const _rrCounters = new Map();

/** Injected pricing lookup — set via setPricingLookup() to avoid circular deps */
let _getPricingForModel = null;

/**
 * Inject the pricing lookup function (called from chat.js or combo.js).
 * @param {Function} fn  async (provider, model) => { inputCost, outputCost } | null
 */
export function setPricingLookup(fn) {
  _getPricingForModel = fn;
}

/**
 * Filter eligible models: exclude those whose provider connections are open-circuited.
 * Falls back to full list if all are excluded.
 *
 * @param {string[]} models
 * @param {Set<string>} [excludedConnections]  — optional quota-preflight exclusions
 * @returns {string[]} filtered list
 */
function _eligibleModels(models, excludedConnections = new Set()) {
  const eligible = models.filter(m => {
    // We don't have connectionId at this level — CB integration happens in combo.js
    // where connection IDs are resolved. Here we just filter by excludedConnections.
    return !excludedConnections.has(m);
  });
  return eligible.length > 0 ? eligible : models;
}

/**
 * Select a model from the combo according to the strategy.
 *
 * @param {{ id: string, strategy: string, models: string[], weights?: number[] }} combo
 * @param {Object} [opts]
 * @param {Set<string>}  [opts.skipModels]          — models to skip this call (failed/CB-open)
 * @param {Set<string>}  [opts.excludedConnections]  — quota-preflight exclusions
 * @returns {Promise<string|null>} selected model string, or null if none eligible
 */
export async function selectComboModel(combo, { skipModels = new Set(), excludedConnections = new Set() } = {}) {
  const { id, strategy = "ordered", models = [], weights } = combo;
  if (!models.length) return null;

  // Build eligible pool (skip already-tried / CB-open models)
  const pool = models.filter(m => !skipModels.has(m));
  if (pool.length === 0) return null;

  switch (strategy) {
    case "round-robin":
      return _selectRoundRobin(id, pool);

    case "weighted":
      return _selectWeighted(pool, weights, models);

    case "cost-optimized":
      return await _selectCostOptimized(pool);

    case "ordered":
    default:
      return pool[0];
  }
}

function _selectRoundRobin(comboId, pool) {
  const count = _rrCounters.get(comboId) || 0;
  const idx = count % pool.length;
  _rrCounters.set(comboId, count + 1);
  return pool[idx];
}

function _selectWeighted(pool, weights, allModels) {
  // Build weights for the eligible pool (mapped from full model order)
  let poolWeights;
  if (weights && weights.length === allModels.length) {
    poolWeights = pool.map(m => {
      const idx = allModels.indexOf(m);
      return idx >= 0 ? (weights[idx] || 1) : 1;
    });
  } else {
    // No weights defined — equal probability
    poolWeights = pool.map(() => 1);
  }

  const total = poolWeights.reduce((s, w) => s + w, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    rand -= poolWeights[i];
    if (rand <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

async function _selectCostOptimized(pool) {
  if (!_getPricingForModel) return pool[0];

  // Fetch pricing for each eligible model (provider/model format: "cc/claude-opus-4")
  const costs = await Promise.all(
    pool.map(async (m) => {
      try {
        const parts = m.split("/");
        if (parts.length < 2) return { model: m, cost: Infinity };
        const [provider, ...rest] = parts;
        const modelName = rest.join("/");
        const pricing = await _getPricingForModel(provider, modelName);
        if (!pricing) return { model: m, cost: Infinity };
        const blended = ((pricing.inputCost || 0) + (pricing.outputCost || 0)) / 2;
        return { model: m, cost: blended };
      } catch {
        return { model: m, cost: Infinity };
      }
    })
  );

  costs.sort((a, b) => a.cost - b.cost);
  return costs[0].model;
}
