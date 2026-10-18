# LexLean Matmul

A pure LexLean implementation of the UOR matrix multiplication method, modeled
with PrismPM: **decode the code, accumulate exactly, encode once**. Its sources
cover exact integer, complex, dyadic, IEEE binary32/binary64, and max-plus
arithmetic, compositional codecs, and canonical Laurent atom contraction.

The product authority is `src/*.lex.tex`. LexLean generates Lean definitions
and kernel evidence; PrismPM generates the native library, Core-Wasm, Holo
archive, and portable browser application. Repository Rust and JavaScript
provide verification and packaging. Shipped matrix arithmetic and request
handling remain LexLean declarations.

[Open the application](https://afflom.github.io/lexlean-matmul/) ·
[Acceptance and deployment runs](https://github.com/afflom/lexlean-matmul/actions/workflows/pages.yml)

Choose a calculation, load a worked example, and edit its matrices. Entries
accept spaces, commas, or line breaks. Compute displays the actual exact result,
its interpretation, and inspectable protocol bytes. All 24 operation families
have guided forms, with 28 editable worked examples. The advanced editor accepts
the complete [version 1 protocol](PROTOCOL.md).

Select an output cell to trace its actual decoded operands, contributions,
accumulation, epilogue, and terminal encoding. Compare equivalent executions
over the same inputs and inspect their exact commands and responses. The codec
inspector follows every composed stage to a selected decoded coordinate; the
IEEE inspector explains binary32/binary64 fields, exact values, and Laurent
atoms. Both inspectors also work as independent tools.

Export a local case to retain inputs, selected cell, inspection settings, model
identity, and the observed answer. Importing recomputes the case and compares
every saved response byte. A different model identity requires explicit
recomputation. See [RESEARCH-WORKBENCH.md](RESEARCH-WORKBENCH.md) for the journeys
and interchange contract.

On GitHub Pages, calculations run in a browser worker. Cancel and retry preserve the current
draft, while changing an input clears the previous result. Calculation history
is not saved in browser storage. The page includes method, limits, privacy,
and recovery guidance. [Production requirements](PRODUCTION-READINESS.md)
identify stakeholders and the finite accessibility and release checks.

Release qualification requires the complete `just vv` gate and the protected
Pages publication checks. Component proofs and diagnostic builds establish
their recorded scope. See [MATMUL-VERIFICATION.md](MATMUL-VERIFICATION.md) for
the evidence and release boundary.

## Build and verify

The host needs Git and Docker. Use the immutable SDK selected by
`prismpm.lock`, or open the pinned devcontainer:

```console
./scripts/in-sdk.sh just setup
./scripts/in-sdk.sh just vv
./scripts/in-sdk.sh just pages
```

`setup` fetches immutable standards and package inputs. `vv` checks the model,
SDK and template identities, source ownership, kernel proofs, generated native
and Wasm behavior, independent arithmetic oracles, two clean build roots,
planted defects, and the native system release. `pages` stages the accepted
SDK browser export in ignored `public/`.

The core also has an isolated diagnostic check:

```console
./scripts/in-sdk.sh just core-proof
```

This checks the identical `src/Core.lex.tex` and records
`.prism/matmul/core-proof.json`; it does not qualify application artifacts.

## Arithmetic and codecs

Signed integers use canonical software digit lists. Exact accumulation keeps
its precision through `alpha*A*B + beta*C`, column bias, complex arithmetic,
and dyadic arithmetic. Output encoders apply signed wrapping, saturation, or
rounding after the complete result. Max-plus arithmetic keeps negative
infinity separate from finite integers, supplies the least attaining index,
and supports canonical recentering.

IEEE operands are unsigned binary32 or binary64 bit patterns. Finite products
normalize into canonical non-adjacent Laurent atoms, contract the ternary
product table by addition, and reach one terminal IEEE encoder. The source
models ties to even, subnormals, overflow, signed underflow, NaN and infinity,
and the zero-beta overwrite rule. IEEE codebooks retain distinct signed zeros
and NaN payloads as symbols; result encoding follows the reference's
canonicalization rules.

The general codec model covers scalar and block books, total grid indexing,
low-first packing, sign and ternary blocks, offsets, runs, transcodes, the
pinned E8 table, and canonical IEEE arenas. Direct decoding and product-table
gathering feed exact accumulation. The earlier scalar `coded` and `table`
requests retain their declared canonical-index interface; the general `codec`
interface handles stored code widths and compositions.

The browser protocol declares dimensions from zero through eight, at most 64
magnitude digits per input coefficient, and explicit byte budgets. These are
transport bounds. See [PROTOCOL.md](PROTOCOL.md) for requests and examples, and
[PORTING.md](PORTING.md) for the reference correspondence and substrate choices.
The Text-V4 application model also declares a maximum of 32,767 Core-Wasm memory
pages and a 16 MiB stack; actual memory grows with the request.

## Model and source map

| Authority | Responsibility |
| --- | --- |
| `src/Core.lex.tex` | Software integers, exact scalar domains, direct and partitioned products, block tables, witnesses, and recentering |
| `src/Atlas.lex.tex` | Valuation, canonical NAF atoms, signed Laurent grades, Euclidean addresses, and ternary contraction |
| `src/Float.lex.tex` | IEEE decode, Atlas-backed exact products, terminal IEEE and signed integer encoding |
| `src/Epilogue.lex.tex` | Exact integer and complex biases, linear and max-plus epilogues, terminal complex/tropical encoding |
| `src/Codec.lex.tex` | Validated compositional codecs, decoded row shapes, E8 data, canonical arenas, and product tables |
| `src/Model.lex.tex` | Shared identity, budgets, selected entry root, and deployment constants |
| `src/Protocol.lex.tex` | Original exact-domain requests, canonical values, and typed failures |
| `src/ExtendedProtocol.lex.tex` | IEEE, output-encoding, and epilogue requests |
| `src/CodecProtocol.lex.tex` | General codec and canonical arena requests; delegates the existing operations |
| `src/Workbench.lex.tex` | Guided input normalization, exact response interpretation, bounded JSON, and typed presenter failures |
| `src/ResearchModel.lex.tex`, `src/ResearchTrace.lex.tex` | Typed research inputs and selected-cell reconstruction checked against the actual terminal response |
| `src/ResearchCompare.lex.tex` | Independent equivalent routes and exact alternate execution schedules |
| `src/ResearchInspect.lex.tex`, `src/Research.lex.tex` | Composed codec and IEEE inspectors and their public source APIs |
| `src/ResearchJson.lex.tex`, `src/ResearchCases.lex.tex` | Closed JSON parsing, versioned local cases, Unicode and schema validation |
| `src/ResearchForms.lex.tex`, `src/ResearchWorkspace.lex.tex` | All guided serializers, action envelopes, case recomputation, exact comparisons, and response bounds |
| `src/Presentation.lex.tex` | Purpose, instructions, fields, examples, error assistance, design, and execution policy |
| `src/Application.lex.tex` | Application roots, byte-level acceptance vectors, Core-Wasm, and portable View |
| `src/MatmulSystem.lex.tex` | Native `Production.BrowserSystem.SystemModel`, component/artifact bindings, controls, and Pages target |
| `model/*.toml`, `features/suites/` | Registered claims, pinned authorities, and behavioral acceptance scenarios |

The public `prismpm/text-application/4` profile models the complete workbench.
The SDK generates generic controls, framing, semantic rendering, and worker
lifecycle from that closed model. Product arithmetic and interpretation remain
LexLean. The containing system uses PrismPM's native browser-system `/2` model. Its
acceptance path binds the selected application digest, complete artifact
inventory, mandatory controls, locked SPDX validation, and GitHub Pages target.

## GitHub Pages

The workflow runs the complete acceptance gate before uploading the browser
assets. The native release path builds and inspects an immutable OCI release,
then exercises the SDK's `export-browser` API from a separate directory that
contains the captured OCI store and no product source or configuration. Pages
uses those same six exported assets.

Deployment runs separately on protected `main` through the `github-pages`
environment. An immediate revision check requires the accepted revision to be
current `main` before publication. Subsequent jobs verify the published bytes
against both the accepted SDK release and the uploaded archive and exercise
the live application. The modeled destination is
`https://afflom.github.io/lexlean-matmul/`. The workflow retains acceptance and
bounded success/failure publication receipts for each revision for 30 days.

The pure implementation uses persistent data and software arithmetic. Native
SIMD throughput, caller-owned scratch, zero allocation, raw BLAS ABI, mutable
strided views, and serialized upstream codec-artifact compatibility are outside
this repository's declared interface.

Licensed under either MIT or Apache-2.0.
