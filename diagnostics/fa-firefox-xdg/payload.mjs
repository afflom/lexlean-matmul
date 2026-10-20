// Complete unchanged DOM component owner only; diagnostic, never qualification.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,lstatSync,fstatSync,writeFileSync,mkdtempSync,mkdirSync,realpathSync,rmSync,statfsSync} from 'node:fs';
import {join} from 'node:path';
const SOURCE='fa204056c9aa0be01129690ad6acd7d0d2e29138';
const ROOT='/opt/prismpm/share/conformance-root';
const FILE='tests/browser-presentation/dom.test.mjs';
const ORIGINAL_TESTS=5;
const hash=b=>createHash('sha256').update(b).digest('hex');
const factor=process.argv[1];assert(['baseline','private-xdg'].includes(factor));assert.equal(process.argv.length,2);
assert(fstatSync(1).isFIFO(),'actual stdout pipe required');
assert.equal(typeof process.stdout._handle?.setBlocking,'function');process.stdout._handle.setBlocking(true);
function frame(name,body){const b=Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body));
 writeFileSync(1,Buffer.from('PRISMPM-FIREFOX-XDG-DIAGNOSTIC/1 '+name+' '+b.length+'\n'));writeFileSync(1,b);writeFileSync(1,Buffer.from('\n'));}
