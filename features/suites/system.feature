Feature: system

  @MM-10 @build
  Scenario: The PrismPM browser system binds the application, artifact, component, controls, and GitHub Pages target.
    Given the locked LexLean and PrismPM model sources
    When the generated implementation is checked for MM-10
    Then its independent acceptance oracle succeeds

