// Held host orchestration. Root must publish/review before --execute is used.
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,readdirSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const SOURCE='fa204056c9aa0be01129690ad6acd7d0d2e29138';
const TREE='e2307fa0d29dc9adc786cb8ed04d7f107c9ae38e';
const CONSUMER='8dfb7cfb3a9a32c20526498450fc020bfc2b6f03';
const CONSUMER_TREE='94542e345377c1e7a94f850cd18511bcdbd5e68f';
const IMAGE='ghcr.io/afflom/lexlean-matmul-sdk@sha256:47d8c7b5d937c4baf9f963e806bf39b23c20d61914815b69164751988c64d0bb';
const LOCK_SHA='0555bd997cd6e12efd204dd9808cbf37b8d69ba314689eccd0f01400f00d03d9';
const hash=b=>createHash('sha256').update(b).digest('hex');
const args=process.argv.slice(2);assert.equal(args.shift(),'--execute','explicit root activation required');
assert.equal(args.length,8);const option={};
while(args.length){const k=args.shift();assert(['--source','--consumer','--output','--factor'].includes(k)&&!Object.hasOwn(option,k));option[k]=args.shift();}
const source=resolve(option['--source']),consumer=resolve(option['--consumer']),out=resolve(option['--output']),factor=option['--factor'];
assert(factor==='private-xdg');assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.equal(process.version,'v22.23.2');
assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REPOSITORY,'afflom/lexlean-matmul');
assert.match(process.env.GITHUB_SHA??'',/^[0-9a-f]{40}$/);assert.match(process.env.GITHUB_RUN_ID??'',/^[1-9][0-9]*$/);
assert.match(process.env.GITHUB_RUN_ATTEMPT??'',/^[1-9][0-9]*$/);
const here=dirname(fileURLToPath(import.meta.url)),helper=resolve(here,'../..');
for(const root of[source,consumer,helper]){assert(!lstatSync(root).isSymbolicLink());assert(lstatSync(root).isDirectory());assert(!out.startsWith(root+'/'));}
mkdirSync(out,{mode:0o700});mkdirSync(join(out,'commands'),{mode:0o700});
const save=(name,bytes)=>{assert(/^[A-Za-z0-9_.-]+$/.test(name));writeFileSync(join(out,name),bytes,{flag:'wx',mode:0o600});};
const json=(name,v)=>save(name,Buffer.from(JSON.stringify(v,null,2)+'\n'));
let sequence=0,containerId=null,primary=null,expectedSource,finalSources=false,cleanup=[];
const nonce=randomBytes(12).toString('hex'),name='fa-dk23-private-xdg-'+process.env.GITHUB_RUN_ID+'-'+factor+'-'+nonce;
const label='org.uor.prismpm.dk23-private-xdg-diagnostic';
const authority=[['scripts/sdk-command-owner.mjs','79e017eeb59107064fbd5917b09e63259dcf47fe9ecdda1ff3db759944794308'],
 ['scripts/sdk-command-owner.py','ca3517a446b8082856e2e952a811a81436aabfd9a71b4414e3298d202aea8854']];
