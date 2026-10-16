Feature: atlas

  @MM-16 @build
  Scenario: Finite IEEE products normalize into canonical non-adjacent Laurent atoms and contract a ternary lookup before one encoding.
    Given the locked LexLean and PrismPM model sources
    When the generated implementation is checked for MM-16
    Then its independent acceptance oracle succeeds
