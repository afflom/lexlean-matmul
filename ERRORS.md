<!-- @generated from src/Protocol.lex.tex, src/Core.lex.tex, and src/Application.lex.tex. -->

# Public errors

The versioned byte interface returns `1`, `error`, and the wire code, separated by tabs.

| Typed variant | Wire code | Modeled negative vectors |
| --- | --- | --- |
| `MalformedRequest` | `malformed-request` | 6 |
| `UnsupportedVersion` | `unsupported-version` | 1 |
| `UnknownOperation` | `unknown-operation` | 1 |
| `InvalidDimension` | `invalid-dimension` | 6 |
| `InvalidInteger` | `invalid-integer` | 9 |
| `ShapeMismatch` | `shape-mismatch` | 5 |
| `UnknownTier` | `unknown-tier` | 1 |
| `InvalidCode` | `invalid-code` | 15 |
| `RequestTooLarge` | `request-too-large` | 2 |
| `InvalidScale` | `invalid-scale` | 3 |

Checked native matrix APIs return the modeled `MatrixError` result type.

| Typed variant | Negative source theorems |
| --- | --- |
| `MalformedMatrix` | `rejectsMalformedMatrix` |
| `Nonconformant` | `rejectsNonconformantProduct` |
| `InvalidCodebook` | `rejectsEmptyTableCodebook`, `rejectsEmptyBlockCodebook`, `rejectsMalformedBlockWord`, `rejectsZeroWidthBlockCodebook` |
| `InvalidCode` | `rejectsOutOfBookCode` |
