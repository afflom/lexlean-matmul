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
