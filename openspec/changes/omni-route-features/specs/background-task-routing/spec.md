## ADDED Requirements

### Requirement: Background task heuristic detects non-interactive requests
The system SHALL classify a request as a background task if ANY of the following conditions are true:
1. `x-background-task: true` header is present
2. The request `User-Agent` matches known CI/bot patterns (case-insensitive: `CI`, `GitHub-Actions`, `headless`, `bot`, `script`)
3. The first user message body length exceeds 2 000 characters AND `stream !== true`
4. `body.metadata.task_type === 'background'`

#### Scenario: Header flag triggers background routing
- **WHEN** a request includes `x-background-task: true` header
- **THEN** the request is classified as a background task

#### Scenario: Long non-streaming body triggers background routing
- **WHEN** a request has no stream flag and the first user message exceeds 2 000 characters
- **THEN** the request is classified as a background task

#### Scenario: Interactive streaming request not classified as background
- **WHEN** a request has `stream: true` regardless of message length
- **THEN** the request is NOT classified as a background task via the length heuristic

### Requirement: Background tasks are routed to a configured cheap model
The system SHALL expose `backgroundTaskModel` (string, default empty) in the settings table. When a request is classified as a background task AND `backgroundTaskModel` is non-empty, the system SHALL replace `body.model` with the configured value before dispatching.

#### Scenario: Background task routed to cheap model
- **WHEN** a background task is detected AND `backgroundTaskModel = "gh/gpt-4o-mini"`
- **THEN** `body.model` is rewritten to `"gh/gpt-4o-mini"` before further processing

#### Scenario: No override when backgroundTaskModel is empty
- **WHEN** `backgroundTaskModel` is empty or unset
- **THEN** no model rewrite occurs even for classified background tasks

### Requirement: Background task routing is opt-in via settings
The system SHALL expose `backgroundTaskRoutingEnabled` (boolean, default false) in the settings table and Settings UI.

#### Scenario: Feature disabled by default
- **WHEN** `backgroundTaskRoutingEnabled` is false
- **THEN** no background task classification or model rewrite occurs
