# Matmul verification record

The complete selected application source closure has passed Lean and
leanchecker verification, including all 158 modeled byte vectors. The five
mathematical modules contain 241 kernel-checked theorems. **Full generated
application acceptance and GitHub Pages deployment remain pending.** Source
verification is not a substitute for the repository's complete `just vv` gate.

## Current source evidence

[Application source evidence](verification/application-source-proof.json)
retains the actual command result, build manifest, source hashes, declaration
axiom audits, and process evidence for the unchanged application selection.
It explicitly records `qualified_for_release: false`: this diagnostic excludes
the containing native system and does not execute generated application
artifacts. The selected modules are Application, Atlas, Codec, CodecProtocol,
Core, Epilogue, ExtendedProtocol, Float, Model, Protocol, and the SDK-owned Text
V1 metadata module. Its attestation is
`ea837f70e39397fdd44c2708dd168c6f2186edbefe1e7d8c2717786fb60e12e3`.

| Mathematical module | Declarations | Theorems |
| --- | ---: | ---: |
| Core | 262 | 59 |
| Atlas | 170 | 54 |
| Float | 236 | 74 |
| Epilogue | 60 | 16 |
| Codec | 670 | 38 |

Owned records hold eager intermediate lists while public list facades retain
their original types. Four additional induction lemmas establish the owned
views used by the existing public preservation theorems.
Digit and bit workers borrow their inputs and move append accumulators through
tail calls. Ten additional worker theorems check prefix order, zero handling,
low zeros, borrow propagation, and prefix limits. Subtraction computes its
borrow and digit in scalar helpers before the recursive call, allowing the
actual Lean exporter and Rust generator to preserve the moved accumulator.
IEEE sticky-bit prefixes use the same bounded copy worker.
Integer IEEE epilogues compare canonical signed NAF expansions and apply the
shorter atom list to the other exact operand through shifts and additions. They preserve the
Atlas multiplication path for matrix operands and the existing non-finite and
fractional-scalar behavior. The [source audit](verification/integer-ieee-epilogue-source-audit.json)
checks that all 224 preceding mathematical theorems remain unchanged and the
five new scalar certificates have no axioms. Actual resource acceptance of
this optimization remains pending.
Laurent contraction merges signed digit products into a sorted grade ledger,
propagates coefficient carries, and performs one final signed subtraction.
Valuation counts a borrowed zero prefix before copying the unit once. IEEE
tables decode each book value once and select one cached product without
copying its entire row. Codec tables similarly decode each stored word once.
The [combined source audit](verification/owned-product-caches-source-audit.json)
preserves all 224 preceding theorem statements and proof trees and checks the
17 new certificates against the actual application attestation. Each new
certificate declares an empty axiom policy. The original policies remain exact.
E8 rows use the same owned storage pattern;
the independent oracle still validates every symbol against the pinned table.
Computational definitions use distinct names across modules because the
generated Rust package has one function namespace. The naming audit reverses
the 101 definition renames and their references, then verifies the original
semantic trees, all 158 byte vectors, and unchanged theorem and datatype names.
The application roots retain the same members under their new names and are
canonically ordered.

Each theorem carries an exact observed axiom policy. Concrete examples and
component lemmas do not establish a universal refinement theorem for every
arbitrary precision operation. Runtime agreement, kernel evidence, imported
reference facts, and release integrity remain separate claims.

The source corpus retains the original 62 cases, including the 16,385-byte and
32,768-byte requests. It adds 47 IEEE, terminal-encoding, and epilogue cases,
plus 49 compositional-codec, arena, and invalid-complex-input cases. Closed
list aliases group these vectors without reducing their original bytes.

## Falsification and runtime gates

The complete mutation gate plants source-policy defects, a false Core theorem,
zero integer multiplication, incorrect IEEE nearest rounding, an Atlas ternary
sign defect, and reversed packed-code fields. It requires the intended generated
proof failure, restores exact bytes, and verifies the restored result. The
scoped [Core](verification/core-falsification.json),
[Float](verification/float-falsification.json),
[Atlas](verification/atlas-falsification.json), and
[Codec](verification/codec-falsification.json) receipts demonstrate those
mathematical gates in isolation; each remains explicitly unqualified for release.

Independent runtime oracles check the actual manifest-bound Core-Wasm against
software integer and IEEE references, all E8 symbols, codec compositions,
geometry limits, and typed failures. Browser acceptance loads the unchanged
SDK-generated wasm-bindgen JS/Wasm, checks the modeled corpus and transport
failures, then drives the generated UI in the SDK-pinned Chromium. These gates
must execute successfully against the final SDK before runtime acceptance is
claimed.

The [maximum-domain regression record](verification/resource-regression-red.json)
retains observed failures from a captured earlier compiler output: 8-by-8
tables with 4,096 distinct products and a wide finite binary64 result exhausted
its 1 GiB allocator. These cases now belong to the ordinary numerical oracles.
Their captured diagnostics do not supply release acceptance.

The [integer IEEE epilogue regression](verification/integer-ieee-epilogue-red.json)
records two further failures in a successful normal Text-V2 build. Both the
wide finite cancellation and dense significand GEMM reach the modeled 32,767
page limit when applying 64-digit integer scalars. Their unscaled cases return
the independent expected bytes. The exact request and expected hashes now
belong to MM-13 and MM-16; the diagnostic record does not qualify those gates.

The [dense IEEE table regression](verification/dense-ieee-table-red.json)
adds a valid 64-entry codebook with 64 distinct activations and 4,096 distinct
exact products. Its actual generated guest also reaches the modeled page
limit. MM-13 and MM-16 retain this case before any Laurent contraction change.

The [composed codec table regression](verification/composed-codec-table-red.json)
combines 64 eight-element book words with seven full-width offsets in a valid
15,985-byte request. Its direct path returns the exact result; its table path
reaches the page limit while repeatedly decoding the same words. MM-17 retains
both paths and deep-composition shape and lazy-decoding checks.

## SDK and release boundary

Execution uses only the immutable SDK selected by [prismpm.lock](prismpm.lock).
The in-progress SDK maintenance refreshes the exact OSV inputs and addresses
native compilation budgets, closed acceptance-list aliases, native compiler
stack setup, and explicitly modeled Core-Wasm resources. The normal Cargo
owner preserves generated resource flags when adding source-path remaps.
Its component tests
are dependency-maintenance evidence, not application qualification. No host,
vendored, handwritten, or reduced-fixture product implementation is admitted.

The containing native browser-system `/2` binds the application model digest,
generated artifact closure, mandatory controls, locked SPDX oracle, and Pages
target. Its release gate builds and inspects the native OCI artifact, exports
six browser files from a separate source-free root, and compares them with the
ordinary application build. Publication uses the captured accepted release
bundle, then checks HTTPS bytes and the live Chromium UI without rebuilding.

Historical receipts for older SDK failures remain under `verification/` as
bounded observations; they do not describe the current source coverage or
supply release acceptance.

The complete acceptance and publication staging commands are:

```console
./scripts/in-sdk.sh just vv
./scripts/in-sdk.sh just pages
```

The diagnostic `just core-proof` checks identical Core source in isolation. It
cannot qualify application artifacts, skip acceptance vectors, or authorize a
Pages deployment.
