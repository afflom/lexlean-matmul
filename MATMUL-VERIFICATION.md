# Matmul verification record

The research workbench extends the original production workbench with Text-V4,
all 24 guided operation families, 28 editable examples, selected-cell traces,
actual equivalent executions, complete codec/IEEE inspectors, and local cases.
MM-25 through MM-31 register their actual-runtime and browser acceptance.
[The research baseline](verification/research-r3-baseline.json) records seven
intended preimplementation failures against the accepted PR4 artifact.
[The workspace source diagnostic](verification/research-workspace-source.json)
records its exact source selection and kernel checks; it does not qualify a
generated application or publication. The original 184 accepted byte pairs
are additionally guarded by their complete ordered request/response hash.

The following records describe their stated historical source selections.
They are retained independently of the current release acceptance.

The original production workbench adds `Presentation.lex.tex` and `Workbench.lex.tex`,
the public Text-V3 profile, and MM-18 through MM-24. Its source corpus retains
all 158 original byte vectors and adds 26 guided/presentation cases. The large
escaped-response case uses shared closed byte blocks and balanced concatenation,
preserving its 96,221 expected bytes without changing default Lean elaboration settings. The metadata
reader admits only bounded literal/alias/byte-append expressions, with negative
controls for cycles, foreign calls, type/arity errors, and expansion limits.
The original eight arithmetic/protocol modules are unchanged.

[Workbench component evidence](verification/workbench-source-runtime.json)
records default-options kernel verification, all 26 new exact UI vectors,
155 representable raw wrappers across all 24 original operation families,
and both defensive presenter failures. Its three explicit raw-wrapper
exclusions concern invalid UTF-8 and framed requests beyond the input bound;
the original direct corpus retains those cases. The
[preservation audit](verification/production-source-preservation.json) records
unchanged original module bytes and acceptance-vector records. Both receipts
remain explicitly unqualified for release.

The [coherent workbench component](verification/production-workbench-component.json)
accounts for all 184 vectors and executes MM-18 through MM-23 on one unchanged
generated artifact, including all named defects and three browser engines.
Its real HTTP-cache check warms the actual Wasm, requires a fresh fetch from a
new engine, and rejects omission of the modeled `NoStore` policy. The
[registered cache regression](verification/production-cache-gate-r3.json)
records the earlier operational failure before the policy check was reached;
[the cross-revision observation](verification/production-cache-r3.json) first
reproduced a new interface using cached old Wasm. These component diagnostics
exclude final installed-SDK, containing-system, complete acceptance, and live
publication qualification.

The [verification custody regression](verification/verification-custody-regression.json)
executes the exact earlier digest owner in isolated roots: changes to Rust gate
sources, their manifests, the model-checking tool, Cargo configuration, and the
dependency policy previously retained the same digest. The corrected owner
binds those files and rejects all five stale-evidence mutations. Its six scoped
tests include restoration and separate-root stability; they do not qualify a
product release.

The production requirements and preimplementation browser failures are recorded
in [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md). Source proofs, generated
runtime probes, visual previews, and historical receipts retain their stated
scope. The full acceptance and protected publication jobs qualify each new
revision independently of those diagnostics.

The recorded application source selection passed Lean and leanchecker
verification before the explicit resource-profile migration, including all
158 modeled byte vectors. The unchanged five
mathematical modules contain 241 kernel-checked theorems. Full generated
application and deployment qualification require the complete `just vv` gate
and protected publication checks. Source verification establishes its recorded
scope independently of those release results.

## Recorded source evidence

[Application source evidence](verification/application-source-proof.json)
retains the actual command result, build manifest, source hashes, declaration
axiom audits, and process evidence for that application selection.
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
this optimization belongs to the complete release gate.
Laurent contraction merges signed digit products into a sorted grade ledger,
propagates coefficient carries, and performs one final signed subtraction.
Valuation counts a borrowed zero prefix before copying the unit once. IEEE
tables decode each book value once and select one cached product without
copying its entire row. Codec tables similarly decode each stored word once.
The [combined source audit](verification/owned-product-caches-source-audit.json)
preserves all 224 preceding theorem statements and proof trees and checks the
17 new certificates against the actual application attestation. Each new
certificate declares an empty axiom policy. The original policies remain exact.
The [resource-model audit](verification/text-v2-resource-model.json) checks that
the subsequent Text-V2 migration preserves all other semantic trees and all
158 vectors. `Model.lex.tex` owns its memory and stack constants; their closed
values equal the metadata used by the successful runtime diagnostic.
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
execute against the final SDK as part of complete acceptance.

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

