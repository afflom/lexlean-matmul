Feature: codec

  @MM-17 @build
  Scenario: Total scalar and compositional codebooks decode stored symbols before the shared exact direct or tabulated matrix traversal.
    Given the locked LexLean and PrismPM model sources
    When the generated implementation is checked for MM-17
    Then its independent acceptance oracle succeeds
