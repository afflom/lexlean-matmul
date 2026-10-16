Feature: proofs

  @MM-08 @build
  Scenario: LexLean generates kernel-checked arithmetic and codec theorems with explicit axiom policies.
    Given the locked LexLean and PrismPM model sources
    When the generated implementation is checked for MM-08
    Then its independent acceptance oracle succeeds

