Feature: floating

  @MM-13 @build
  Scenario: IEEE binary32 and binary64 products decode exactly and encode once with the requested rounding and non-finite semantics.
    Given the locked LexLean and PrismPM model sources
    When the generated implementation is checked for MM-13
    Then its independent acceptance oracle succeeds

  @MM-14 @build
  Scenario: Signed integer output encoders wrap or saturate the exact result at the requested width without intermediate loss.
    Given the locked LexLean and PrismPM model sources
    When the generated implementation is checked for MM-14
    Then its independent acceptance oracle succeeds
