Feature: verification

  @MM-11 @build
  Scenario: Independent exact arithmetic oracles validate generated runtime results and representative planted defects are rejected.
    Given the locked LexLean and PrismPM model sources
    When the generated implementation is checked for MM-11
    Then its independent acceptance oracle succeeds

