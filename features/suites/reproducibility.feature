Feature: reproducibility

  @MM-12 @build
  Scenario: The pinned SDK reproduces platform-independent application artifacts from separate clean roots.
    Given the locked LexLean and PrismPM model sources
    When the generated implementation is checked for MM-12
    Then its independent acceptance oracle succeeds

