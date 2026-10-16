# Matmul verification record

The complete selected application source closure has passed Lean and
leanchecker verification, including all 158 modeled byte vectors. The five
mathematical modules contain 222 kernel-checked theorems. **Full generated
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
`7bfc15908ee0e0e95556f2022ba134549b913b933074a641bd06f9163ea1ea3f`.

| Mathematical module | Declarations | Theorems |
| --- | ---: | ---: |
| Core | 260 | 59 |
| Atlas | 132 | 47 |
| Float | 214 | 65 |
| Epilogue | 60 | 16 |
| Codec | 656 | 35 |

Owned records hold eager intermediate lists while public list facades retain
their original types. Four additional induction lemmas establish the owned
views used by the existing public preservation theorems.
Digit and bit workers borrow their inputs and move append accumulators through
tail calls. Eight additional worker theorems check prefix order, zero handling,
low zeros, and borrow propagation. E8 rows use the same owned storage pattern;
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

## SDK and release boundary

Execution uses only the immutable SDK selected by [prismpm.lock](prismpm.lock).
The in-progress SDK maintenance refreshes the exact OSV inputs and addresses
large byte-literal compilation, closed acceptance-list aliases, native compiler
stack setup, and explicitly modeled Core-Wasm resources. Its component tests
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
