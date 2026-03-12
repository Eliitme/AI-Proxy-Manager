## 1. Dependencies & DB Migrations

- [x] 1.1 Add `micromatch` to package.json dependencies
- [x] 1.2 Add `@modelcontextprotocol/sdk` to package.json dependencies
- [x] 1.3 Run `npm install`
- [x] 1.4 Create `db/migrations/008_circuit_breaker.sql` — `circuit_breaker_state` table (connection_id PK, state, failure_count, last_failure_at, opened_at, half_open_at, updated_at)
- [x] 1.5 Create `db/migrations/009_wildcard_routes.sql` — `wildcard_routes` table (id, user_id, pattern, target, priority, created_at)
- [x] 1.6 Create `db/migrations/010_ip_filter_rules.sql` — `ip_filter_rules` table (id, user_id, mode CHECK IN ('allow','block'), cidr, created_at)
- [x] 1.7 Create `db/migrations/011_model_deprecation.sql` — `model_deprecation_overrides` table (id, user_id, from_model, to_model, created_at)
- [x] 1.8 Create `db/migrations/012_combo_strategy.sql` — add `strategy VARCHAR(50) DEFAULT 'ordered'` and `weights JSONB` columns to `combos` table
- [x] 1.9 Create `db/migrations/013_settings_new_flags.sql` — add new settings columns: `circuit_breaker_enabled`, `circuit_breaker_failure_threshold`, `circuit_breaker_recovery_window_ms`, `idempotency_enabled`, `idempotency_ttl_ms`, `quota_preflight_enabled`, `signature_cache_enabled`, `signature_cache_ttl_ms`, `semantic_cache_enabled`, `semantic_cache_ttl_ms`, `background_task_routing_enabled`, `background_task_model`, `mcp_server_enabled`
- [x] 1.10 Verify existing migration runner in `pgLocalDb.js` picks up and runs new migration files on startup
- [x] 1.11 Create `db/migrations/014_ip_filter_enabled.sql` — add `ip_filter_enabled BOOLEAN DEFAULT TRUE` to settings table

## 2. Circuit Breaker

- [x] 2.1 Create `open-sse/services/circuitBreaker.js` — in-memory Map of `connectionId → CBState`, `recordSuccess(connectionId)`, `recordFailure(connectionId)`, `getState(connectionId)`, `isOpen(connectionId)` functions
- [x] 2.2 Add DB persistence in `circuitBreaker.js` — `persistState(connectionId, state)` writes to `circuit_breaker_state` table; `loadAllStates()` reads all rows on startup
- [x] 2.3 Call `loadAllStates()` during app startup (in `pgLocalDb.js` init or `open-sse` init)
- [x] 2.4 Integrate circuit breaker into `getProviderCredentials` — filter out connections where `isOpen(connectionId)` returns true (with graceful-degradation fallback when all are open)
- [x] 2.5 Call `recordSuccess` / `recordFailure` at the end of `handleChatCore` based on upstream response outcome
- [x] 2.6 Add `circuitBreakerEnabled` guard — wrap all CB logic in a settings-flag check
- [x] 2.7 Add `circuit_breaker_state` DB query functions to `pgLocalDb.js` (upsert state, load all, load by connectionId)
- [ ] 2.8 Add circuit breaker state display to Providers dashboard page — show state badge (Closed/Open/Half-Open) and failureCount per connection card

## 3. Combo Strategies

- [x] 3.1 Update `pgLocalDb.js` `getCombos` / `getComboByName` to include `strategy` and `weights` fields from new DB columns
- [x] 3.2 Create `open-sse/services/comboStrategy.js` — `selectComboModel(combo, eligibleModels)` implementing `ordered`, `round-robin` (module-level counter Map), `weighted` (weighted-random), `cost-optimized` (sort by pricing table) strategies
- [x] 3.3 Update `open-sse/services/combo.js` `handleComboChat` to call `selectComboModel` instead of iterating in array order
- [x] 3.4 Add `getCostPerToken(provider, model)` lookup in `comboStrategy.js` using `pricing` table via `pgLocalDb.js`
- [ ] 3.5 Update combo editor in dashboard (`/dashboard/combos`) — add Strategy dropdown (Ordered / Round Robin / Weighted / Cost Optimized) and Weights input array (shown only when Weighted is selected)
- [x] 3.6 Update combo API routes (`/api/combos`) to accept and persist `strategy` and `weights` fields

