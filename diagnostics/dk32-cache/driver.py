"""HELD nativeAMD installed-image DK32 baseline/candidate diagnostic; root-only."""
import argparse,datetime,hashlib,json,os,re,selectors,signal,stat,subprocess,time
from pathlib import Path
IMAGE='ghcr.io/afflom/lexlean-matmul-sdk@sha256:203fbb3769ab565b63d22d27a777adb916e6b13e558f539e95a1dca610870e5a'
SOURCE='6048db073d8b1bdf026685dfbc42016fb5a00f67';PARENT='b22cb5e7221cea3829ecc92f2df0075846f04fe3';TREE='b9eb684e8a24cc0ee12d6443a51a71cc05b7b563'
BRANCH='ci/sdk-dk32-model-lake-cache-6048db07-2026-10-20';REL='tests/browser-signed-context/compile.mjs';DEST='/opt/prismpm/share/conformance-root/'+REL
CONFIG='sha256:d7f9e9becacbde1202c1f9017cfbde6fdef4850dd170a382a611b5a52d4ceecc'
BASE='f114e224150e28de0c7be38820d79c2dbf2f1984988d21a2321d106c6179adad';CANDIDATE='55281e3479ac42e8dab067b4e8da06ada254416368e50f8ee6d95805a9021903';LABEL='org.uor.dk32-cache-diagnostic'
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--execute',action='store_true');parser.add_argument('--mode',choices=['baseline','candidate'],required=True);parser.add_argument('--output',type=Path,required=True);a=parser.parse_args();assert a.execute
ROOT=Path.cwd().resolve();HERE=Path(__file__).resolve().parent;OUT=a.output;assert OUT.is_absolute()and OUT.resolve()==OUT and OUT.parent.is_dir()and not OUT.exists()and not OUT.is_relative_to(ROOT);OUT.mkdir(mode=0o700);(OUT/'commands').mkdir()
nonce=os.urandom(12).hex();name='dk32-'+a.mode+'-'+nonce;container=None;created=False;image_id=None;seq=0;retained=0;problem=None;cleanup=[];outcome=None
CAP=256*1024**2;DEADLINE=time.monotonic()+160*60;CLEANUP_DEADLINE=None;interrupted=None
def interruption(signum,frame):
 global interrupted
 if interrupted is None:
  interrupted=signal.Signals(signum).name;raise InterruptedError('diagnostic interrupted by '+interrupted)
for sig in [signal.SIGHUP,signal.SIGINT,signal.SIGTERM]:signal.signal(sig,interruption)
sha=lambda b:hashlib.sha256(b).hexdigest()
def put(n,v):
 global retained
 b=v if isinstance(v,bytes)else(json.dumps(v,indent=2)+'\n').encode();assert retained+len(b)<=CAP-65536;target=OUT/n;target.parent.mkdir(parents=True,exist_ok=True)
 with target.open('xb')as f:f.write(b)
 retained+=len(b);return{'path':n,'bytes':len(b),'sha256':sha(b)}
def regular(p):
 assert p.resolve()==p and p.is_file()and not p.is_symlink()and p.stat().st_nlink==1;return p.read_bytes()
def group(proc):
 proc.poll()
 try:os.killpg(proc.pid,0);return True
 except ProcessLookupError:return False
def retire(proc):
 sent=[]
 for sig in [signal.SIGTERM,signal.SIGKILL]:
  try:os.killpg(proc.pid,sig);sent.append(signal.Signals(sig).name)
  except ProcessLookupError:pass
  until=time.monotonic()+5
  while group(proc)and time.monotonic()<until:time.sleep(.05)
  if not group(proc):break
 return{'signals':sent,'process_group_absent':not group(proc),'leader_returncode':proc.poll()}
