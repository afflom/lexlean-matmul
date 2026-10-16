Feature: exact

  @MM-01 @build
  Scenario: Integer GEMM decodes operands, accumulates exact products, and applies the linear epilogue once.
    Given the locked LexLean and PrismPM model sources
    When the generated implementation is checked for MM-01
    Then its independent acceptance oracle succeeds

  @MM-03 @build
  Scenario: Partitioned and tabulated accumulation agrees with direct accumulation, including partial blocks.
    Given the locked LexLean and PrismPM model sources
    When the generated implementation is checked for MM-03
    Then its independent acceptance oracle succeeds

  @MM-04 @build
  Scenario: Complex integer products and dyadic products retain exact arithmetic through reduction.
    Given the locked LexLean and PrismPM model sources
    When the generated implementation is checked for MM-04
    Then its independent acceptance oracle succeeds

