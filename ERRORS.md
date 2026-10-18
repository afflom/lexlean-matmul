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
| `RequestTooLarge` | `request-too-large` | 5 |
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
| `invalid-dimension` | Dimensions must be canonical decimal integers from 0 through 8. | Check m, k, and n. Remove signs and leading zeroes; 0 denotes an empty dimension. | 2 |
| `invalid-integer` | Integer entries use signed decimal text with at most 64 magnitude digits. IEEE inputs use unsigned decimal bit patterns. | Use values such as 0, -3, and 42. Remove a leading +, leading zeroes, or decimal points. | 1 |
| `shape-mismatch` | A needs m × k entries, B needs k × n decoded entries, and C needs m × n entries. | Count the values row by row or load a complete example. For composed codecs, verify the decoded stored-row length. | 1 |
| `unknown-tier` | The scalar codec tier is not recognized. | Select Binary, Ternary, or one of the documented eight-bit books. | 1 |
| `invalid-code` | A stored symbol, codebook, plan, width, or output mode violates its declared contract. | Check the selected book and the field help. For a first calculation, reload a source-owned example. | 1 |
| `request-too-large` | The underlying canonical version 1 calculation request exceeds its unchanged 16 KiB UTF-8 budget. | Use smaller matrices or shorter coefficients, then compute again. Research envelope and local file limits are shown in Protocol & limits. | 0 |
| `invalid-scale` | A scale must be a canonical integer from 0 through 64. | Enter one supported scale for each dyadic coefficient. | 1 |
| `response-too-large` | The application refuses an oversized response rather than truncating exact values. | Reduce the request size and retry. The complete structured response is bounded by the application model. | 0 |
| `invalid-response` | The response did not satisfy the declared exact presentation contract. | Your inputs remain available. Retry the calculation; use the source and release links if the failure persists. | 0 |
| `research-invalid-selection` | The selected zero-based row or column is outside this result. | Compute the current draft and select one of its output cells. | 0 |
| `research-incompatible-route` | The explicitly requested route does not apply to this calculation family. | Choose the automatic route, or select a compatible exact schedule. | 0 |
| `research-trace-disagreement` | Independent source reduction or terminal encoding did not agree with the canonical execution. | Keep the request for review and report this failure using the source link. Do not use the disputed explanation. | 0 |
| `research-invalid-inspection` | This target, index or decoded coordinate is unavailable in the current operation. | Check the operand and its zero-based index. Use an independent tool for a representation that is absent here. | 0 |
| `research-invalid-tool-input` | The codec plan, stored symbol, IEEE format or raw bit pattern violates its source contract. | Use the tool starting values or the protocol reference, then run the inspector again. | 0 |
| `research-invalid-response` | The canonical calculation could not be interpreted under the modeled research contract. | Your draft is retained. Retry; keep the exact request and report a persistent failure. | 0 |
| `research-invalid-envelope` | The closed envelope, UTF-8 structure, version or complete 2 MiB transport budget is invalid. | Reload a worked example or select a smaller file and retry. Your current draft is retained. | 1 |
| `research-invalid-draft` | The selected operation, field count, action controls or selection does not match its source model. | Load the operation example, review the action controls and run again. | 1 |
| `research-unknown-action` | The source request prefix does not identify a supported action. | Use one of the modeled compute, research, inspector or case controls. | 1 |
| `research-runtime-identity` | Case exchange requires the actual checked generated model identity. | Reload the accepted application assets before exporting or importing a case. | 1 |
| `research-response-too-large` | The source refuses a report larger than 4 MiB and never silently truncates exact rows or values. | Choose smaller operands or inspect a more focused selected value. | 0 |
| `case-invalid-json` | The file has invalid JSON syntax or exceeds the closed parser collection or escape-complexity limits. | Choose a complete case exported by this application. The current draft is retained. | 1 |
| `case-duplicate-field` | Duplicate JSON keys would make a case ambiguous and are rejected. | Use a complete canonical exported case with each field present once. | 1 |
| `case-invalid-schema` | The schema name or exact required field set is invalid, unknown or incomplete. | Choose a lexlean-matmul/case/1 export. Unknown or missing fields are never silently discarded. | 1 |
| `case-invalid-version` | The local case version must be the modeled version 1. | Open a supported version 1 case or export a fresh case from the current application. | 1 |
| `case-too-large` | The source will not parse or export an oversized case file. | Reduce operands or observation size and export again; the current draft remains available. | 1 |
| `case-invalid-identity` | The saved identity must contain exactly 64 lowercase hexadecimal characters. | Use an intact exported case. A valid different identity follows the explicit recompute journey. | 1 |
| `case-invalid-type` | Strings, natural numbers and arrays of strings must match the closed versioned schema. | Use an intact source-generated JSON export; no field is implicitly coerced. | 1 |
| `case-invalid-draft` | The saved operation or ordered field count is invalid. | Choose an intact exported case for a declared guided, raw or independent tool workflow. | 1 |
| `case-invalid-selection` | The stored row or column is not a supported bounded index or does not select an actual output in the fresh result. | Use a case with valid zero-based selection settings, then choose a current output cell. | 1 |
| `case-invalid-controls` | The saved target, index, decoded coordinate, format or control count is inconsistent. | Use the declared inspector settings and export a fresh case. | 1 |
| `case-inconsistent-request` | The saved guided fields do not reconstruct its exact canonical request, or a standalone tool claims an unrelated wire request. | Use an intact exported case. Edit inputs in the workbench and export a new observation. | 1 |
| `case-invalid-action` | A matrix case records compute; an independent tool case must name that tool. | Use an intact source-owned case export. | 1 |
| `case_file_read` | The explicit local file operation failed or no readable file is selected. | Choose the local case file again and import. The current draft remains available. | 0 |
| `case_file_encoding` | The local file decoder rejected malformed bytes before source parsing. | Choose the original UTF-8 JSON case exported by this application. | 0 |
| `case_file_too_large` | The browser rejects an oversized local file before reading it. | Choose a case within the source-modeled file budget. | 0 |

