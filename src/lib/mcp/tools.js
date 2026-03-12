/**
 * MCP Tool Schemas — defines all tool names, descriptions, and input schemas.
 *
 * Tools:
 *   Read-only: get_providers, get_combos, get_models, get_proxy_status,
 *              get_circuit_breaker_state, get_usage_stats
 *   Admin:     create_combo, delete_combo, flush_cache, add_wildcard_route
 */

export const TOOLS = [
  // ── Read-only tools ────────────────────────────────────────────────────────

  {
    name: "get_providers",
    description: "Returns the list of active provider connections configured in 9router.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  {
    name: "get_combos",
    description: "Returns all defined model combos (named groups of models with fallback strategies).",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  {
    name: "get_models",
    description: "Returns all configured model aliases.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  {
    name: "get_proxy_status",
    description: "Returns overall proxy health: provider count, active connections, circuit breaker states.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  {
    name: "get_circuit_breaker_state",
    description: "Returns circuit breaker states for all or a specific provider connection.",
    inputSchema: {
      type: "object",
      properties: {
        connectionId: {
          type: "string",
          description: "Optional connection UUID to filter by.",
        },
      },
      required: [],
    },
  },

  {
    name: "get_usage_stats",
    description: "Returns recent usage statistics (token counts, cost, request count) from usage_history.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of recent records to return (default: 20, max: 100).",
        },
      },
      required: [],
    },
  },

  // ── Admin-only tools ───────────────────────────────────────────────────────

  {
    name: "create_combo",
    description: "[Admin] Creates a new model combo with a name, models list, and optional strategy.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Unique combo name (used as model string in requests).",
        },
        models: {
          type: "array",
          items: { type: "string" },
          description: "Ordered list of model strings (e.g. 'openai/gpt-4o').",
        },
        strategy: {
          type: "string",
          enum: ["ordered", "round-robin", "weighted", "cost-optimized"],
          description: "Model selection strategy (default: ordered).",
        },
        weights: {
          type: "array",
          items: { type: "number" },
          description: "Weights for weighted strategy (must match models length).",
        },
      },
      required: ["name", "models"],
    },
  },

  {
    name: "delete_combo",
    description: "[Admin] Deletes a model combo by name.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the combo to delete.",
        },
      },
      required: ["name"],
    },
  },

  {
    name: "flush_cache",
    description: "[Admin] Flushes all in-memory request caches (signature and semantic).",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  {
    name: "add_wildcard_route",
    description: "[Admin] Adds a wildcard model routing rule (glob pattern → target model).",
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Glob pattern to match (e.g. 'anthropic/*', 'gpt-4*').",
        },
        target: {
          type: "string",
          description: "Target model string to route to (e.g. 'openai/gpt-4o').",
        },
        priority: {
          type: "number",
          description: "Route priority — lower values are checked first (default: 100).",
        },
      },
      required: ["pattern", "target"],
    },
  },
];

/** Set of admin-only tool names */
export const ADMIN_TOOLS = new Set(["create_combo", "delete_combo", "flush_cache", "add_wildcard_route"]);
