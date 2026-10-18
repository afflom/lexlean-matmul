Feature: Modeled production reference workbench

  @MM-18 @build
  Scenario: An unfamiliar visitor can understand and navigate the exact arithmetic workbench
    Given the source-owned purpose, audience, method, limits, and documentation
    When a visitor opens the generated application without prior protocol knowledge
    Then the purpose, ordered instructions, navigation, and safe documentation links are available

  @MM-19 @build
  Scenario: Worked examples remain editable and compute genuine new answers
    Given a named source-owned example with a bound expected response
    When a visitor loads it and changes a matrix entry before computing
    Then the generated dispatcher returns the independently calculated changed result

  @MM-20 @build
  Scenario: Human-readable results preserve exact protocol semantics
    Given large integer, codec, IEEE, complex, dyadic, and tropical requests
    When the actual generated responses are presented as matrices and explanations
    Then cell order, exact values, witnesses, and request and response bytes remain consistent

  @MM-21 @build
  Scenario: Long computations and failures preserve a recoverable draft
    Given a worker computation, a delayed load, a previously cached Wasm module, and modeled protocol failures
    When the visitor cancels, times out, retries, or corrects an input
    Then each new engine fetch bypasses the cached module, visible states preserve inputs, and stale work cannot replace the current result

  @MM-22 @build
  Scenario: A keyboard and small-screen visitor can complete the guided journey
    Given the actual rendered workbench and the pinned semantic browser oracle
    When a visitor navigates by keyboard at mobile width and enlarged text
    Then labels, focus, status, contrast, target geometry, and contained matrix overflow meet the declared finite checks

  @MM-23 @build
  Scenario: A Pages visitor can understand and verify the local computation boundary
    Given the standalone Pages application and its source-owned browser-local and no-history privacy explanation
    When a visitor computes hostile-looking and ordinary operand strings
    Then no operands enter a network request, navigation URL, log, or persistent storage and links follow the source HTTPS policy

  @MM-24 @build
  Scenario: Production publication retains the accepted revision and its evidence
    Given a protected main revision and its accepted native browser bundle
    When the release deploys and observes the live HTTPS application
    Then the current-main policy and retention model bind the bounded acceptance, deployment, and publication records
    And the retained closure includes full source-defensive receipts and research browser screenshots