Research actions use typed source errors in the version 2 workbench reply. A saved answer is an observation; a different saved model identity requires explicit recomputation. The following rows identify required negative fixtures, not their execution results. Current acceptance receipts record the actual outcomes. Exact-source defensive fixtures are isolated generated applications and never replace the shipped dispatcher.

| Source type | Typed variant | JSON error code | Required negative fixture |
| --- | --- | --- | --- |
| `ResearchModel.ResearchError` | `InvalidSelection` | `research-invalid-selection` | MM-25: absent output cell, empty output and bounded-index failures |
| `ResearchModel.ResearchError` | `IncompatibleRoute` | `research-incompatible-route` | MM-26: route unavailable for the selected operation |
| `ResearchModel.ResearchError` | `TraceDisagreement` | `research-trace-disagreement` | MM-31: exact-source prepared trace with inconsistent terminal observation |
| `ResearchModel.ResearchError` | `InvalidInspection` | `research-invalid-inspection` | MM-28/MM-29: target, operand index or decoded coordinate outside its representation |
| `ResearchModel.ResearchError` | `InvalidToolInput` | `research-invalid-tool-input` | MM-28/MM-29: invalid codec plan, stored code, IEEE format or bit pattern |
| `ResearchModel.ResearchError` | `InvalidResponse` | `research-invalid-response` | MM-31: exact-source preparation with a malformed actual response |
| `ResearchCases.ResearchCaseError` | `InvalidJson` | `case-invalid-json` | MM-27: malformed JSON and Unicode escape sequences |
| `ResearchCases.ResearchCaseError` | `DuplicateField` | `case-duplicate-field` | MM-27: duplicate case key |
| `ResearchCases.ResearchCaseError` | `InvalidSchema` | `case-invalid-schema` | MM-27: unknown, missing or additional schema fields |
| `ResearchCases.ResearchCaseError` | `InvalidVersion` | `case-invalid-version` | MM-27: unsupported case version |
| `ResearchCases.ResearchCaseError` | `TooLarge` | `case-too-large` | MM-27: case text beyond its declared UTF-8 byte limit |
| `ResearchCases.ResearchCaseError` | `InvalidIdentity` | `case-invalid-identity` | MM-27: malformed saved model identity |
| `ResearchCases.ResearchCaseError` | `InvalidType` | `case-invalid-type` | MM-27: wrong scalar or array field type |
| `ResearchCases.ResearchCaseError` | `InvalidDraft` | `case-invalid-draft` | MM-27: unknown operation or wrong guided-value arity |
| `ResearchCases.ResearchCaseError` | `InvalidSelection` | `case-invalid-selection` | MM-27: selection outside the bounded index or freshly computed output shape |
| `ResearchCases.ResearchCaseError` | `InvalidControls` | `case-invalid-controls` | MM-27: unsupported inspection settings or integer representation overflow |
| `ResearchCases.ResearchCaseError` | `InconsistentRequest` | `case-inconsistent-request` | MM-27: saved guided values disagree with saved request |
| `ResearchCases.ResearchCaseError` | `InvalidAction` | `case-invalid-action` | MM-27: case action disagrees with selected operation |
| `ResearchCases.ResearchCaseError` | `FileRead` | `case_file_read` | MM-31: injected native FileReader error callback |
| `ResearchCases.ResearchCaseError` | `FileEncoding` | `case_file_encoding` | MM-31: actual file with invalid UTF-8 bytes |
| `ResearchCases.ResearchCaseError` | `FileTooLarge` | `case_file_too_large` | MM-31: actual file beyond the declared byte limit |
| `ResearchWorkspace.WorkspaceError` | `InvalidEnvelope` | `research-invalid-envelope` | MM-31: malformed, duplicate, missing, additional or wrongly typed action fields |
| `ResearchWorkspace.WorkspaceError` | `InvalidDraft` | `research-invalid-draft` | MM-31: invalid operation, selection or action-control schema |
| `ResearchWorkspace.WorkspaceError` | `UnknownAction` | `research-unknown-action` | MM-31: unknown framed action prefix |
| `ResearchWorkspace.WorkspaceError` | `RuntimeIdentity` | `research-runtime-identity` | MM-31: absent or malformed checked runtime identity for a case action |
| `ResearchWorkspace.WorkspaceError` | `ResponseTooLarge` | `research-response-too-large` | MM-31: exact-source serialization at and beyond the modeled response bound |

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
