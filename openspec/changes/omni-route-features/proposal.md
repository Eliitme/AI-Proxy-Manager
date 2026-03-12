## Why

9router currently routes requests via simple round-robin/sticky combo fallback, but lacks resilience, observability, and routing intelligence features that production proxy gateways need. Adopting proven patterns from OmniRoute fills critical gaps: circuit breakers prevent thundering-herd failures, combo strategy extensions (weighted, cost-optimized) enable smarter load distribution, wildcard model routing removes the need for exact name matches, and an optional semantic/signature cache reduces redundant upstream calls for deterministic requests.

## What Changes

- Add **circuit breaker** state machine per provider account (closed → open → half-open cycle), surfaced in dashboard
- Add **weighted** and **cost-optimized** combo strategies alongside existing round-robin/sticky
- Add **wildcard model routing** (`anthropic/*`, `openai/gpt-4*`) via glob pattern matching on incoming model strings
- Add **request idempotency** deduplication (5-second window keyed on hash of method+path+body)
- Add **quota preflight check** before forwarding requests (skip providers already at limit)
- Add **IP allowlist/blocklist** middleware for API key endpoints
- Add **semantic cache** (temperature=0, non-streaming, hash of messages array) and **signature cache** (identical full-request hash)
- Add **MCP server** exposing proxy status, provider health, model list, combo management as MCP tools (stdio + HTTP transports)
- Add **background task detection** heuristic → route to cheaper/faster model automatically
- Add **model deprecation mapping** table (old model name → replacement) with automatic rewriting

## Capabilities

### New Capabilities
- `circuit-breaker`: Per-provider-account open/half-open/closed state machine with configurable failure threshold and recovery window
- `combo-strategies`: Weighted and cost-optimized selection strategies on top of existing round-robin/sticky
- `wildcard-model-routing`: Glob pattern resolution for incoming model strings against configured provider+model targets
- `request-idempotency`: In-memory deduplication of identical requests within a configurable TTL window
- `quota-preflight`: Pre-request check against known quota state to skip exhausted providers
- `ip-filtering`: Middleware for per-endpoint IP allowlist/blocklist with CIDR support
- `request-cache`: Semantic cache (temperature=0 + non-streaming) and exact signature cache with configurable TTL and max-entries
- `mcp-server`: MCP-compatible server exposing proxy management tools over stdio and HTTP (SSE) transports
- `background-task-routing`: Heuristic detection of background/non-interactive requests → route to configured cheap-model override
- `model-deprecation-map`: Static + user-configurable mapping of deprecated model names to current equivalents with automatic rewriting

### Modified Capabilities
- `combo-routing`: Existing combo execution pipeline extended to consult circuit breaker state and quota preflight results before selection

## Impact

- **Core routing pipeline**: `open-sse/services/` — chat handler wraps new middleware chain
- **Database**: new tables for circuit breaker state, model deprecation map; new columns on combos for strategy + weights
- **Dashboard**: Circuit breaker status panel, cache hit/miss stats, new combo strategy fields in combo editor, IP filter config in Settings
- **API surface**: New `/api/mcp` route (MCP HTTP transport); new `/api/cache/flush` admin endpoint; model deprecation rewrite is transparent to clients
- **Dependencies**: `micromatch` or `minimatch` for glob matching; `@modelcontextprotocol/sdk` for MCP server transport
