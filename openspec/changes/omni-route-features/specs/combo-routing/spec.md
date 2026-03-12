## MODIFIED Requirements

### Requirement: Combo routing consults circuit breaker and quota preflight before model selection
The combo routing pipeline (in `handleComboChat` / `selectComboModel`) SHALL filter the candidate model list against both the circuit breaker state and quota preflight exclusion set before applying the combo strategy. Models whose connections are in `open` circuit state OR whose connections are in the quota-preflight exclusion set SHALL be skipped as initial candidates. If filtering leaves no candidates, all models SHALL be treated as eligible (graceful degradation).

#### Scenario: Open-circuit combo model skipped
- **WHEN** a combo has models `["a","b","c"]` and model "a"'s connection is in `open` circuit state
- **THEN** `selectComboModel` excludes "a" from initial selection; "b" is tried first

#### Scenario: Quota-exhausted combo model skipped
- **WHEN** model "b"'s connection is in the quota-preflight exclusion set
- **THEN** `selectComboModel` excludes "b" from initial selection

#### Scenario: All combo models filtered — graceful degradation
- **WHEN** all models in a combo are excluded by circuit breaker or quota preflight
- **THEN** the full model list is used as-is (no exclusions applied)

#### Scenario: Failed model in fallback loop updates circuit breaker
- **WHEN** `handleComboChat` moves to the next model due to a fallback-eligible error on the current model
- **THEN** the circuit breaker failure count for the failing model's connection is incremented

#### Scenario: Successful combo request resets circuit breaker
- **WHEN** a combo model request succeeds
- **THEN** the circuit breaker failure count for that connection is reset to 0 (transition to closed if was half-open)
