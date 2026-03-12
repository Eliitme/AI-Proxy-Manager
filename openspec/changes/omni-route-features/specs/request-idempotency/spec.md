## ADDED Requirements

### Requirement: Identical concurrent requests are deduplicated within a TTL window
The system SHALL compute a SHA-256 hash of `(HTTP method + path + canonically-sorted request body JSON)` for each incoming chat request. If a second request with the same hash arrives while the first is still in-flight (or within `idempotencyTtlMs` after it completed, default 5 000 ms), the system SHALL return the result of the first request without issuing a duplicate upstream call.

#### Scenario: Concurrent duplicate request returns same response
- **WHEN** two identical requests arrive within 100 ms of each other
- **THEN** both receive the same response; only one upstream call is made

#### Scenario: Sequential request after TTL is treated as new
- **WHEN** a request arrives more than `idempotencyTtlMs` ms after the previous identical request completed
- **THEN** it is treated as a new request and a fresh upstream call is issued

#### Scenario: Different body produces different hash (no dedup)
- **WHEN** two requests differ only in a single message character
- **THEN** they produce different hashes and are both forwarded upstream independently

### Requirement: Idempotency deduplication cache is bounded
The system SHALL cap the idempotency Map at `idempotencyMaxEntries` (default 1 000) using LRU eviction. A background sweep SHALL remove expired entries every 10 seconds.

#### Scenario: LRU eviction on capacity
- **WHEN** the idempotency Map reaches 1 000 entries and a new request arrives
- **THEN** the least-recently-used entry is evicted before the new entry is inserted

### Requirement: Idempotency is opt-in via settings
The system SHALL expose `idempotencyEnabled` (boolean, default false) and `idempotencyTtlMs` (int, default 5 000) in the settings table.

#### Scenario: Feature disabled by default
- **WHEN** `idempotencyEnabled` is false
- **THEN** all hash computation and dedup logic is skipped

#### Scenario: Streaming requests are excluded from idempotency
- **WHEN** the request body has `stream: true`
- **THEN** the idempotency check is skipped regardless of the settings flag (streaming responses cannot be replayed)