function metadata(path){try{const s=lstatSync(path);return{path,regular:s.isFile(),directory:s.isDirectory(),symlink:s.isSymbolicLink(),mode:s.mode,uid:s.uid,gid:s.gid,dev:s.dev,ino:s.ino,size:s.size,realpath:realpathSync(path)};}catch(error){return{path,error:{code:error.code,message:error.message}};}}
const XDG=['XDG_CACHE_HOME','XDG_CONFIG_HOME','XDG_RUNTIME_DIR'];
const environment=env=>Object.fromEntries(['HOME','CARGO_HOME','CARGO_NET_OFFLINE','PRISMPM_EPHEMERAL_HOME','TMPDIR',...XDG].map(key=>[key,env[key]??null]));
const paths=()=>['/home/vscode','/home/vscode/.cache','/home/vscode/.cache/dconf','/tmp','/dev/shm'].map(metadata);
function filesystem(path){const s=statfsSync(path,{bigint:true});return{path,type:String(s.type),bsize:String(s.bsize),blocks:String(s.blocks),bfree:String(s.bfree),bavail:String(s.bavail)};}
let exit=90,api,before,primary,privateRoot,privateIdentity,privateRetired=false;
try{
 assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.equal(process.getuid(),1000);assert.equal(process.getgid(),1000);
 assert.equal(process.version,'v22.23.2');assert.equal(process.cwd(),ROOT);
 assert.equal(process.env.PRISMPM_EPHEMERAL_HOME,'1');assert.equal(process.env.CARGO_NET_OFFLINE,'true');
 assert.equal(process.env.HOME,'/home/vscode');assert.equal(process.env.CARGO_HOME,'/tmp/prismpm-cargo-1000');
 assert(lstatSync(join(process.env.CARGO_HOME,'.seeded')).isFile(),'original entrypoint seeded private cache');
 assert.equal(process.env.TMPDIR,undefined,'unchanged original temporary directory selection');
 for(const key of XDG)assert.equal(process.env[key],undefined,'original image has no XDG setting');
 api=await import(join(ROOT,'scripts/browser-api-sdk-check.mjs'));
 const suite=api.suites.find(x=>x.id==='DK-23');assert(suite.files.includes(FILE));assert.equal(suite.deadline,3600000);
 before=api.capture(ROOT,SOURCE);frame('source-before.json',before);
 const originalBody=readFileSync(join(ROOT,FILE)),factory=readFileSync(join(ROOT,'sdk/browser/browser-test-server.mjs'));
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 const prior={environment:environment(env),paths:paths(),filesystems:['/tmp','/dev/shm'].map(filesystem)};
 let owned=[];
 if(factor==='private-xdg'){
  privateRoot=mkdtempSync('/tmp/prismpm-firefox-xdg-');assert.equal(realpathSync(privateRoot),privateRoot);privateIdentity=lstatSync(privateRoot);
  assert(privateIdentity.isDirectory()&&!privateIdentity.isSymbolicLink());assert.equal(privateIdentity.uid,1000);assert.equal(privateIdentity.gid,1000);assert.equal(privateIdentity.mode&0o777,0o700);
  for(const [key,name]of [['XDG_CACHE_HOME','cache'],['XDG_CONFIG_HOME','config'],['XDG_RUNTIME_DIR','runtime']]){
   const path=join(privateRoot,name);mkdirSync(path,{mode:0o700});const s=lstatSync(path);
   assert(s.isDirectory()&&!s.isSymbolicLink());assert.equal(s.uid,1000);assert.equal(s.gid,1000);assert.equal(s.mode&0o777,0o700);assert.equal(realpathSync(path),path);
   const check=join(path,'owned-write-probe');writeFileSync(check,Buffer.from('owned-xdg\n'),{flag:'wx',mode:0o600});assert.equal(readFileSync(check,'utf8'),'owned-xdg\n');rmSync(check);
   env[key]=path;owned.push(metadata(path));
  }
 }
 const reporter='data:text/javascript;base64,'+readFileSync(join(ROOT,'scripts/owning-node-reporter.mjs')).toString('base64');
 const args=['--test','--test-concurrency=1','--test-reporter='+reporter,'--test-timeout='+suite.deadline,FILE];
 frame('invocation.json',{schema:'prismpm/firefox-xdg-dom-component-diagnostic/1',scope:'complete-original-DOM-component-diagnostic-only-no-qualification',factor,source:SOURCE,
  program:process.execPath,program_sha256:hash(readFileSync(process.execPath)),args,cwd:ROOT,environment:environment(env),
  effective_uid:process.getuid(),effective_gid:process.getgid(),groups:process.getgroups(),node:process.version,
  timeout:3700000,maxBuffer:64*1024*1024,encoding:'raw-buffer-capture-only',original_tests:ORIGINAL_TESTS,
  selected_file:{path:FILE,bytes:originalBody.length,sha256:hash(originalBody)},factory:{path:'sdk/browser/browser-test-server.mjs',bytes:factory.length,sha256:hash(factory)},
  NODE_TEST_CONTEXT_removed:!Object.hasOwn(env,'NODE_TEST_CONTEXT'),private_xdg_root:privateRoot??null,private_directories:owned,baseline:prior,
  limits:readFileSync('/proc/self/limits','utf8'),mountinfo:readFileSync('/proc/self/mountinfo','utf8'),
  source_module_sha256:hash(readFileSync(join(ROOT,'scripts/browser-api-sdk-check.mjs'))),browser_flags_changed:false,HOME_changed:false,TMPDIR_changed:false});
 const start=performance.now();const result=spawnSync(process.execPath,args,{cwd:ROOT,timeout:3700000,maxBuffer:64*1024*1024,env});
 const stdout=result.stdout??Buffer.alloc(0),stderr=result.stderr??Buffer.alloc(0);
 frame('owning.stdout',stdout);frame('owning.stderr',stderr);
 frame('owning-status.json',{status:result.status,signal:result.signal,pid:result.pid,elapsed_ms:performance.now()-start,error:result.error?{name:result.error.name,message:result.error.message,code:result.error.code??null,errno:result.error.errno??null}:null,
  stdout:{size:stdout.length,sha256:hash(stdout)},stderr:{size:stderr.length,sha256:hash(stderr)}});
 frame('runtime-after.json',{environment:environment(env),paths:paths(),private_directories:owned.map(row=>metadata(row.path)),filesystems:['/tmp','/dev/shm'].map(filesystem)});
 if(Number.isInteger(result.status)&&result.status>0)exit=result.status;
 assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,0,'complete original DOM component diagnostic child');
 const tap=stdout.toString('utf8'),tests=api.verifyTap(tap,ORIGINAL_TESTS);assert.equal(tests,ORIGINAL_TESTS,'all five original DOM tests');
 api.verifyFileCompletions(tap,[join(ROOT,FILE)],tests,[ORIGINAL_TESTS]);
 frame('diagnostic-result.json',{scope:'complete-original-DOM-component-diagnostic-only-no-qualification',factor,tests,full_five_file_DK23:false,original_full_qualification:false,source_fixed:false});exit=0;
}catch(error){primary={name:error.name,message:error.message,stack:error.stack,code:error.code??null,actual:error.actual??null,expected:error.expected??null};frame('diagnostic-failure.json',{scope:'diagnostic-only-no-qualification',...primary});}
finally{
 if(api&&before)try{const after=api.capture(ROOT,SOURCE);frame('source-after.json',after);assert.deepEqual(after,before);}catch(error){exit=90;frame('source-postcondition-failure.json',{name:error.name,message:error.message});}
 if(privateRoot)try{const s=lstatSync(privateRoot);assert(s.isDirectory()&&!s.isSymbolicLink());assert.equal(s.dev,privateIdentity.dev);assert.equal(s.ino,privateIdentity.ino);assert.equal(s.uid,1000);assert.equal(realpathSync(privateRoot),privateRoot);assert(privateRoot.startsWith('/tmp/prismpm-firefox-xdg-'));rmSync(privateRoot,{recursive:true});assert.throws(()=>lstatSync(privateRoot),error=>error.code==='ENOENT');privateRetired=true;}catch(error){exit=90;frame('private-directory-cleanup-failure.json',{name:error.name,message:error.message});}
 frame('private-directory-cleanup.json',{factor,private_root:privateRoot??null,normal_owned_remove:privateRoot?privateRetired:null});
 frame('controller-status.json',{status:exit,primary_failure:primary,scope:'diagnostic-only-no-qualification'});
}
process.exitCode=exit;
