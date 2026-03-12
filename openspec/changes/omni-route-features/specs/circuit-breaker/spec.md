## ADDED Requirements

### Requirement: Circuit breaker tracks failure state per provider connection
The system SHALL maintain a circuit breaker state machine for each `provider_connections.id`. States are `closed` (normal), `open` (failing — requests skipped), and `half-open` (testing recovery). State transitions persist to the `circuit_breaker_state` Postgres table on every change and are loaded into an in-memory Map on startup.

#### Scenario: Connection exceeds failure threshold
- **WHEN** a provider connection accumulates `failureCount >= failureThreshold` (default 5) within the measurement window
- **THEN** the circuit breaker transitions to `open` state and records `openedAt` timestamp

#### Scenario: Open circuit automatically transitions to half-open after recovery window
- **WHEN** a connection is in `open` state AND `now - openedAt >= recoveryWindowMs` (default 60 000 ms)
- **THEN** the circuit breaker transitions to `half-open` state, allowing one test request through

#### Scenario: Half-open test request succeeds
- **WHEN** a request succeeds for a connection in `half-open` state
- **THEN** the circuit breaker transitions to `closed` state and resets `failureCount` to 0

#### Scenario: Half-open test request fails
- **WHEN** a request fails for a connection in `half-open` state
- **THEN** the circuit breaker transitions back to `open` state and resets `openedAt` to now

#### Scenario: Successful request resets failure count in closed state
- **WHEN** a request succeeds for a connection in `closed` state
- **THEN** `failureCount` is reset to 0

### Requirement: Open-circuit connections are excluded from account selection
The system SHALL skip connections whose circuit breaker state is `open` during the account selection step inside `handleSingleModelChat`. If all connections for a provider are open, normal fallback proceeds (no connections excluded — graceful degradation).

#### Scenario: Open-circuit connection skipped
- **WHEN** `getProviderCredentials` is called and a connection's circuit breaker state is `open`
- **THEN** that connection is excluded from the candidate list

#### Scenario: All connections open — graceful degradation
- **WHEN** all connections for the requested provider are in `open` state
- **THEN** the system proceeds without exclusion (treats all connections as candidates)

### Requirement: Circuit breaker thresholds are configurable per-deployment
The system SHALL expose `circuitBreakerEnabled` (boolean, default false), `circuitBreakerFailureThreshold` (int, default 5), and `circuitBreakerRecoveryWindowMs` (int, default 60 000) in the `settings` table and Settings dashboard UI.

#### Scenario: Feature is disabled by default
- **WHEN** `circuitBreakerEnabled` is false
- **THEN** all circuit breaker evaluation logic is skipped entirely (zero overhead)

#### Scenario: Admin changes threshold
- **WHEN** admin updates `circuitBreakerFailureThreshold` to 3
- **THEN** subsequent requests use the new threshold for state transitions

### Requirement: Circuit breaker state is visible in the dashboard
The system SHALL display per-connection circuit breaker state (state, failureCount, openedAt) in the Providers dashboard page.

#### Scenario: Dashboard shows open circuit
- **WHEN** a connection is in `open` state
- **THEN** the Providers page shows a red "Circuit Open" badge next to that connection with time-since-opened
