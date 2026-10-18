# Research workbench requirements

The next release adds explanation, equivalent-route comparison, reproducible
case exchange, and codec/IEEE inspection as complete modeled product features.
The authoritative behavior, controls, design, copy, bounds, and failures belong
in LexLean and the public PrismPM application model. This document organizes
the required outcomes; it does not establish their implementation or acceptance.

## Stakeholder journeys

| Journey | Required result |
| --- | --- |
| Explain an edited calculation | Choose any output cell and inspect the actual decoded operands, products, reduction, epilogue, and terminal encoding. Empty outputs and empty reductions have explicit explanations. |
| Compare equivalent executions | Execute two valid routes over the identical immutable request and compare the complete canonical outputs, including secondary components and tropical witnesses. |
| Reproduce a finding | Explicitly export a versioned local file with the canonical request, recorded response, selected settings, and implementation identity. Import validates the file and recomputes the result locally before reporting agreement. |
| Inspect a codec | Choose any modeled codec and stored symbol; inspect its true composition path, child codes, decoded word, width/modulo rules, and canonical codebook ordering. |
| Inspect IEEE data | Choose binary32 or binary64 bits and inspect sign, exponent, fraction, classification, exact finite value, canonical atoms/addresses, and terminal encoding behavior. Signed zeros and distinct NaN payloads remain distinguishable as input symbols. |
| Use the complete interface | Every original operation family has a guided form and editable examples. Trace, comparison, inspector, and case controls have source-owned labels, instructions, design, status, recovery, and keyboard/mobile journeys. |

## Complete arithmetic coverage

Explanations and equivalent executions cover all 24 original operation
families: matmul, gemm, coded, table, partitioned, complex, dyadic, tropical,
recenter, ieee, ieee-gemm, ieee-table, encode, encode-dyadic, bias, bias-gemm,
complex-gemm, complex-bias, complex-bias-gemm, tropical-gemm, complex-encode,
tropical-encode, codec, and arena.

Direct and table comparisons execute the actual codec traversals. Other
families compare exact reduction schedules with the identical terminal
semantics. Recenter compares equivalent maximum/normalization constructions.
A particular incompatible route produces a typed explanation while a valid
comparison remains available for that family. Mathematical work counts describe
the declared operations; they are not instruction counts or throughput claims.

All nine codec stages remain available, including compositions: grid, book,
sign, ternary, E8, packed, offset, transcode, and runs. Inspection follows the
actual mapping through wrappers and branches, rather than applying an unchanged
code independently to each prefix. Both IEEE formats include zero, subnormal,
normal, infinity, NaN, cancellation, underflow, overflow, all existing encoding
modes, and zero-beta overwrite behavior.

## State, files, and evidence

Computation, explanation, comparison, and standalone inspection are explicit
actions over the current draft. Selecting any valid cell or symbol makes its
complete data available. Pagination and selectors expose bounded data without
silently dropping rows. Changing inputs retires dependent results; cancellation,
timeout, failure, and retry preserve editable drafts and cannot publish stale
work. Long research actions have their own declared cancellable deadlines.

Case files have a versioned bounded schema. Recorded responses are observations,
not trusted answers. Imported requests are parsed and recomputed by LexLean;
agreement and disagreement are explicit results. Recorded and current
implementation identities remain visible, including a deliberate recomputation
journey for an older implementation. Invalid files, unknown versions, duplicate
fields, invalid encodings, invalid selections, and budget excesses are typed.

File exchange is explicit and browser local. Operands and cases do not enter
URLs, telemetry, logs, network requests, or automatic persistent history.
The original version 1 protocol and existing accepted vectors retain their
behavior. Its 16 KiB wire bound is distinct from the bounded outer transport
needed to import a complete case file.

Registered behavioral scenarios, independent arithmetic/representation oracles,
meaningful planted defects, and real three-engine browser journeys establish
these features. Release requires the entire immutable-SDK `just vv` boundary,
protected main deployment, source-free export, retained revision-bound evidence,
and live byte/journey verification. Component diagnostics retain their scope.
