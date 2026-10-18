// Verification only: every case body and restored draft comes from the actual
// source guest. Lexical JSON escape variants are adversarial fixture inputs.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const request='1\tmatmul\t1\t1\t1\t1\t2',response='1\tok\t1\t1\t2';
const controls=Object.freeze(['output','0','0']);
const values=Object.freeze(['1','1','1','1'+'\n'.repeat(9000),'2'+'\n'.repeat(9000)]);
const nearValues=Object.freeze(['1','1','1','1'+'\n'.repeat(81000),'2'+'\n'.repeat(81000)]);
const unicodeObservation='🧮漢'.repeat(9000);
const caseKeys=['schema','version','implementation','operation','values','request','response','controls','row','column','action'];

export function researchCaseFidelityFixtures() {
  return [
    {id:'two-operands-9000-line-feeds',values:[...values],comparison:'equivalent'},
    {id:'unicode-escaped-values',values:[...values],comparison:'equivalent'},
    {id:'unicode-escaped-recorded-observation',values:[...values],comparison:'different'},
    {id:'near-case-file-limit-81000-line-feeds',values:[...nearValues],comparison:'equivalent'},
  ];
}
function unicodeString(value) {
  let text='"';for(let i=0;i<value.length;i++)text+='\\u'+value.charCodeAt(i).toString(16).padStart(4,'0');return text+'"';
}
function member(text,key,next,replacement) {
  const start='"'+key+'":',end=',"'+next+'":';
  assert.equal(text.split(start).length,2,'research-case-fidelity: ambiguous source field');
  const at=text.indexOf(start)+start.length,after=text.indexOf(end,at);assert(after>at);
  return text.slice(0,at)+replacement+text.slice(after);
}
function environment(artifacts,binding,actions,helpers) {
  assert.equal(artifacts.application.profile,'prismpm/text-application/4');
  assert.match(binding.modelId,/^[0-9a-f]{64}$/);
  assert.equal(typeof helpers?.frame,'function');assert.equal(typeof helpers?.assertObservations,'function');
  assert.equal(typeof actions.invokeAction,'function');
  const view=actions.view,specs=view.case_exchange;
  assert.equal(specs.maximum_bytes,1048576);assert.equal(artifacts.application.request_maximum,2097152);
  const timings=[];
  const invoke=(action,input)=>{
    const framed=helpers.frame(action,{...input,model_id:binding.modelId});
    assert(Buffer.byteLength(framed)<=artifacts.application.request_maximum,'research-case-fidelity: fixture exceeds the actual outer byte limit');
    assert.equal(action.timeout_milliseconds,180000,'research-case-fidelity: source action deadline differs');
    const started=performance.now(),report=actions.invokeAction(action,input),elapsed=performance.now()-started;
    timings.push({action:action.id,elapsed_milliseconds:elapsed});
    assert(elapsed<=action.timeout_milliseconds,'research-case-fidelity: actual source action exceeded its modeled deadline');
    return report;
  };
  return{view,specs,invoke,timings};
}
function sourceCase(report,fixture,identity) {
  assert.equal(report.status,'ok','research-case-fidelity: source rejected the independent 1×1 draft');
  assert.equal(report.exchange.status,'exported');assert.equal(report.response,response);assert.deepEqual(report.cells,['2']);
  const text=report.exchange.file_text,file=JSON.parse(text);
  assert.deepEqual(Object.keys(file),caseKeys);
  assert.equal(file.schema,'lexlean-matmul/case/1');assert.equal(file.version,1);assert.equal(file.implementation,identity);
  assert.equal(file.operation,'matmul');assert.deepEqual(file.values,fixture.values);assert.deepEqual(file.controls,controls);
  assert.equal(file.request,request);assert.equal(file.response,response);assert.equal(file.row,0);assert.equal(file.column,0);assert.equal(file.action,'compute');
  return text;
}
function importedCase(report,fixture,recorded,assertObservations) {
  assert.equal(report.status,'ok','research-case-fidelity: source refused its admitted complete case');
  assert.equal(report.exchange.status,'imported');assert.equal(report.operation,'matmul');
  assert.equal(report.request,request);assert.equal(report.response,response);assert.deepEqual(report.cells,['2']);
  assert.deepEqual([report.rows,report.columns],[1,1]);assert.equal(report.comparison.status,fixture.comparison);
  assert.deepEqual(report.exchange.draft,{operation:'matmul',values:fixture.values,raw:request,controls:[...controls],row:0,column:0});
  assertObservations(report,recorded,response);
}
export function createResearchCaseFidelityCase(artifacts,binding,actions,helpers,fixture) {
  assert.deepEqual(fixture,researchCaseFidelityFixtures().find(item=>item.id===fixture.id));
  const {specs,invoke,timings}=environment(artifacts,binding,actions,helpers);
  const input={operation:'matmul',request,values:fixture.values,controls:[...controls],row:0,column:0};
  const sourceText=sourceCase(invoke(specs.export_action,input),fixture,binding.modelId);
  let importText=sourceText,recorded=response;
  if(fixture.id==='unicode-escaped-values')importText=member(sourceText,'values','request','['+fixture.values.map(unicodeString).join(',')+']');
  if(fixture.id==='unicode-escaped-recorded-observation'){
    recorded=unicodeObservation;importText=member(sourceText,'response','controls',unicodeString(recorded));
  }
  const file=JSON.parse(importText);assert.deepEqual(file.values,fixture.values);assert.equal(file.response,recorded);assert.equal(file.implementation,binding.modelId);
  assert(Buffer.byteLength(sourceText)<=specs.maximum_bytes&&Buffer.byteLength(importText)<=specs.maximum_bytes,
    'research-case-fidelity: fixture exceeds the modeled case file bound');
  if(fixture.id==='near-case-file-limit-81000-line-feeds')assert(Buffer.byteLength(sourceText)>950000,'research-case-fidelity: near-file-limit fixture did not reach the claimed byte range');
  return{fixture,input,sourceText,importText,recorded,source_timings:timings,source_bytes:Buffer.byteLength(sourceText),source_sha256:sha(sourceText),import_bytes:Buffer.byteLength(importText),import_sha256:sha(importText)};
}
export function runResearchCaseFidelityGuestCase(artifacts,binding,actions,helpers,fixture) {
  const prepared=createResearchCaseFidelityCase(artifacts,binding,actions,helpers,fixture),{specs,invoke,timings}=environment(artifacts,binding,actions,helpers);
  const imported=invoke(specs.import_action,{operation:'raw',case_text:prepared.importText});
  importedCase(imported,fixture,prepared.recorded,helpers.assertObservations);
  const draft=imported.exchange.draft,reexported=invoke(specs.export_action,{operation:draft.operation,request:draft.raw,values:draft.values,controls:draft.controls,row:draft.row,column:draft.column});
  assert.equal(sourceCase(reexported,fixture,binding.modelId),prepared.sourceText,'research-case-fidelity: unchanged restored draft lost exact source case bytes');
  return{id:fixture.id,source_bytes:prepared.source_bytes,source_sha256:prepared.source_sha256,import_bytes:prepared.import_bytes,import_sha256:prepared.import_sha256,
    canonical_request_sha256:sha(request),fresh_response_sha256:sha(response),comparison:fixture.comparison,exact_values:true,exact_canonical_reexport:true,source_guest_calls:3,source_action_timings:[...prepared.source_timings,...timings]};
}
export function runResearchCaseFidelityGuestChecks(artifacts,binding,actions,helpers) {
  return researchCaseFidelityFixtures().map(fixture=>runResearchCaseFidelityGuestCase(artifacts,binding,actions,helpers,fixture));
}
export async function runResearchCaseFidelityBrowserChecks(page,artifacts,binding,actions,helpers) {
  assert.equal(typeof helpers?.browserReply,'function');assert.equal(typeof helpers?.assertRendered,'function');
  const {view,specs}=environment(artifacts,binding,actions,helpers),operation=view.operations.find(op=>op.id==='matmul');assert(operation);
  const rows=[];
  for(const fixture of researchCaseFidelityFixtures()){
    const prepared=createResearchCaseFidelityCase(artifacts,binding,actions,helpers,fixture);
    const before=await page.evaluate(()=>window.__researchObserved.inputs.length);
    await page.locator('#case-file').setInputFiles({name:'source-'+fixture.id+'.json',mimeType:'application/json',buffer:Buffer.from(prepared.importText)});
    const selectionCalls=await page.evaluate(()=>window.__researchObserved.inputs.length)-before;
    assert.equal(selectionCalls,0,'research-case-fidelity: file selection executed the guest before explicit import');
    const importStarted=performance.now(),imported=await helpers.browserReply(page,'#case-import',specs.import_action,'matmul'),importElapsed=performance.now()-importStarted;
    assert(importElapsed<=specs.import_action.timeout_milliseconds,'research-case-fidelity: actual browser import exceeded its source deadline');
    const submitted=await page.evaluate(index=>window.__researchObserved.inputs.slice(index),before);
    assert.equal(submitted.length,1,'research-case-fidelity: explicit import invoked the guest more than once');
    const submittedText=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Uint8Array.from(submitted[0].input));
    const importPrefix=specs.import_action.request_prefix+'\u001f';assert(submittedText.startsWith(importPrefix));
    const submittedEnvelope=JSON.parse(submittedText.slice(importPrefix.length));
    assert.equal(submittedEnvelope.case_text,prepared.importText,'research-case-fidelity: actual Worker received stale textarea bytes instead of selected file');
    assert.equal(submittedEnvelope.model_id,binding.modelId);assert(Buffer.byteLength(submittedText)<=artifacts.application.request_maximum);
    importedCase(imported,fixture,prepared.recorded,helpers.assertObservations);await helpers.assertRendered(page,imported,view);
    for(const[index,field]of operation.fields.entries())assert.equal(await page.locator('#field-'+field.id).inputValue(),fixture.values[index],
      'research-case-fidelity: actual file import truncated or normalized an LF operand');
    assert.equal(await page.locator('#result').textContent(),response);assert.deepEqual(await page.locator('#result-table tbody td').allTextContents(),['2']);
    const exportStarted=performance.now(),exported=await helpers.browserReply(page,'#case-export',specs.export_action,'matmul'),exportElapsed=performance.now()-exportStarted;
    assert(exportElapsed<=specs.export_action.timeout_milliseconds,'research-case-fidelity: actual browser export exceeded its source deadline');
    assert.equal(sourceCase(exported,fixture,binding.modelId),prepared.sourceText,'research-case-fidelity: actual file import then unchanged export lost source bytes');
    const observedCalls=await page.evaluate(index=>window.__researchObserved.inputs.slice(index),before);
    assert.equal(observedCalls.length,2,'research-case-fidelity: file import/export performed hidden or omitted guest work');
    const exportText=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Uint8Array.from(observedCalls[1].input));
    assert(exportText.startsWith(specs.export_action.request_prefix+'\u001f'));
    rows.push({id:fixture.id,source_sha256:prepared.source_sha256,import_sha256:prepared.import_sha256,source_bytes:prepared.source_bytes,import_bytes:prepared.import_bytes,
      actual_file_read:true,submitted_file_sha256:sha(submittedEnvelope.case_text),source_restored_values:true,exact_canonical_reexport:true,fresh_response_sha256:sha(response),comparison:fixture.comparison,file_selection_guest_calls:selectionCalls,import_guest_calls:submitted.length,browser_guest_calls:observedCalls.length,source_action_timings:prepared.source_timings,browser_action_milliseconds:{import:importElapsed,export:exportElapsed}});
  }
  return rows;
}
