## ADDED Requirements

### Requirement: Deprecated model names are automatically rewritten
The system SHALL maintain a two-tier model deprecation map: (1) a static built-in map in `open-sse/services/model.js` covering well-known provider renames, and (2) a `model_deprecation_overrides` Postgres table for user-defined additions. At request time, if the incoming `body.model` value matches a deprecated name (after provider prefix stripping), the system SHALL rewrite it to the current replacement before any routing logic runs.

#### Scenario: Known deprecated model name is rewritten
- **WHEN** a request arrives with `model: "gpt-4"` and the deprecation map maps `gpt-4` → `gpt-4o`
- **THEN** `body.model` is rewritten to the provider-qualified replacement before routing

#### Scenario: Unknown model name passes through unchanged
- **WHEN** a request arrives with a model name not present in either deprecation tier
- **THEN** `body.model` is unchanged

#### Scenario: Rewrite is transparent to the client
- **WHEN** a model rewrite occurs
- **THEN** the response `model` field reflects the actual model used (as returned by the upstream provider), not the deprecated name

### Requirement: Built-in static deprecation map covers common provider renames
The static map SHALL include at minimum: `gpt-4` → `gpt-4o`, `gpt-4-turbo` → `gpt-4o`, `claude-2` → `claude-3-5-haiku-20241022`, `claude-instant-1` → `claude-3-haiku-20240307`, `gemini-pro` → `gemini-1.5-pro`.

#### Scenario: Static map entry applied
- **WHEN** `model: "claude-2"` arrives
- **THEN** it is rewritten to `"claude-3-5-haiku-20241022"` by the static map

### Requirement: User-defined deprecation overrides are manageable via dashboard
The system SHALL provide a UI panel (Settings) to add, list, and delete custom model deprecation entries (from → to). Entries take effect within 5 seconds (cache TTL).

#### Scenario: User adds a custom override
- **WHEN** admin adds override `from: "my-old-model"` → `to: "cc/claude-opus-4-5"`
- **THEN** requests with `model: "my-old-model"` are rewritten to `"cc/claude-opus-4-5"`

#### Scenario: User-defined override takes priority over static map
- **WHEN** a user-defined override and a static map entry both match the same model name
- **THEN** the user-defined override takes priority
