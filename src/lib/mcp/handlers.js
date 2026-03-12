/**
 * MCP Tool Handlers — implements each tool by calling existing DB / service functions.
 */

import {
  getProviderConnections,
  getCombos,
  getComboByName,
  createCombo,
  deleteCombo,
  getModelAliases,
  getWildcardRoutes,
  createWildcardRoute,
  invalidateWildcardCache,
} from "@/lib/localDb";
import { getAllStates as getCBStates } from "open-sse/services/circuitBreaker.js";
import { flushAll as flushRequestCache, getCacheStats } from "open-sse/services/requestCache.js";
import { invalidateWildcardCache as _invalidateWildcardCache } from "open-sse/services/wildcardRouting.js";

/** Shared usage DB import (may not exist in all environments) */
let _getUsage = null;
try {
  const usageDb = await import("@/lib/usageDb.js");
  _getUsage = usageDb.getRecentUsage || null;
} catch {
  // usage DB optional
}

// ─── Read-only handlers ────────────────────────────────────────────────────────

export async function handle_get_providers() {
  const connections = await getProviderConnections({ isActive: true }, null);
  return connections.map(c => ({
    id: c.id,
    provider: c.provider,
    name: c.name || c.provider,
    authType: c.authType || "apikey",
    isActive: c.isActive !== false,
  }));
}

export async function handle_get_combos() {
  const combos = await getCombos(null);
  return combos.map(c => ({
    id: c.id,
    name: c.name,
    models: c.models || [],
    strategy: c.strategy || "ordered",
    weights: c.weights || null,
  }));
}

export async function handle_get_models() {
  const aliases = await getModelAliases(null);
  return aliases;
}

export async function handle_get_proxy_status() {
  const connections = await getProviderConnections({ isActive: true }, null);
  const cbStates = getCBStates();
  const openCount = Object.values(cbStates).filter(s => s.state === "open").length;
  const cacheStats = getCacheStats();
  return {
    totalConnections: connections.length,
    providers: [...new Set(connections.map(c => c.provider))],
    circuitBreaker: {
      open: openCount,
      total: Object.keys(cbStates).length,
    },
    cache: cacheStats,
  };
}

export async function handle_get_circuit_breaker_state({ connectionId } = {}) {
  const states = getCBStates();
  if (connectionId) {
    return states[connectionId] || { state: "closed", failureCount: 0 };
  }
  return states;
}

export async function handle_get_usage_stats({ limit = 20 } = {}) {
  const cap = Math.min(limit, 100);
  if (_getUsage) {
    return await _getUsage(cap);
  }
  return { message: "Usage DB not available", limit: cap };
}

// ─── Admin-only handlers ───────────────────────────────────────────────────────

export async function handle_create_combo({ name, models, strategy = "ordered", weights = null }) {
  if (!name || !Array.isArray(models) || models.length === 0) {
    throw new Error("name and models (non-empty array) are required");
  }
  const combo = await createCombo({ name, models, strategy, weights, enabled: true });
  return combo;
}

export async function handle_delete_combo({ name }) {
  if (!name) throw new Error("name is required");
  const existing = await getComboByName(name, null);
  if (!existing) throw new Error(`Combo '${name}' not found`);
  await deleteCombo(existing.id, null);
  return { deleted: true, name };
}

export async function handle_flush_cache() {
  flushRequestCache();
  return { flushed: true };
}

export async function handle_add_wildcard_route({ pattern, target, priority = 100 }) {
  if (!pattern || !target) throw new Error("pattern and target are required");
  const route = await createWildcardRoute({ userId: null, pattern, target, priority });
  // Invalidate cache so new route is picked up immediately
  _invalidateWildcardCache(null);
  return route;
}

// ─── Dispatch table ────────────────────────────────────────────────────────────

export const HANDLERS = {
  get_providers: handle_get_providers,
  get_combos: handle_get_combos,
  get_models: handle_get_models,
  get_proxy_status: handle_get_proxy_status,
  get_circuit_breaker_state: handle_get_circuit_breaker_state,
  get_usage_stats: handle_get_usage_stats,
  create_combo: handle_create_combo,
  delete_combo: handle_delete_combo,
  flush_cache: handle_flush_cache,
  add_wildcard_route: handle_add_wildcard_route,
};
