# Suites

The Gherkin suites cover the 17 registered matrix multiplication capabilities,
with one scenario per conformance ID (R3).

A scenario is tagged with its ID and its honesty level:

```gherkin
Feature: exact

  @MM-01 @build
  Scenario: Integer GEMM decodes operands, accumulates exact products, and applies the linear epilogue once.
    Given the locked LexLean and PrismPM model sources
    When the generated implementation is checked for MM-01
    Then its independent acceptance oracle succeeds
```

The capability register is `model/ids.toml`. The scenarios connect its claims
to the conformance tests and their generated-artifact oracles. `just bdd`
fails if an ID has no scenario, a scenario has no registered ID, or an ID has
no test whose name ends in it lowercased with underscores.

Add a capability as a register row, then a scenario here, then a failing
test before implementing it, as required by `AGENTS.md`. Full release
qualification requires `just vv` in the locked SDK.
