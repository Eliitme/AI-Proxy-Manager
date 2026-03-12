## ADDED Requirements

### Requirement: Quota preflight annotates request context with exhausted connections
Before account selection, the system SHALL check the in-memory quota snapshot (populated by the existing quota-refresh polling) for each candidate connection. Connections whose quota is at 0% remaining SHALL be added to an `excludedConnections` Set on the request context.

#### Scenario: Exhausted connection excluded from selection
- **WHEN** a provider connection has quota remaining = 0%
- **THEN** `getProviderCredentials` skips that connection during account selection

#### Scenario: All connections exhausted — graceful degradation
- **WHEN** all connections for the requested provider are quota-exhausted according to the snapshot
- **THEN** the exclusion set is ignored and all connections are treated as eligible (quota data may be stale)

#### Scenario: No quota snapshot available — no exclusions
- **WHEN** the quota polling has never run or returned no data for a provider
- **THEN** no connections are excluded (preflight is a no-op)

### Requirement: Quota preflight is opt-in via settings
The system SHALL expose `quotaPreflightEnabled` (boolean, default false) in the settings table.

#### Scenario: Feature disabled by default
- **WHEN** `quotaPreflightEnabled` is false
- **THEN** no quota snapshot lookup occurs before account selection
