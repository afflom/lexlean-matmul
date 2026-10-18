// The research acceptance boundary always invokes the genuine generated guest.
// Independent references and named report/browser defects are test-only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserArtifacts } from './browser-oracle.mjs';
import { withWorkbench } from './production-oracle.mjs';
import { evidenceRoot, freshBuild, sha, writeJson } from './evidence.mjs';
import { researchFamilies, completeResearchCases, researchCase, ieeeTerminalCases, roundingModes, preservedResearchExamples } from './research-cases.mjs';
import { assertTrace, assertComparison, assertIeeeInspection, assertOutputInspection, ieeeCases, plantReportDefect, reportTable, expectedResearchCells } from './research-assertions.mjs';
import { assertCodecInspection, codecInspectionCases, invalidCodecInspections, codecMatrixCase } from './research-codec-reference.mjs';

const separator = '\u001f', encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const capabilities = Object.freeze(['MM-25', 'MM-26', 'MM-27', 'MM-28', 'MM-29', 'MM-30', 'MM-31']);
const familyOperation = family => family === 'ieee' ? 'float' : family;
const sourceIdentity = artifacts => {
  const provenance = JSON.parse(fs.readFileSync(path.join(artifacts.directory, 'provenance.json'), 'utf8'));
  assert.match(provenance.model_id, /^[0-9a-f]{64}$/); return provenance.model_id;
};
export function researchEnvelope({ operation = 'raw', request = '', values = [], row = 0, column = 0, controls = [], model_id, case_text = '' }) {
  return { version: 1, operation, request, values, row, column, controls, model_id, case_text };
}
export function researchFrame(action, input) {
  assert.equal(typeof action.request_prefix, 'string'); assert(action.request_prefix.length > 0);
  return action.request_prefix + separator + JSON.stringify(researchEnvelope(input));
}
function validateView(artifacts) {
  assert.equal(artifacts.application.profile, 'prismpm/text-application/4', 'research-profile: actual TextV4 guest is required');
  const view = artifacts.application.view;
  assert.deepEqual(view.operations.map(x => x.id).sort(), researchFamilies.map(familyOperation).sort(), 'research-operations: every family needs an actual guided operation');
  assert(view.operations.every(op => op.examples.length > 0));
  assert(view.operations.reduce((sum, op) => sum + op.examples.length, 0) >= 28, 'research-examples: preserved14 plus all missing families must be present');
  for(const preserved of preservedResearchExamples) {
    const operation=view.operations.find(op=>op.id===preserved.operation),example=operation.examples.find(example=>example.id===preserved.example);
    assert(example,'research-preserved-example: original editable example is missing');const outcome=JSON.parse(example.expected_response);
    assert.equal(outcome.request,preserved.request,'research-preserved-example: original canonical inputs changed');
    assert.equal(outcome.response,preserved.response,'research-preserved-example: original exact outcome changed');
  }
  for (const op of view.operations) for (const field of ['trace', 'comparison', 'inspection']) {
    const action = op[field]; assert(action && action.label.trim() && action.help.trim());
    assert.equal(action.timeout_milliseconds, 180000, 'research-deadline: research must use its source action budget');
  }
  for(const op of view.operations) {
    assert.deepEqual(op.trace.fields,[],'research-trace-fields: selected cell controls are separate from trace action');
    assert.deepEqual(op.comparison.fields.map(field=>field.id),['method']);
    assert.deepEqual(op.comparison.fields[0].choices.map(choice=>choice.value).sort(),['auto','direct-table','reverse','partitioned'].sort());
    assert.deepEqual(op.inspection.fields.map(field=>field.id),['target','index','coordinate']);
    assert.deepEqual(op.inspection.fields[0].choices.map(choice=>choice.value).sort(),['a','b','c','codebook','output'].sort());
  }
  assert.deepEqual(view.research.tools.map(tool=>tool.id).sort(),['codec-tool','ieee-tool']);
  assert.equal(view.case_exchange.maximum_bytes, 1048576);
  assert.equal(artifacts.application.request_maximum, 2097152); assert.equal(artifacts.application.response_maximum, 4194304);
  return view;
}
export async function researchBinding(artifacts) {
  assert.equal(artifacts.assets.length,6,'research-assets: exact six-asset export required');
  for(const asset of artifacts.assets) {const bytes=fs.readFileSync(path.join(artifacts.directory,asset.path));
    assert.equal(bytes.length,asset.bytes);assert.equal(sha(bytes),asset.sha256,'research-assets: bytes changed after capture');}
  const modelId = sourceIdentity(artifacts);
  const binding = await import(`${pathToFileURL(path.join(artifacts.directory, artifacts.javascript)).href}?research=${modelId}`);
  assert.equal(typeof binding.initSync, 'function'); assert.equal(typeof binding.invoke_bytes, 'function');
  binding.initSync({ module: fs.readFileSync(path.join(artifacts.directory, artifacts.wasm.path)) });
  assert.equal(typeof binding.model_id, 'function', 'research-identity: actual adapter export is missing');
  assert.equal(binding.model_id(), modelId, 'research-identity: adapter and view model identities disagree');
  const invoke = request => {
    assert(Buffer.byteLength(request) <= artifacts.application.request_maximum, 'research-fixture: outer request exceeds captured transport');
    const actual = binding.invoke_bytes(encoder.encode(request)); assert(actual instanceof Uint8Array);
    assert(actual.length <= artifacts.application.response_maximum, 'research-response: guest exceeded modeled output bound');
    return decoder.decode(actual);
  };
  return { invoke, modelId };
}
export function parseResearchReply(text, action, input) {
  const report = JSON.parse(text);
  assert.deepEqual(Object.keys(report), ['version', 'status', 'operation', 'message', 'rows', 'columns', 'cells', 'details', 'request', 'response', 'error',
    'action', 'selection', 'tables', 'panels', 'comparison', 'exchange'], 'research-shape: reply fields differ from closed source contract');
  assert.equal(report.version, 2); assert.equal(report.action, action.id, 'research-correlation: wrong action reply');
  if (!['case-import', 'case-recompute'].includes(action.id)) assert.equal(report.operation, input.operation, 'research-correlation: wrong operation reply');
  assert(['ok', 'error'].includes(report.status));
  assert(Array.isArray(report.tables) && Array.isArray(report.panels));
  for (const table of report.tables) assert(table.rows.every(row => row.length === table.columns.length && row.every(x => typeof x === 'string')));
  if (report.status === 'error') {
    assert.equal(typeof report.error, 'string'); assert(report.error); assert.equal(report.rows, 0); assert.equal(report.columns, 0); assert.deepEqual(report.cells, []);
  }
  return report;
}
function guestActions(artifacts, binding) {
  const view = validateView(artifacts), op = view.operations.find(x => x.id === 'matmul');
  const invokeAction = (action, input = {}) => {
    const envelope = researchEnvelope({ ...input, model_id: binding.modelId });
    const report = parseResearchReply(binding.invoke(researchFrame(action, envelope)), action, envelope);
    if (report.status === 'error') {
      const hint = view.errors.find(hint => hint.code === report.error);
      assert(hint && hint.title.trim() && hint.explanation.trim() && hint.recovery.trim(), 'research-error: source error lacks modeled explanation/recovery');
    }
    return report;
  };
  return { view, trace: op.trace, comparison: op.comparison, inspection: op.inspection,
    tool: id => { const value = view.research.tools.find(x => x.id === id); assert(value, `research-tools: missing ${id}`); return value.action; },
    invokeAction };
}
function expectTyped(report, codes) {
  assert.equal(report.status, 'error', 'research-error: invalid input became a successful report');
  assert(codes.includes(report.error), `research-error: expected ${codes.join('|')}, received ${report.error}`);
  assert(report.message.trim(), 'research-error: missing source failure message');
  return report.error;
}
function traceNegatives(report, fixture, row, column) {
  const tableId = fixture.normalize ? 'recenter-trace' : 'calculation-trace';
  plantReportDefect(report, r => { r.tables.find(x => x.id === tableId).rows.pop(); },
    r => assertTrace(r, fixture, row, column), /research-(phases|recenter)/);
  if (!fixture.normalize && fixture.inner) plantReportDefect(report,
    r => { r.tables.find(x => x.id === tableId).rows[0][4] = '0'; }, r => assertTrace(r, fixture, row, column), /research-scalar/);
  plantReportDefect(report, r => { r.selection.column = column + 1; }, r => assertTrace(r, fixture, row, column), /research-selection/);
  const lookup=report.tables.find(table=>table.id==='lookup-contributions');
  if(lookup?.rows.length) {
    plantReportDefect(report,r=>{r.tables.find(table=>table.id==='lookup-contributions').rows[0][2]='wrong stored symbol';},
      r=>assertTrace(r,fixture,row,column),/research-lookup/);
    plantReportDefect(report,r=>{r.tables.find(table=>table.id==='lookup-contributions').rows[0][4]=fixture.domain==='ieee'?'999999999999999999 / 2^0':'999999999999999999';},
      r=>assertTrace(r,fixture,row,column),/research-scalar/);
  }
  return (fixture.normalize?2:3)+(lookup?.rows.length?2:0);
}
export function researchTraceCases() {
  return [...completeResearchCases(), ...researchFamilies.filter(x => x !== 'recenter').flatMap(family => [
    researchCase(family, { rows: 0 }), researchCase(family, { columns: 0 }), researchCase(family, { inner: 0 }),
    researchCase(family, { rows: 1, inner: 8, columns: 1 }),
  ]), codecMatrixCase('grid:8:-3,0,7;packed:4',[[228n,57n],[165n,27n]],[3n,-5n,7n,11n],2),
    codecMatrixCase('book:8:2:1,-2/3,4;packed:2;offset:-5;transcode:8:17,1',[[0n],[1n]],[7n,-11n]),
    ...researchFamilies.filter(x => x !== 'recenter').map(family => researchCase(family, { rows: 1, inner: 8, columns: 1,
    left: Array.from({length:8},(_,i) => 10n ** 64n - 1n - BigInt(i)), right: Array.from({length:8},(_,i) => -(10n ** 64n - 101n - BigInt(i))) })),
    ...['encode', 'encode-dyadic', 'complex-encode', 'tropical-encode'].flatMap(family => roundingModes.map(mode => researchCase(family,{mode}))),
    researchCase('recenter', { vector: [] }), researchCase('recenter', { vector: [null, null] }),
    researchCase('recenter',{vector:[10n ** 64n - 1n,-(10n ** 64n - 1n),null]})];
}
async function inspectionApplicability(actions) {
  const fixtures=[...completeResearchCases(),...researchFamilies.filter(family=>family!=='recenter').flatMap(family=>[
    researchCase(family,{rows:0}),researchCase(family,{columns:0}),researchCase(family,{inner:0})]),researchCase('recenter',{vector:[]})];
  const observations=[];
  for(const fixture of fixtures){
    const counts={a:fixture.normalize?fixture.original.length:fixture.left.length,
      b:fixture.normalize?0:fixture.family==='codec'?fixture.storedCodes.flat().length:fixture.right.length,
      c:fixture.hasLinear?fixture.prior.length:0,
      codebook:fixture.family==='coded'?3:['table','ieee-table','arena'].includes(fixture.family)?fixture.book.length:0,
      output:fixture.output.length};
    const present=[],missing=[],boundaries=[];
    for(const [target,count]of Object.entries(counts)){
      if(count){
        const report=actions.invokeAction(actions.inspection,{request:fixture.request,controls:[target,'0','0']});
        assert.equal(report.status,'ok','research-operand-availability: actual existing operand was refused');
        assert.equal(report.response,fixture.expectedResponse,'research-operand-availability: inspection changed canonical arithmetic');
        if(fixture.family==='codec'&&target==='b'){
          expectTyped(actions.invokeAction(actions.inspection,{request:fixture.request,controls:[target,'0','1']}),['research-invalid-inspection']);
        }else{
          const coordinate=actions.invokeAction(actions.inspection,{request:fixture.request,controls:[target,'0','7']});
          assert.equal(coordinate.status,'ok');assert.deepEqual(coordinate.tables,report.tables,
            'research-scalar-coordinate: scalar inspection wrongly interprets a codec-only coordinate');
        }
        present.push(target);
      }else missing.push(target);
      boundaries.push({target,index:count,code:expectTyped(actions.invokeAction(actions.inspection,{request:fixture.request,controls:[target,String(count),'0']}),['research-invalid-inspection'])});
    }
    const unknown=expectTyped(actions.invokeAction(actions.inspection,{request:fixture.request,controls:['unmodeled-target','0','0']}),['research-invalid-draft']);
    observations.push({family:fixture.family,rows:fixture.rows,inner:fixture.inner,columns:fixture.columns,target_counts:counts,
      actual_present_targets:present,absent_target_refusals:missing,index_boundary_refusals:boundaries,unknown_target_refusal:unknown,
      codec_coordinate_or_scalar_invariance_checked:true});
  }
  return observations;
}
async function traces(artifacts, binding, actions) {
  let selectedCells = 0, negatives = 0; const cases = [];
  const fixtures=researchTraceCases();
  for (const fixture of fixtures) {
    assert.equal(binding.invoke(fixture.request), fixture.expectedResponse, `research-reference: independent ${fixture.family} fixture differs`);
    const positions = fixture.rows * fixture.columns ? Array.from({ length: fixture.rows * fixture.columns }, (_, i) => [Math.floor(i / fixture.columns), i % fixture.columns]) : [[0, 0]];
    for (const [row, column] of positions) {
      const report = actions.invokeAction(actions.trace, { request: fixture.request, row, column });
      assertTrace(report, fixture, row, column); selectedCells++;
      if (positions[0][0] === row && positions[0][1] === column && fixture.rows * fixture.columns && fixture.inner) {
        negatives += traceNegatives(report, fixture, row, column);
      }
    }
    if (fixture.rows * fixture.columns) {
      expectTyped(actions.invokeAction(actions.trace, { request: fixture.request, row: fixture.rows, column: 0 }), ['research-invalid-selection']); negatives++;
      expectTyped(actions.invokeAction(actions.trace, { request: fixture.request, row: 0, column: fixture.columns }), ['research-invalid-selection']); negatives++;
    }
    cases.push({ family: fixture.family, rows: fixture.rows, inner: fixture.inner, columns: fixture.columns,
      request_sha256: sha(fixture.request), response_sha256: sha(fixture.expectedResponse), selected_cells: positions.length });
  }
  let inspectedOutputs=0;
  for(const fixture of completeResearchCases()){
    const index=fixture.output.length-1;
    const inspected=actions.invokeAction(actions.inspection,{request:fixture.request,controls:['output',String(index),'0']});
    assertOutputInspection(inspected,fixture,index);inspectedOutputs++;
    if(fixture.family==='matmul'){
      plantReportDefect(inspected,r=>{r.tables.find(table=>table.id==='operand-values').rows[0][3]='planted output';},
        r=>assertOutputInspection(r,fixture,index),/research-output-inspection/);negatives++;
    }
  }
  return { cases, selected_cells: selectedCells, independently_inspected_family_outputs:inspectedOutputs,
    operand_applicability:await inspectionApplicability(actions), intended_rejections: negatives,
    planted_rejections: ['omitted-terminal-or-normalization-step', 'wrong-primitive-product', 'wrong-selected-cell','wrong-table-stored-symbol','wrong-actual-gathered-product','wrong-inspected-output'] };
}
async function comparisons(artifacts, binding, actions) {
  const rows = [];
  for (const fixture of completeResearchCases()) {
    const report = actions.invokeAction(actions.comparison, { request: fixture.request, controls: ['auto'] });
    await assertComparison(report, fixture, binding.invoke);
    const changed = structuredClone(report); changed.panels[1].response = '1\tok\t1\t1\t0';
    await assert.rejects(() => assertComparison(changed, fixture, binding.invoke), /research-panel-wire/);
    const wrongCells=structuredClone(report);wrongCells.panels[1].cells[0]='planted incorrect interpreted cell';
    await assert.rejects(()=>assertComparison(wrongCells,fixture,binding.invoke),/research-panel-cells/);
    const originalRoute = structuredClone(report); originalRoute.panels[1].request = originalRoute.panels[0].request;
    await assert.rejects(() => assertComparison(originalRoute, fixture, binding.invoke), /research-route/);
    const falseWork = structuredClone(report); falseWork.tables.find(x => x.id === 'comparison-work').rows[0][1] = '999999';
    await assert.rejects(() => assertComparison(falseWork, fixture, binding.invoke), /research-work/);
    const incompatible = fixture.family === 'matmul' || fixture.family === 'partitioned' ? 'direct-table'
      : ['coded', 'table', 'codec', 'ieee-table', 'arena'].includes(fixture.family) ? 'partitioned' : 'direct-table';
    expectTyped(actions.invokeAction(actions.comparison, { request: fixture.request, controls: [incompatible] }), ['research-incompatible-route']);
    rows.push({ family: fixture.family, method: 'auto', primary_request_sha256: sha(report.panels[0].request),
      alternate_request_sha256: sha(report.panels[1].request), response_sha256: sha(fixture.expectedResponse), work: reportTable(report, 'comparison-work') });
  }
  for (const family of ['matmul', 'partitioned']) {
    const fixture = researchCase(family), report = actions.invokeAction(actions.comparison, { request: fixture.request, controls: ['partitioned'] });
    await assertComparison(report, fixture, binding.invoke);
  }
  // Both nonempty ties and masked terms must keep least ORIGINAL index under reverse traversal.
  const tie = researchCase('tropical', { rows: 1, inner: 3, columns: 1 });
  tie.left = [5n, 5n, 5n]; tie.right = [2n, 2n, 2n]; tie.reduced = [7n]; tie.linear = [7n]; tie.beforeEncoding = [7n]; tie.output = [7n];
  tie.request = '1\ttropical\t1\t3\t1\t5,5,5\t2,2,2'; tie.expectedResponse = '1\tok\t1\t1\t7\t0';
  const tieReport = actions.invokeAction(actions.comparison, { request: tie.request, controls: ['reverse'] });
  await assertComparison(tieReport, tie, binding.invoke);
  const unknown=expectTyped(actions.invokeAction(actions.comparison,{request:researchCase('matmul').request,controls:['not-a-source-method']}),['research-invalid-draft']);
  return { families: rows, explicit_partitioned_routes: 2, tropical_original_index: true,unknown_method_refusal:unknown,
    planted_rejections: ['fabricated-alternate-response','wrong-interpreted-route-cell', 'same-route-as-primary', 'false-work-count'] };
}
async function codecs(artifacts, binding, actions) {
  const action = actions.tool('codec-tool'), cases = codecInspectionCases(), summaries = [];
  for (const fixture of cases) {
    const report = actions.invokeAction(action, { operation: 'codec-tool', controls: [fixture.plan, String(fixture.code), String(fixture.coordinate)] });
    assertCodecInspection(report, fixture.plan, fixture.code, fixture.coordinate);
    if (summaries.length < 12) summaries.push({ plan: fixture.plan, code: String(fixture.code), coordinate: fixture.coordinate, report_sha256: sha(JSON.stringify(report)) });
  }
  const sample = cases.find(x => x.plan.includes('packed') && x.coordinate > 0);
  const report = actions.invokeAction(action, { operation: 'codec-tool', controls: [sample.plan, String(sample.code), String(sample.coordinate)] });
  plantReportDefect(report, r => { r.tables.find(x => x.id === 'codec-path').rows.at(-1)[2] = String(sample.code); },
    r => assertCodecInspection(r, sample.plan, sample.code, sample.coordinate), /research-codec/);
  plantReportDefect(report, r => { r.tables.find(x => x.id === 'codec-path').rows.pop(); },
    r => assertCodecInspection(r, sample.plan, sample.code, sample.coordinate), /research-codec/);
  let matrixInspections=0;
  for(const fixture of [researchCase('codec'),codecMatrixCase('grid:8:-3,0,7;packed:4',[[228n,57n],[165n,27n]],[3n,-5n,7n,11n],2)]) {
    let index=0;for(const row of fixture.storedCodes)for(const code of row) {
      const count=fixture.codecPlan.includes('packed')?4:1;
      for(let coordinate=0;coordinate<count;coordinate++) {
        const inspected=actions.invokeAction(actions.inspection,{request:fixture.request,controls:['b',String(index),String(coordinate)]});
        assertCodecInspection(inspected,fixture.codecPlan,code,coordinate);assert.equal(inspected.response,fixture.expectedResponse);matrixInspections++;
      }index++;
    }
  }
  const errors = invalidCodecInspections.map(fixture => expectTyped(actions.invokeAction(action,
    { operation: 'codec-tool', controls: fixture.controls }), [fixture.code]));
  errors.push(expectTyped(actions.invokeAction(action,{operation:'codec-tool',controls:[largeCoordinateTool[0],'0','18446744073709551616']}),['research-invalid-draft']));
  return { actual_inspections: cases.length, matrix_stored_symbol_inspections:matrixInspections, codec_kinds: 9, e8_all_codes: 256, e8_all_coordinates: 8, maximum_stages: 8,
    examples: summaries, negative_codes: errors, planted_rejections: ['unchanged-parent-code-at-child', 'omitted-wrapper-stage'] };
}
async function ieee(artifacts, binding, actions) {
  const action = actions.tool('ieee-tool'), cases = ieeeCases(), summaries = [];
  for (const fixture of cases) {
    const report = actions.invokeAction(action, { operation: 'ieee-tool', controls: [fixture.format, String(fixture.bits)] });
    assertIeeeInspection(report, fixture.format, fixture.bits);
    summaries.push({ ...fixture, bits: String(fixture.bits), fields: reportTable(report, 'ieee-fields'), atoms: reportTable(report, 'atlas-atoms') });
    plantReportDefect(report, r => { r.tables.find(x => x.id === 'ieee-fields').rows.find(x => x[0] === 'Sign bit')[1] = '2'; },
      r => assertIeeeInspection(r, fixture.format, fixture.bits), /research-ieee/);
  }
  const finite = cases.find(x => x.format === 'f64' && x.bits === 1n);
  const report = actions.invokeAction(action, { operation: 'ieee-tool', controls: [finite.format, String(finite.bits)] });
  plantReportDefect(report, r => { r.tables.find(x => x.id === 'atlas-atoms').rows[0][3] = '0'; },
    r => assertIeeeInspection(r, finite.format, finite.bits), /research-atoms/);
  let operandInspections=0;
  for(const family of ['ieee','ieee-gemm','ieee-table','arena']) {
    const fixture=researchCase(family),right=fixture.book?fixture.storedCodes.map(code=>fixture.book[Number(code%BigInt(fixture.book.length))]):fixture.bBits;
    const targets=[['a',fixture.aBits],['b',right],['output',fixture.output],...(family==='ieee-gemm'?[['c',fixture.cBits]]:[]),...(fixture.book?[['codebook',fixture.book]]:[])];
    for(const [target,bits]of targets)for(const [index,value]of bits.entries()) {
      const inspected=actions.invokeAction(actions.inspection,{request:fixture.request,controls:[target,String(index),'0']});
      assertIeeeInspection(inspected,fixture.format,value);assert.equal(inspected.response,fixture.expectedResponse);operandInspections++;
    }
    for(const target of ['a','b','output']) {
      const values=targets.find(row=>row[0]===target)[1];
      expectTyped(actions.invokeAction(actions.inspection,{request:fixture.request,controls:[target,String(values.length),'0']}),['research-invalid-inspection']);
    }
  }
  const terminal = [];
  for (const fixture of ieeeTerminalCases()) {
    assert.equal(binding.invoke(fixture.request), fixture.expectedResponse, 'research-ieee: independent terminal reference differs');
    const trace = actions.invokeAction(actions.trace, {request:fixture.request}); assertTrace(trace, fixture, 0, 0);
    terminal.push({format:fixture.format,mode:fixture.mode,request_sha256:sha(fixture.request),response:fixture.expectedResponse});
  }
  expectTyped(actions.invokeAction(action, {operation:'ieee-tool',controls:['f64','1'.repeat(16385)]}), ['request-too-large']);
  const errors = [['binary128', '0'], ['f32', '4294967296'], ['f64', '18446744073709551616'], ['f32', '-1'], ['f64', 'not-bits']]
    .map(controls => expectTyped(actions.invokeAction(action, { operation: 'ieee-tool', controls }),
      [controls[0]==='binary128'?'research-invalid-draft':'research-invalid-tool-input']));
  return { formats: ['f32', 'f64'], actual_inspections: cases.length, matrix_operand_inspections:operandInspections, classes: 8, terminal_cases:terminal, cases: summaries, negative_codes: errors,
    planted_rejections: ['wrong-sign-field', 'wrong-Atlas-revolution'] };
}
const controlObservation = 'x'.repeat(1023)+'😀'+Array.from({length:32},(_,i)=>String.fromCodePoint(i)).join('')+Array.from({length:33},(_,i)=>String.fromCodePoint(127+i)).join('')+'漢字🧮終';
function assertCaseDisplaySafe(report) {
  for(const table of report.tables)for(const text of [table.title,...table.columns,...table.rows.flat()])
    assert(!/[\u0000-\u001f\u007f-\u009f]/u.test(text),'research-case-display: opaque recorded control characters leaked into human report');
}
const largeCoordinateTool = Object.freeze(['book:8:8:1,2,3,4,5,6,7,8' + ';packed:8'.repeat(7), '0', '16777215']);
const standaloneCaseInputs = Object.freeze([['codec-tool', ['grid:8:-3,0,7;packed:4', '228', '2']], ['codec-tool', largeCoordinateTool], ['ieee-tool', ['f64', '1']]]);
const caseKeys = Object.freeze(['schema', 'version', 'implementation', 'operation', 'values', 'request', 'response', 'controls', 'row', 'column', 'action']);
function caseActions(view) {
  return { export: view.case_exchange.export_action, import: view.case_exchange.import_action, recompute: view.case_exchange.recompute_action };
}
function parseCase(text, identity) {
  const value = JSON.parse(text); assert.deepEqual(Object.keys(value), [...caseKeys], 'research-case-schema: source export is not the closed case format');
  assert.equal(value.schema, 'lexlean-matmul/case/1'); assert.equal(value.version, 1);
  assert.equal(value.implementation, identity, 'research-case-identity: export did not bind actual executing adapter');
  assert(Array.isArray(value.values) && Array.isArray(value.controls)); assert(['compute', 'codec-tool', 'ieee-tool'].includes(value.action));
  return value;
}
export function assertCaseObservations(report, saved, current) {
  assertCaseDisplaySafe(report);
  const rows=reportTable(report,'case-observations',['Observation','Part','Exact JSON string chunk']);
  for(const [label,expected] of [['Saved observation',saved],['Fresh execution',current]]) {
    const chunks=rows.filter(row=>row[0]===label);assert(chunks.length>0,'research-case-chunks: empty response observation omitted');
    assert.deepEqual(chunks.map(row=>row[1]),Array.from({length:chunks.length},(_,i)=>String(i)),'research-case-chunks: skipped/duplicate/out-of-order part');
    const decoded=chunks.map(row=>{const text=JSON.parse(row[2]);assert.equal(typeof text,'string','research-case-chunks: observation chunk is not a JSON string');
      assert(Buffer.byteLength(text)<=1027,'research-case-chunks: UTF8 chunk exceeds target+boundary allowance');return text;});
    assert.equal(decoded.join(''),expected,'research-case-chunks: complete exact saved/fresh observation changed or truncated');
  }
  assert(rows.every(row=>['Saved observation','Fresh execution'].includes(row[0])),'research-case-chunks: unmodeled observation category');
}
function assertCaseIdentity(report,saved,current) {
  assert.deepEqual(reportTable(report,'case-identity',['Binding','Model identity']),[['Saved case',saved],['Current generated model',current]],
    'research-case-identity: saved/current bindings are missing or misattributed');
}
function assertRetainedTables(actual,expected) {
  for(const table of expected)assert.deepEqual(actual.filter(row=>row.id===table.id),[table],
    'research-tool-case: imported tool did not freshly reconstruct actual inspector');
}
function assertCaseResult(report, fixture, comparison = 'equivalent', recorded = fixture.expectedResponse) {
  assert.equal(report.status, 'ok', 'research-case: import/recompute failed');
  assert.equal(report.exchange.status, 'imported', 'research-case: import did not actually recompute');
  assert.equal(report.request, fixture.request, 'research-case: exact imported request changed');
  assert.equal(report.response, fixture.expectedResponse, 'research-case: untrusted recorded answer replaced actual arithmetic');
  assert.equal(report.comparison.status, comparison, 'research-case: recorded/current disagreement is hidden');
  assert(report.exchange.draft, 'research-case: explicit source draft restoration missing');
  assertCaseObservations(report,recorded,fixture.expectedResponse);
}
async function cases(artifacts, binding, actions) {
  const specs = caseActions(actions.view), rows = [];
  const caseFixtures=[...completeResearchCases(),researchCase('matmul',{rows:0}),researchCase('matmul',{columns:0}),researchCase('matmul',{inner:0}),researchCase('recenter',{vector:[]})];
  for (const fixture of caseFixtures) {
    const exported = actions.invokeAction(specs.export, { request: fixture.request, row: 0, column: 0 });
    assert.equal(exported.status, 'ok'); assert.equal(exported.exchange.status, 'exported');
    const file = parseCase(exported.exchange.file_text, binding.modelId);
    assert.equal(file.request, fixture.request); assert.equal(file.response, fixture.expectedResponse);
    assert.equal(file.operation, 'raw'); assert.equal(file.action, 'compute');
    const imported = actions.invokeAction(specs.import, { case_text: exported.exchange.file_text });
    assertCaseResult(imported, fixture);assertCaseIdentity(imported,binding.modelId,binding.modelId);
    const forged = { ...file, response: fixture.expectedResponse + '\tforged-recorded-output' };
    const recomputed = actions.invokeAction(specs.import, { case_text: JSON.stringify(forged) });
    assertCaseResult(recomputed, fixture, 'different',forged.response);
    const foreign = { ...file, implementation: binding.modelId === '0'.repeat(64) ? '1'.repeat(64) : '0'.repeat(64) };
    const mismatch = actions.invokeAction(specs.import, { case_text: JSON.stringify(foreign) });
    assertCaseIdentity(mismatch,foreign.implementation,binding.modelId);
    assert.equal(mismatch.exchange.status, 'identity-mismatch', 'research-case-identity: old model silently became fresh computation');
    assert.equal(mismatch.response, ''); assert.deepEqual(mismatch.cells, []); assert(mismatch.exchange.draft);
    assertCaseResult(actions.invokeAction(specs.recompute, { case_text: JSON.stringify(foreign) }), fixture);
    rows.push({ family: fixture.family, file_bytes: Buffer.byteLength(exported.exchange.file_text), file_sha256: sha(exported.exchange.file_text),
      exact_roundtrip: true, forged_answer_recomputed: true, identity_mismatch_explicit: true });
  }
  const base = researchCase('matmul'), alternate = researchCase('matmul', { left: [9n, 2n, 4n, 3n, 7n, 1n] });
  const exported = actions.invokeAction(specs.export, { request: base.request }), file = parseCase(exported.exchange.file_text, binding.modelId);
  const paddedCase=' '.repeat(actions.view.case_exchange.maximum_bytes-Buffer.byteLength(exported.exchange.file_text))+exported.exchange.file_text;
  assert.equal(Buffer.byteLength(paddedCase),actions.view.case_exchange.maximum_bytes);
  assertCaseResult(actions.invokeAction(specs.import,{case_text:paddedCase}),base);
  const controlsCase=actions.invokeAction(specs.import,{case_text:JSON.stringify({...file,response:controlObservation})});
  assertCaseResult(controlsCase,base,'different',controlObservation);assertCaseDisplaySafe(controlsCase);
  const edited = { ...file, request: alternate.request };
  assertCaseResult(actions.invokeAction(specs.import, { case_text: JSON.stringify(edited) }), alternate, 'different',file.response);
  // These exercise the actual guest parser, never a JS replacement case parser.
  const mutations = [
    ['empty', '', 'case-invalid-json'], ['malformed-json', '{', 'case-invalid-json'],
    ['version', JSON.stringify({ ...file, version: 2 }), 'case-invalid-version'],
    ['schema', JSON.stringify({ ...file, schema: 'other/case/1' }), 'case-invalid-schema'],
    ['identity', JSON.stringify({ ...file, implementation: 'bad' }), 'case-invalid-identity'],
    ['uppercase-identity',JSON.stringify({...file,implementation:'A'.repeat(64)}),'case-invalid-identity'],
    ['unpaired-high-surrogate',JSON.stringify({...file,response:String.fromCharCode(0xd800)}),'case-invalid-json'],
    ['unpaired-low-surrogate',JSON.stringify({...file,response:String.fromCharCode(0xdc00)}),'case-invalid-json'],
    ['extra-field', JSON.stringify({ ...file, extra: true }), 'case-invalid-schema'],
    ['missing-field', JSON.stringify(Object.fromEntries(Object.entries(file).filter(([key]) => key !== 'controls'))), 'case-invalid-schema'],
    ['wrong-type', JSON.stringify({ ...file, row: '0' }), 'case-invalid-type'],
    ['negative-selection', JSON.stringify({ ...file, row: -1 }), 'case-invalid-type'],
    ['selection-overflow', JSON.stringify({ ...file, row: 4294967296 }), 'case-invalid-selection'],
    ['duplicate-field', exported.exchange.file_text.replace('{', '{"version":1,'), 'case-duplicate-field'],
    ['oversized-file', ' '.repeat(actions.view.case_exchange.maximum_bytes + 1), 'case-too-large'],
    ['at-limit-whitespace-only', ' '.repeat(actions.view.case_exchange.maximum_bytes), 'case-invalid-json'],
    ['unknown-operation', JSON.stringify({ ...file, operation: 'unknown-operation' }), 'case-invalid-draft'],
    ['unknown-action', JSON.stringify({ ...file, action: 'execute-remote-script' }), 'case-invalid-action'],
  ];
  const errors = mutations.map(([name, case_text, code]) => ({ name,
    code: expectTyped(actions.invokeAction(specs.import, { case_text }), [code]) }));
  for(const [name,row,column]of [['row-outside-output',base.rows,0],['column-outside-output',0,base.columns]]) {
    errors.push({name:'export-'+name,code:expectTyped(actions.invokeAction(specs.export,{request:base.request,row,column}),['case-invalid-selection'])});
    errors.push({name:'import-'+name,code:expectTyped(actions.invokeAction(specs.import,{case_text:JSON.stringify({...file,row,column})}),['case-invalid-selection'])});
  }
  const guided=actions.invokeAction(specs.export,{operation:'matmul',request:base.request,values:base.fields,controls:['output','0','0']});
  const guidedFile=parseCase(guided.exchange.file_text,binding.modelId);
  errors.push({name:'guided-values-request-disagreement',code:expectTyped(actions.invokeAction(specs.import,{case_text:JSON.stringify({...guidedFile,values:['1',...guidedFile.values.slice(1)]})}),['case-inconsistent-request'])});
  errors.push({name:'guided-value-arity',code:expectTyped(actions.invokeAction(specs.import,{case_text:JSON.stringify({...guidedFile,values:guidedFile.values.slice(1)})}),['case-invalid-draft'])});
  errors.push({name:'invalid-inspection-controls',code:expectTyped(actions.invokeAction(specs.import,{case_text:JSON.stringify({...guidedFile,controls:['unmodeled-target','0','0']})}),['case-invalid-controls'])});
  const forged = actions.invokeAction(specs.import, { case_text: JSON.stringify({ ...file, response: '1\tok\t2\t2\t0,0,0,0' }) });
  assertCaseResult(forged, base, 'different','1\tok\t2\t2\t0,0,0,0');
  const bad = structuredClone(forged); bad.response = '1\tok\t2\t2\t0,0,0,0';
  assert.throws(() => assertCaseResult(bad, base, 'different'), /research-case: untrusted recorded answer/);
  const toolCases = [];
  for (const [operation, controls] of standaloneCaseInputs) {
    const tool = actions.invokeAction(actions.tool(operation), {operation,controls});
    const exported = actions.invokeAction(specs.export, {operation,controls});
    const file = parseCase(exported.exchange.file_text,binding.modelId);
    assert.equal(file.operation,operation); assert.equal(file.action,operation); assert.equal(file.request,''); assert.deepEqual(file.controls,controls);
    for (const [recorded, expected] of [[file,'equivalent'], [{...file,response:'forged recorded tool report'},'different']]) {
      const imported=actions.invokeAction(specs.import,{case_text:JSON.stringify(recorded)});
      assert.equal(imported.exchange.status,'imported'); assert.equal(imported.comparison.status,expected);
      assertRetainedTables(imported.tables,tool.tables);assertCaseObservations(imported,recorded.response,tool.response);
      assert.deepEqual(imported.exchange.draft.controls,controls,'research-tool-case: exact controls changed during import');
      if(operation==='codec-tool')assertCodecInspection(imported,controls[0],BigInt(controls[1]),Number(controls[2]));
    }
    const foreign={...file,implementation:binding.modelId==='0'.repeat(64)?'1'.repeat(64):'0'.repeat(64)};
    assert.equal(actions.invokeAction(specs.import,{case_text:JSON.stringify(foreign)}).exchange.status,'identity-mismatch');
    const recomputed=actions.invokeAction(specs.recompute,{case_text:JSON.stringify(foreign)});
    assert.equal(recomputed.exchange.status,'imported'); assertRetainedTables(recomputed.tables,tool.tables);assertCaseObservations(recomputed,file.response,tool.response);
    assert.deepEqual(recomputed.exchange.draft.controls,controls,'research-tool-case: exact controls changed during explicit recompute');
    if(operation==='codec-tool')assertCodecInspection(recomputed,controls[0],BigInt(controls[1]),Number(controls[2]));
    if(operation==='codec-tool') errors.push({name:'codec-coordinate-u64-overflow',code:expectTyped(actions.invokeAction(specs.import,{case_text:JSON.stringify({...file,controls:[controls[0],controls[1],'18446744073709551616']})}),['case-invalid-controls'])});
    toolCases.push({operation,controls,file_sha256:sha(exported.exchange.file_text),fresh_report:true});
  }
  const failedRequest='1\tmatmul\t1\t1\t1\tnot-an-integer\t1',failedResponse='1\terror\tinvalid-integer';
  assert.equal(binding.invoke(failedRequest),failedResponse);
  const failedExport=actions.invokeAction(specs.export,{request:failedRequest});
  assert.equal(failedExport.status,'error');assert.equal(failedExport.error,'invalid-integer');assert.equal(failedExport.exchange.status,'exported');
  const failedFile=parseCase(failedExport.exchange.file_text,binding.modelId);assert.equal(failedFile.request,failedRequest);assert.equal(failedFile.response,failedResponse);
  const failedImport=actions.invokeAction(specs.import,{case_text:failedExport.exchange.file_text});
  assert.equal(failedImport.status,'error');assert.equal(failedImport.error,'invalid-integer');assert.equal(failedImport.exchange.status,'imported');
  assert.equal(failedImport.response,failedResponse);assert.equal(failedImport.comparison.status,'equivalent');assertCaseObservations(failedImport,failedResponse,failedResponse);
  return { families: rows, standalone_tools:toolCases, exact_case_file_limit_imported:true, edited_request_recomputed: true, opaque_control_observation_sha256:sha(controlObservation), failed_raw_protocol_case_preserved:true, typed_failures: errors,
    planted_rejections: ['recorded-answer-as-computation'], actual_identity: binding.modelId };
}
async function installResearchObserver(page) {
  await page.evaluate(() => {
    if (window.__researchObserved) return;
    const observations = window.__researchObserved = { replies: [], inputs: [] };
    const observe = worker => {
      worker.addEventListener('message', event => {
        if (event.data?.type === 'result') observations.replies.push({ generation: event.data.generation, output: [...event.data.output] });
      });
      const send = worker.postMessage.bind(worker);
      worker.postMessage = (message, transfer) => {
        if (message?.type === 'invoke') observations.inputs.push({ generation: message.generation, input: [...message.input] });
        return send(message, transfer);
      };
    };
    for (const worker of window.__productionWorkerProbe.workers) observe(worker);
    const Actual = window.Worker;
    window.Worker = class extends Actual { constructor(...args) { super(...args); observe(this); } };
  });
}
async function browserReply(page, button, action, operation, { click = true, trigger = null } = {}) {
  const before = await page.evaluate(() => window.__researchObserved.replies.length);
  if(trigger)await trigger();else if (click) await page.locator(button).click();
  await page.waitForFunction(index => window.__researchObserved.replies.length > index, before, { timeout: action.timeout_milliseconds ?? 180000 });
  const observed = await page.evaluate(index => window.__researchObserved.replies[index], before);
  const report = parseResearchReply(decoder.decode(Uint8Array.from(observed.output)), action, { operation });
  await page.waitForFunction(generation => document.querySelector('#research-output')?.dataset.requestId === String(generation), observed.generation);
  assert.equal(await page.locator('#research-output').getAttribute('data-action'), action.id, 'research-browser-correlation: wrong action report rendered');
  assert.equal(await page.locator('#research-output').getAttribute('data-operation'), report.operation, 'research-browser-correlation: wrong operation report rendered');
  return report;
}
async function fillFields(page, fields, values, prefix) {
  assert.equal(fields.length, values.length, 'research-fixture: source form arity changed');
  for (const [index, field] of fields.entries()) {
    const control = page.locator('#' + prefix + field.id);
    if (field.kind === 'choice') await control.selectOption(String(values[index]));
    else await control.fill(String(values[index]));
  }
}
async function fillResearchFixture(page, view, fixture) {
  const operation = view.operations.find(x => x.id === familyOperation(fixture.family)); assert(operation);
  await page.locator('#operation').selectOption(operation.id);
  await fillFields(page, operation.fields, fixture.normalize ? [fixture.original.map(x => x === null ? '-inf' : String(x)).join(',')] : fixture.fields, 'field-');
  return operation;
}
async function browserCompute(page, view, fixture) {
  const operation = await fillResearchFixture(page, view, fixture);
  const report = await browserReply(page, '#guided-submit', { id: 'compute', timeout_milliseconds: view.execution.timeout_milliseconds }, operation.id);
  assert.equal(report.request, fixture.request, 'research-guided-input: actual form changed operands');
  assert.equal(report.response, fixture.expectedResponse, 'research-guided-result: actual guided arithmetic differs from independent reference');
  assert.deepEqual(report.cells,expectedResearchCells(fixture),'research-guided-cells: actual human result differs from independent exact output');
  assert.equal(await page.locator('#result').textContent(), fixture.expectedResponse);
  return { operation, report };
}
async function assertSourceResearchSchema(page,operation) {
  const schemas=[];
  for(const [kind,button]of [['trace','research-trace'],['comparison','research-compare'],['inspection','research-inspect']]) {
    const spec=operation[kind],prefix='research-'+kind+'-field-';
    assert.equal(await page.locator('#'+button).textContent(),spec.label,'research-raw-schema: action label differs from source raw authority');
    assert.equal(await page.locator('#research-'+kind+'-help').textContent(),spec.help,'research-raw-schema: action help differs from source raw authority');
    assert.deepEqual(await page.locator('#research-'+kind+'-fields input,#research-'+kind+'-fields select,#research-'+kind+'-fields textarea').evaluateAll(nodes=>nodes.map(node=>node.id)),
      spec.fields.map(field=>prefix+field.id),'research-raw-schema: controls differ from source raw authority');
    for(const field of spec.fields) {
      const id=prefix+field.id,node=page.locator('#'+id);
      assert.equal(await page.locator(`label[for="${id}"]`).textContent(),field.label,'research-raw-schema: field label differs from source raw authority');
      assert.equal(await page.locator('#'+id+'-help').textContent(),field.help,'research-raw-schema: field help differs from source raw authority');
      assert.equal(await node.evaluate(n=>n.tagName.toLowerCase()),field.kind==='choice'?'select':field.kind==='multiline'?'textarea':'input','research-raw-schema: field kind differs from source raw authority');
      if(field.kind==='choice')assert.deepEqual(await node.locator('option').evaluateAll(nodes=>nodes.map(n=>({value:n.value,label:n.textContent}))),field.choices,'research-raw-schema: choices differ from source raw authority');
    }
    schemas.push({action:spec.id,fields:spec.fields.map(field=>field.id)});
  }
  return schemas;
}
async function rawResearchSchemaJourney(page,view,binding) {
  const initial=view.operations.find(op=>op.id===view.initial_operation);assert(initial);
  const guided=researchCase('arena');await browserCompute(page,view,guided);
  const raw=researchCase('matmul');await page.locator('#raw-editor').evaluate(node=>{node.open=true;});
  await page.locator('#request').fill(raw.request);
  const schemas=await assertSourceResearchSchema(page,initial);
  const field=initial.inspection.fields[0];assert(field);
  const label=page.locator(`label[for="research-inspection-field-${field.id}"]`),original=await label.textContent();
  await label.evaluate(node=>{node.textContent='Incorrect inherited raw control';});
  try{await assert.rejects(()=>assertSourceResearchSchema(page,initial),/research-raw-schema/);}
  finally{await label.evaluate((node,text)=>{node.textContent=text;},original);}
  const computed=await browserReply(page,'#submit',{id:'compute',timeout_milliseconds:view.execution.timeout_milliseconds},'raw');
  assert.equal(computed.request,raw.request);assert.equal(computed.response,raw.expectedResponse);
  await page.locator('#research-row').fill('0');await page.locator('#research-column').fill('0');
  const trace=await browserReply(page,'#research-trace',initial.trace,'raw');assertTrace(trace,raw,0,0);await assertResearchRendered(page,trace,view);
  await fillFields(page,initial.inspection.fields,['output','0','0'],'research-inspection-field-');
  const inspection=await browserReply(page,'#research-inspect',initial.inspection,'raw');assertOutputInspection(inspection,raw,0);
  return {default_operation:initial.id,entered_from:familyOperation(guided.family),schemas,actual_raw_trace:true,actual_raw_output_inspection:true,
    source_schemas_distinct:view.operations.some(op=>JSON.stringify([op.trace,op.comparison,op.inspection])!==JSON.stringify([initial.trace,initial.comparison,initial.inspection]))};
}
async function assertResearchControlHelp(page) {
  const references=await page.locator('#research-panel input,#research-panel select,#research-panel textarea').evaluateAll(nodes=>nodes
    .filter(node=>/^(research-(trace|comparison|inspection)-field-|tool-field-)/.test(node.id)).map(node=>({id:node.id,
      described:(node.getAttribute('aria-describedby')??'').split(/\s+/).filter(Boolean),expected:node.id+'-help',
      help:document.getElementById(node.id+'-help')?.textContent??'',
      missing:(node.getAttribute('aria-describedby')??'').split(/\s+/).filter(Boolean).filter(id=>!document.getElementById(id))})));
  for(const item of references) assert(item.described.includes(item.expected)&&item.help.trim()&&item.missing.length===0,
    'research-help: current action/tool control lost its actual modeled help association: '+item.id);
  return references.length;
}
export async function assertResearchRendered(page, report, view) {
  assert.equal(await page.locator('#research-output').getAttribute('data-action'), report.action);
  assert.equal(await page.locator('#research-output').getAttribute('data-operation'), report.operation);
  const seen = [];
  for (const table of report.tables) {
    assert.match(table.id, /^[a-z][a-z0-9-]*$/);
    const element = page.locator(`[data-research-table="${table.id}"]`);
    assert.equal(await element.count(), 1, 'research-browser-table: source table is missing/duplicated');
    assert.equal(await element.locator('caption').textContent(), table.title);
    assert.deepEqual(await element.locator('thead th').allTextContents(), table.columns);
    const rows = [];
    const pages = Math.max(1, Math.ceil(table.rows.length / view.research.page_rows));
    for (let current = 1; current <= pages; current++) {
      const control = page.locator(`[data-table-page="${table.id}"]`);
      await control.fill(String(current)); await control.dispatchEvent('change');
      const visible = await element.locator('tbody tr').evaluateAll(nodes => nodes.map(node => ({
        index: Number(node.dataset.rowIndex), cells: [...node.querySelectorAll('td')].map(cell => cell.textContent),
      })));
      assert.deepEqual(visible.map(row => row.index), Array.from({ length: Math.min(view.research.page_rows, Math.max(0, table.rows.length - (current - 1) * view.research.page_rows)) },
        (_, i) => (current - 1) * view.research.page_rows + i), 'research-browser-pagination: output row indexes skipped/repeated');
      rows.push(...visible.map(row => row.cells));
    }
    assert.deepEqual(rows, table.rows, 'research-browser-table: actual source rows were changed or truncated');
    seen.push({ id: table.id, rows: rows.length, pages });
  }
  assert.equal(await page.locator('#research-tables [data-research-table]').count(), report.tables.length);
  assert.equal(await page.locator('#comparison-panels [data-comparison-panel]').count(), report.panels.length);
  for (const panel of report.panels) {
    assert.match(panel.id, /^[a-z][a-z0-9-]*$/);
    const element = page.locator(`[data-comparison-panel="${panel.id}"]`);
    assert.equal(await element.locator('caption').textContent(), panel.title);
    assert.deepEqual(await element.locator('tbody td').allTextContents(), panel.cells, 'research-browser-panels: exact route values differ');
    assert.deepEqual(await element.locator('pre').allTextContents(), [panel.request, panel.response], 'research-browser-panels: actual routes or answers are hidden');
  }
  assert.equal(await page.locator('#comparison-status').getAttribute('data-state'), report.comparison.status);
  assert.equal(await page.locator('#comparison-status').textContent(), report.comparison.message);
  await assertResearchControlHelp(page);
  return seen;
}
async function renderedReportDefects(page, report, view) {
  if (!report.tables.some(table => table.rows.length)) return [];
  const table = report.tables.find(table => table.rows.length), control = page.locator(`[data-table-page="${table.id}"]`);
  await control.fill('1'); await control.dispatchEvent('change');
  const target = page.locator(`[data-research-table="${table.id}"] tbody td`).first();
  const text = await target.textContent(); await target.evaluate(node => { node.textContent = 'planted altered source row'; });
  try { await assert.rejects(() => assertResearchRendered(page, report, view), /research-browser-table/); }
  finally { await control.fill('1'); await control.dispatchEvent('change'); }
  await assertResearchRendered(page, report, view);
  return ['altered-visible-research-row'];
}
async function browserTool(page, view, id, controls) {
  const tool = view.research.tools.find(x => x.id === id); assert(tool);
  await page.locator('#research-tool').selectOption(id);
  await fillFields(page, tool.action.fields, controls, 'tool-field-');
  return browserReply(page, '#research-tool-submit', tool.action, id);
}
async function browserCaseRoundTrip(page, view, modelId, fixture, operation, { download = false } = {}) {
  const specs = caseActions(view);
  const settings=[];for(const field of operation.inspection.fields)settings.push(await page.locator('#research-inspection-field-'+field.id).inputValue());
  const selected={row:Number(await page.locator('#research-row').inputValue()),column:Number(await page.locator('#research-column').inputValue())};
  const exported = await browserReply(page, '#case-export', specs.export, operation.id);
  assert.equal(exported.exchange.status, 'exported');
  const file = parseCase(exported.exchange.file_text, modelId); assert.equal(file.operation, operation.id);
  assert.equal(file.request, fixture.request); assert.equal(file.response, fixture.expectedResponse);
  assert.deepEqual(file.controls,settings,'research-case-settings: export lost current inspection controls');
  assert.deepEqual({row:file.row,column:file.column},selected,'research-case-settings: export lost selected cell');
  assert.equal(await page.locator('#case-content').inputValue(), exported.exchange.file_text);
  assert.equal(await page.locator('#case-model-id').textContent(), modelId);
  if (download) {
    const waiting = page.waitForEvent('download'); await page.locator('#case-download').click(); const artifact = await waiting;
    assert.equal(artifact.suggestedFilename(), view.case_exchange.file_name);
    const saved = await artifact.path(); assert(fs.readFileSync(saved).equals(Buffer.from(exported.exchange.file_text)), 'research-case-file: explicit download changed source bytes');
  }
  // Alter the active draft first; import must restore exact exported values and recompute.
  const first = operation.fields.find(field => field.kind !== 'choice'); assert(first);
  await page.locator('#field-' + first.id).fill('1');
  const beforeFileSelection=await page.evaluate(()=>window.__researchObserved.inputs.length);
  await page.locator('#case-file').setInputFiles({name:view.case_exchange.file_name,mimeType:view.case_exchange.media_type,buffer:Buffer.from(exported.exchange.file_text)});
  assert.equal(await page.evaluate(()=>window.__researchObserved.inputs.length),beforeFileSelection,'research-case-file: file selection automatically executed or uploaded content');
  const imported = await browserReply(page, '#case-import', specs.import, operation.id);
  assertCaseResult(imported, fixture);assertCaseIdentity(imported,modelId,modelId);
  for (const [index, field] of operation.fields.entries()) assert.equal(await page.locator('#field-' + field.id).inputValue(), file.values[index]);
  const forged = { ...file, response:fixture.family==='matmul'?controlObservation:'recorded output must never become current arithmetic' };
  await page.locator('#case-content').fill(JSON.stringify(forged));
  const forgedReply=await browserReply(page, '#case-import', specs.import, operation.id);
  assertCaseResult(forgedReply,fixture,'different',forged.response);assertCaseDisplaySafe(forgedReply);await assertResearchRendered(page,forgedReply,view);
  const foreign = { ...file, implementation: modelId === '0'.repeat(64) ? '1'.repeat(64) : '0'.repeat(64) };
  await page.locator('#case-content').fill(JSON.stringify(foreign));
  const mismatched = await browserReply(page, '#case-import', specs.import, operation.id);
  assertCaseIdentity(mismatched,foreign.implementation,modelId);await assertResearchRendered(page,mismatched,view);
  assert.equal(mismatched.exchange.status, 'identity-mismatch'); assert.equal(mismatched.response, ''); assert.deepEqual(mismatched.cells, []);
  assert.equal(await page.locator('#result').textContent(), '', 'research-case-identity: old recorded result displayed as fresh');
  assert.equal(await page.locator('#case-recompute').isVisible(), true);
  assert.equal(await page.locator('#case-status').textContent(), view.case_exchange.mismatch_label);
  assertCaseResult(await browserReply(page, '#case-recompute', specs.recompute, operation.id), fixture);
  return { family: fixture.family, file_sha256: sha(exported.exchange.file_text), file_bytes: Buffer.byteLength(exported.exchange.file_text), download, actual_recomputed: true };
}
async function browserResearchJourneys(context, artifacts, binding, actions, { complete = true } = {}) {
  const { page } = context, view = actions.view; await installResearchObserver(page);
  const families = [], caseRows = [], examples = [], renderedNegatives = [];
  for (const fixture of completeResearchCases()) {
    const { operation } = await browserCompute(page, view, fixture);
    const row = Math.max(0, fixture.rows - 1), column = Math.max(0, fixture.columns - 1);
    const cell = page.locator(`#result-table button[data-row="${row}"][data-column="${column}"]`);
    await cell.focus(); await page.keyboard.press('Enter');
    assert.equal(await cell.getAttribute('aria-pressed'), 'true', 'research-selection: keyboard cannot select actual result cell');
    assert.equal(await page.locator('#research-row').inputValue(), String(row));
    assert.equal(await page.locator('#research-column').inputValue(), String(column));
    const trace = await browserReply(page, '#research-trace', operation.trace, operation.id);
    assertTrace(trace, fixture, row, column); const pages = await assertResearchRendered(page, trace, view);
    if (fixture.family === 'matmul') renderedNegatives.push(...await renderedReportDefects(page, trace, view));
    await page.locator('#research-comparison-field-method').selectOption('auto');
    const compare = await browserReply(page, '#research-compare', operation.comparison, operation.id);
    await assertComparison(compare, fixture, binding.invoke); await assertResearchRendered(page, compare, view);
    await fillFields(page, operation.inspection.fields, ['output', String(row * fixture.columns + column), '0'], 'research-inspection-field-');
    const inspection = await browserReply(page, '#research-inspect', operation.inspection, operation.id);
    assert.equal(inspection.status, 'ok'); assert.equal(inspection.response, fixture.expectedResponse);
    assertOutputInspection(inspection,fixture,row*fixture.columns+column);
    await assertResearchRendered(page, inspection, view);
    if (complete) caseRows.push(await browserCaseRoundTrip(page, view, binding.modelId, fixture, operation, { download: fixture.family === 'matmul' }));
    families.push({ family: fixture.family, operation: operation.id, selected: { row, column },
      response_sha256: sha(fixture.expectedResponse), actual_trace_rows: trace.tables.reduce((n, table) => n + table.rows.length, 0), pages,
      comparison_status: compare.comparison.status, inspected_output: true });
  }
  if (complete) for (const operation of view.operations) {
    await page.locator('#operation').selectOption(operation.id);
    for (const example of operation.examples) {
      await page.locator('#example').selectOption(example.id); await page.locator('#load-example').click();
      assert.equal(await page.locator('#result').textContent(), '', 'research-example: loading source example fabricated fresh result');
      const report = await browserReply(page, '#guided-submit', { id: 'compute', timeout_milliseconds: view.execution.timeout_milliseconds }, operation.id);
      const expected = JSON.parse(example.expected_response);
      assert.equal(report.request, expected.request); assert.equal(report.response, expected.response);
      examples.push({ operation: operation.id, example: example.id, response_sha256: sha(report.response) });
    }
  }
  const codecRows = [], uniquePlans = new Map();
  for (const fixture of codecInspectionCases({ exhaustiveE8: false })) {
    const old = uniquePlans.get(fixture.plan); if (!old || fixture.coordinate > old.coordinate) uniquePlans.set(fixture.plan, fixture);
  }
  for (const fixture of uniquePlans.values()) {
    const report = await browserTool(page, view, 'codec-tool', [fixture.plan, String(fixture.code), String(fixture.coordinate)]);
    assertCodecInspection(report, fixture.plan, fixture.code, fixture.coordinate); await assertResearchRendered(page, report, view);
    codecRows.push({ plan: fixture.plan, code: String(fixture.code), coordinate: fixture.coordinate });
  }
  const ieeeRows = [];
  for (const fixture of ieeeCases()) {
    const report = await browserTool(page, view, 'ieee-tool', [fixture.format, String(fixture.bits)]);
    assertIeeeInspection(report, fixture.format, fixture.bits); await assertResearchRendered(page, report, view);
    ieeeRows.push({ format: fixture.format, bits: String(fixture.bits) });
  }
  const toolCases = [];
  for (const [id, controls] of standaloneCaseInputs) {
    await page.locator('#research-row').fill('not-a-matrix-row');
    await page.locator('#research-column').fill('4294967296');
    const report = await browserTool(page, view, id, controls), specs = caseActions(view);
    if(id==='codec-tool')assertCodecInspection(report,controls[0],BigInt(controls[1]),Number(controls[2]));
    else assertIeeeInspection(report,controls[0],BigInt(controls[1]));
    const exported = await browserReply(page, '#case-export', specs.export, id);
    const file = parseCase(exported.exchange.file_text, binding.modelId);
    assert.equal(file.operation, id); assert.equal(file.action, id); assert.equal(file.request, ''); assert.deepEqual(file.controls, controls);
    assert.deepEqual([file.row,file.column],[0,0],'research-tool-selection: standalone tool case inherited invalid matrix coordinates');
    await page.locator('#case-content').fill(exported.exchange.file_text);
    const imported = await browserReply(page, '#case-import', specs.import, id);
    assert.equal(imported.exchange.status, 'imported'); assert.equal(imported.comparison.status, 'equivalent');
    assertRetainedTables(imported.tables,report.tables);assertCaseObservations(imported,file.response,report.response);
    if(id==='codec-tool') assertCodecInspection(imported,controls[0],BigInt(controls[1]),Number(controls[2]));
    else assertIeeeInspection(imported,controls[0],BigInt(controls[1]));
    assert.equal(await page.locator('#research-tool').inputValue(), id);
    const tool = view.research.tools.find(tool => tool.id === id);
    for (const [index, field] of tool.action.fields.entries()) assert.equal(await page.locator('#tool-field-' + field.id).inputValue(), controls[index]);
    await assertResearchRendered(page, imported, view);
    const foreign={...file,implementation:binding.modelId==='0'.repeat(64)?'1'.repeat(64):'0'.repeat(64),response:'untrusted recorded tool observation'};
    await page.locator('#case-content').fill(JSON.stringify(foreign));
    const mismatch=await browserReply(page,'#case-import',specs.import,id);
    assertCaseIdentity(mismatch,foreign.implementation,binding.modelId);
    assert.equal(mismatch.exchange.status,'identity-mismatch'); assert.equal(mismatch.response,'');
    assert(!mismatch.tables.some(table=>['codec-path','ieee-fields','atlas-atoms'].includes(table.id)),'research-tool-case: foreign recorded inspector appeared fresh');
    const recomputed=await browserReply(page,'#case-recompute',specs.recompute,id);
    assert.equal(recomputed.exchange.status,'imported'); assert.equal(recomputed.comparison.status,'different');
    assertRetainedTables(recomputed.tables,report.tables);assertCaseObservations(recomputed,foreign.response,report.response);
    await assertResearchRendered(page,recomputed,view);
    toolCases.push({ tool: id, controls, exported_sha256: sha(exported.exchange.file_text), actual_recomputed: true,
      independent_of_invalid_matrix_selection:true,case_coordinates:[file.row,file.column] });
  }
  // Selection itself owns the next explicit export; it cannot inherit the last
  // executed tool. A subsequent matrix action likewise takes ownership back.
  await browserTool(page,view,'codec-tool',standaloneCaseInputs[0][1]);
  await page.locator('#research-tool').selectOption('ieee-tool');
  const selectedTool=view.research.tools.find(tool=>tool.id==='ieee-tool');
  const selectedToolControls=['f32','1065353216'];
  await fillFields(page,selectedTool.action.fields,selectedToolControls,'tool-field-');
  const selectedToolExport=await browserReply(page,'#case-export',view.case_exchange.export_action,'ieee-tool');
  const selectedToolFile=parseCase(selectedToolExport.exchange.file_text,binding.modelId);
  assert.equal(selectedToolFile.operation,'ieee-tool','research-tool-context: selection exported a previously executed tool');
  assert.deepEqual(selectedToolFile.controls,selectedToolControls);
  const matrixContext=researchCase('matmul'),{operation:matrixOperation}=await browserCompute(page,view,matrixContext);
  await browserTool(page,view,'codec-tool',standaloneCaseInputs[0][1]);
  const matrixTrace=await browserReply(page,'#research-trace',matrixOperation.trace,matrixOperation.id);
  assertTrace(matrixTrace,matrixContext,0,0);
  const matrixExport=await browserReply(page,'#case-export',view.case_exchange.export_action,matrixOperation.id);
  const matrixFile=parseCase(matrixExport.exchange.file_text,binding.modelId);
  assert.equal(matrixFile.operation,matrixOperation.id,'research-tool-context: explicit matrix action retained a prior tool case');
  assert.equal(matrixFile.request,matrixContext.request);assert.equal(matrixFile.response,matrixContext.expectedResponse);
  const rawSchema=await rawResearchSchemaJourney(page,view,binding);renderedNegatives.push('wrong-raw-research-control-schema');
  const codecTool=await browserTool(page,view,'codec-tool',largeCoordinateTool);
  assertCodecInspection(codecTool,largeCoordinateTool[0],0n,16777215);
  const overflow=await browserTool(page,view,'codec-tool',[largeCoordinateTool[0],'0','18446744073709551616']);
  expectTyped(overflow,['research-invalid-draft']);
  const zeroShapeCases=[];
  for(const fixture of [researchCase('matmul',{rows:0}),researchCase('matmul',{columns:0}),researchCase('matmul',{inner:0}),researchCase('recenter',{vector:[]})]) {
    const {operation}=await browserCompute(page,view,fixture);
    await page.locator('#research-row').fill('0');await page.locator('#research-column').fill('0');
    const file=await browserReply(page,'#case-export',view.case_exchange.export_action,operation.id);
    assert.equal(file.exchange.status,'exported');const saved=parseCase(file.exchange.file_text,binding.modelId);
    assert.equal(saved.row,0);assert.equal(saved.column,0);await page.locator('#case-content').fill(file.exchange.file_text);
    const imported=await browserReply(page,'#case-import',view.case_exchange.import_action,operation.id);assertCaseResult(imported,fixture);
    assert.deepEqual([imported.rows,imported.columns],[fixture.rows,fixture.columns]);zeroShapeCases.push({family:fixture.family,rows:fixture.rows,columns:fixture.columns});
  }
  const failedRequest='1\tmatmul\t1\t1\t1\tnot-an-integer\t1',failedResponse='1\terror\tinvalid-integer';
  await page.locator('#raw-editor').evaluate(node=>{node.open=true;});await page.locator('#request').fill(failedRequest);
  const failed=await browserReply(page,'#submit',{id:'compute',timeout_milliseconds:view.execution.timeout_milliseconds},'raw');
  expectTyped(failed,['invalid-integer']);assert.equal(failed.response,failedResponse);
  const failedExport=await browserReply(page,'#case-export',view.case_exchange.export_action,'raw');
  assert.equal(failedExport.status,'error');assert.equal(failedExport.exchange.status,'exported');const failedFile=parseCase(failedExport.exchange.file_text,binding.modelId);
  assert.equal(failedFile.response,failedResponse);await page.locator('#case-content').fill(failedExport.exchange.file_text);
  const failedImport=await browserReply(page,'#case-import',view.case_exchange.import_action,'raw');
  assert.equal(failedImport.status,'error');assert.equal(failedImport.exchange.status,'imported');assert.equal(failedImport.response,failedResponse);
  assertCaseObservations(failedImport,failedResponse,failedResponse);await assertResearchRendered(page,failedImport,view);
  assert.deepEqual(families.map(x => x.family), [...researchFamilies]);
  if (complete) {
    assert.equal(new Set(examples.map(x => x.operation + ':' + x.example)).size, examples.length);
    assert(examples.length >= 28);
    assert.deepEqual(examples.map(x => [x.operation, x.example]), view.operations.flatMap(op => op.examples.map(example => [op.id, example.id])));
  }
  return { families, examples, zero_shape_case_roundtrips:zeroShapeCases, failed_raw_protocol_case_preserved:true, guided_case_roundtrips: caseRows, codec_tools: codecRows, ieee_tools: ieeeRows, standalone_case_roundtrips: toolCases,
    explicit_tool_selection_export:true,matrix_action_reclaims_case_context:true,
    raw_research_schema:rawSchema,
    planted_rejections: renderedNegatives };
}
async function keyboardResearchJourney(page, view, binding) {
  const fixture=researchCase('matmul'),{operation}=await browserCompute(page,view,fixture);
  const reach=async selector=>{for(let i=0;i<300;i++) {if(await page.locator(selector).evaluate(node=>node===document.activeElement))return;
    await page.keyboard.press('Tab');}assert.fail('research-keyboard: Tab cannot reach '+selector);};
  const type=async text=>{await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type(text);};
  const enter=(button,action,op)=>browserReply(page,button,action,op,{trigger:()=>page.keyboard.press('Enter')});
  await reach('#research-row');await type('0');await page.keyboard.press('Tab');
  assert.equal(await page.locator('#research-column').evaluate(node=>node===document.activeElement),true,'research-keyboard: column coordinate is not next in focus order');
  await type('0');await reach('#research-trace');const trace=await enter('#research-trace',operation.trace,operation.id);
  assertTrace(trace,fixture,0,0);await assertResearchRendered(page,trace,view);
  await reach('#research-comparison-field-method');await page.keyboard.press('Home');await reach('#research-compare');
  const comparison=await enter('#research-compare',operation.comparison,operation.id);await assertComparison(comparison,fixture,binding.invoke);
  await reach('#research-inspection-field-target');await page.keyboard.press('Home');
  for(let i=0;i<operation.inspection.fields[0].choices.findIndex(choice=>choice.value==='output');i++)await page.keyboard.press('ArrowDown');
  await reach('#research-inspection-field-index');await type('0');await reach('#research-inspection-field-coordinate');await type('0');
  await reach('#research-inspect');const inspection=await enter('#research-inspect',operation.inspection,operation.id);
  assert.equal(inspection.status,'ok');await assertResearchRendered(page,inspection,view);
  await reach('#research-tool');await page.keyboard.press('Home');
  for(let i=0;i<view.research.tools.findIndex(tool=>tool.id==='codec-tool');i++)await page.keyboard.press('ArrowDown');
  const tool=view.research.tools.find(tool=>tool.id==='codec-tool'),controls=['grid:8:-3,0,7;packed:4','228','2'];
  for(const [i,field]of tool.action.fields.entries()){await reach('#tool-field-'+field.id);await type(controls[i]);}
  await reach('#research-tool-submit');const report=await enter('#research-tool-submit',tool.action,tool.id);
  assertCodecInspection(report,controls[0],228n,2);await assertResearchRendered(page,report,view);
  await reach('#case-export');const exported=await enter('#case-export',view.case_exchange.export_action,tool.id);
  const file=parseCase(exported.exchange.file_text,binding.modelId);assert.equal(file.operation,tool.id);assert.deepEqual(file.controls,controls);
  await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('#case-import').evaluate(node=>node===document.activeElement),true,
    'research-keyboard: explicit local case import is not reachable before export');
  const imported=await enter('#case-import',view.case_exchange.import_action,tool.id);
  assert.equal(imported.exchange.status,'imported');assertCodecInspection(imported,controls[0],228n,2);
  await assertResearchRendered(page,imported,view);
  return ['selected-cell trace','same-input route comparison','actual output inspector','standalone codec inspector','explicit case export','explicit case import/recompute'];
}
async function assertResearchAccessibility(context, artifacts, actions, binding) {
  const { page, require } = context, view = actions.view;
  const operation = view.operations.find(x => x.id === 'matmul'), fixture = researchCase('matmul', { rows: 1, inner: 8, columns: 1 });
  await browserCompute(page, view, fixture);
  await page.locator('#research-row').focus(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('0');
  await page.locator('#research-column').focus(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('0');
  await page.locator('#research-trace').focus();
  const first = await page.evaluate(() => window.__researchObserved.replies.length);
  await page.keyboard.press('Enter');
  await page.waitForFunction(index => window.__researchObserved.replies.length > index, first);
  const raw = await page.evaluate(index => window.__researchObserved.replies[index], first);
  const report = parseResearchReply(decoder.decode(Uint8Array.from(raw.output)), operation.trace, { operation: operation.id });
  await page.waitForFunction(token => document.querySelector('#research-output').dataset.requestId === String(token), raw.generation);
  assertTrace(report, fixture, 0, 0); await assertResearchRendered(page, report, view);
  const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  assert.equal(require('axe-core/package.json').version, '4.13.0');
  assert.equal(sha(axe), 'c24f097bd2f451d4f933e8bc7d8d539f8672a2ebcb5cc9f9f3eec8ca9470a0c1');
  await page.addScriptTag({ content: axe });
  const assess = () => page.evaluate(async () => {const result=await window.axe.run(document, { runOnly: { type: 'tag',
    values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });return {
    violations:result.violations.map(row=>row.id),incomplete:result.incomplete.map(row=>row.id)};});
  const modes = [];
  for (const colorScheme of ['light', 'dark']) { await page.emulateMedia({ colorScheme }); const assessed = await assess();
    assert.deepEqual(assessed.violations, [], 'research-accessibility: modeled research surface has finite axe violations');
    assert.deepEqual(assessed.incomplete, [], 'research-accessibility: modeled research surface has unresolved finite axe checks');
    modes.push({color_scheme:colorScheme,...assessed}); }
  const row = page.locator('#research-row'); const prior = await row.getAttribute('id');
  await row.evaluate(node => node.removeAttribute('id'));
  try { assert((await assess()).violations.includes('label'), 'research-accessibility-negative: missing research selection label was accepted'); }
  finally { await page.locator('#research-panel input').first().evaluate((node, id) => { node.id = id; }, prior); }
  const method=page.locator('#research-comparison-field-method'),helpBefore=await method.getAttribute('aria-describedby');
  await method.evaluate(node=>node.setAttribute('aria-describedby','missing-research-help'));
  try {await assert.rejects(()=>assertResearchControlHelp(page),/research-help/);}
  finally {await method.evaluate((node,value)=>node.setAttribute('aria-describedby',value),helpBefore);}
  await assertResearchControlHelp(page);
  await page.emulateMedia({ colorScheme: 'light' }); await page.setViewportSize({ width: 320, height: 640 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'research-reflow: research overflows 320 CSS pixels');
  for (const control of await page.locator('#research-panel button,#research-panel input,#research-panel select,#research-panel textarea,#case-exchange button,#case-exchange input,#case-exchange textarea').all()) {
    if (!await control.isVisible()) continue;
    const size = await control.boundingBox(); assert(size.width >= 24 && size.height >= 24, 'research-target: research control is smaller than24 CSS pixels');
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  const style = await page.addStyleTag({ content: 'html{font-size:200% !important}' });
  try { assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'research-reflow: research overflows after200% text resize'); }
  finally { await style.evaluate(node => node.remove()); }
  return { keyboard_actual_trace: true, keyboard_research_actions:await keyboardResearchJourney(page,view,binding), all_rows_reachable: true, axe: modes, widths: [320, 1280], text_resize_percent: 200,
    screen_reader_speech_tested: false, planted_rejections: ['missing-research-selection-label','broken-action-help-association'],
    scope: 'finite rendered WCAG2.2/WAI-ARIA semantics, not complete standard conformance' };
}
async function researchScreenshots(context, artifacts, actions, engine) {
  const { page } = context, fixture = researchCase('matmul'), view = actions.view;
  const { operation } = await browserCompute(page, view, fixture);
  await page.locator('#research-comparison-field-method').selectOption('auto');
  const compare = await browserReply(page, '#research-compare', operation.comparison, operation.id);
  await assertResearchRendered(page, compare, view);
  const records = [];
  for (const [name, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height }); await page.locator('#research-heading').scrollIntoViewIfNeeded();
    await page.evaluate(() => document.activeElement?.blur());
    const filename = `research-${engine}-${name}.png`, target = path.join(evidenceRoot, 'runtime-oracle', filename);
    await page.screenshot({ path: target, fullPage: false }); const bytes = fs.readFileSync(target);
    records.push({ path: `runtime-oracle/${filename}`, width, height, bytes: bytes.length, sha256: sha(bytes), surface: 'actual same-input equivalent routes' });
  }
  return records;
}
function outerFailures(artifacts,binding,actions) {
  const compute={id:'compute',request_prefix:actions.view.operations.find(op=>op.id==='matmul').request_prefix};
  const envelope=researchEnvelope({request:researchCase('matmul').request,model_id:binding.modelId});
  const definitions=[
    ['missing-envelope-fields',compute,compute.request_prefix+separator+'{}','research-invalid-envelope'],
    ['malformed-envelope-json',compute,compute.request_prefix+separator+'{','research-invalid-envelope'],
    ['wrong-envelope-version',compute,compute.request_prefix+separator+JSON.stringify({...envelope,version:2}),'research-invalid-envelope'],
    ['extra-envelope-field',compute,compute.request_prefix+separator+JSON.stringify({...envelope,extra:true}),'research-invalid-envelope'],
    ['raw-extra-values',compute,researchFrame(compute,{...envelope,values:['extra']}),'research-invalid-draft'],
    ['unknown-action',compute,'research-unknown-v1'+separator+JSON.stringify(envelope),'research-unknown-action'],
    ['missing-runtime-identity',actions.view.case_exchange.export_action,researchFrame(actions.view.case_exchange.export_action,{...envelope,model_id:''}),'research-runtime-identity'],
  ];
  return definitions.map(([name,action,request,code])=>{const text=binding.invoke(request),report=parseResearchReply(text,action,{operation:'raw'});
    expectTyped(report,[code]);const hint=actions.view.errors.find(hint=>hint.code===code);
    assert(hint&&hint.explanation.trim()&&hint.recovery.trim(),'research-error: outer failure has no modeled recovery');
    return {name,code,request_sha256:sha(request),response_sha256:sha(text)};});
}
async function persistentState(page) {
  const state = await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length,
    databases: (await indexedDB.databases()).length, caches: (await caches.keys()).length,
    service_workers: (await navigator.serviceWorker.getRegistrations()).length }));
  assert.deepEqual(state, { local: 0, session: 0, databases: 0, caches: 0, service_workers: 0 },
    'research-privacy: operands or local cases escaped into persistent browser state');
  return state;
}
async function unblockedResearchStatus(page, view) {
  assert.equal(await page.locator('#status').textContent(), view.statuses.running);
  assert.equal(await page.locator('#status').getAttribute('role'), 'status');
  assert.equal(await page.locator('#status').getAttribute('aria-live'), 'polite');
  assert.equal(await page.locator('#status').evaluate(node => node.closest('[aria-busy="true"]') === null), true,
    'research-live-status: busy ancestor may defer a research announcement');
}
async function heldResearchReply(page, button) {
  await page.evaluate(() => { const probe = window.__productionWorkerProbe; probe.hold = true; probe.held = []; });
  await page.locator(button).click();
  await page.waitForFunction(() => window.__productionWorkerProbe.held.length === 1);
  return page.evaluate(() => ({ generation: window.__productionWorkerProbe.held[0].data.generation,
    output: [...window.__productionWorkerProbe.held[0].data.output] }));
}
async function replayHeldReply(page) {
  await page.evaluate(() => { const probe = window.__productionWorkerProbe, reply = probe.held.shift();
    probe.hold = false; reply.handler({ data: reply.data }); });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function waitResearchReady(page) {
  await page.waitForFunction(() => !document.querySelector('#guided-submit').disabled && !document.querySelector('#research-trace').disabled);
}
async function importRecoversUnrelatedDraft(page,view,binding,fixture) {
  const {operation}=await browserCompute(page,view,fixture),specs=caseActions(view);
  const exported=await browserReply(page,'#case-export',specs.export,operation.id),saved=parseCase(exported.exchange.file_text,binding.modelId);
  const required=operation.fields.find(field=>field.required&&field.kind==='natural');assert(required);
  const checks=[];
  for(const name of ['required-guided-field-empty','invalid-selected-coordinate']) {
    if(name==='required-guided-field-empty')await page.locator('#field-'+required.id).fill('');
    else await page.locator('#research-row').fill('not-a-row');
    const before=await page.evaluate(()=>window.__researchObserved.inputs.length);
    await page.locator('#case-file').setInputFiles({name:view.case_exchange.file_name,mimeType:view.case_exchange.media_type,buffer:Buffer.from(exported.exchange.file_text)});
    assert.equal(await page.evaluate(()=>window.__researchObserved.inputs.length),before,'research-import-recovery: choosing a file executed automatically');
    const restored=await browserReply(page,'#case-import',specs.import,operation.id);assertCaseResult(restored,fixture);assertCaseIdentity(restored,binding.modelId,binding.modelId);
    for(const [index,field]of operation.fields.entries())assert.equal(await page.locator('#field-'+field.id).inputValue(),saved.values[index],
      'research-import-recovery: unrelated invalid draft blocked source-restored fields');
    assert.equal(await page.locator('#research-row').inputValue(),String(saved.row));assert.equal(await page.locator('#research-column').inputValue(),String(saved.column));
    assert.equal(await page.locator('#result').textContent(),fixture.expectedResponse);
    checks.push({name,status:restored.exchange.status,fresh_response_sha256:sha(restored.response),source_restored_draft:true});
  }
  await page.locator('#case-file').setInputFiles([]);
  return {source_case_sha256:sha(exported.exchange.file_text),checks};
}
async function selectionInputOwnership(page,view,binding,fixture) {
  assert(fixture.rows>=2&&fixture.columns>=2,'research-selection-fixture: row1 and column1 must both be within actual shape');
  const checks=[];
  for(const [field,text,kind]of [['row','1','in-range'],['column','1','in-range'],['row','7','outside-shape'],['column','7','outside-shape'],
    ['row','not-a-row','invalid-natural'],['column','not-a-column','invalid-natural'],['row','-1','invalid-natural'],['column','4294967296','invalid-natural']]) {
    const {operation}=await browserCompute(page,view,fixture);await heldResearchReply(page,'#research-trace');
    const before=await page.evaluate(()=>({terminated:window.__productionWorkerProbe.terminated,inputs:window.__researchObserved.inputs.length}));
    const input=page.locator('#research-'+field);await input.fill(text);
    assert.equal(await input.evaluate(node=>node===document.activeElement),true,'research-selection-input: ownership test must precede blur/change');
    await page.waitForFunction(count=>window.__productionWorkerProbe.terminated>count,before.terminated);
    assert.equal(await input.inputValue(),text,'research-selection-input: local edit was normalized before explicit source action');
    if(kind==='invalid-natural') {
      assert.equal(await input.getAttribute('aria-invalid'),'true','research-selection-input: invalid natural lacks input association');
      for(const selector of ['#research-trace','#guided-submit','#case-export'])if(!await page.locator(selector).isDisabled())await page.locator(selector).click();
      assert.equal(await page.evaluate(()=>window.__researchObserved.inputs.length),before.inputs,'research-selection-input: invalid selection reached guest execution');
    }
    await replayHeldReply(page);
    assert.equal(await input.inputValue(),text,'research-selection-stale: a retired report replaced exact unblurred selection text');
    assert.equal(await page.locator('#research-tables [data-research-table]').count(),0,'research-selection-stale: retired trace repopulated an edited selection');
    assert.equal(await page.locator('#result').textContent(),'','research-selection-stale: retired result appeared fresh after selection edit');
    assert.equal(await page.evaluate(()=>window.__researchObserved.inputs.length),before.inputs,'research-selection-input: editing or replay silently recomputed');
    if(kind==='outside-shape') {
      await page.waitForFunction(()=>!document.querySelector('#research-trace').disabled);
      const rejected=await browserReply(page,'#research-trace',operation.trace,operation.id);expectTyped(rejected,['research-invalid-selection']);
    }
    await page.locator('#research-row').fill('0');await page.locator('#research-column').fill('0');await waitResearchReady(page);
    const recovered=await browserReply(page,'#research-trace',operation.trace,operation.id);assertTrace(recovered,fixture,0,0);
    checks.push({field,text,kind,input_before_blur:true,retired_owner:true,stale_reply_rejected:true,recovered_actual_trace:true});
  }
  return checks;
}
async function researchFileFailures(page, view, operation, requestMaximum) {
  const cases = view.case_exchange, retained = await page.locator('#fields input,#fields select,#fields textarea').evaluateAll(nodes => nodes.map(x => x.value));
  const exported=await browserReply(page,'#case-export',cases.export_action,operation.id);
  const canonical=Buffer.from(exported.exchange.file_text);
  assert(canonical.length<cases.maximum_bytes);
  const padded=Buffer.concat([Buffer.alloc(cases.maximum_bytes-canonical.length,0x09),canonical]);
  const files = [
    { name: 'invalid-utf8.json', data: Buffer.from([0xff]), code: cases.file_encoding_error_code },
    { name: 'too-large.json', data: Buffer.alloc(cases.maximum_bytes + 1, 0x20), code: cases.file_too_large_error_code },
  ];
  const results = [];
  for (const file of files) {
    await page.locator('#case-file').setInputFiles({ name: file.name, mimeType: cases.media_type, buffer: file.data });
    const before = await page.evaluate(() => window.__researchObserved.inputs.length);
    await page.locator('#case-import').click();
    const hint = view.errors.find(hint => hint.code === file.code); assert(hint);
    await page.waitForFunction(explanation => document.querySelector('#result-error')?.textContent.includes(explanation), hint.explanation);
    assert.equal(await page.locator('#case-file').getAttribute('aria-invalid'), 'true', 'research-file: file error lacks invalid-input association');
    assert.equal(await page.evaluate(() => window.__researchObserved.inputs.length), before, 'research-file: refused bytes reached guest execution');
    assert.deepEqual(await page.locator('#fields input,#fields select,#fields textarea').evaluateAll(nodes => nodes.map(x => x.value)), retained,
      'research-file: failure changed a valid draft');
    results.push({ bytes: file.data.length, code: file.code });
  }
  // Legal JSON whitespace still consumes the independent encoded action budget.
  // Use a real source-exported case, not a replacement case parser or answer.
  const paddedText=padded.toString('utf8');
  assert(Buffer.byteLength(JSON.stringify(paddedText))>requestMaximum,'research-fixture: padded case must exceed the actual outer transport');
  await page.locator('#case-file').setInputFiles({name:'encoded-action-budget.json',mimeType:cases.media_type,buffer:padded});
  const beforeBudget=await page.evaluate(()=>window.__researchObserved.inputs.length);
  await page.locator('#case-import').click();
  await page.waitForFunction(copy=>document.querySelector('#status')?.textContent===copy,view.statuses.input_error);
  assert.equal(await page.evaluate(()=>window.__researchObserved.inputs.length),beforeBudget,'research-file-budget: oversized encoded action reached guest');
  assert.deepEqual(await page.locator('#fields input,#fields select,#fields textarea').evaluateAll(nodes=>nodes.map(node=>node.value)),retained,
    'research-file-budget: encoded action refusal changed a valid draft');
  results.push({bytes:padded.length,code:'input_error',fault:'source-exported valid case padded with legal JSON whitespace exceeds the separate encoded action budget',
    encoded_case_text_bytes:Buffer.byteLength(JSON.stringify(paddedText)),preserved_draft:true});
  const representable=Buffer.concat([Buffer.alloc(cases.maximum_bytes-canonical.length,0x20),canonical]);
  await page.locator('#case-file').setInputFiles({name:'exact-file-limit.json',mimeType:cases.media_type,buffer:representable});
  const atLimit=await browserReply(page,'#case-import',cases.import_action,operation.id);
  assert.equal(atLimit.exchange.status,'imported');assert.equal(atLimit.comparison.status,'equivalent');
  assert.equal(atLimit.request,exported.request);assert.equal(atLimit.response,exported.response);
  results.push({bytes:representable.length,status:'imported',fault:'genuine source-exported case with legal ASCII whitespace at the exact file limit',fresh_execution:true});
  await page.evaluate(()=>{const Actual=window.FileReader;window.__researchReadFailureActual=Actual;window.FileReader=class extends Actual {
    readAsArrayBuffer(file){super.readAsArrayBuffer(file);this.abort();queueMicrotask(()=>this.onerror?.(new ProgressEvent('error')));}
  };});
  try {
    await page.locator('#case-file').setInputFiles({name:'read-failure.json',mimeType:cases.media_type,buffer:Buffer.from('{}')});
    const before=await page.evaluate(()=>window.__researchObserved.inputs.length);await page.locator('#case-import').click();
    const hint=view.errors.find(hint=>hint.code===cases.file_read_error_code);assert(hint);
    await page.waitForFunction(text=>document.querySelector('#result-error')?.textContent.includes(text),hint.explanation);
    assert.equal(await page.evaluate(()=>window.__researchObserved.inputs.length),before,'research-file: failed local read reached guest');
    results.push({bytes:2,code:cases.file_read_error_code,fault:'named native FileReader error callback injection, not a filesystem failure claim'});
  } finally {await page.evaluate(()=>{window.FileReader=window.__researchReadFailureActual;});}
  await page.locator('#case-file').setInputFiles({ name: 'empty.json', mimeType: cases.media_type, buffer: Buffer.alloc(0) });
  const empty = await browserReply(page, '#case-import', cases.import_action, operation.id);
  expectTyped(empty, ['case-invalid-json']); results.push({ bytes: 0, code: 'case-invalid-json' });
  await page.locator('#case-file').setInputFiles([]);
  return results;
}
async function fileReadCancellation(page, view, fixture, operation) {
  const exported = await browserReply(page, '#case-export', view.case_exchange.export_action, operation.id);
  await page.evaluate(() => {
    const Actual = window.FileReader; window.__researchFileRead = { Actual, held: null };
    window.FileReader = class extends Actual { constructor() { super(); this.addEventListener('load', event => {
      event.stopImmediatePropagation(); window.__researchFileRead.held = { reader: this, handler: this.onload, event,
        bytes: this.result instanceof ArrayBuffer ? [...new Uint8Array(this.result)] : [] };
    }); } };
  });
  try {
    await page.locator('#case-file').setInputFiles({ name: 'cancelled-current-case.json', mimeType: view.case_exchange.media_type,
      buffer: Buffer.from(exported.exchange.file_text) });
    const before = await page.evaluate(() => window.__researchObserved.inputs.length);
    await page.locator('#case-import').click();
    await page.waitForFunction(() => window.__researchFileRead.held !== null);
    const actualRead = await page.evaluate(() => window.__researchFileRead.held.bytes);
    assert(Buffer.from(actualRead).equals(Buffer.from(exported.exchange.file_text)), 'research-file: held callback did not read actual source export bytes');
    assert.equal(await page.evaluate(() => window.__researchObserved.inputs.length), before, 'research-file: cancelled file invoked guest before load ownership');
    await page.locator('#cancel').click(); await waitResearchReady(page);
    const edited = researchCase('matmul', { left: [9n, 2n, 4n, 3n, 7n, 1n] });
    await browserCompute(page, view, edited);
    const current = await page.locator('#research-output').getAttribute('data-request-id');
    await page.evaluate(() => { const read = window.__researchFileRead.held; read.handler.call(read.reader, read.event); });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator('#result').textContent(), edited.expectedResponse, 'research-file-stale: cancelled read replaced fresh arithmetic');
    assert.equal(await page.locator('#research-output').getAttribute('data-request-id'), current, 'research-file-stale: cancelled file callback regained ownership');
    return { actual_read_sha256: sha(Buffer.from(actualRead)), bytes: actualRead.length, cancelled_before_guest: true, fresh_edited_result_preserved: true };
  } finally { await page.evaluate(() => { window.FileReader = window.__researchFileRead.Actual; }); }
}
async function researchLifecycle(context, artifacts, binding, actions) {
  const { page, requests, consoles } = context, view = actions.view, fixture = researchCase('matmul');
  await installResearchObserver(page); let { operation } = await browserCompute(page, view, fixture);
  const delayed = await heldResearchReply(page, '#research-trace'); await unblockedResearchStatus(page, view);
  const statusParent = await page.locator('#status').evaluate(node => {
    const before = node.parentElement.getAttribute('aria-busy'); node.parentElement.setAttribute('aria-busy', 'true'); return before;
  });
  try { await assert.rejects(() => unblockedResearchStatus(page, view), /research-live-status/); }
  finally { await page.locator('#status').evaluate((node, before) => {
    if (before === null) node.parentElement.removeAttribute('aria-busy'); else node.parentElement.setAttribute('aria-busy', before);
  }, statusParent); }
  await page.locator('#cancel').click(); await waitResearchReady(page);
  assert.equal(await page.locator('#research-tables [data-research-table]').count(), 0);
  await page.evaluate(() => { window.__productionWorkerProbe.hold = false; });
  const current = await browserReply(page, '#research-compare', operation.comparison, operation.id);
  await assertResearchRendered(page, current, view);
  await replayHeldReply(page);
  await assertResearchRendered(page, current, view);
  assert.notEqual(await page.locator('#research-output').getAttribute('data-request-id'), String(delayed.generation),
    'research-stale: cancelled owner regained current authority');
  const invalidations = [];
  for (const [name, button, change] of [
    ['selected-cell-edit', '#research-trace', () => page.locator('#research-column').fill('1')],
    ['route-edit', '#research-compare', () => page.locator('#research-comparison-field-method').selectOption('reverse')],
    ['tool-change', '#research-inspect', () => page.locator('#research-tool').selectOption('ieee-tool')],
    ['raw-draft-edit', '#research-trace', async () => { await page.locator('#raw-editor').evaluate(node => { node.open = true; }); await page.locator('#request').fill(fixture.request); }],
    ['import-file-selection', '#case-export', () => page.locator('#case-file').setInputFiles({ name: 'replacement.json', mimeType: 'application/json', buffer: Buffer.from('{}') })],
  ]) {
    ({ operation } = await browserCompute(page, view, fixture));
    await heldResearchReply(page, button); const before = await page.evaluate(() => window.__productionWorkerProbe.terminated);
    await change();
    await page.waitForFunction(() => !document.querySelector('#guided-submit').disabled);
    assert(await page.evaluate(value => window.__productionWorkerProbe.terminated > value, before), 'research-invalidation: edited context did not terminate old owner');
    assert.equal(await page.locator('#research-tables [data-research-table]').count(), 0, 'research-invalidation: old report survived changed input');
    await replayHeldReply(page);
    assert.equal(await page.locator('#research-tables [data-research-table]').count(), 0, 'research-stale: retired report repopulated a new draft');
    invalidations.push(name);
  }
  const selectionInputs=await selectionInputOwnership(page,view,binding,researchCase('matmul',{rows:2,columns:2}));
  const importRecovery=await importRecoversUnrelatedDraft(page,view,binding,fixture);
  ({ operation } = await browserCompute(page, view, fixture));
  await page.clock.install(); await page.evaluate(() => { window.__productionWorkerProbe.drop = true; });
  await page.locator('#research-trace').click(); await unblockedResearchStatus(page, view);
  await page.clock.fastForward(operation.trace.timeout_milliseconds + 1);
  assert.equal(await page.locator('#status').textContent(), view.statuses.timeout, 'research-timeout: source action deadline did not retire computation');
  assert.equal(await page.locator('#retry').isVisible(), true, 'research-recovery: timed out research cannot retry');
  await page.evaluate(() => { window.__productionWorkerProbe.drop = false; }); await page.clock.resume();
  const retry = await browserReply(page, '#retry', operation.trace, operation.id); assertTrace(retry, fixture, 0, 0);
  await page.evaluate(() => { window.__productionWorkerProbe.replacement = [123]; });
  await page.locator('#research-compare').click();
  await page.waitForFunction(copy => document.querySelector('#status')?.textContent === copy, view.statuses.response_error);
  assert.equal(await page.locator('#retry').isVisible(), true, 'research-recovery: malformed research reply cannot retry');
  await page.evaluate(() => { window.__productionWorkerProbe.replacement = null; });
  const recovered = await browserReply(page, '#retry', operation.comparison, operation.id);
  await assertComparison(recovered, fixture, binding.invoke); await assertResearchRendered(page, recovered, view);
  const fileCancellation = await fileReadCancellation(page, view, fixture, operation);
  ({ operation } = await browserCompute(page, view, fixture));
  const fileErrors = await researchFileFailures(page, view, operation, artifacts.application.request_maximum);
  const sentinel = '987654321098765432109876543210987654321098765432109876543210';
  const privateCase = researchCase('matmul', { rows: 1, inner: 1, columns: 1, left: [BigInt(sentinel)], right: [1n] });
  ({ operation } = await browserCompute(page, view, privateCase));
  const exported = await browserReply(page, '#case-export', view.case_exchange.export_action, operation.id);
  assert(exported.exchange.file_text.includes(sentinel));
  const hostile = '<img src=x onerror=alert(1)>', forged = JSON.parse(exported.exchange.file_text);
  forged.response = hostile;
  await page.locator('#case-content').fill(JSON.stringify(forged));
  const imported = await browserReply(page, '#case-import', view.case_exchange.import_action, operation.id);
  assertCaseResult(imported, privateCase, 'different',hostile);
  assert.equal(await page.locator('img').count(), 0, 'research-safe-text: case text created active markup');
  assert(requests.every(row => !row.url.includes(sentinel) && !row.url.includes(encodeURIComponent(sentinel)) && row.method === 'GET'), 'research-privacy: case or operands entered network');
  assert(consoles.every(text => !text.includes(sentinel) && !text.includes(hostile)), 'research-privacy: case or operands entered console logs');
  assert(!page.url().includes(sentinel));
  const storage = await persistentState(page); assert.deepEqual((await context.context.storageState()).cookies, []);
  await page.evaluate(value => localStorage.setItem('research-case-history', value), sentinel);
  try { await assert.rejects(() => persistentState(page), /research-privacy/); }
  finally { await page.evaluate(() => localStorage.removeItem('research-case-history')); }
  await persistentState(page);
  return { actual_delayed_cancel: true, stale_reply_replay: true, invalidations, source_deadline_milliseconds: operation.trace.timeout_milliseconds,
    selection_input_ownership:selectionInputs,import_draft_recovery:importRecovery,
    actual_timeout_retry: true, malformed_reply_retry: true, file_errors: fileErrors, file_read_cancellation:fileCancellation, identity: binding.modelId, storage,
    operand_requests: 0, operand_console_messages: 0,
    planted_rejections: ['busy-live-status-ancestor', 'malformed-actual-worker-output', 'persistent-case-history'],
    scope: 'Actual guest results, bounded file refusals, rendered semantics and local privacy. No screen-reader speech claim.' };
}
export async function runResearchArtifactChecks(artifacts, id = 'all', publicationUrl = null) {
  const selected = id === 'all' ? [...capabilities] : [id];
  assert(selected.every(value => capabilities.includes(value)), 'Select a registered research capability');
  const binding = await researchBinding(artifacts), actions = guestActions(artifacts, binding), records = [];
  fs.mkdirSync(path.join(evidenceRoot, 'runtime-oracle'), { recursive: true });
  const math = { 'MM-25': traces, 'MM-26': comparisons, 'MM-27': cases, 'MM-28': codecs, 'MM-29': ieee };
  for (const capability of selected) {
    fs.rmSync(path.join(evidenceRoot,'runtime-oracle',`${capability}.json`),{force:true});
    fs.rmSync(path.join(evidenceRoot,'runtime-oracle',`${capability}.failure.json`),{force:true});
    const report = { schema: 'lexlean-matmul/research-acceptance/1', id: capability, status: 'passed',
      model_id: binding.modelId, profile: artifacts.application.profile, assets: artifacts.assets, publication_url: publicationUrl,
      node: process.version, skipped: 0, filtered: 0, started_at: new Date().toISOString() };
    try {
      if (Object.hasOwn(math, capability)) report.guest = await math[capability](artifacts, binding, actions);
      else {
        if(capability==='MM-31')report.guest={outer_failures:outerFailures(artifacts,binding,actions)};
        report.browsers = [];
        for (const engine of ['chromium', 'firefox', 'webkit']) {
          report.browsers.push(await withWorkbench(artifacts, async context => {
            await installResearchObserver(context.page);
            if (capability === 'MM-30') return { journeys: await browserResearchJourneys(context, artifacts, binding, actions),
              accessibility: await assertResearchAccessibility(context, artifacts, actions, binding), screenshots: await researchScreenshots(context, artifacts, actions, engine) };
            return { lifecycle: await researchLifecycle(context, artifacts, binding, actions) };
          }, { engine, publicationUrl, observeWorkers: true }));
        }
      }
      report.finished_at = new Date().toISOString();
      writeJson(path.join(evidenceRoot, 'runtime-oracle', `${capability}.json`), report); records.push(report);
    } catch (error) {
      writeJson(path.join(evidenceRoot, 'runtime-oracle', `${capability}.failure.json`), { ...report, status: 'failed',
        error: { name: error.name, message: String(error.message).slice(0, 4096) }, finished_at: new Date().toISOString() });
      throw error;
    }
  }
  return records;
}
export async function runResearchChecks(id, build = freshBuild()) {
  // Defensive functions with deliberately inconsistent internal inputs cannot be
  // reached through a valid public request. Exercise their real source in a
  // separate negative-only SDK fixture; the source-free entry never calls it.
  let defensive=null;
  if(id==='MM-31'||id==='all') {
    fs.rmSync(path.join(evidenceRoot,'runtime-oracle','MM-31.json'),{force:true});
    fs.rmSync(path.join(evidenceRoot,'runtime-oracle','MM-31.failure.json'),{force:true});
    try {
      const {runResearchDefensiveChecks}=await import('./research-defensive.mjs');
      defensive=await runResearchDefensiveChecks(build);
    } catch(error) {
      writeJson(path.join(evidenceRoot,'runtime-oracle','MM-31.failure.json'),{schema:'lexlean-matmul/research-acceptance/1',id:'MM-31',status:'failed',
        stage:'source-defensive',build_id:build.build_id,error:{name:error.name,message:String(error.message).slice(0,4096)}});throw error;
    }
  }
  const records=await runResearchArtifactChecks(browserArtifacts(build), id);
  if(defensive) {
    const record=records.find(record=>record.id==='MM-31');assert(record);
    record.source_defensive=defensive;
    writeJson(path.join(evidenceRoot,'runtime-oracle','MM-31.json'),record);
  }
  return records;
}

// These unchanged guest gates also support an explicitly unqualified source
// carrier diagnostic. Release entrypoints retain their exact V4/model binding.
export {traces as runResearchTraceGuestChecks,comparisons as runResearchComparisonGuestChecks,
  cases as runResearchCaseGuestChecks,codecs as runResearchCodecGuestChecks,ieee as runResearchIeeeGuestChecks};
