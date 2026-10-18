Feature: Complete modeled exact arithmetic research journeys

  @MM-25 @build
  Scenario: Every operation explains its actual selected output or normalization
    Given all 24 operation families with exact inputs, zero dimensions, and domain-specific epilogues
    When a visitor computes and selects each output cell or recentered coordinate
    Then the generated trace exposes the actual decoded terms, ordered accumulations, applicable epilogues, witnesses, and terminal encoding without truncation

  @MM-26 @build
  Scenario: Every operation executes an equivalent route on the same inputs
    Given direct and tabulated storage routes or an implemented alternate exact reduction or normalization schedule for every operation family
    When a visitor compares routes without changing the parsed operands or terminal policy
    Then both routes execute and independently agree on exact semantic results, shapes, witnesses, and encodings while incompatible requested routes have typed explanations and another executable comparison remains available

  @MM-27 @build
  Scenario: A local case round trip recomputes exact results with explicit identity
    Given a bounded versioned case containing canonical request data and declared implementation identity
    When a visitor exports it, edits or clears the draft, imports it, and recomputes
    Then exact request values survive and fresh generated arithmetic determines the result while malformed, incompatible, oversized, and forged-result cases cannot replace the current draft or become computation authority

  @MM-28 @build
  Scenario: Codec inspection follows every actual wrapper mapping
    Given grid, book, sign, ternary, E8, packed, offset, transcode, and runs stages including bounded nested compositions
    When a visitor selects a stored symbol and a decoded output position
    Then the inspector shows the actual inner code and position at each stage, low-field packing, modulo or mapping selection, signed offset, run length, and resulting decoded value

  @MM-29 @build
  Scenario: IEEE inspection explains exact bits, finite atoms, and terminal rounding
    Given both IEEE formats, every value class, finite Laurent normalization, Atlas contraction, and all declared output modes
    When a visitor inspects actual operand bits and a selected computed output
    Then original sign, exponent, fraction and payload bits remain exact, finite dyadic and non-adjacent atoms reconstruct their values, and rounding or non-finite behavior agrees with the actual terminal response

  @MM-30 @build
  Scenario: Every operation has a complete guided research journey
    Given all 24 guided operation families and all preserved named editable examples
    When visitors use keyboard navigation, each pinned browser, mobile reflow, and enlarged text to compute, select cells, compare routes, handle cases, and open applicable inspectors
    Then every journey reaches readable exact results with source-owned labels, focus, tables, limits, recovery instructions, and no unsupported-family placeholder
    And switching from a guided family into raw input renders the source-declared initial-operation research controls and executes correlated raw trace and inspection actions
    And standalone codec and IEEE inspectors and their exact local case round trips remain usable despite invalid unrelated matrix-coordinate text

  @MM-31 @build
  Scenario: Research state remains correlated, recoverable, accessible, and local
    Given real delayed or failed computation and research work, edited drafts, imported cases, and hostile-looking operands
    When a visitor cancels, times out, retries, changes a cell or route, imports a replacement, or follows an explicit export action
    Then stale reports cannot replace current trace, comparison, inspection, or case data, drafts remain recoverable, live status stays outside busy ancestors, and operands enter only the requested local case output rather than URLs, telemetry, logs, or persistent history
    And valid local case import restores its fresh source draft despite unrelated empty required fields or invalid selected-coordinate text
    And every selected-coordinate input edit retires pending work before blur or change, preserves exact valid or invalid text, and permits explicit typed rejection or corrected recovery
    And accepted publication evidence retains the complete bound source-defensive receipt and research browser screenshots
