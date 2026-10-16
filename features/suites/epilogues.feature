Feature: epilogues

  @MM-15 @build
  Scenario: Bias and linear epilogues retain exact integer, complex, and tropical results until one terminal output encoding.
    Given the locked LexLean and PrismPM model sources
    When the generated implementation is checked for MM-15
    Then its independent acceptance oracle succeeds
