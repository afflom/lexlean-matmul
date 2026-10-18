# Research workbench

The application serves learners, numerical researchers, codec developers,
integrators, and reviewers through one modeled workbench. Its public Text-V4
view and user journeys are declared in `src/Presentation.lex.tex`. All arithmetic,
inspection, case validation, and comparison execute generated LexLean.

## Journeys

| Task | Interaction | Result |
| --- | --- | --- |
| Learn a calculation | Choose any of the 24 operations, load one of 28 examples, edit its fields, and compute | Actual exact result, interpretation, and original request/response bytes |
| Explain an output | Select a zero-based row and column, then trace | Actual operands and decoded contributions, exact accumulation, epilogue, and terminal encoding checked against the computed result |
| Compare implementations | Choose an applicable route or automatic comparison | Two actual executions over identical inputs, complete responses, and an equivalence decision; commands can be replayed independently |
| Examine stored data | Select an operand/index/decoded coordinate, or use the standalone codec tool | Full root-to-leaf codec path, actual transformed codes, widths, decoded word length, and selected value |
| Examine IEEE data | Inspect a matrix value, or enter a format and unsigned bit pattern in the IEEE tool | Sign/exponent/fraction, classification, exact finite interpretation, canonical NAF/Laurent atoms, and terminal behavior |
| Preserve and review a case | Export; later choose a local JSON file and import | Validated inputs and controls, saved/current identities, a fresh execution, and comparison with the exact saved observation |

Direct decoding and table gathering are compared where both exist. Other
families use a separately executed reverse or partitioned exact schedule.
Tropical ties retain the least original witness index. The interface reports
incompatible route selections explicitly.

Codec inspection covers grid, book, sign, ternary, E8, packed, offset,
transcode, and runs. It follows the selected coordinate without materializing
an arbitrarily large decoded word. Unknown runs have zero length; the inspector
stops there without inventing a child code or value. Coordinates use validated
unsigned 64-bit representation and are checked against the actual decoded word.

## Local case interchange

A case is UTF-8 JSON with exactly these fields:

| Field | Meaning |
| --- | --- |
| `schema` | Exactly `lexlean-matmul/case/1` |
| `version` | Exactly `1` |
| `implementation` | Lowercase 64-digit SHA256 identity of the generated application model |
| `operation` | A guided operation ID, `raw`, `codec-tool`, or `ieee-tool` |
| `values` | Ordered guided field strings; empty for raw requests and independent tools |
| `request` | Exact canonical arithmetic request, exact raw draft, or empty for a tool |
| `response` | Exact observed arithmetic response or canonical source-generated tool report |
| `controls` | Ordered inspection settings or independent-tool fields |
| `row`, `column` | Zero-based selected cell; bounded indices checked against the fresh output shape; independent tools use `0,0` |
| `action` | `compute`, `codec-tool`, or `ieee-tool`, consistent with the operation |

Files use `lexlean-matmul.case.json` when downloaded. The parser rejects
duplicate, missing, additional, incorrectly typed, and unsupported-version
fields; malformed UTF-8/Unicode; inconsistent guided requests; invalid settings;
and declared byte-budget violations. A rejected import preserves the current
draft. Typed errors and recovery guidance are generated in [ERRORS.md](ERRORS.md).
A valid case can replace an unfinished draft, including an empty required matrix
field or invalid selected-coordinate text. Standalone tools and their cases
remain independent of the matrix selection.

The renderer checks the actual adapter identity before submitting actions. A
same-identity import executes the current source and compares every response
byte. A different identity shows both identities and requires explicit
recomputation before presenting a fresh answer. Saved answers never supply the
current calculation. Exact observations are displayed as numbered JSON-string
chunks; decoding and concatenating each category reconstructs the entire saved
or fresh response, including control characters and non-ASCII text.

An arithmetic failure can itself be exported and recomputed as a case. Editing
a restored draft starts a new calculation. Exporting always computes from the
current draft, so an earlier displayed answer cannot be silently attached to
edited inputs.

## Execution and bounds

The original version 1 arithmetic protocol and original presentation frames
retain their byte-exact behavior and 16 KiB request limit. Text-V4 actions use
a closed source-owned JSON envelope with a separate 2 MiB transport request
limit, 4 MiB response limit, and 1 MiB local case-file limit. These budgets apply
to encoded UTF-8 bytes, including framing and escaping. Ordinary computations
have a 30-second worker deadline; research actions have a 180-second deadline.
The source declares the selected limits and error recovery.

Loading, computing, cancellation, timeout, retry, input changes, operation
changes, file reads and case recomputation share a declared ownership lifecycle.
Every coordinate input edit retires pending work before blur. An older worker
or file read cannot overwrite newer inputs or results. Reports
paginate with all rows reachable. Files and calculations stay in the browser;
explicit downloads create local files. No calculation history is persisted.

## Acceptance boundary

MM-25 through MM-31 cover these journeys alongside the previous 24 capabilities.
They exercise actual generated guest results, independent arithmetic and codec
references, command replay, malformed inputs, planted report defects, worker
ownership failures, file failures, and Chromium/Firefox/WebKit interaction.
Source-only defensive fixtures call unchanged production functions for otherwise
unreachable malformed prepared states; they are separate diagnostic applications.

The complete unfiltered `just vv` in the immutable selected SDK, both native CI
platforms, clean reproduction, protected merge, and fresh-main Pages publication
checks qualify a release. Historical baselines and component diagnostics retain
their recorded scope and cannot qualify a later revision.
