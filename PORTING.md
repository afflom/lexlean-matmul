# UOR porting contract

The arithmetic reference is [UOR-Foundation/uor-matmul at `3cc5882f210667f9ac00fd8c02c5b5957b493f5d`](https://github.com/UOR-Foundation/uor-matmul/tree/3cc5882f210667f9ac00fd8c02c5b5957b493f5d).
The deployment reference is [calculator-example at `5051dc6adb18e9ca2b6ae4ca7090e638329831ef`](https://github.com/UOR-Foundation/calculator-example/tree/5051dc6adb18e9ca2b6ae4ca7090e638329831ef).
Exact revisions and README digests are recorded in `model/authorities.toml`.
Imported design authority and locally constructed evidence have separate claim
levels.

This document describes source coverage and the pure LexLean adaptation. It
does not establish complete upstream API compatibility or release qualification.

## Semantic correspondence

| UOR construction | LexLean construction |
| --- | --- |
| Decode `Code -> Alphabet` | Validated scalar/block codec plans and separate IEEE arenas |
| Total stored-code decoding | Width-aware grid/book modulo indexing, sign bits, and ternary digit 3 decoding to zero |
| Codec composition | Low-subcode-first packing, exact zero-point subtraction, transcodes, and runs |
| Canonical float codebook | Unsigned bit-pattern sorting and deduplication, preserving signed zeros and distinct NaN payloads |
| E8 block alphabet | Exact pinned 256-by-eight reference data |
| Exact integer accumulation | Canonical arbitrary precision digit lists |
| Alternative reduction schedules | Direct, partitioned, and partial-block products |
| Tabulate, then gather | Activation/codeword product tables followed by lookup and exact addition |
| Finite IEEE product | Canonical valuation and NAF Laurent atoms, modality involution, ternary product lookup, and exact placement |
| Atlas grade addressing | Euclidean 32-grade words with four scopes and eight contexts, including negative grades |
| One IEEE encoding | Binary32/binary64 rounding, subnormals, overflow, signed underflow, and canonical nonfinite results |
| Linear and bias epilogues | Exact integer scalars, per-column real bias, complex components, and zero-beta overwrite |
| Terminal integer encoding | Signed wrapping or saturation; dyadic ties-to-even or truncation before the range rule |
| Tropical arithmetic | Distinct negative infinity, finite addition, maximum, and max-plus alpha/beta epilogues |
| Selection and gauge | Least attaining reduction index, empty-reduction absence, and finite-max recentering |

`Core.lex.tex` owns the base exact domains and reduction constructions.
`Atlas.lex.tex` owns the canonical finite atom construction; `Float.lex.tex`
uses it for finite products before terminal encoding. `Epilogue.lex.tex`
keeps scaling, prior output, and bias exact. `Codec.lex.tex` validates the
compositional plan and decoded row lengths before either direct multiplication
or table gathering.

The general codec interface accepts every code within the declared storage
width and applies the tier's total decoding rule. The earlier scalar `coded`
and `table` operations are narrower canonical-index conveniences. Codec
wrappers follow the reference's default maximum-block length semantics,
including wrappers around a variable-length run codec. Run-matrix validation
still requires positive decoded lengths that exactly fill each row.

IEEE codebook identity uses input bit patterns. Arithmetic results use the
reference's canonical NaN and positive exact zero; a negative nonzero value
that underflows can encode as negative zero. Nearest mode rounds ties to even
and overflows to infinity. The other IEEE modes truncate and clamp finite
overflow. A zero beta skips the old value's arithmetic contribution, including
an old NaN. Tropical terminal encoding follows the reference's finite output
interval `[MIN+1, MAX-1]` and unsigned 128-bit wrapping offset; negative infinity
remains a distinct value.

The core uses mathematical empty-reduction identities: zero for the ring
families and negative infinity for max-plus. Zero rows or columns produce an
empty output. Protocol checks validate each component array before assembling
complex or dyadic entries, and checked matrix roots reject malformed shapes.

## Pure substrate choices

The portable implementation preserves the central decode, exact-accumulate,
and encode-once construction using immutable lists and software integers. Its
finite IEEE route is the canonical NAF/ternary reference construction. The
upstream balanced-octet kernels and carrier/projector witness API are not
reproduced here. ISA selection, cache pricing, and scratch reuse belong to the
native implementation; this repository does not claim their performance or
resource contracts.

Matrices are logical row-major values. The public interface does not expose
mutable strided buffers, alias rejection, caller-owned scratch, or a raw BLAS
ABI. Specialized typed traversals serve the exact scalar domains. No SIMD or
zero-heap-allocation guarantee is inferred from numerical agreement.

Codec semantics and E8 data are modeled here. Serialized upstream kappa
manifests, their canonical artifact hashes, and native addressing/lane-planning
reports are not an interchange format supplied by this application. Those
artifact identities are separate from evaluating a coded mathematical product.
The containing PrismPM system has its own explicitly bound artifact identities.

The browser transport has declared shape, scalar-length, and byte budgets.
They bound the presentation interface rather than introducing a fixed-width
accumulator or silently changing arithmetic when a bound is reached.

## Application and deployment model

`Model.lex.tex` supplies identity, budgets, the entry root, and destination.
`Protocol.lex.tex`, `ExtendedProtocol.lex.tex`, and `CodecProtocol.lex.tex`
implement the versioned requests and typed failures. `Application.lex.tex`
declares the native roots, acceptance vectors, Core-Wasm, and portable View.
`Workbench.lex.tex` wraps guided requests, normalizes entry separators, and
interprets actual wire responses as bounded structured results. Unframed
version 1 requests retain their original bytes and responses.
`Presentation.lex.tex` declares the full Text-V3 interface: fields, examples,
guidance, design, error assistance, and cancellation/timeout policy. The SDK
supplies generic rendering and browser-worker execution without domain arithmetic.
`MatmulSystem.lex.tex` uses the native `Production.BrowserSystem.SystemModel`
for browser-system `/2`, binding the application digest, complete generated
artifact inventory, controls, and Pages target.

The release pipeline delegates OCI construction, inspection, validation, and
source-free browser export to the selected immutable SDK. It checks the locked
SPDX oracle and compares all six exported browser assets with the application
build. Pages deploys those accepted assets and then verifies publication
through the SDK release API and direct HTTPS byte checks. Repository scripts
orchestrate and inspect this evidence; product arithmetic and request handling
remain LexLean source.

The guided interface covers ten operation families; the advanced editor covers
all 24 version 1 operation families. Exact cells remain strings, including IEEE
bit patterns larger than JavaScript's exact integer range. Empty matrix shapes
remain valid. A timed-out or cancelled browser worker is replaced, while inputs
remain editable. This lifecycle bounds waiting and prevents stale results; it
does not promise a fixed calculation time on every device.

## Evidence scope

Kernel-checked component evidence includes exact arithmetic, IEEE edge cases,
NAF reconstruction, signed-grade address boundaries, ternary table laws, and
epilogue properties. The acceptance harness compares generated-runtime results
with independent oracles for the modeled operations. Planted arithmetic,
rounding, and atom-sign defects must be rejected by the intended theorem
checks. These certificates are not a claim
that every implementation function has a universal refinement proof.

The complete `just vv` gate and protected Pages publication checks establish
release qualification for each revision.
Isolated source proofs and diagnostic receipts retain their stated scope;
release and deployment claims require the complete recorded acceptance result.
