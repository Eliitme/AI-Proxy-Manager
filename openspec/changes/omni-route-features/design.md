## Context

9router is a Next.js 16 + Node.js AI proxy gateway. Chat requests flow through:

```
POST /api/v1/chat/completions
  → handleChat()          [auth, combo detect]
    → handleComboChat()   [ordered fallback loop across combo models]
      → handleSingleModelChat()   [account selection loop per model]
        → handleChatCore()        [format translation, upstream fetch, response routing]
```

The database is PostgreSQL (pg pool). There is no existing response cache, no circuit breaker state, no IP filtering, and no MCP server. Combo records are simple `{ name, models: string[] }` — no strategy or weight fields. All routing decisions live in `open-sse/services/` (pure JS, no framework dependency) and `src/sse/handlers/chat.js`.

Existing packages already present: `pg`, `uuid`, `jose`, `undici`, `express`, `bcryptjs`.

## Goals / Non-Goals

**Goals:**
- Add 10 new capabilities from the proposal without breaking the existing request pipeline
- Keep all new logic in thin, composable middleware layers callable from `handleChat` / `handleComboChat`
- Reuse existing DB (Postgres) — add tables/columns via numbered migration files
- Expose new config in the existing dashboard UI (Settings, Combos editor, new panels)
- Ship an MCP server as a separate optional process (stdio) and as a Next.js API route (HTTP/SSE)

**Non-Goals:**
- Redis or external cache — all caching is in-process LRU Maps
- Distributed circuit breaker state across multiple 9router instances
- Replacing the existing account-level fallback/lock mechanism in `accountFallback.js`
- A/B testing or traffic splitting beyond the combo strategy extensions

## Decisions

### D1 — Middleware Chain in `handleChat`

**Decision**: Wrap the existing `handleChat` entry point with a composable pre/post middleware array rather than scattering logic across files.

New pipeline order:
```
1. IP filter check              (ip-filtering)
2. Idempotency check            (request-idempotency) → return cached response if hit
3. Model deprecation rewrite    (model-deprecation-map) → mutate body.model
4. Wildcard model resolution    (wildcard-model-routing) → resolve glob to concrete provider/model
5. Background task detection    (background-task-routing) → potentially override model
6. Quota preflight              (quota-preflight) → annotate request with excluded providers
7. [existing combo/single dispatch]
8. Cache write-back             (request-cache) → store result if cacheable
```

Each middleware is a plain function `(ctx) => ctx | Response`. The `ctx` object wraps request state and is passed by reference. This avoids deep function signature changes.

**Rationale**: Keeps `handleChat` readable; each capability can be enabled/disabled via a settings flag without touching other middleware.

### D2 — Circuit Breaker: In-Memory State + Periodic DB Sync

**Decision**: Store circuit breaker state in a module-level `Map<connectionId, CBState>` (in-process). Persist state to a new `circuit_breaker_state` Postgres table only on state transitions (closed→open, open→half-open, half-open→closed/open). On startup, load persisted state from DB.

```
CBState = {
  state: 'closed' | 'open' | 'half-open',
  failureCount: number,
  lastFailureAt: number,  // epoch ms
  openedAt: number,       // epoch ms
  halfOpenAt: number,     // epoch ms
}
```

Thresholds (configurable in settings): `failureThreshold` (default 5), `recoveryWindowMs` (default 60_000).

**Rationale**: Reading DB on every request is too slow; in-memory is O(1). Persistence is only needed for restart recovery and dashboard display — rare writes are acceptable.

**Alternative considered**: Pure in-memory only (lost on restart). Rejected: operators would have no visibility after restart.

### D3 — Combo Strategies: Discriminated Union on `strategy` Column

**Decision**: Add `strategy` (VARCHAR, default `'ordered'`) and `weights` (JSONB, default `null`) columns to the `combos` table.