## 4. Wildcard Model Routing

- [x] 4.1 Create `open-sse/services/wildcardRouting.js` — `resolveWildcard(modelStr, userId)` queries `wildcard_routes` ordered by priority, tests each with `micromatch.isMatch`, returns target or null; compiled-pattern cache (Map per userId, invalidated on write)
- [x] 4.2 Add `wildcard_routes` CRUD functions to `pgLocalDb.js` (list by userId, insert, delete, invalidate cache on write)
- [x] 4.3 Insert wildcard resolution as middleware step in `handleChat` (before combo/single dispatch, after model-deprecation rewrite) — done via requestPipeline.js step 4
- [x] 4.4 Add Wildcard Routes panel to Settings dashboard — `/dashboard/security` page, API at `/api/wildcard-routes`

## 5. Request Idempotency

- [x] 5.1 Create `open-sse/services/idempotency.js` — SHA-256 hash function, LRU Map (max 1000), `checkIdempotency(hash)` returns cached response or null, `registerRequest(hash, promise)` stores in-flight promise, `recordResponse(hash, response)` stores completed response, 10s sweep interval
- [x] 5.2 Insert idempotency check as second middleware step in `handleChat` (after IP filter, before model deprecation) — done via requestPipeline.js step 2
- [x] 5.3 Add `idempotencyEnabled` and `idempotencyTtlMs` to Settings UI — `/dashboard/security` page

## 6. Quota Preflight

- [x] 6.1 Create `open-sse/services/quotaPreflight.js` — `getExcludedConnections(provider, userId)` reads in-memory quota snapshot Map (exported from existing quota polling), returns Set of connectionIds at 0% remaining
- [x] 6.2 Insert quota preflight as 6th middleware step in `handleChat`, attaches `ctx.excludedConnections` Set — done via requestPipeline.js
- [x] 6.3 Update `getProviderCredentials` to accept and apply `excludedConnections` Set (with graceful-degradation if all excluded)
- [x] 6.4 Add `quotaPreflightEnabled` to Settings UI — `/dashboard/security` page

## 7. IP Filtering

- [x] 7.1 Create `open-sse/services/ipFilter.js` — `checkIpFilter(ip, userId)` loads rules from cache (5s TTL), evaluates block/allow logic with CIDR matching using Node.js `net` module, returns `{ blocked: boolean, reason: string }`
- [x] 7.2 Add `ip_filter_rules` CRUD functions to `pgLocalDb.js` (list by userId, insert, delete)
- [x] 7.3 Insert IP filter as first middleware step in `handleChat` — extract IP from `x-forwarded-for` header, return 403 on block — done via requestPipeline.js step 1
- [x] 7.4 Add IP Filter Rules panel to Settings dashboard — `/dashboard/security` page, API at `/api/ip-filter-rules`
- [x] 7.5 IPv6 support included in ipFilter.js using `net.isIPv6` + CIDR bit-string comparison

## 8. Request Cache

- [x] 8.1 Create `open-sse/services/requestCache.js` — two LRU Maps (signature: 500 entries, semantic: 200 entries), `checkSignatureCache(userId, bodyJson)`, `checkSemanticCache(userId, messages, systemPrompt)`, `writeSignatureCache(...)`, `writeSemanticCache(...)`, `flushAll()`
- [x] 8.2 Insert cache read as middleware step before upstream dispatch — done via requestPipeline.js step 7
- [x] 8.3 Skip cache read/write for streaming requests (`stream: true`) — implemented in requestPipeline.js
- [ ] 8.4 Log cache hits in `usage_history` with `status: 'cache-hit'` and `cost: 0`
- [x] 8.5 Add `POST /api/admin/cache/flush` Next.js API route (admin-only, calls `requestCache.flushAll()`)
- [x] 8.6 Add cache settings (`signatureCacheEnabled`, `signatureCacheTtlMs`, `semanticCacheEnabled`, `semanticCacheTtlMs`) to Settings UI — `/dashboard/security` page
- [x] 8.7 Add cache stats endpoint at `GET /api/cache/stats`

## 9. Background Task Routing