for(const [file,digest]of authority)assert.equal(hash(readFileSync(join(source,file))),digest,'original private supervisor bytes');
const {executeOwnedSdkCommand}=await import(pathToFileURL(join(source,'scripts/sdk-command-owner.mjs')).href);
async function command(tag,program,argv,timeout=30000,allowFailure=false,limit=4*1024*1024){
 const stem=String(++sequence).padStart(3,'0')+'-'+tag;assert(/^[A-Za-z0-9_.-]+$/.test(stem));
 const prefix=join(out,'commands',stem),start=new Date().toISOString();
 writeFileSync(prefix+'.invocation.json',JSON.stringify({program,args:argv,timeout,limit,aggregate:true,cwd:helper,started_at:start},null,2)+'\n',{flag:'wx',mode:0o600});
 let row,error;try{row=await executeOwnedSdkCommand(program,argv,{profile:'qualification',environment:process.env,
  timeout,limit,aggregate:true,cwd:helper,interruptions:true});}catch(e){error=e;row=e.result;}
 if(row){writeFileSync(prefix+'.stdout',row.stdout,{flag:'wx',mode:0o600});writeFileSync(prefix+'.stderr',row.stderr,{flag:'wx',mode:0o600});}
 const {stdout,stderr,...status}=row??{};
 writeFileSync(prefix+'.status.json',JSON.stringify({...status,started_at:start,completed_at:new Date().toISOString(),error:error?String(error):null,
  stdout:stdout?{size:stdout.length,sha256:hash(stdout)}:null,stderr:stderr?{size:stderr.length,sha256:hash(stderr)}:null},null,2)+'\n',{flag:'wx',mode:0o600});
 if(error)throw error;assert(row);for(const flag of['timedOut','overflow','aborted','orphaned'])assert.equal(row[flag],false,tag+' '+flag);
 assert.equal(row.retirement.descendants_absent,true);assert.equal(row.retirement.uncertainty,null);assert.equal(row.signal,null);
 if(!allowFailure)assert.equal(row.status,0,tag+' original status');return row;
}
const docker=(tag,argv,timeout,allowFailure,limit)=>command(tag,'docker',argv,timeout,allowFailure,limit);
async function gitIdentity(root,revision,tree,tag){
 const r=await command(tag+'-identity','git',['-C',root,'rev-parse','HEAD','HEAD^{tree}']);
 assert.deepEqual(r.stdout.toString('utf8').trim().split('\n'),[revision,tree]);
 const s=await command(tag+'-clean','git',['-C',root,'status','--porcelain','--untracked-files=all']);assert.equal(s.stdout.length,0);
}
async function absent(id,tag){
 const r=await docker(tag,['container','inspect',id],30000,true);
 assert.equal(r.status,1);assert.equal(r.stdout.toString('utf8').trim(),'[]');
 assert(/no such (?:object|container)/i.test(r.stderr.toString('utf8')),'exact missing-container diagnostic');
}
let imageId;
function owned(value){
 assert(Array.isArray(value)&&value.length===1);const c=value[0];assert.match(c.Id,/^[0-9a-f]{64}$/);
 if(containerId)assert.equal(c.Id,containerId);assert.equal(c.Name,'/'+name);assert.equal(c.Image,imageId);
 assert.equal(c.Config.Image,IMAGE);assert.equal(c.Config.Labels[label],nonce);assert.equal(c.Config.Labels[label+'.factor'],factor);
 assert.equal(c.Config.User,'1000:1000');assert.equal(c.HostConfig.ReadonlyRootfs,true);assert.equal(c.HostConfig.NetworkMode,'none');
 assert.equal(c.HostConfig.Privileged,false);assert.equal(c.HostConfig.AutoRemove,false);assert.deepEqual(c.HostConfig.CapDrop,['ALL']);
 assert.equal(c.HostConfig.SecurityOpt.length,1);assert(['no-new-privileges','no-new-privileges=true'].includes(c.HostConfig.SecurityOpt[0]));
 assert.deepEqual(c.HostConfig.Tmpfs,{'/tmp':'rw,exec,nosuid,nodev,size=8g'});assert(!c.HostConfig.Binds?.length);assert(!c.HostConfig.Mounts?.length);
 assert(c.Mounts.every(m=>m.Type==='tmpfs'&&m.Destination==='/tmp'&&m.RW===true),'no host/socket/source/data mounts');
 for(const k of['NanoCpus','CpuQuota','CpuPeriod','CpuShares','Memory','MemorySwap'])assert.equal(c.HostConfig[k],0,'unchanged default '+k);
 assert.equal(c.HostConfig.CpusetCpus,'');assert.equal(c.HostConfig.CpusetMems,'');assert([null,0].includes(c.HostConfig.PidsLimit));
 assert(!c.HostConfig.Devices?.length);assert(!c.HostConfig.DeviceRequests?.length);
 return c;
}
async function inspect(tag){const r=await docker(tag,['container','inspect',containerId??name]);return owned(JSON.parse(r.stdout));}
function decodeFrames(bytes){
 let at=0;const rows=[];
 while(at<bytes.length){
  const end=bytes.indexOf(10,at);assert(end>=0&&end-at<=160,'bounded frame header');
  const match=/^PRISMPM-DK23-PRIVATE-XDG-DIAGNOSTIC\/1 ([A-Za-z0-9_.-]+) (0|[1-9][0-9]*)$/.exec(bytes.subarray(at,end).toString('ascii'));assert(match);
  const length=Number(match[2]);assert(Number.isSafeInteger(length)&&length<=64*1024*1024);at=end+1;
  assert(at+length<bytes.length&&bytes[at+length]===10,'complete original frame');const body=bytes.subarray(at,at+length);at+=length+1;
  assert(!rows.some(x=>x.name===match[1]),'unique output frame');save(match[1],body);rows.push({name:match[1],size:length,sha256:hash(body)});
 }
 json('frame-index.json',rows);return rows;
}
try{
 await gitIdentity(source,SOURCE,TREE,'source-before');await gitIdentity(consumer,CONSUMER,CONSUMER_TREE,'consumer-before');
 const hg=await command('helper-identity','git',['-C',helper,'rev-parse','HEAD','HEAD^{tree}']);
 assert.equal(hg.stdout.toString('utf8').split('\n')[0],process.env.GITHUB_SHA);
 const hc=await command('helper-clean','git',['-C',helper,'status','--porcelain','--untracked-files=all']);assert.equal(hc.stdout.length,0);
 const lock=readFileSync(join(consumer,'prismpm.lock'));assert.equal(hash(lock),LOCK_SHA);assert.equal(JSON.parse(lock).sdk_image,IMAGE);
 const payload=readFileSync(join(here,'payload.mjs'));
 for(const [relative,path]of[['driver.mjs',fileURLToPath(import.meta.url)],['payload.mjs',join(here,'payload.mjs')],['workflow.yml',join(helper,'.github/workflows/fa-dk23-private-xdg-diagnostic.yml')]])save('published-'+relative,readFileSync(path));
 const api=await import(pathToFileURL(join(source,'scripts/browser-api-sdk-check.mjs')).href);
 expectedSource=api.capture(source,SOURCE);json('source-authority-before.json',expectedSource);
 json('identity.json',{scope:'diagnostic-only-no-qualification',factor,source:SOURCE,source_tree:TREE,consumer:CONSUMER,consumer_tree:CONSUMER_TREE,
  image:IMAGE,lock_sha256:LOCK_SHA,helper_actual:process.env.GITHUB_SHA,helper_identity:hg.stdout.toString('utf8').trim().split('\n'),
  run_id:process.env.GITHUB_RUN_ID,run_attempt:process.env.GITHUB_RUN_ATTEMPT,job:process.env.GITHUB_JOB,
  workflow_ref:process.env.GITHUB_WORKFLOW_REF,event:process.env.GITHUB_EVENT_NAME,runner:process.env.RUNNER_NAME,
  nonce,name,source_supervisor:authority,payload_sha256:hash(payload),source_test_execution_on_host:false});
 await command('host-kernel','uname',['-a']);await docker('host-docker-version',['version'],30000);
 await docker('pull-immutable-amd64',['pull','--platform','linux/amd64',IMAGE],1200000,false,4*1024*1024);
 const im=await docker('image-inspect',['image','inspect',IMAGE],30000);const image=JSON.parse(im.stdout);api.verifyImage(image,IMAGE,'amd64',SOURCE);imageId=image[0].Id;
 await absent(name,'exclusive-name-absence');
 const create=['container','create','--name',name,'--label',label+'='+nonce,'--label',label+'.factor='+factor,
  '--user','1000:1000','--read-only','--network','none','--cap-drop','ALL','--security-opt','no-new-privileges',
  '--tmpfs','/tmp:rw,exec,nosuid,nodev,size=8g','--env','PRISMPM_EPHEMERAL_HOME=1','--env','CARGO_NET_OFFLINE=true',
  '--workdir','/opt/prismpm/share/conformance-root',IMAGE,'node','--input-type=module','-e',payload.toString('utf8'),factor];
 const cr=await docker('create-original-isolation',create,120000);containerId=cr.stdout.toString('utf8').trim();assert.match(containerId,/^[0-9a-f]{64}$/);
 const first=await inspect('container-created');assert.equal(first.State.Running,false);assert.equal(first.State.Pid,0);
 const execution=await docker('complete-original-owners-attach',['container','start','--attach',containerId],3900000,true,64*1024*1024);
 const last=await inspect('container-after-owner');assert.equal(last.State.Running,false);assert.equal(last.State.Pid,0);
 json('container-original-outcome.json',{id:containerId,state:last.State,attach_status:execution.status,attach_retirement:execution.retirement});
 const frames=decodeFrames(execution.stdout);assert(frames.some(f=>f.name==='source-before.json')&&frames.some(f=>f.name==='source-after.json'));
 for(const path of['source-before.json','source-after.json'])assert.deepEqual(JSON.parse(readFileSync(join(out,path))),expectedSource,'original exact installed source '+path);
 const after=api.capture(source,SOURCE);json('source-authority-after.json',after);assert.deepEqual(after,expectedSource);
 await gitIdentity(source,SOURCE,TREE,'source-after');await gitIdentity(consumer,CONSUMER,CONSUMER_TREE,'consumer-after');finalSources=true;
 assert.equal(last.State.OOMKilled,false);assert.equal(execution.status,last.State.ExitCode);assert.equal(execution.status,0,'diagnostic recorded a negative original owner');
 assert(frames.some(f=>f.name==='diagnostic-result.json'));assert.equal(JSON.parse(readFileSync(join(out,'controller-status.json'))).status,0);
}catch(error){primary={name:error.name,message:error.message,stack:error.stack};json('primary-failure.json',primary);}
finally{
 try{
  // Lookup by the exclusive nonce/name also recovers a successful create whose
  // output was interrupted. Never remove by a guessed ID or unrelated name.
  const ir=await docker('cleanup-inspect-owned',['container','inspect',containerId??name],30000,true);
  if(ir.status===0){const c=owned(JSON.parse(ir.stdout));containerId=c.Id;
   if(c.State.Running){await docker('cleanup-normal-stop',['container','stop','--timeout','5',containerId],30000);}
   const stopped=await inspect('cleanup-inspect-stopped');assert.equal(stopped.State.Running,false);assert.equal(stopped.State.Pid,0);
   await docker('cleanup-normal-remove',['container','rm',containerId],30000);await absent(containerId,'cleanup-id-absence');await absent(name,'cleanup-name-absence');
   cleanup.push({id:containerId,name,normal_remove:true,id_absent:true,name_absent:true});
  }else{assert.equal(ir.status,1);assert(/no such (?:object|container)/i.test(ir.stderr.toString('utf8')));cleanup.push({name,never_observed_created:true});}
 }catch(error){cleanup.push({error:String(error)});}
 json('cleanup.json',cleanup);
 json('result.json',{scope:'diagnostic-only-no-SDK-qualification-or-release',factor,primary_failure:primary,
  source_prepost_verified:finalSources,cleanup,completed_at:new Date().toISOString(),
  status:primary||cleanup.some(x=>x.error)?1:0});
 const files=[];for(const dir of[out,join(out,'commands')])for(const f of readdirSync(dir).sort()){
  const p=join(dir,f),s=lstatSync(p);if(s.isFile()){const b=readFileSync(p);files.push({path:dir===out?f:'commands/'+f,size:b.length,sha256:hash(b)});}}
 json('evidence-index.json',files);
}
process.exitCode=primary||cleanup.some(x=>x.error)?1:0;
