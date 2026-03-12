## ADDED Requirements

### Requirement: Wildcard routes map glob patterns to concrete targets
The system SHALL maintain a `wildcard_routes` Postgres table with columns `(id, user_id, pattern VARCHAR(255), target VARCHAR(255), priority INT)`. When the incoming `model` field matches a pattern, the system SHALL rewrite `model` to the `target` value before further processing.

#### Scenario: Exact-prefix glob resolves to target
- **WHEN** a request has `model: "anthropic/claude-3-opus"` and a wildcard route `pattern: "anthropic/*"` → `target: "cc/claude-opus-4-5"` exists
- **THEN** the model is rewritten to `"cc/claude-opus-4-5"` before combo/single dispatch

#### Scenario: No matching pattern leaves model unchanged
- **WHEN** no wildcard route pattern matches the incoming model string
- **THEN** the model field is unchanged and processing continues normally

#### Scenario: First matching pattern wins (priority ordering)
- **WHEN** multiple wildcard routes could match the incoming model string
- **THEN** the route with the lowest `priority` integer value is applied

#### Scenario: Wildcard target can be a combo name
- **WHEN** a wildcard route target resolves to a string that matches an existing combo name
- **THEN** combo routing is triggered with that combo

### Requirement: Wildcard routes are manageable via the dashboard
The system SHALL provide a UI panel (Settings or new Routing page) to create, reorder, and delete wildcard routes, showing pattern, target, and priority.

#### Scenario: Admin creates a wildcard route
- **WHEN** admin enters pattern `"openai/gpt-4*"` and target `"gh/gpt-4o"` and clicks Save
- **THEN** a new row is inserted into `wildcard_routes` and takes effect immediately

#### Scenario: Admin deletes a wildcard route
- **WHEN** admin deletes a wildcard route
- **THEN** the row is removed and the pattern no longer matches subsequent requests

### Requirement: Wildcard pattern compilation is cached
The system SHALL compile and cache glob patterns per user (invalidated on table write) to avoid re-compiling on every request.

#### Scenario: Pattern cache invalidated on table change
- **WHEN** a wildcard route is created or deleted
- **THEN** the in-memory compiled-pattern cache for that user is cleared