def run(tag,argv,timeout=30,allow=False,stdout_max=4*1024**2,stderr_max=4*1024**2):
 global seq,retained
 budget=CLEANUP_DEADLINE if CLEANUP_DEADLINE is not None else DEADLINE;assert time.monotonic()<budget,'diagnostic phase deadline before command'
 seq+=1;stem='commands/'+str(seq).zfill(3)+'-'+tag;put(stem+'.invocation.json',{'argv':argv,'cwd':str(ROOT),'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'timeout_seconds':timeout,'stdout_max':stdout_max,'stderr_max':stderr_max})
 proc=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True);sel=selectors.DefaultSelector();buf={'stdout':bytearray(),'stderr':bytearray()};limits={'stdout':stdout_max,'stderr':stderr_max};reason=None;retirement=None;end=min(budget,time.monotonic()+timeout)
 try:
  for n,s in [('stdout',proc.stdout),('stderr',proc.stderr)]:sel.register(s,selectors.EVENT_READ,n)
  while sel.get_map():
   if time.monotonic()>=end:reason='command or whole diagnostic deadline';break
   for key,_ in sel.select(.2):
    b=os.read(key.fileobj.fileno(),65536)
    if not b:sel.unregister(key.fileobj);continue
    n=key.data
    if len(buf[n])+len(b)>limits[n]or retained+sum(map(len,buf.values()))+len(b)>CAP-131072:reason='original output bound';break
    buf[n]+=b
   if reason:break
  if reason is None:
   try:proc.wait(timeout=min(10,max(.001,end-time.monotonic())))
   except subprocess.TimeoutExpired:reason='leader did not exit after pipe EOF'
  if reason is None and group(proc):reason='process group remained after leader exit'
 except BaseException as e:reason='capture exception '+type(e).__name__
 finally:
  if reason is not None:retirement=retire(proc)
  sel.close();proc.stdout.close();proc.stderr.close()
 row={'argv':argv,'returncode':proc.poll(),'complete_streams':reason is None,'incomplete_reason':reason,'retirement':retirement}
 for n in ['stdout','stderr']:row[n]=put(stem+'.'+n,bytes(buf[n]))
 put(stem+'.status.json',row);assert reason is None,tag+' incomplete original capture';assert allow or row['returncode']==0,tag+' failed'
 return bytes(buf['stdout']),bytes(buf['stderr']),row

def docker(tag,args,**kw):return run(tag,['docker',*args],**kw)
def absent(id,tag):
 out,err,s=docker(tag,['container','inspect',id],allow=True);assert s['returncode']==1 and out.strip()==b'[]'and re.search(b'no such (?:object|container)',err,re.I)
def owned(v):
 assert isinstance(v,list)and len(v)==1;c=v[0];assert re.fullmatch('[0-9a-f]{64}',c['Id'])and c['Name']=='/'+name and c['Image']==image_id and c['Config']['Image']==IMAGE
 if container:assert c['Id']==container
 assert c['Config']['Entrypoint']==['/usr/local/bin/prismpm-devcontainer-init']and c['Config']['WorkingDir']=='/opt/prismpm/share/conformance-root'
 assert c['Config']['Labels'][LABEL]==nonce and c['Config']['Labels'][LABEL+'.mode']==a.mode and c['Config']['User']=='1000:1000'
 h=c['HostConfig'];assert h['ReadonlyRootfs']is True and h['NetworkMode']=='none'and h['Privileged']is False and h['AutoRemove']is False and h['CapDrop']==['ALL']and h['SecurityOpt']in [['no-new-privileges'],['no-new-privileges=true']]
 assert h['Tmpfs']=={'/tmp':'rw,exec,nosuid,nodev,size=8g'}and not h.get('Mounts')and not h.get('Devices')and not h.get('DeviceRequests')
 expected=[str(HERE/'candidate.compile.mjs')+':'+DEST+':ro']if a.mode=='candidate'else[];assert(h.get('Binds')or[])==expected
 for m in c['Mounts']:
  assert(m['Type']=='tmpfs'and m['Destination']=='/tmp'and m['RW']is True)or(a.mode=='candidate'and m['Type']=='bind'and m['Destination']==DEST and m['Source']==str(HERE/'candidate.compile.mjs')and m['RW']is False)
 for k in ['NanoCpus','CpuQuota','CpuPeriod','CpuShares','Memory','MemorySwap']:assert h[k]==0
 assert h['PidsLimit']in [None,0]and h['CpusetCpus']==h['CpusetMems']==''
 return c
def inspect(tag):return owned(json.loads(docker(tag,['container','inspect',container or name])[0]))
def frames(raw):
 at=0;rows=[];complete=True
 while at<len(raw):
  end=raw.find(b'\n',at)
  if end<0 or end-at>160:complete=False;break
  m=re.fullmatch(rb'PRISMPM-DK32-DIAGNOSTIC/1 ([A-Za-z0-9_.-]+) (0|[1-9][0-9]*)',raw[at:end]);assert m,'unexpected diagnostic stdout framing';n=m[1].decode();length=int(m[2]);assert length<=64*1024**2 and n not in {v['name']for v in rows};begin=end+1
  if begin+length>=len(raw):complete=False;break
  assert raw[begin+length:begin+length+1]==b'\n';body=raw[begin:begin+length];at=begin+length+1
  # Preserve original attach stdout once; frame offsets locate raw child streams without duplicating them.
  row={'name':n,'offset':begin,'bytes':length,'sha256':sha(body)}
  if n.endswith('.json'):put('frames/'+n,body)
  rows.append(row)
 put('frame-index.json',{'frames':rows,'all_frames_complete':complete,'parsed_bytes':at,'original_attach_stdout_contains_original_child_streams':True});return rows,complete
try:
 assert os.environ.get('GITHUB_REPOSITORY')=='afflom/lexlean-matmul'and os.environ.get('GITHUB_EVENT_NAME')=='push'and os.environ.get('GITHUB_REF')=='refs/heads/'+BRANCH and os.environ.get('GITHUB_RUN_ATTEMPT')=='1'
 for n in ['driver.py','payload.mjs','candidate.compile.mjs']:put('published/'+n,regular(HERE/n))
 put('published/workflow.yml',regular(ROOT/'.github/workflows/dk32-model-lake-cache-diagnostic.yml'));assert sha(regular(HERE/'candidate.compile.mjs'))==CANDIDATE
 head=run('helper-identity',['git','rev-parse','HEAD','HEAD^{tree}'])[0].decode().splitlines();assert head[0]==os.environ['GITHUB_SHA'];assert run('helper-parent',['git','rev-list','--parents','-n','1','HEAD'])[0].decode().split()==[head[0],PARENT];assert run('parent-tree',['git','rev-parse',PARENT+'^{tree}'])[0].decode().strip()==TREE
 assert run('helper-clean',['git','status','--porcelain','--untracked-files=all'])[0]==b'';assert json.loads(regular(ROOT/'prismpm.lock'))['sdk_image']==IMAGE
 changes=run('helper-delta',['git','diff','--name-status',PARENT,'HEAD'])[0].decode().splitlines();assert set(changes)=={'A\tdiagnostics/dk32-cache/driver.py','A\tdiagnostics/dk32-cache/payload.mjs','A\tdiagnostics/dk32-cache/candidate.compile.mjs','A\t.github/workflows/dk32-model-lake-cache-diagnostic.yml'}
 put('identity.json',{'scope':'paired-DK32-source-overlay-diagnostic-only','mode':a.mode,'source':SOURCE,'image':IMAGE,'consumer_parent':PARENT,'helper':head,'run':os.environ['GITHUB_RUN_ID'],'attempt':1,'name':name,'nonce':nonce,'candidate_sha256':CANDIDATE,'baseline_compile_sha256':BASE})
 docker('pull-original-public-amd64',['pull','--platform','linux/amd64',IMAGE],timeout=1200)
 image=json.loads(docker('image-inspect',['image','inspect',IMAGE])[0]);assert len(image)==1;im=image[0];assert im['Id']==CONFIG and im['Architecture']=='amd64'and im['Os']=='linux'and IMAGE in im['RepoDigests']and im['Config']['Entrypoint']==['/usr/local/bin/prismpm-devcontainer-init']and im['Config']['Labels']['org.opencontainers.image.revision']==SOURCE and im['Config']['Labels']['org.opencontainers.image.source']=='https://github.com/UOR-Foundation/PrismPM'and im['Config']['Labels']['org.opencontainers.image.version']=='0.3.0'and not im['Config'].get('Volumes');image_id=im['Id']
 absent(name,'exclusive-name-absence');args=['container','create','--name',name,'--label',LABEL+'='+nonce,'--label',LABEL+'.mode='+a.mode,'--user','1000:1000','--read-only','--network','none','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,exec,nosuid,nodev,size=8g','--env','PRISMPM_EPHEMERAL_HOME=1','--env','CARGO_NET_OFFLINE=true','--workdir','/opt/prismpm/share/conformance-root']
 if a.mode=='candidate':args+=['--volume',str(HERE/'candidate.compile.mjs')+':'+DEST+':ro']
 args += [IMAGE,'node','--input-type=module','-e',regular(HERE/'payload.mjs').decode(),a.mode];created=True;container=docker('create-owned-isolation',args,timeout=120)[0].decode().strip();assert re.fullmatch('[0-9a-f]{64}',container)
 first=inspect('created-inspect');assert not first['State']['Running']and first['State']['Pid']==0
 raw,err,attached=docker('complete-DK32-original-argv',['container','start','--attach',container],timeout=3900,allow=True,stdout_max=160*1024**2,stderr_max=16*1024**2)
 last=inspect('post-owner-inspect');assert not last['State']['Running']and last['State']['Pid']==0;outcome={'state':last['State'],'attach_status':attached['returncode']};put('original-owner-outcome.json',outcome);rows,allframes=frames(raw)
 assert allframes and not last['State']['OOMKilled']and attached['returncode']==last['State']['ExitCode']==0,'diagnostic negative or incomplete; originals retained'
 controller=json.loads((OUT/'frames/controller-status.json').read_bytes());assert controller['status']==0
 assert run('helper-final-clean',['git','status','--porcelain','--untracked-files=all'])[0]==b''and sha(regular(HERE/'candidate.compile.mjs'))==CANDIDATE
except BaseException as e:problem={'type':type(e).__name__,'message':str(e)};put('primary-failure.json',problem)
finally:
 CLEANUP_DEADLINE=time.monotonic()+300
 for sig in [signal.SIGHUP,signal.SIGINT,signal.SIGTERM]:signal.signal(sig,signal.SIG_IGN)
 try:
  if created:
   out,err,s=docker('cleanup-exact-name-inspect',['container','inspect',container or name],allow=True)
   if s['returncode']==0:
    c=owned(json.loads(out));container=c['Id']
    if c['State']['Running']:docker('cleanup-normal-stop',['container','stop','--timeout','5',container])
    c=inspect('cleanup-stopped-inspect');assert not c['State']['Running']and c['State']['Pid']==0
    docker('cleanup-normal-remove',['container','rm',container]);absent(container,'cleanup-id-absence');absent(name,'cleanup-name-absence');cleanup.append({'id':container,'name':name,'normal_remove':True,'id_absent':True,'name_absent':True})
   else:assert s['returncode']==1 and out.strip()==b'[]'and re.search(b'no such (?:object|container)',err,re.I);cleanup.append({'name':name,'not_observed_created':True})
  else:cleanup.append({'created':False})
 except BaseException as e:cleanup.append({'error':type(e).__name__+': '+str(e)})
 put('cleanup.json',cleanup);put('result.json',{'qualification':False,'acceptance':False,'scope':'full-DK32-paired-source-overlay-diagnostic-only','mode':a.mode,'primary_failure':problem,'original_container_outcome':outcome,'cleanup':cleanup,'status':1 if problem or any('error'in r for r in cleanup)else 0,'baseline_standalone_failure_not_required':True,'whole_host_deadline_seconds':160*60,'separate_cleanup_budget_seconds':300,'interrupted':interrupted})
 index=[]
 for p in sorted(OUT.rglob('*')):
  if p.is_file():b=p.read_bytes();index.append({'path':p.relative_to(OUT).as_posix(),'bytes':len(b),'sha256':sha(b)})
 put('evidence-index.json',index)
raise SystemExit(1 if problem or any('error'in r for r in cleanup)else 0)