| strategy | behaviour |
|---|---|
| `ordered` | existing behaviour — try in array order |
| `round-robin` | rotate index per-combo across requests (module-level Map counter) |
| `weighted` | weighted-random pick; weights array parallel to `models` |
| `cost-optimized` | sort eligible accounts by estimated cost per token (pricing table) before pick |

`handleComboChat` receives the full combo record; a `selectComboModel(combo, availableModels)` function implements the strategy switch. Circuit breaker state is consulted here to exclude open-circuit models before selection.

**Rationale**: Adding `strategy` + `weights` to the existing `combos` table is minimal schema change and doesn't require a new table.

### D4 — Wildcard Routing: Glob → First Matching Provider Config

**Decision**: Add a `wildcard_routes` Postgres table:
```sql
id, user_id, pattern VARCHAR(255), target VARCHAR(255), priority INT
-- pattern: "anthropic/*", "openai/gpt-4*"
-- target:  "cc/claude-opus-4-5" or a combo name
```

At request time, `resolveWildcard(modelStr, userId)` queries this table (ordered by priority ASC), tests each pattern using `micromatch.isMatch(modelStr, pattern)`, returns the `target` string or null.

**Dependency**: `micromatch` (already widely used in Node.js ecosystem, zero native deps).

**Alternative considered**: `minimatch` — less feature-rich for multi-pattern. `micromatch` wins.

### D5 — Request Idempotency: In-Memory LRU with SHA-256 Key

**Decision**: Use a module-level `Map<hash, PendingEntry>` where:
```js
hash = SHA-256(method + path + sortedBodyJSON)
PendingEntry = { promise, resolvedAt }
```

On hit within TTL (default 5000 ms): await the in-flight promise and return its result (dedup concurrent).
On hit after TTL but within a second grace window: return the cached `Response` object.
Eviction: LRU eviction at max 1000 entries; a 10s setInterval sweeps expired entries.

**Rationale**: Prevents duplicate charges from retry storms. In-memory is sufficient — idempotency within a single instance is the primary use case.

### D6 — Quota Preflight: Annotate, Don't Block

**Decision**: The preflight does NOT block the request. It calls `getQuotaSnapshot(provider, connectionId)` (reads the cached quota data from the `quota_cache` in-memory Map populated by the existing `/api/quota` polling) and adds `excludedConnections: Set<string>` to the request context. `getProviderCredentials` is updated to skip connections in this set.

**Rationale**: Hard blocking on quota state could cause false negatives (quota data can be stale). Soft exclusion degrades gracefully — if all connections are "preflight-excluded", normal fallback proceeds anyway.

### D7 — IP Filtering: Express-style Middleware on Next.js Route

**Decision**: Add `ip_filter_rules` Postgres table:
```sql
id, user_id, mode ENUM('allow','block'), cidr VARCHAR(50), created_at
```

An in-memory `Map` caches rules per user (5s TTL). `checkIpFilter(ip, userId)` is called at the top of `handleChat`. Uses Node.js built-in `net` module for CIDR matching (no extra dep).

### D8 — Request Cache: Two-Level LRU Map

**Decision**: Two separate in-memory LRU Maps:
- **Signature cache**: key = SHA-256(full normalized body JSON). TTL: configurable (default 60s). Max entries: 500.
- **Semantic cache**: key = SHA-256(messages array only, with system prompt). Only eligible when `temperature === 0` and `stream !== true`. TTL: configurable (default 300s). Max entries: 200.

No persistent cache (no Redis). Cache is not shared across restarts. A `/api/admin/cache/flush` endpoint clears both maps.

**Rationale**: For a single-instance local proxy, in-process LRU is fast and zero-dependency. Persistence would require Redis which is out of scope.

### D9 — MCP Server: Separate Entry Point + Next.js Route

**Decision**:
- **stdio transport**: `bin/mcp-server.js` — a standalone Node script using `@modelcontextprotocol/sdk/server/stdio.js`. Exposed as `npx 9router mcp` command.
- **HTTP/SSE transport**: `src/app/api/mcp/route.js` — a Next.js route handler using `@modelcontextprotocol/sdk/server/sse.js`. Accessible at `http://localhost:PORT/api/mcp`.

