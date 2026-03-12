## ADDED Requirements

### Requirement: IP filter rules block or allow requests by CIDR
The system SHALL maintain an `ip_filter_rules` Postgres table with columns `(id, user_id, mode ENUM('allow','block'), cidr VARCHAR(50), created_at)`. Rules are evaluated at the top of `handleChat` before any other processing.

#### Scenario: Request from blocked IP is rejected
- **WHEN** the request IP matches a `block` CIDR rule
- **THEN** the system returns HTTP 403 with body `{ "error": "IP blocked" }`

#### Scenario: Allowlist mode rejects non-matching IPs
- **WHEN** at least one `allow` rule exists AND the request IP does not match any `allow` rule
- **THEN** the system returns HTTP 403 with body `{ "error": "IP not allowed" }`

#### Scenario: Allow and block rules — block takes precedence
- **WHEN** the request IP matches both an `allow` rule and a `block` rule
- **THEN** the `block` rule takes precedence and the request is rejected

#### Scenario: No rules — all IPs allowed
- **WHEN** the `ip_filter_rules` table is empty
- **THEN** all requests pass through without IP evaluation

### Requirement: IP filter rules cache with short TTL
The system SHALL cache IP filter rules per user in an in-memory Map with a 5-second TTL to avoid a DB round-trip on every request.

#### Scenario: Cache refreshed after TTL
- **WHEN** a new rule is added and 5 seconds have elapsed
- **THEN** subsequent requests use the updated rule set

### Requirement: IP filter rules are manageable via the Settings dashboard
The system SHALL provide a UI section in Settings to add (mode + CIDR), list, and delete IP filter rules.

#### Scenario: Admin adds a block rule
- **WHEN** admin enters mode `block` and CIDR `192.168.1.0/24` and clicks Add
- **THEN** the rule is inserted and takes effect within 5 seconds (cache TTL)

#### Scenario: IPv6 addresses are supported
- **WHEN** a `block` rule is created with an IPv6 CIDR (e.g. `::1/128`)
- **THEN** requests from that IPv6 address are rejected
