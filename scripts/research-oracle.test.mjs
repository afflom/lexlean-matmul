import assert from 'node:assert/strict';
import test from 'node:test';
import { capturedBrowserRequest, browserScriptIdentity } from './browser-oracle.mjs';
import { researchEnvelope, researchFrame, parseResearchReply, assertCaseObservations } from './research-oracle.mjs';

const identity='12'.repeat(32), action={id:'trace',request_prefix:'research-trace-v1'};
const table=(saved,current)=>({tables:[{id:'case-observations',title:'Exact local case observations',
  columns:['Observation','Part','Exact JSON string chunk'],rows:[...chunks(saved).map((value,i)=>['Saved observation',String(i),quote(value)]),
    ...chunks(current).map((value,i)=>['Fresh execution',String(i),quote(value)])]}]});
function quote(value){return JSON.stringify(value).replace(/[\u007f-\u009f]/gu,character=>'\\u'+character.codePointAt(0).toString(16).padStart(4,'0'));}
function chunks(value){const result=[];let current='';for(const character of value){if(Buffer.byteLength(current+character)>1024){result.push(current);current='';}current+=character;}result.push(current);return result;}
const mutate=(value,change)=>{const changed=structuredClone(value);change(changed);return changed;};
test('V4 framing preserves exact opaque bytes with closed key order and actual identity',()=>{
  const input=researchEnvelope({model_id:identity,request:'1\tmatmul\t1\t1\t1\t9\t7',row:1,column:2,controls:['auto']});
  const framed=researchFrame(action,input),[prefix,payload]=framed.split('\u001f');
  assert.equal(prefix,action.request_prefix);assert.deepEqual(JSON.parse(payload),input);
  assert.deepEqual(Object.keys(input),['version','operation','request','values','row','column','controls','model_id','case_text']);
  assert.equal(input.request,'1\tmatmul\t1\t1\t1\t9\t7');assert.equal(input.model_id,identity);
});
test('case observations independently reconstruct control-rich UTF8 and empty responses',()=>{
  const saved='x'.repeat(1023)+'😀'+Array.from({length:160},(_,i)=>String.fromCodePoint(i)).join('')+'漢字🧮';
  const current='1\tok\t1\t1\t63';assertCaseObservations(table(saved,current),saved,current);
  assertCaseObservations(table('',current),'',current);
});
test('case observation oracle rejects truncation, duplicate parts and swapped category despite correct fresh output',()=>{
  const saved='x'.repeat(2400)+'😀',current='1\tok\t1\t1\t63',report=table(saved,current);
  assert.throws(()=>assertCaseObservations(mutate(report,r=>r.tables[0].rows.shift()),saved,current),/research-case-chunks/);
  assert.throws(()=>assertCaseObservations(mutate(report,r=>r.tables[0].rows[1][1]='0'),saved,current),/research-case-chunks/);
  assert.throws(()=>assertCaseObservations(mutate(report,r=>r.tables[0].rows[0][0]='Fresh execution'),saved,current),/research-case-chunks/);
  assert.throws(()=>assertCaseObservations(mutate(report,r=>r.tables[0].rows[0][2]='"wrong recorded data"'),saved,current),/research-case-chunks/);
});
test('case observations reject unsafe display controls and invented non-string chunks',()=>{
  const report=table('saved','fresh');
  assert.throws(()=>assertCaseObservations(mutate(report,r=>r.tables[0].rows[0][2]='"raw\u0085control"'),'saved','fresh'),/research-case-display/);
  assert.throws(()=>assertCaseObservations(mutate(report,r=>r.tables[0].rows[0][2]='[]'),'saved','fresh'),/research-case-chunks/);
});
const reply=()=>({version:2,status:'error',operation:'raw',message:'Invalid research input.',rows:0,columns:0,cells:[],details:[],request:'',response:'',error:'research-invalid-selection',
  action:'trace',selection:{row:0,column:0},tables:[],panels:[],comparison:{status:'none',message:''},exchange:{status:'none',file_name:'',file_text:'',draft:null}});
