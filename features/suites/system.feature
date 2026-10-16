Feature: system

  @MM-10 @build
  Scenario: PrismPM browser-system /2 projects and verifies the bound application, artifact, component, mandatory controls, and GitHub Pages target.
    Given the locked LexLean and PrismPM model sources
    When the generated implementation is checked for MM-10
    Then its independent acceptance oracle succeeds

