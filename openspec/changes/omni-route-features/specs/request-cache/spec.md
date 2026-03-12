## ADDED Requirements

### Requirement: Signature cache deduplicates identical full-body requests
The system SHALL maintain a signature cache keyed on `SHA-256(userId + canonical JSON of full request body)`. On a cache hit, the stored `Response`-equivalent object SHALL be returned immediately without an upstream call.

#### Scenario: Identical non-streaming request returns cached response
- **WHEN** a non-streaming request body is identical to a previously cached request (same user, same body)
- **THEN** the cached response is returned; no upstream call is made

#### Scenario: Cache entry expires after TTL
- **WHEN** a cache entry's age exceeds `signatureCacheTtlMs` (default 60 000 ms)
- **THEN** the entry is treated as a miss and a fresh upstream call is made

#### Scenario: Streaming requests are never cached
- **WHEN** the request body has `stream: true`
- **THEN** the signature cache is neither read nor written

### Requirement: Semantic cache deduplicates equivalent zero-temperature requests
The system SHALL maintain a semantic cache keyed on `SHA-256(userId + canonical JSON of messages[] + system prompt)`. The semantic cache SHALL only be consulted when `temperature === 0` (or absent, defaulting to 0) and `stream !== true`.

#### Scenario: Same messages at temperature=0 returns cached response
- **WHEN** a non-streaming request has `temperature: 0` and its `messages` array is identical to a previously cached request
- **THEN** the semantic cache response is returned; no upstream call is made

#### Scenario: Non-zero temperature bypasses semantic cache
- **WHEN** a request has `temperature: 0.7`
- **THEN** the semantic cache is skipped entirely (check and write)

#### Scenario: Semantic cache hit logs as cache hit
- **WHEN** a semantic cache hit occurs
- **THEN** the usage record written to `usage_history` has `status: 'cache-hit'` and `cost: 0`

### Requirement: Cache is bounded and flushable
Both the signature and semantic caches SHALL be capped (signature: 500 entries; semantic: 200 entries) using LRU eviction. An admin API endpoint `POST /api/admin/cache/flush` SHALL clear both caches.

#### Scenario: Admin flushes cache
- **WHEN** an admin calls `POST /api/admin/cache/flush`
- **THEN** both signature and semantic caches are emptied and a 200 response with `{ "flushed": true }` is returned

#### Scenario: LRU eviction on capacity
- **WHEN** the signature cache reaches 500 entries
- **THEN** the least-recently-used entry is evicted before inserting the new entry

### Requirement: Cache settings are configurable
The system SHALL expose `signatureCacheEnabled`, `signatureCacheTtlMs`, `semanticCacheEnabled`, and `semanticCacheTtlMs` in the settings table and Settings dashboard UI.

#### Scenario: Both caches disabled by default
- **WHEN** `signatureCacheEnabled` and `semanticCacheEnabled` are both false
- **THEN** no cache lookups or writes occur