test('V4 error reply uses exact String code and rejects old object-shaped or uncorrelated reports',()=>{
  const valid=reply();assert.deepEqual(parseResearchReply(JSON.stringify(valid),action,{operation:'raw'}),valid);
  assert.throws(()=>parseResearchReply(JSON.stringify({...valid,error:{code:valid.error}}),action,{operation:'raw'}),/string/);
  assert.throws(()=>parseResearchReply(JSON.stringify({...valid,action:'compare'}),action,{operation:'raw'}),/research-correlation/);
  assert.throws(()=>parseResearchReply(JSON.stringify({...valid,operation:'matmul'}),action,{operation:'raw'}),/research-correlation/);
  assert.throws(()=>parseResearchReply(JSON.stringify({...valid,unexpected:true}),action,{operation:'raw'}),/research-shape/);
});

test('browser requests admit only exact public model identity keys on captured scripts',()=>{
  const origin='https://example.test',base='/lexlean-matmul/',modelId='ab'.repeat(32),javascript='lexlean_matmul.js';
  const assets=['index.html','app.js','app.css',javascript,'lexlean_matmul_bg.wasm','provenance.json'];
  const artifact={modelId,javascript,application:{profile:'prismpm/text-application/4',view:{runtime_binding:{model_identity:'current_model'}}}};
  const captured=browserScriptIdentity(artifact);
  assert.deepEqual(captured,{modelId,javascript});
  assert.equal(browserScriptIdentity({...artifact,application:{profile:'prismpm/text-application/3'}}),null);
  assert.throws(()=>browserScriptIdentity({...artifact,modelId:'bad'}));
  assert.throws(()=>browserScriptIdentity({...artifact,application:{...artifact.application,view:{runtime_binding:{model_identity:'unbound'}}}}));
  const permitted=address=>capturedBrowserRequest(address,origin,base,assets,captured);
  for(const asset of assets)assert.equal(permitted(origin+base+asset),true);
  assert.equal(permitted(origin+base),true);
  for(const asset of ['app.js',javascript,'app.css']){
    const address=origin+base+asset+'?model_id='+modelId;
    assert.equal(permitted(address),true,'browser-model-cache: the exact captured script identity must be admitted');
    assert.equal(capturedBrowserRequest(address,origin,base,assets),false,'legacy profiles must retain query-free asset admission');
  }
  for(const address of [
    origin+base+'app.css?model_id='+'cd'.repeat(32),
    origin+base+'lexlean_matmul_bg.wasm?model_id='+modelId,
    origin+base+'provenance.json?model_id='+modelId,
    origin+base+'index.html?model_id='+modelId,
    origin+base+'?model_id='+modelId,
    origin+base+'app.js?model_id='+'cd'.repeat(32),
    origin+base+'app.js?model_id='+modelId.toUpperCase(),
    origin+base+'app.js?model_id='+modelId+'&operand=secret',
    origin+base+'app.js?model_id='+modelId+'&model_id='+modelId,
    origin+base+'app.js?model_id=%61'+modelId.slice(1),
    origin+base+'app.js?operand=secret',origin+base+'app.js?model_id='+modelId+'#secret',
    origin+base+'app.js#secret',origin+base+'unknown.js?model_id='+modelId,
    'https://other.test'+base+'app.js?model_id='+modelId,
    'https://user:secret@example.test'+base+'app.js?model_id='+modelId,
    origin+base+'%61pp.js?model_id='+modelId,
    origin+'/other/app.js?model_id='+modelId,
    'data:text/javascript,secret','blob:'+origin+'/secret',
  ])assert.equal(permitted(address),false,'browser-model-cache: undeclared or operand-bearing request was admitted: '+address);
  assert.equal(capturedBrowserRequest(origin+base+'app.js?model_id='+modelId,origin,base,assets,
    {modelId:'invalid',javascript}),false);
});
