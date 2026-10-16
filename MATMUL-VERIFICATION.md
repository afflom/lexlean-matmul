# Matmul verification record

The unchanged mathematical core and protocol have passed kernel verification.
The complete application has not been accepted. **Application build is blocked
by the pinned SDK.** A component result below does not establish generated
runtime, reproducibility, or deployment acceptance.

Execution uses the development SDK selected by [prismpm.lock](prismpm.lock):

```text
ghcr.io/uor-foundation/prismpm-sdk-candidate@sha256:60226bc791d4c0e5613402a6be7e63f4963d3faf7f327befcf56fc0e41d0ce21
```

It contains PrismPM 0.3.0, LexLean 0.3.0 with language 1.1 support, and Lean
4.32.1. Its own release status identifies it as an unaccepted development
candidate. The observed runs used Linux AMD64.
[template.lock](template.lock) binds the actual
[template policy revision `1bea460bac6ea50bae53a7eeb674589d7900e6cb`](https://github.com/UOR-Foundation/template/tree/1bea460bac6ea50bae53a7eeb674589d7900e6cb).
The shared Action is pinned to
`UOR-Foundation/PrismPM/action@f785ee46d794886c29b7efe80c2b261e48733a15`.
Both SDK platform inventories were extracted by the unchanged upstream
bootstrap; template and SDK lock checks passed.

| Observed check | Result and evidence scope |
| --- | --- |
| Unchanged `Core.lex.tex` | Lean, leanchecker, and exact axiom audits passed for 193 declarations, including 40 theorems. [Core receipt](verification/core-proof.json). |
| Actual repository `Protocol.lex.tex` | Kernel verification passed for its three-module closure. [Source diagnostics](verification/source-diagnostics.json). |
| Ordinary application build | Failed with SDK `PP5001` after compiling Core, Protocol, and metadata; required large application fixtures exceed Lean limits. [Build failure](verification/application-build-failure.json). |
| Complete `just vv` | Failed at `product-build` with the same `PP5001`. The preceding model, trust-root, formatting, source policy, and Clippy checks passed. Later application gates did not execute. [Observation](verification/full-gate.json), [transcript](verification/full-gate.log). |
| Complete source graph | `prismpm --json check` passed static model projection. [Model check receipt](verification/model-check.json). |
| Repository infrastructure | Source ownership policy, formatting, Clippy, all-feature/all-target checks, 17 infrastructure tests, four meta tests, and dependency policy checks passed. These component checks do not run product runtime conformance. |
| Clean GitHub Actions | Both architecture bootstrap jobs and the corrected Pages acceptance job fail `PP5401` at the locked crates.io OSV generation (HTTP 404). Deployment jobs do not run. [CI observations](verification/ci.json). |
| SDK image advisory replay | Both locked platform images were scanned using the locked database set, with zero policy rejections. This is dependency evidence only. [Summary](verification/sdk-advisory-summary.json). |
| Arithmetic defect | Replacing `integerMultiply` with zero caused `lexlean verify` to reject arithmetic theorems with `LLV7002`. Restoring the original bytes passed and reproduced the original attestation. [Falsification record](verification/core-falsification.json). |
| Arithmetic mutation detector | Both a false theorem and multiplication replaced with zero failed specifically at `Core.largeProduct`; the detector requires its generated source location and proof failure. This isolated probe is not the full artifact mutation gate. [Diagnostic record](verification/arithmetic-mutation-policy.json). |
| Source/documentation defects | Handwritten product code, a stale error register, missing reachable error vectors, and missing native error proofs each failed their intended policy check; restored source passed. These are prefix checks only. [Falsification record](verification/policy-falsification.json). |

The Core attestation is
`b3c14e333805689397c418dffd9c59834d38bdbb22eb7552c3c7fb1f02f0beaa`.
The actual Protocol closure attestation is
`4df75f75c987eca89a23d0d438ea220ea5fb62efa9bee7f6afa106bf465add3f`.
The receipts bind source identities and observed axiom policies; concrete
arithmetic examples do not establish a universal refinement theorem for the
arbitrary precision implementation.

The System proof has a narrower observation. An isolated temporary copy
verified six modules while preserving Core, Model, Protocol, and MatmulSystem
bytes and removing application constants `acceptanceVector45` and
`acceptanceVector46`. Its [record](verification/source-diagnostics.json)
explicitly sets `qualification: false`. This localizes the application-data
failure; it does not verify the complete repository application. The
authoritative application retains both required vectors.

Complete `lexlean verify` failed with `LLV7002` on the generated application:
the 16,385-byte and 32,768-byte request fixtures reached Lean's recursion depth
512 and heartbeat limit 200,000. A separate temporary dispatch-proof probe
also found that imported byte/string wrappers prevented the supported
`decide` and reflexivity proofs from reducing even a small request; its
[diagnostic record](verification/corpus-sdk-limit.json) carries no product
qualification. Generated native/Core-Wasm/Holo runtime acceptance, independent
runtime oracles, two-root reproduction, and GitHub Pages acceptance remain
unexecuted.

Cold acquisition of the locked OSV GCS generations returned HTTP 404. The five
original snapshots were recovered from existing local content-addressed
caches, checked against their exact SHA-256 values in
[standards.lock](standards.lock), and placed in the ignored authority cache.
The SDK continues to validate those locked bytes. This recovery supplies exact
dependencies for local verification; the public cold-fetch URLs remain broken.
No standards binding was replaced with a newer snapshot.

The installed candidate also lacks the newer `Production.BrowserSystem` `/2`
profile. [MatmulSystem.lex.tex](src/MatmulSystem.lex.tex) therefore declares a
project-owned typed architecture and validator. There is no accepted
SDK-generated browser-system `/2` release or observed Pages deployment.
SDK behavior remains inside the locked image; there is no host, vendored, or
handwritten product fallback.

Run the diagnostic mathematical check with:

```console
./scripts/in-sdk.sh just core-proof
```

This checks the identical Core source in isolation and writes
`.prism/matmul/core-proof.json`. The complete acceptance command remains:

```console
./scripts/in-sdk.sh just vv
```

`core-proof` cannot qualify an application or substitute for `vv`. The complete
gate retains application boundary fixtures, generated artifact checks,
independent runtime tests, reproduction, and planted defects. Pages staging
requires the complete accepted evidence; this verification record supplies no
reduced release path.
