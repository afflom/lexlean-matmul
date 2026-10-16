Feature: tropical

  @MM-05 @build
  Scenario: Max-plus multiplication preserves negative infinity and selects the least attaining reduction index.
    Given the locked LexLean and PrismPM model sources
    When the generated implementation is checked for MM-05
    Then its independent acceptance oracle succeeds

  @MM-06 @build
  Scenario: Tropical recentering preserves masked entries and yields a canonical gauge representative.
    Given the locked LexLean and PrismPM model sources
    When the generated implementation is checked for MM-06
    Then its independent acceptance oracle succeeds

