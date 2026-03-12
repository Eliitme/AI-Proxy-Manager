## ADDED Requirements

### Requirement: Combos support a strategy field
The system SHALL add a `strategy` column (VARCHAR, default `'ordered'`) and a `weights` column (JSONB array, default null) to the `combos` table. The combo editor in the dashboard SHALL expose strategy selection.

#### Scenario: Default strategy preserves existing behaviour
- **WHEN** a combo has `strategy = 'ordered'` (or null/missing)
- **THEN** `handleComboChat` iterates `models[]` in array order, identical to pre-change behaviour

#### Scenario: Round-robin strategy rotates model selection
- **WHEN** a combo has `strategy = 'round-robin'` and receives successive requests
- **THEN** the system cycles through `models[]` entries using a per-combo atomic counter, distributing load evenly

#### Scenario: Round-robin counter wraps on overflow
- **WHEN** the round-robin counter reaches `models.length`
- **THEN** it wraps back to 0

### Requirement: Weighted strategy selects models by probability
The system SHALL, when `strategy = 'weighted'`, perform a weighted-random selection among available (non-open-circuit) models using the parallel `weights[]` array.

#### Scenario: Weighted selection respects weights
- **WHEN** a combo has `models: ["a","b","c"]` and `weights: [70, 20, 10]`
- **THEN** model "a" is selected approximately 70% of the time across many requests

#### Scenario: Weights normalised automatically
- **WHEN** the weights array does not sum to 100
- **THEN** the system normalises weights to proportions before selection (no error thrown)

#### Scenario: Open-circuit models excluded from weighted pool
- **WHEN** a model's connection is in open-circuit state
- **THEN** that model is excluded from the weighted pool and its weight is redistributed proportionally

### Requirement: Cost-optimized strategy selects the cheapest eligible model
The system SHALL, when `strategy = 'cost-optimized'`, sort the available models by their blended cost-per-token (from the `pricing` table, using the average of `input_cost` and `output_cost`) ascending and select the lowest-cost model first.

#### Scenario: Cheapest model selected
- **WHEN** a combo has `strategy = 'cost-optimized'` and pricing data exists for all models
- **THEN** the model with the lowest blended cost-per-token is tried first

#### Scenario: Fallback when pricing data missing
- **WHEN** pricing data is absent for one or more models
- **THEN** models without pricing data are treated as cost = Infinity (tried last) and `ordered` fallback order is used as a tiebreaker

### Requirement: Failed model selection falls back to the next eligible model
Regardless of strategy, if the selected model fails with a fallback-eligible error, the system SHALL attempt the next eligible model in the strategy's order.

#### Scenario: Round-robin falls back on failure
- **WHEN** the round-robin-selected model fails with a 429 error
- **THEN** the system tries the next model in rotation order

#### Scenario: Weighted falls back on failure
- **WHEN** the weighted-selected model fails
- **THEN** the system retries weighted selection among remaining (non-failed) models
