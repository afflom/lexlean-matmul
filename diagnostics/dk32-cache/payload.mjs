// Diagnostic observation only. Original DK32 files, reporter and bounds are unchanged.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fstatSync,lstatSync,readFileSync,readdirSync,statfsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const ROOT='/opt/prismpm/share/conformance-root',SOURCE='6048db073d8b1bdf026685dfbc42016fb5a00f67';
const BASE='f114e224150e28de0c7be38820d79c2dbf2f1984988d21a2321d106c6179adad';
const CANDIDATE='55281e3479ac42e8dab067b4e8da06ada254416368e50f8ee6d95805a9021903';
const REL='tests/browser-signed-context/compile.mjs';
const FILES=['tests/browser-signed-context/corpus.test.mjs','tests/browser-signed-context/bridge.test.mjs',
 'tests/browser-signed-context/wpt.test.mjs','tests/browser-signed-context/aggregate.test.mjs','sdk/browser/signed-context-test.mjs'];
const mode=process.argv[1];assert(['baseline','candidate'].includes(mode)&&process.argv.length===2);
const sha=b=>createHash('sha256').update(b).digest('hex');
assert(fstatSync(1).isFIFO());assert.equal(typeof process.stdout._handle?.setBlocking,'function');process.stdout._handle.setBlocking(true);
let frameBytes=0;
function frame(name,value){
 const b=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));
 assert(/^[A-Za-z0-9_.-]+$/.test(name)&&b.length<=64*1024**2);frameBytes+=b.length;assert(frameBytes<=150*1024**2,'bounded diagnostic frames');
 writeFileSync(1,`PRISMPM-DK32-DIAGNOSTIC/1 ${name} ${b.length}\n`);writeFileSync(1,b);writeFileSync(1,'\n');
}
function treeBytes(root){
 let logical=0,allocated=0,files=0,directories=0,links=0,sockets=0,fifos=0,devices=0,other=0,races=0;const seen=new Set();
 function walk(p){let s;try{s=lstatSync(p);}catch(e){if(e.code==='ENOENT'){races++;return;}throw e;}
  const id=s.dev+':'+s.ino;if(!seen.has(id)){seen.add(id);allocated+=s.blocks*512;logical+=s.size;}
  if(s.isSymbolicLink()){links++;return;}if(s.isDirectory()){directories++;let names;try{names=readdirSync(p);}catch(e){if(e.code==='ENOENT'){races++;return;}throw e;}for(const n of names)walk(join(p,n));}
  else if(s.isFile())files++;else if(s.isSocket())sockets++;else if(s.isFIFO())fifos++;else if(s.isCharacterDevice()||s.isBlockDevice())devices++;else other++;
 }
 try{walk(root);}catch(e){if(e.code==='ENOENT')races++;else throw e;}
 return {logical_bytes:logical,allocated_bytes:allocated,regular_files:files,directories,symlinks:links,sockets,fifos,devices,other_nodes:other,raced_paths:races};
}
function capacity(){const s=statfsSync('/tmp');return {block_bytes:s.bsize,total_bytes:s.blocks*s.bsize,free_bytes:s.bfree*s.bsize,available_bytes:s.bavail*s.bsize,used_bytes:(s.blocks-s.bfree)*s.bsize,total_inodes:s.files,free_inodes:s.ffree,used_inodes:s.files-s.ffree};}
function modelRoots(){return readdirSync('/tmp').filter(n=>/^prismpm-signed-context-[A-Za-z0-9_-]+$/.test(n)).sort().map(n=>join('/tmp',n));}
function cache(root){const p=join(root,'lean/.lake/build');let s;try{s=lstatSync(p);}catch(e){if(e.code==='ENOENT')return {path:p,exists:false,logical_bytes:0,allocated_bytes:0};throw e;}
 assert(s.isDirectory()&&!s.isSymbolicLink());return {path:p,exists:true,...treeBytes(p)};
}
let samples=0,minAvailable=null,samplerError=null,timer=null,api,before,originalStatus=null,primary=null,code=1;
function sample(final=false){assert(samples<390,'sample count bound');const cap=capacity();minAvailable=minAvailable===null?cap.available_bytes:Math.min(minAvailable,cap.available_bytes);
 const roots=modelRoots();assert(roots.length<=64);const v={sample:++samples,at:new Date().toISOString(),capacity:cap,models:roots.map(work=>({work,cache:cache(work)})),sampled_not_continuous_peak:true};
 if(final)v.final_named_tmp_allocation=treeBytes('/tmp');frame('sample-'+String(samples).padStart(3,'0')+'.json',v);return v;
}
function identities(roots){return roots.map(work=>{
 let report,kind,name;for(const [k,n]of [['baseline','signed-context-component.json'],['mutation','signed-context-mutation.json']]){
  try{const p=join(work,n),s=lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.size<=4*1024**2);const b=readFileSync(p);report=JSON.parse(b);kind=k;name={path:p,bytes:b.length,sha256:sha(b)};break;}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 return {work,kind:kind??'incomplete',report:name??null,source:report?.source??null,attestation:report?.attestation??null,ir:report?.ir??null,mutation:report?.mutation??null,cache:cache(work),named_retained_bytes:treeBytes(work)};
});}
try{
 assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.equal(process.getuid(),1000);assert.equal(process.getgid(),1000);assert.equal(process.version,'v22.23.2');assert.equal(process.cwd(),ROOT);
 assert.equal(process.env.PRISMPM_EPHEMERAL_HOME,'1');assert.equal(process.env.CARGO_NET_OFFLINE,'true');assert.equal(process.env.HOME,'/home/vscode');assert.equal(process.env.CARGO_HOME,'/tmp/prismpm-cargo-1000');assert(lstatSync(join(process.env.CARGO_HOME,'.seeded')).isFile());
 assert.equal(sha(readFileSync(join(ROOT,REL))),mode==='baseline'?BASE:CANDIDATE);
 api=await import(join(ROOT,'scripts/browser-api-sdk-check.mjs'));const suite=api.suites.find(x=>x.id==='DK-32');assert.deepEqual(suite,{id:'DK-32',minimum:21,files:FILES,deadline:3600000});
 const owner=await import(join(ROOT,'scripts/sdk-command-owner.mjs'));
 before=api.capture(ROOT,SOURCE);frame('source-before.json',{base_revision:SOURCE,mode,overlay:mode==='candidate'?{path:REL,base_sha256:BASE,candidate_sha256:CANDIDATE}:null,actual_inventory:before});
 const reporter='data:text/javascript;base64,'+readFileSync(join(ROOT,'scripts/owning-node-reporter.mjs')).toString('base64');
 const args=['--test','--test-concurrency=1','--test-reporter='+reporter,'--test-timeout='+suite.deadline,...suite.files];const env={...process.env};delete env.NODE_TEST_CONTEXT;
 frame('invocation.json',{scope:'source-overlay-diagnostic-only-not-installed-qualification',mode,base_revision:SOURCE,program:process.execPath,program_sha256:sha(readFileSync(process.execPath)),args,cwd:ROOT,uid:process.getuid(),gid:process.getgid(),groups:process.getgroups(),environment:{HOME:process.env.HOME,CARGO_HOME:process.env.CARGO_HOME,CARGO_NET_OFFLINE:process.env.CARGO_NET_OFFLINE,PRISMPM_EPHEMERAL_HOME:process.env.PRISMPM_EPHEMERAL_HOME},limits:readFileSync('/proc/self/limits','utf8'),mountinfo:readFileSync('/proc/self/mountinfo','utf8'),original_suite_deadline_ms:suite.deadline,outer_child_capture_ms:3700000,per_stream_bytes:64*1024**2,prior_suites_executed:false});
 sample();timer=setInterval(()=>{if(samplerError)return;try{sample();}catch(e){samplerError={name:e.name,message:e.message};}},10000);
 let result,ownerError;try{result=await owner.executeOwnedSdkCommand(process.execPath,args,{profile:'qualification',environment:env,cwd:ROOT,timeout:3700000,limit:64*1024**2,aggregate:false,interruptions:true});}catch(e){result=e.result;ownerError={name:e.name,message:e.message};}
 if(timer){clearInterval(timer);timer=null;}
 assert(result,'source command owner returned no captured result');const{stdout,stderr,...status}=result;frame('owning.stdout',stdout);frame('owning.stderr',stderr);originalStatus={...status,owner_error:ownerError??null,stdout:{bytes:stdout.length,sha256:sha(stdout)},stderr:{bytes:stderr.length,sha256:sha(stderr)}};frame('owning-status.json',originalStatus);
 const final=sample(true),models=identities(modelRoots());frame('model-identities-and-final-caches.json',{models,model_count:models.length,final_capacity:final.capacity,final_named_tmp_allocation:final.final_named_tmp_allocation,sampled_min_available_bytes:minAvailable,sampled_peak_used_bytes:final.capacity.total_bytes-minAvailable,sampling_interval_ms:10000,sampler_error:samplerError,scope:'Sampled cache evolution can miss an instant build/clean. Final existence/statfs/named allocation are actual post-owner observations; named allocation excludes anonymous open-file/filesystem metadata.'});
 if(ownerError)throw Error('original command owner capture refused: '+ownerError.message);
 assert.equal(result.signal,null);assert.equal(result.status,0,'complete original DK32 owner');for(const k of ['timedOut','overflow','aborted','orphaned'])assert.equal(result[k],false);assert(result.retirement.descendants_absent&&result.retirement.uncertainty===null);
 const tap=stdout.toString('utf8'),tests=api.verifyTap(tap,suite.minimum);api.verifyFileCompletions(tap,FILES.map(f=>join(ROOT,f)),tests);
 const mutations=(await import(join(ROOT,'tests/browser-signed-context/mutations.mjs'))).mutations;assert.equal(mutations.length,24);assert.equal(models.length,25,'baseline plus every actual compiled mutant');assert.equal(models.filter(x=>x.kind==='baseline').length,1);
 assert.deepEqual(models.filter(x=>x.kind==='mutation').map(x=>x.mutation.id).sort(),mutations.map(x=>x.id).sort());assert(models.every(x=>x.source&&x.attestation&&x.ir));
 if(mode==='candidate')assert(models.every(x=>!x.cache.exists),'candidate leaves a completed model Lake build');assert.equal(samplerError,null);
 frame('diagnostic-result.json',{scope:'complete-DK32-source-overlay-diagnostic-only',mode,tests,models:models.length,compiled_mutants:mutations.length,original_full_qualification:false,prior_suite_cumulative_state_reproduced:false,baseline_failure_not_required:true,original_owner_status:result.status});code=0;
}catch(e){primary={name:e.name,message:e.message,stack:e.stack};frame('diagnostic-failure.json',primary);}
finally{
 if(timer)clearInterval(timer);
 if(api&&before)try{const after=api.capture(ROOT,SOURCE);frame('source-after.json',{base_revision:SOURCE,mode,actual_inventory:after});assert.deepEqual(after,before);}catch(e){code=1;frame('source-postcondition-failure.json',{name:e.name,message:e.message});}
 frame('controller-status.json',{scope:'diagnostic-only-not-qualification',mode,status:code,original_owner_status:originalStatus?.status??null,primary_failure:primary,sampler_error:samplerError});
}
process.exitCode=code;
