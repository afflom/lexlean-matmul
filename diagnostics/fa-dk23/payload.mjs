// Diagnostic only; neither lane is an installed-qualification or release path.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,lstatSync,fstatSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const SOURCE='fa204056c9aa0be01129690ad6acd7d0d2e29138';
const ROOT='/opt/prismpm/share/conformance-root';
const FILES=['tests/browser-presentation/wire.test.mjs','tests/browser-presentation/dom.test.mjs',
 'tests/browser-presentation/replay.test.mjs','tests/browser-presentation/provenance.test.mjs',
 'sdk/browser/presentation.test.mjs'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const mode=process.argv[1];
assert(['isolated','full'].includes(mode));assert.equal(process.argv.length,2);
// runSuites does not await emit. Blocking writes preserve its complete emitted
// strings before the next synchronous owner can run or a failed owner can throw.
assert(fstatSync(1).isFIFO(),'actual stdout pipe required');
assert.equal(typeof process.stdout._handle?.setBlocking,'function');
process.stdout._handle.setBlocking(true);
function frame(name,body){
 const b=Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body));
 writeFileSync(1,Buffer.from('PRISMPM-DK23-DIAGNOSTIC/1 '+name+' '+b.length+'\n'));
 writeFileSync(1,b);writeFileSync(1,Buffer.from('\n'));
}
let exit=90,api,before,primary;
try{
 assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.equal(process.getuid(),1000);
 assert.equal(process.getgid(),1000);assert.equal(process.version,'v22.23.2');assert.equal(process.cwd(),ROOT);
 assert.equal(process.env.PRISMPM_EPHEMERAL_HOME,'1');assert.equal(process.env.CARGO_NET_OFFLINE,'true');
 assert.equal(process.env.HOME,'/home/vscode');assert.equal(process.env.CARGO_HOME,'/tmp/prismpm-cargo-1000');
 assert(lstatSync(join(process.env.CARGO_HOME,'.seeded')).isFile(),'original entrypoint seeded private cache');
 api=await import(join(ROOT,'scripts/browser-api-sdk-check.mjs'));
 const suite=api.suites.find(x=>x.id==='DK-23');
 assert.deepEqual(suite,{id:'DK-23',minimum:39,files:FILES,deadline:3600000});
 before=api.capture(ROOT,SOURCE);frame('source-before.json',before);
 const identity={schema:'prismpm/browser-owner-diagnostic/1',mode,source:SOURCE,scope:'diagnostic-only-no-qualification',
  program:process.execPath,program_sha256:hash(readFileSync(process.execPath)),cwd:ROOT,
  environment:{HOME:process.env.HOME,CARGO_HOME:process.env.CARGO_HOME,CARGO_NET_OFFLINE:process.env.CARGO_NET_OFFLINE,
   PRISMPM_EPHEMERAL_HOME:process.env.PRISMPM_EPHEMERAL_HOME},effective_uid:process.getuid(),effective_gid:process.getgid(),
  groups:process.getgroups(),node:process.version,limits:readFileSync('/proc/self/limits','utf8'),
  mountinfo:readFileSync('/proc/self/mountinfo','utf8'),
  source_module_sha256:hash(readFileSync(join(ROOT,'scripts/browser-api-sdk-check.mjs')))};
 if(mode==='isolated'){
  for(const f of FILES){let p=ROOT;for(const part of f.split('/')){p=join(p,part);assert(!lstatSync(p).isSymbolicLink());}assert(lstatSync(p).isFile());}
  const reporter='data:text/javascript;base64,'+readFileSync(join(ROOT,'scripts/owning-node-reporter.mjs')).toString('base64');
  const args=['--test','--test-concurrency=1','--test-reporter='+reporter,'--test-timeout='+suite.deadline,...suite.files];
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  frame('invocation.json',{...identity,args,timeout:3700000,maxBuffer:64*1024*1024,
   encoding:'raw-buffer-capture-only',prior_owners_executed:false,NODE_TEST_CONTEXT_removed:!Object.hasOwn(env,'NODE_TEST_CONTEXT')});
  const start=performance.now();
  const result=spawnSync(process.execPath,args,{cwd:ROOT,timeout:3700000,maxBuffer:64*1024*1024,env});
  const stdout=result.stdout??Buffer.alloc(0),stderr=result.stderr??Buffer.alloc(0);
  frame('owning.stdout',stdout);frame('owning.stderr',stderr);
  frame('owning-status.json',{status:result.status,signal:result.signal,pid:result.pid,elapsed_ms:performance.now()-start,
   error:result.error?{name:result.error.name,message:result.error.message,code:result.error.code??null,errno:result.error.errno??null}:null,
   stdout:{size:stdout.length,sha256:hash(stdout)},stderr:{size:stderr.length,sha256:hash(stderr)}});
  if(Number.isInteger(result.status)&&result.status>0)exit=result.status;
  assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,0,'complete original DK-23 diagnostic child');
  const tap=stdout.toString('utf8'),tests=api.verifyTap(tap,suite.minimum);
  api.verifyFileCompletions(tap,suite.files.map(f=>join(ROOT,f)),tests);
  frame('diagnostic-result.json',{scope:'isolated-complete-DK23-diagnostic-only',tests,
   original_full_qualification:false,prior_owner_cumulative_state_reproduced:false});
 }else{
  const executions=[...api.suites,...api.fallbackSuites,...api.standaloneSuites];assert.equal(executions.length,34);
  frame('invocation.json',{...identity,entry:'unchanged runSuites(ROOT,undefined,blockingEmit)',executions,
   decoding:'unchanged source UTF-8 strings; full emitted concatenation retained, not separate raw child streams',
   prior_owners_executed:true,whole_outer_timeout_ms:21420000,outer_capture_bytes:64*1024*1024});
  let count=0;
  const completed=await api.runSuites(ROOT,undefined,text=>{
   assert.equal(typeof text,'string');frame('suite-'+String(++count).padStart(2,'0')+'.txt',Buffer.from(text,'utf8'));
  });
  assert.equal(count,34);assert.equal(completed.length,34);
  frame('diagnostic-result.json',{scope:'complete-original-browser-collection-diagnostic-only',completed,
   original_full_qualification:false,all_34_original_executions_completed:true});
 }
 exit=0;
}catch(error){
 primary={name:error.name,message:error.message,stack:error.stack,code:error.code??null,
  actual:error.actual??null,expected:error.expected??null};
 frame('diagnostic-failure.json',{scope:'diagnostic-only-no-qualification',...primary});
}finally{
 if(api&&before)try{const after=api.capture(ROOT,SOURCE);frame('source-after.json',after);assert.deepEqual(after,before);}
 catch(error){exit=90;frame('source-postcondition-failure.json',{name:error.name,message:error.message});}
 frame('controller-status.json',{status:exit,primary_failure:primary,scope:'diagnostic-only-no-qualification'});
}
process.exitCode=exit;
