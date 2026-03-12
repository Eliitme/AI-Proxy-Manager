/**
 * Shared combo (model combo) handling with fallback support.
 * Extended with strategy-aware model selection and circuit breaker / quota integration.
 */

import { checkFallbackError, formatRetryAfter } from "./accountFallback.js";
import { unavailableResponse } from "../utils/error.js";
import { selectComboModel } from "./comboStrategy.js";
import { isOpen as isCBOpen, recordFailure as cbRecordFailure, recordSuccess as cbRecordSuccess } from "./circuitBreaker.js";

/**
 * Get combo models from combos data (legacy helper — returns models array only).
 * @param {string} modelStr - Model string to check
 * @param {Array|Object} combosData - Array of combos or object with combos
 * @returns {string[]|null} Array of models or null if not a combo
 */
export function getComboModelsFromData(modelStr, combosData) {
  // Don't check if it's in provider/model format
  if (modelStr.includes("/")) return null;

  // Handle both array and object formats
  const combos = Array.isArray(combosData) ? combosData : (combosData?.combos || []);

  const combo = combos.find(c => c.name === modelStr);
  if (combo && combo.models && combo.models.length > 0) {
    return combo.models;
  }
  return null;
}

/**
 * Handle combo chat with strategy-aware fallback.
 *
 * @param {Object} options
 * @param {Object} options.body                   — request body
 * @param {string[]} options.models               — ordered model list (from combo.models)
 * @param {Object}  [options.combo]               — full combo record (with strategy/weights)
 * @param {Function} options.handleSingleModel    — (body, modelStr) => Promise<Response>
 * @param {Object}  options.log                   — logger
 * @param {Set<string>} [options.excludedConnections] — quota-preflight exclusions
 * @returns {Promise<Response>}
 */
export async function handleComboChat({ body, models, combo, handleSingleModel, log, excludedConnections = new Set() }) {
  let lastError = null;
  let earliestRetryAfter = null;
  let lastStatus = null;

  // Build effective combo object for strategy selection
  const comboObj = combo || { id: "default", strategy: "ordered", models, weights: null };

  // Determine which models are open-circuit (to exclude from initial candidates)
  const cbOpenSet = new Set(models.filter(m => {
    // At this level we don't have connectionId, just model string.
    // Circuit breaker filtering at connection level is done in getProviderCredentials.
    // Here we just skip models in the quota-preflight exclusion set.
    return excludedConnections.has(m);
  }));

  const triedModels = new Set();
  let maxAttempts = models.length;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Select next model according to strategy, skipping already-tried ones
    const modelStr = await selectComboModel(comboObj, { skipModels: triedModels });
    if (!modelStr) break;

    triedModels.add(modelStr);
    log.info("COMBO", `Trying model ${attempt + 1}/${models.length}: ${modelStr}`);

    try {
      const result = await handleSingleModel(body, modelStr);

      // Success (2xx) — record CB success and return
      if (result.ok) {
        log.info("COMBO", `Model ${modelStr} succeeded`);
        cbRecordSuccess(modelStr);
        return result;
      }

      // Extract error info from response
      let errorText = result.statusText || "";
      let retryAfter = null;
      try {
        const errorBody = await result.clone().json();
        errorText = errorBody?.error?.message || errorBody?.error || errorBody?.message || errorText;
        retryAfter = errorBody?.retryAfter || null;
      } catch {
        // Ignore JSON parse errors
      }

      // Track earliest retryAfter across all combo models
      if (retryAfter && (!earliestRetryAfter || new Date(retryAfter) < new Date(earliestRetryAfter))) {
        earliestRetryAfter = retryAfter;
      }

      // Normalize error text to string (Worker-safe)
      if (typeof errorText !== "string") {
        try { errorText = JSON.stringify(errorText); } catch { errorText = String(errorText); }
      }

      // Check if should fallback to next model
      const { shouldFallback } = checkFallbackError(result.status, errorText);

      if (!shouldFallback) {
        log.warn("COMBO", `Model ${modelStr} failed (no fallback)`, { status: result.status });
        return result;
      }

      // Fallback to next model — record CB failure
      cbRecordFailure(modelStr);
      lastError = errorText || String(result.status);
      if (!lastStatus) lastStatus = result.status;
      log.warn("COMBO", `Model ${modelStr} failed, trying next`, { status: result.status });
    } catch (error) {
      // Catch unexpected exceptions to ensure fallback continues
      cbRecordFailure(modelStr);
      lastError = error.message || String(error);
      if (!lastStatus) lastStatus = 500;
      log.warn("COMBO", `Model ${modelStr} threw error, trying next`, { error: lastError });
    }
  }

  // All models failed
  const status = 406;
  const msg = lastError || "All combo models unavailable";

  if (earliestRetryAfter) {
    const retryHuman = formatRetryAfter(earliestRetryAfter);
    log.warn("COMBO", `All models failed | ${msg} (${retryHuman})`);
    return unavailableResponse(status, msg, earliestRetryAfter, retryHuman);
  }

  log.warn("COMBO", `All models failed | ${msg}`);
  return new Response(
    JSON.stringify({ error: { message: msg } }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
