Feature: application

  @MM-09 @build
  Scenario: One LexLean application model generates the native library, Core-Wasm, Holo archive, and accessible portable View.
    Given the locked LexLean and PrismPM model sources
    When the generated implementation is checked for MM-09
    Then its independent acceptance oracle succeeds