The [final runtime diagnostic](verification/final-runtime-diagnostic.json)
records a successful normal upstream build of the complete 158-vector
application, with unchanged math and protocol sources. Only Text-V2 resource
metadata differs from the preceding source-proof selection: 32,767 maximum
pages and a 16 MiB stack. All 167 artifact hashes were checked before testing.
The resulting Core-Wasm passes 40 resource cases and 3,301 independent numerical
requests. The unchanged generated Node binding passes all 158 vectors, and
Chromium 157 passes the UI, transport recovery, asset, and MIME checks with no
external requests or page errors.

| Generated Core-Wasm diagnostic | Seconds | Observed memory pages |
| --- | ---: | ---: |
| Wide finite IEEE integer epilogue | 4.21 | 9,742 |
| Dense significand integer epilogue | 0.93 | 3,028 |
| Full dense IEEE product table | 4.22 | 12,574 |
| Maximum-exponent IEEE product table | 21.37 | 24,678 |
| Eight-stage composed codec table | 12.80 | 22,735 |

These measurements use the actual normal source-maintenance compiler output.
They remain explicitly unqualified for release and do not replace the final
immutable SDK, native system, complete acceptance, or publication gates.
The [browser boundary diagnostic](verification/browser-boundary-diagnostic.json)
also executes the wide and dense epilogues, composed codec table, and
maximum-exponent table through the unchanged generated Node binding and fresh
Chromium UI instances. All eight probes pass. The browser allocator's largest
observed memory size is 1,076 pages, about 70.5 MB; its memory behavior differs
from the Core-Wasm allocator measured above.

## SDK and release boundary

Execution uses only the immutable SDK selected by [prismpm.lock](prismpm.lock).
The SDK refreshes the exact OSV inputs and addresses
native compilation budgets, closed acceptance-list aliases, native compiler
stack setup, and explicitly modeled Core-Wasm resources. The normal Cargo
owner preserves generated resource flags when adding source-path remaps.
Its component tests
are dependency-maintenance evidence, not application qualification. No host,
vendored, handwritten, or reduced-fixture product implementation is admitted.

The [immutable SDK binding receipt](verification/immutable-sdk-binding.json)
records both original native builds, verified public artifacts, canonical
template outputs, and their installation. Its scope is SDK custody; it does
not replace complete application acceptance or live publication checks.

The [native browser-home regression](verification/production-browser-home-r3.json)
records MM-22's Firefox launch failure on both native CI architectures. The
credential mount left the inherited home unwritable. Each verification browser
now receives a private home and XDG directories, removed after close. The
exact-SDK comparison and restored three-engine journeys preserve the browser
pins, deadlines, scenarios, and planted defects; they remain diagnostic evidence
until the complete acceptance and publication boundary passes.

The containing native browser-system `/2` binds the application model digest,
generated artifact closure, mandatory controls, locked SPDX oracle, and Pages
target. Its release gate builds and inspects the native OCI artifact, exports
six browser files from a separate source-free root, and compares them with the
ordinary application build. Publication uses the captured accepted release
bundle, then checks HTTPS bytes and the live Chromium UI without rebuilding.

The native bundle regression distinguishes the full source graph from the
selected application snapshot. Its valid fixture failed the former equality
check between those different identities. `node --test
scripts/bundle-provenance.test.mjs` now accepts the valid case and rejects four
changes to the captured graph, manifest, snapshot, or model provenance. MM-10
runs these checks, and the release reader applies the same bindings to actual
SDK artifacts. The bundle retains the release-bound build manifest and its
selected application snapshot for source-free verification.

Historical receipts for older SDK failures remain under `verification/` as
bounded observations; they do not describe the current source coverage or
supply release acceptance.

The complete acceptance and publication staging commands are:

```console
./scripts/in-sdk.sh just setup
./scripts/in-sdk.sh just vv
./scripts/in-sdk.sh just pages
```

The diagnostic `just core-proof` checks identical Core source in isolation. It
cannot qualify application artifacts, skip acceptance vectors, or authorize a
Pages deployment.
