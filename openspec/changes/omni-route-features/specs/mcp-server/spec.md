## ADDED Requirements

### Requirement: MCP server exposes proxy management tools
The system SHALL implement an MCP server (Model Context Protocol) exposing at minimum the following tools: `get_providers`, `get_combos`, `create_combo`, `delete_combo`, `get_models`, `get_proxy_status`, `get_circuit_breaker_state`, `flush_cache`, `add_wildcard_route`, `get_usage_stats`.

#### Scenario: get_providers returns connected provider list
- **WHEN** an MCP client calls `get_providers`
- **THEN** the tool returns an array of active provider connections with fields: id, provider, name, authType, isActive

#### Scenario: create_combo creates a new combo
- **WHEN** an MCP client calls `create_combo` with name and models array
- **THEN** a new combo is inserted into the database and the new combo object is returned

#### Scenario: flush_cache clears response caches
- **WHEN** an MCP client calls `flush_cache`
- **THEN** both signature and semantic caches are emptied and `{ flushed: true }` is returned

### Requirement: MCP server supports stdio transport
The system SHALL expose an MCP stdio server entry point at `bin/mcp-server.js`, invocable as `9router mcp` (added to `package.json` bin field). The server SHALL authenticate using the `MCP_API_KEY` environment variable, which must match a valid API key in the database.

#### Scenario: stdio server starts and accepts tool calls
- **WHEN** `9router mcp` is run with `MCP_API_KEY` set to a valid API key
- **THEN** the server starts, connects to the database, and responds to MCP tool calls over stdin/stdout

#### Scenario: stdio server rejects missing or invalid API key
- **WHEN** `9router mcp` is run without `MCP_API_KEY` or with an invalid key
- **THEN** the process exits with code 1 and an error message

### Requirement: MCP server supports HTTP/SSE transport
The system SHALL expose an HTTP MCP endpoint at `GET /api/mcp` (SSE stream) and `POST /api/mcp` (message endpoint) following the MCP HTTP transport specification. The endpoint SHALL require a valid API key in the `Authorization: Bearer` header.

#### Scenario: HTTP transport returns SSE stream on GET
- **WHEN** a client sends `GET /api/mcp` with a valid API key
- **THEN** the server returns a `text/event-stream` response and keeps the connection open

#### Scenario: Unauthenticated HTTP request rejected
- **WHEN** `GET /api/mcp` is called without a valid API key
- **THEN** the server returns HTTP 401

### Requirement: Admin-only tools require isAdmin flag
Destructive or configuration-changing tools (`create_combo`, `delete_combo`, `flush_cache`, `add_wildcard_route`) SHALL verify the authenticated user is an admin before executing.

#### Scenario: Non-admin user blocked from create_combo
- **WHEN** a non-admin API key holder calls `create_combo`
- **THEN** the tool returns an error: `{ "error": "Admin access required" }`
