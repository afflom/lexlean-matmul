Feature: protocol

  @MM-07 @build
  Scenario: Versioned matrix requests reject malformed values, incompatible shapes, and invalid codes with modeled errors.
    Given the locked LexLean and PrismPM model sources
    When the generated implementation is checked for MM-07
    Then its independent acceptance oracle succeeds

