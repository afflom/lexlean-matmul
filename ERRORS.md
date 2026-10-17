<!-- @generated from the typed LexLean errors, source theorems, and application vectors. -->

# Public errors

The versioned byte interface returns `1`, `error`, and the wire code, separated by tabs.

| Typed variant | Wire code | Modeled negative vectors |
| --- | --- | --- |
| `MalformedRequest` | `malformed-request` | 6 |
| `UnsupportedVersion` | `unsupported-version` | 1 |
| `UnknownOperation` | `unknown-operation` | 1 |
| `InvalidDimension` | `invalid-dimension` | 7 |
| `InvalidInteger` | `invalid-integer` | 9 |
| `ShapeMismatch` | `shape-mismatch` | 10 |
| `UnknownTier` | `unknown-tier` | 1 |
| `InvalidCode` | `invalid-code` | 30 |
| `RequestTooLarge` | `request-too-large` | 2 |
| `InvalidScale` | `invalid-scale` | 3 |

Checked native matrix APIs return the modeled `MatrixError` result type.

| Typed variant | Negative source theorems |
| --- | --- |
| `MalformedMatrix` | `rejectsMalformedMatrix`, `rejectsOutputGeometryOverflow`, `rejectsPartitionedOutputOverflow`, `rejectsTableOutputOverflow`, `rejectsBlockTableOutputOverflow`, `rejectsGemmOutputOverflow`, `rejectsComplexOutputOverflow`, `rejectsDyadicOutputOverflow`, `rejectsTropicalOutputOverflow`, `rejectsDyadicScaleOverflow` |
| `Nonconformant` | `rejectsNonconformantProduct` |
| `InvalidCodebook` | `rejectsEmptyTableCodebook`, `rejectsEmptyBlockCodebook`, `rejectsMalformedBlockWord`, `rejectsZeroWidthBlockCodebook` |
| `InvalidCode` | `rejectsOutOfBookCode` |

Checked codec APIs return the modeled `CodecError` result type. The byte adapter maps `InvalidPlan` and `InvalidCode` to `invalid-code`, and `ShapeMismatch` and `Nonconformant` to `shape-mismatch`.

| Typed variant | Negative source theorems |
| --- | --- |
| `InvalidPlan` | `rejectsInvalidPlan` |
| `InvalidCode` | `rejectsInvalidCode` |
| `ShapeMismatch` | `rejectsShapeMismatch`, `rejectsEmptyRunSymbol`, `rejectsPartialFixedRow`, `rejectsOutputCapacityOverflow`, `rejectsTableOutputCapacityOverflow`, `rejectsHugeDecodedWordBeforeAllocation` |
| `Nonconformant` | `rejectsNonconformant` |

The guided and advanced browser views use the closed `WorkbenchResult` JSON presentation. Protocol failures retain the original wire code and actual request/response bytes. The following defensive presenter failures have typed LexLean variants; isolated exact-source negative fixtures exercise malformed replies and the declared output bound.

| Typed presenter variant | JSON error code | Negative fixture |
| --- | --- | --- |
| `InvalidResponse` | `invalid-response` | Malformed actual presenter reply |
| `ResponseTooLarge` | `response-too-large` | Response beyond the modeled byte bound |

Actionable browser error assistance is generated from `Presentation.view.errors`. The input byte limit also has direct transport coverage in the unchanged protocol corpus.

| Error code | Explanation | Recovery | Modeled UI negative vectors |
| --- | --- | --- | --- |
| `malformed-request` | The request does not have the required fields or byte structure. | Use a guided example, or paste a complete version 1 request with literal tab separators. | 3 |
| `unsupported-version` | The advanced interface expects version 1. | Begin the raw request with 1 followed by a tab, or use the guided form. | 1 |
| `unknown-operation` | The requested operation name is not part of this interface. | Select a guided operation or consult the linked protocol reference. | 1 |
| `invalid-dimension` | Dimensions must be canonical decimal integers from 0 through 8. | Check m, k, and n. Remove signs and leading zeroes; 0 denotes an empty dimension. | 1 |
| `invalid-integer` | Integer entries use signed decimal text with at most 64 magnitude digits. IEEE inputs use unsigned decimal bit patterns. | Use values such as 0, -3, and 42. Remove a leading +, leading zeroes, or decimal points. | 1 |
| `shape-mismatch` | A needs m × k entries, B needs k × n decoded entries, and C needs m × n entries. | Count the values row by row or load a complete example. For composed codecs, verify the decoded stored-row length. | 1 |
| `unknown-tier` | The scalar codec tier is not recognized. | Select Binary, Ternary, or one of the documented eight-bit books. | 1 |
| `invalid-code` | A stored symbol, codebook, plan, width, or output mode violates its declared contract. | Check the selected book and the field help. For a first calculation, reload a source-owned example. | 1 |
| `request-too-large` | The complete UTF-8 request, including its framing, must fit the modeled input limit. | Use smaller matrices or shorter coefficients. Keep the complete browser request within 16 KiB. | 0 |
| `invalid-scale` | A scale must be a canonical integer from 0 through 64. | Enter one supported scale for each dyadic coefficient. | 1 |
| `response-too-large` | The application refuses an oversized response rather than truncating exact values. | Reduce the request size and retry. The complete structured response is bounded by the application model. | 0 |
| `invalid-response` | The response did not satisfy the declared exact presentation contract. | Your inputs remain available. Retry the calculation; use the source and release links if the failure persists. | 0 |

External CI observation failures use the closed code set declared by `Model.productionEvidenceFailureCodes`. Bounded structured failure receipts preserve the observation scope and revision identity; these codes do not change the arithmetic protocol.

| Publication/evidence failure code |
| --- |
| `publication-url-refused` |
| `publication-http-failed` |
| `publication-integrity-failed` |
| `publication-runtime-failed` |
| `publication-current-main-refused` |
| `publication-evidence-invalid` |
| `evidence-job-failed` |
