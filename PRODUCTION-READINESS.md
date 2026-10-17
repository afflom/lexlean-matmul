# Production reference workbench

The product is an exact arithmetic reference workbench for learning, examining,
and integrating the UOR method. The authoritative interface and execution policy
are LexLean declarations in `src/`. The registered release requirements are
MM-18 through MM-24 in the generated `CONFORMANCE.md`. The complete `just vv`
gate and protected-main publication checks qualify a revision for release.

## Stakeholders and useful outcomes

| Stakeholder | Task | Required outcome |
| --- | --- | --- |
| Learner or educator | Understand the method and change a worked example | Purpose, ordered instructions, editable matrices, and an explained actual result |
| Numerical researcher | Examine exact accumulation and terminal encoding | Exact values, cancellation examples, IEEE interpretation, and original protocol bytes |
| Codec developer | Explore stored symbols and lookup contraction | Documented code meanings and comparable direct and tabulated calculations |
| Integrator | Construct requests and investigate failures | Guided serialization, the complete advanced protocol, actionable typed errors, and recovery |
| Maintainer or reviewer | Assess a deployed revision | Explicit bounds, source links, accepted artifact identity, and retained publication evidence |
| Keyboard, assistive-technology, or mobile user | Complete those tasks | Named controls, logical focus, announced states, readable contrast, and contained overflow |

## First-deployment findings

The baseline is merged revision `2d4dc45f1dde9fde7978653aad3ce72b071d542f`.
Its arithmetic, generated artifacts, native system release, reproducibility,
and deployed asset integrity passed their declared gates. Its generic text View
does not provide the product guidance needed by the stakeholders above.

Actual browser observations established these gaps:

- No in-app protocol/help link, guided operation, or editable named example.
- Correct results appear only as tab-separated wire output.
- A failed Wasm load has no retry control; reloading discards the draft.
- Computation blocks the main thread. A maximum IEEE example measured about
  0.76 seconds on the audit host and 3.05 seconds at four-times CPU slowdown;
  the busy state had ended before its first animation-frame paint.
- Browser-local computation and calculation-history behavior are unexplained.
- Native evidence has one-day retention; final publication receipts are not
  uploaded before the runner is discarded.

The baseline already has usable target sizes and focus outlines, 320-pixel
page reflow, and clean pinned automated semantic scans. Those existing
properties are retained. New accessibility acceptance includes the guided
journey and its runtime states.

`verification/production-r3-baseline.json` records the seven intended behavioral
failures before implementation. `scripts/production-baseline.mjs` is the
diagnostic that exercised the actual accepted application and a real loading
failure. It does not qualify a later revision.

## Modeled release requirements

| ID | Requirement and meaningful verification |
| --- | --- |
| MM-18 | Source-owned purpose, audience, instructions, limits, navigation, and HTTPS documentation links are rendered and reachable. |
| MM-19 | Examples populate editable guided inputs. Both the original example and independently calculated edits execute generated LexLean arithmetic. |
| MM-20 | Exact result cells, order, domain explanations, and underlying request/response bytes agree with the actual generated response. |
| MM-21 | Each new engine fetch bypasses cached Wasm from earlier deployments. Loading, computation, cancellation, timeout, retry, rejection, and success follow the declared lifecycle; drafts survive recovery and stale work cannot replace a newer result. |
| MM-22 | Pinned semantic scans and actual keyboard, focus, status, contrast, target, 320-pixel reflow, and enlarged-text journeys exercise the rendered product. |
| MM-23 | Visible privacy guidance matches observed behavior: calculations use browser-local execution, without operand-bearing navigation, telemetry, logs, or persistent history. |
| MM-24 | The modeled current-main policy and retention period bind the accepted bundle and bounded success/failure publication receipts to the deployed revision. |

Guided request construction and mathematical response interpretation belong in
LexLean. The SDK generates presentation, generic field framing, rendering, and
the execution lifecycle. Expected example answers are acceptance inputs;
calculating an example invokes the generated dispatcher.

## Standards and evidence scope

ISO/IEC/IEEE 42010:2022 provides the stakeholder/concern/viewpoint organization,
and ISO/IEC 25010:2023 provides the product-quality organization. These are
conceptual authority bindings, not certification claims.

Finite accessibility requirements use the SDK's pinned WCAG 2.2 edition of
2024-12-12, WAI-ARIA 1.2 edition of 2023-06-06, and HTML source revision
`2f441941fc523877bd9d5cd7de3b91a81a00ca2e`. The executable semantic oracle is
the inventory-bound axe-core 4.13.0. Automated and manual browser assertions
establish their recorded checks; incomplete oracle findings remain visible
for assessment. They do not establish complete WCAG certification.

Native browser-system `/2` retains its exact mandatory controls and
SPDX-3.0.1 binding. Product UX evidence is included in application acceptance;
additional quality claims do not alter that closed containing-system schema.

The SDK OCI lifecycle status is `development`. Repository acceptance means the
complete `just vv` and publication checks; SDK promotion to `candidate` or
`accepted` uses a separate cryptographic trust workflow.

All browser content is rendered as text or structured elements. The declared
link policy admits explicit HTTPS documentation links. The privacy claim
concerns calculation data: loading the application and deliberately following
a documentation link involve network access.

Portable arithmetic and transport bounds remain explicit in `PROTOCOL.md` and
`PORTING.md`. This reference workbench does not claim native SIMD throughput,
raw BLAS ABI compatibility, or performance for unbounded production matrices.