Both share a common `src/lib/mcp/server.js` that defines the tool registry (≈12 tools: `get_providers`, `get_combos`, `create_combo`, `delete_combo`, `get_models`, `get_proxy_status`, `get_circuit_breaker_state`, `flush_cache`, `add_wildcard_route`, `get_usage_stats`, `get_api_keys`, `rotate_api_key`).

**Dependency**: `@modelcontextprotocol/sdk` (official Anthropic SDK, MIT license).

### D10 — Background Task Detection: Header + Body Heuristics

**Decision**: A request is considered a "background task" if ANY of:
- `x-background-task: true` header is present
- `user_agent` matches known CI/bot patterns (`CI`, `GitHub-Actions`, `headless`)
- First user message length > 2000 chars AND no `stream: true` (batch processing heuristic)
- `metadata.task_type === 'background'` in request body

If detected, model is replaced with the configured `backgroundTaskModel` setting (default: same as request model, i.e. no change unless explicitly configured). No fallback if `backgroundTaskModel` is not set.

### D11 — Model Deprecation Map: Static + DB Table

**Decision**: A static `DEPRECATED_MODELS` map in `open-sse/services/model.js` covers well-known renames (e.g., `gpt-4` → `gpt-4o`, `claude-2` → `claude-3-5-haiku`). A `model_deprecation_overrides` Postgres table allows user additions. Both are merged at startup and cached in-process (invalidated on table write). Rewriting happens in the model-rewrite middleware step (D1, step 3).

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| In-memory circuit breaker state lost on restart | Persist state transitions to DB; load on startup |
| `micromatch` glob evaluation on every non-combo request | Cache compiled patterns per user; invalidate on table write |
| Idempotency Map growing unbounded under traffic | LRU cap at 1000 + 10s sweep |
| MCP server auth — anyone with access to `/api/mcp` can manage the proxy | Protect route with existing API key middleware; admin-only operations require `isAdmin` check |
| `cost-optimized` combo strategy requires up-to-date pricing data | Falls back to `ordered` strategy if pricing table has no rows for the models |
| Semantic cache returns stale response if provider model is updated | TTL-limited; operators can flush via `/api/admin/cache/flush` |
| Background task heuristic (body length > 2000) could misclassify legitimate interactive requests | Heuristic is opt-in via settings; disabled by default |

## Migration Plan

1. Run migration files `008_circuit_breaker.sql`, `009_wildcard_routes.sql`, `010_ip_filter_rules.sql`, `011_model_deprecation.sql`, `012_combo_strategy.sql` on startup (existing migration runner in `pgLocalDb.js` already handles sequential numbered files).
2. Existing combos get `strategy = 'ordered'` and `weights = null` by default — no behaviour change.
3. New middleware steps are no-ops if their tables are empty / settings flags are off.
4. MCP server is off by default; opt-in via settings toggle.
5. All new settings have conservative defaults (circuit breaker threshold: 5 failures; cache TTL: 60s; background task routing: disabled).

**Rollback**: Disable each feature via its settings flag. Migration files use `IF NOT EXISTS` / `IF NOT EXISTS` guards so re-running is safe. Dropping new tables restores prior state without affecting existing tables.

## Open Questions

1. Should circuit breaker state be per-user or global (shared across all users for the same `connectionId`)? Current assumption: per-connectionId (shared global) since `provider_connections` are shared by a single-instance deployment.
2. Should the semantic cache be keyed per-user (to avoid cross-user cache poisoning)? Initial answer: yes — include `userId` in the cache key hash.
3. Should wildcard routes be user-scoped or admin-global? Proposal assumes user-scoped; admin may want to define global fallbacks. Punted to implementation.
4. MCP tool `rotate_api_key`: should it generate a new key and invalidate the old one atomically, or just create an additional key? Decision deferred to specs.
