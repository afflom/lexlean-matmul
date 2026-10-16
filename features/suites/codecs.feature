Feature: codecs

  @MM-02 @build
  Scenario: Signed binary, ternary, and signed eight-bit codecs preserve their declared decoded values.
    Given the locked LexLean and PrismPM model sources
    When the generated implementation is checked for MM-02
    Then its independent acceptance oracle succeeds

