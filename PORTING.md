# UOR porting contract

The reference is [UOR-Foundation/uor-matmul at `3cc5882f210667f9ac00fd8c02c5b5957b493f5d`](https://github.com/UOR-Foundation/uor-matmul/tree/3cc5882f210667f9ac00fd8c02c5b5957b493f5d).
The deployment reference is [calculator-example at `5051dc6adb18e9ca2b6ae4ca7090e638329831ef`](https://github.com/UOR-Foundation/calculator-example/tree/5051dc6adb18e9ca2b6ae4ca7090e638329831ef).
The README digests and exact revisions are recorded in `model/authorities.toml`.
These citations describe imported design authority; they do not transfer proof
or production qualification to this repository.

This is a partial port of the central UOR method. The table below maps the
implemented exact-domain operations; it does not establish complete upstream
API or codec parity. SDK compilation and qualification blockers are separate
from these source-level scope gaps.

## Semantic correspondence

| UOR construction | LexLean construction |
| --- | --- |
| Decode `Code -> Alphabet` before accumulation | Closed signed binary, ternary, signed-byte tiers and arbitrary user codebooks |
| Exact integer accumulation | Canonical arbitrary precision digit lists |
| One result independent of reduction partition | Direct and partial-block partitioned matrix products |
| Tabulate activation/codeword products then gather | Product tables followed by code-indexed accumulation |
| `alpha*A*B + beta*C` | Exact integer epilogue after the complete product |
| Complex algebra | Exact real and imaginary integer components |
| Finite dyadic values | Exact coefficient with power-of-two denominator scale |
| Tropical semiring | Separate negative-infinity constructor, max, and exact finite addition |
| Selected max | Least attaining reduction index, with explicit absence for empty reduction |
| Gauge representative | Subtract the finite maximum while preserving masks |
| Reproducible portable execution | One selected LexLean graph generates native, Core-Wasm, Holo, and browser artifacts |

The scalar table API stores codewords as arbitrary integers. The blocked
codeword API groups coefficients along the reduction dimension, makes codeword
orientation explicit, and handles a partial final block with exact zero
padding. Tables are generated from the current activation row and codebook;
result accumulation does not multiply decoded coefficients again.

The core uses mathematical empty reduction identities. A zero inner dimension
produces zero integer/complex/dyadic entries or negative infinity in max-plus;
zero rows or columns produce an empty output. Matrix transport validates
shapes before invoking the core. List-level functions have their own explicit
zip/identity equations; no split theorem assumes an unvalidated list length.

## Deliberate substrate choices

The original implementation's no-allocation, vectorized kernels and caller
scratch offers are native substrate contracts. The pure LexLean adaptation
uses persistent lists and arbitrary precision software arithmetic. It does
not advertise those native resource or throughput guarantees.

The dyadic representation does not implement IEEE formats. Floating-point
bit decoding, signed zero, infinity, NaN propagation, overflow/subnormal
rounding, and final ties-to-even encoding are outside the declared product
contract. An exact dyadic answer alone would not justify IEEE parity.

Wrapping, saturating, and rounded output codecs are absent: the current
interface emits exact decimal integers or coefficient/scale pairs. The full
upstream packed/grid/offset/run codec ecosystem, Atlas/NAF/octet contraction,
canonical codec manifests, and addressing machinery are not implemented.
Matrices use contiguous row-major lists without strided views, alias rejection,
or a raw BLAS ABI. Each exact domain has a specialized traversal rather than
one algebra-parametric traversal.

PrismPM supplies artifact generation and platform adapters. Product arithmetic,
parsing, protocol failures, acceptance vectors, and presentation text remain
LexLean declarations. Host scripts inspect evidence and invoke the SDK; they
cannot provide a handwritten fallback for product behavior.

## Evidence scope

Universal computational equations and recursive invariants are proved in
LexLean and checked by Lean plus kernel replay. Concrete arithmetic theorems
cover representative carry/borrow, cancellation, matrix, codebook, dyadic,
complex, and tropical cases. These are not restated as a universal proof of
the arbitrary precision implementation's refinement to mathematical integers.
The independent seeded and boundary oracle harness requires a generated
runtime; it has not executed because application compilation is blocked.
Conformance is established only by the complete recorded gate result.