- [x] 9.1 Create `open-sse/services/backgroundTaskDetector.js` — `isBackgroundTask(req, body)` implementing the four heuristics: header flag, user-agent pattern, body length + no-stream, metadata.task_type
- [x] 9.2 Insert background task detection as 5th middleware step in `handleChat`, rewrite `body.model` when `backgroundTaskModel` is set — done via requestPipeline.js step 5
- [x] 9.3 Add `backgroundTaskRoutingEnabled` and `backgroundTaskModel` to Settings UI — `/dashboard/security` page

## 10. Model Deprecation Map

- [x] 10.1 Add `DEPRECATED_MODELS` static Map to `open-sse/services/model.js` with built-in renames (gpt-4 → gpt-4o, claude-2 → claude-3-5-haiku-20241022, etc.)
- [x] 10.2 Create `open-sse/services/modelDeprecation.js` — merges static map with DB `model_deprecation_overrides` rows (cached with 5s TTL), exposes `rewriteModel(modelStr, userId)` returning replacement or original
- [x] 10.3 Add `model_deprecation_overrides` CRUD functions to `pgLocalDb.js` (list by userId, insert, delete, invalidate cache on write)
- [x] 10.4 Insert model deprecation rewrite as 3rd middleware step in `handleChat` (after idempotency, before wildcard routing) — done via requestPipeline.js step 3
- [x] 10.5 Add Model Deprecation Overrides panel to Settings dashboard — `/dashboard/security` page, API at `/api/model-deprecation`

## 11. Combo Routing Integration (Modified Capability)

- [x] 11.1 Update `handleComboChat` to accept circuit breaker state and quota preflight exclusion set from request context
- [x] 11.2 Filter combo model list through `excludedConnections` before passing to `selectComboModel`
- [x] 11.3 Call `circuitBreaker.recordFailure` on fallback-eligible combo model failures inside the fallback loop
- [x] 11.4 Call `circuitBreaker.recordSuccess` on successful combo response

## 12. MCP Server

- [x] 12.1 Create `src/lib/mcp/tools.js` — define all MCP tool schemas (name, description, inputSchema) for the 10 tools listed in the spec
- [x] 12.2 Create `src/lib/mcp/handlers.js` — implement each tool handler function (calling existing pgLocalDb, circuitBreaker, requestCache, etc.)
- [x] 12.3 Create `src/lib/mcp/server.js` — instantiate MCP Server with tool registry, shared by both transports
- [x] 12.4 Create `bin/mcp-server.js` — stdio transport entry point: validate `MCP_API_KEY`, connect to DB, start MCP server over stdio
- [x] 12.5 Add `mcp` command to `package.json` bin field pointing to `bin/mcp-server.js`
- [x] 12.6 Create `src/app/api/mcp/route.js` — Next.js route handler for HTTP/SSE transport, protected by API key middleware
- [x] 12.7 Add `mcpServerEnabled` toggle to Settings UI — `/dashboard/security` page
- [ ] 12.8 Test MCP server with Claude Desktop config: `{ "command": "9router", "args": ["mcp"], "env": { "MCP_API_KEY": "..." } }`

## 13. Middleware Chain Wiring

- [x] 13.1 Create `open-sse/middleware/requestPipeline.js` — compose middleware steps in order: (1) IP filter, (2) idempotency check, (3) model deprecation rewrite, (4) wildcard resolution, (5) background task detection, (6) quota preflight, (7) cache read
- [x] 13.2 Update `src/sse/handlers/chat.js` `handleChat` to call `requestPipeline(ctx)` instead of inline dispatch
- [x] 13.3 Add request context object `ctx` type/shape documentation (inline JSDoc in requestPipeline.js)
- [ ] 13.4 Write integration test (or manual test script) verifying each middleware step fires in order with correct ctx mutations

## 14. Settings DB + API + UI Cleanup

- [x] 14.1 Update `pgLocalDb.js` `getSettings` / `updateSettings` to include all new settings columns from migrations 013-014
- [x] 14.2 Update `/api/settings` GET and POST routes to expose and accept all new settings fields — settings API uses getSettings/updateSettings which now include all columns
- [x] 14.3 Add all new settings panels to `/dashboard/security` page: Security (IP Filter, Circuit Breaker), Routing (Wildcard Routes, Model Deprecation, Background Task), Caching (Request Cache, Idempotency), Infrastructure (MCP Server, Quota Preflight)
- [ ] 14.4 Add i18n translations to `public/i18n/literals/zh-CN.json` and `vi.json` for all new Settings UI labels
