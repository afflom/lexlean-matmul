# LexLean Matmul

A pure LexLean implementation of UOR matrix multiplication, modeled with
PrismPM: **decode the code, accumulate exactly, encode once**.

The product authority is `src/*.lex.tex`. LexLean generates Lean and its
kernel evidence; PrismPM generates the library, Core-Wasm, Holo archive, and
portable browser application. Repository Rust and JavaScript implement
verification and packaging, never matrix arithmetic in the shipped product.

The pinned PrismPM 0.3.0 image is a development candidate, not an accepted
production SDK. The complete acceptance boundary is `just vv`; individual
source checks do not establish a releasable application. The unchanged core and
protocol pass kernel checks. Complete application verification currently fails
on the SDK candidate's Lean limits for required large byte literals; native,
Wasm, and Pages acceptance have not passed. See
[MATMUL-VERIFICATION.md](MATMUL-VERIFICATION.md) for observed results and
external dependency limitations.

## Build and verify

The host needs Git and Docker. Run commands through the exact SDK selected by
`prismpm.lock`, or open the pinned devcontainer:

The mathematical core can also be checked independently, without downloading
the application's standards corpus:

```console
./scripts/in-sdk.sh just core-proof
```

This checks the identical `src/Core.lex.tex` in an isolated LexLean workspace
and records `.prism/matmul/core-proof.json`. It does not qualify the application.

```console
./scripts/in-sdk.sh just setup
./scripts/in-sdk.sh just vv
./scripts/in-sdk.sh just pages
```

`setup` fetches immutable standards and package inputs. `vv` checks template
and SDK identities, generated conformance, pure source ownership, kernel
proofs, native and Wasm behavior, independent exact arithmetic oracles,
artifact closure, two clean build roots, and planted defects. A failed or
missing check fails the gate. `pages` stages the exact verified six-file
browser projection in ignored `public/`; it does not compile another UI.

## Exact arithmetic

The runtime represents signed integers as a sign and a canonical list of
base-ten digits. The SDK's fixed-width natural numbers are used for individual
digits, bounded carries, dimensions, and indexes. The accumulator itself has
no fixed-width overflow envelope.

Integer GEMM computes `alpha * sum(A[i,k] * decode(B[k,j])) + beta * C[i,j]`
with one linear epilogue. Partitioned reduction and precomputed product tables
implement the same exact result. Complex entries use pairs of exact integers;
dyadic entries use an exact coefficient and a nonnegative power-of-two
scale. Max-plus entries distinguish every finite integer from negative
infinity, select the least attaining index, and support canonical recentering.

The portable request interface declares an eight-by-eight presentation
envelope, at most 64 magnitude digits per input coefficient, and byte budgets.
These transport constraints do not change the core arithmetic definitions.
See [PROTOCOL.md](PROTOCOL.md) for the versioned interface and copyable inputs.

## Model and source map

| Authority | Responsibility |
| --- | --- |
| `src/Core.lex.tex` | Arbitrary precision arithmetic, codecs, direct/partitioned/tabulated multiplication, exact scalar domains, and mathematical evidence |
| `src/Model.lex.tex` | Shared identity, budgets, and deployment constants |
| `src/Protocol.lex.tex` | Typed requests and failures, transport bounds, parsing, and response encoding |
| `src/Application.lex.tex` | PrismPM text application, native roots, byte-level acceptance vectors, Core-Wasm and portable View |
| `src/MatmulSystem.lex.tex` | Product, component/artifact links, deployment target, controls, risks, and model validation |
| `model/*.toml` | Conformance IDs, authority citations, and claim levels |
| `features/suites/` | Acceptance scenarios for every registered capability |

The SDK candidate does not implement the newer PrismPM browser-system `/2`
projection. The containing system is therefore a project-owned typed model
with kernel-checked validation in the source graph; it is not described as an
SDK-generated production system release. This limitation is explicit in the
verification record.

## GitHub Pages

The Pages workflow checks the complete acceptance boundary before uploading
`public/`, then deploys the same artifact in a separate job with Pages-only
write permissions. Pull requests have read-only build authority. Deployment
uses the repository's `github-pages` environment and the modeled destination
`https://afflom.github.io/lexlean-matmul/`.

No public deployment is implied by the presence of this workflow. Its build
must pass, Pages must be enabled, and the deployment result must be observed.

## Reference boundary

[PORTING.md](PORTING.md) maps this implementation to the pinned UOR reference
and explains mathematical and substrate differences. This repository does not
claim native SIMD performance, zero heap allocation, BLAS ABI compatibility,
or complete IEEE binary32/binary64 rounding and exceptional-value behavior.
Its dyadic domain expresses finite exact values directly.

Licensed under either MIT or Apache-2.0.
