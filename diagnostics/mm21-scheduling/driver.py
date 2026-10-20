"""HELD same-build full production7 scheduling diagnostic; root only, no acceptance."""
import argparse,datetime,hashlib,json,os,re,selectors,shutil,signal,stat,subprocess,time
from pathlib import Path
IMAGE='ghcr.io/afflom/lexlean-matmul-sdk@sha256:203fbb3769ab565b63d22d27a777adb916e6b13e558f539e95a1dca610870e5a'
SDK_SOURCE='6048db073d8b1bdf026685dfbc42016fb5a00f67';CONFIG='sha256:d7f9e9becacbde1202c1f9017cfbde6fdef4850dd170a382a611b5a52d4ceecc'
PARENT='b22cb5e7221cea3829ecc92f2df0075846f04fe3';BRANCH='ci/mm21-browser-scheduling-b22-2026-10-20'
REL='crates/conformance/tests/production.rs';BASE='b2e66f2c49c748f8236c44ea81a2730776b3d8769110371117fa4d1d3ce4685a';MUTEX='5e58301f99fad543cba8989047a6bc71949d513e71cbb2373378d4dc93d2637a'
EXPECTED={'conformance_mm_'+str(n)for n in range(18,25)}
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--execute',action='store_true');p.add_argument('--inside',choices=['original','mutex']);p.add_argument('--output',type=Path,required=True);a=p.parse_args();assert a.execute
ROOT=Path.cwd().resolve();HERE=Path(__file__).resolve().parent;OUT=a.output;assert OUT.is_absolute()and OUT.resolve()==OUT and OUT.parent.is_dir()and not OUT.exists();OUT.mkdir(mode=0o700);(OUT/'commands').mkdir()
CAP=512*1024**2;DEADLINE=time.monotonic()+(3700 if a.inside else 330*60);CLEANUP_DEADLINE=None;retained=0;seq=0;interrupted=None;problem=None;overlay=False;initial=None;pending=[]
sha=lambda b:hashlib.sha256(b).hexdigest()
def interruption(signum,frame):
 global interrupted
 if interrupted is None:interrupted=signal.Signals(signum).name;raise InterruptedError('diagnostic interrupted by '+interrupted)
for sig in[signal.SIGHUP,signal.SIGINT,signal.SIGTERM]:signal.signal(sig,interruption)
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

def run(tag,argv,timeout=30,allow=False,stdout_max=4*1024**2,stderr_max=4*1024**2,observe=False):
 global seq,retained
 budget=CLEANUP_DEADLINE if CLEANUP_DEADLINE is not None else DEADLINE;assert time.monotonic()<budget,'diagnostic phase deadline before command'
 seq+=1;stem='commands/'+str(seq).zfill(3)+'-'+tag;put(stem+'.invocation.json',{'argv':argv,'cwd':str(ROOT),'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'timeout_seconds':timeout,'stdout_max':stdout_max,'stderr_max':stderr_max})
 proc=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True);sel=selectors.DefaultSelector();buf={'stdout':bytearray(),'stderr':bytearray()};limits={'stdout':stdout_max,'stderr':stderr_max};reason=None;retirement=None;end=min(budget,time.monotonic()+timeout)
 try:
  for n,s in [('stdout',proc.stdout),('stderr',proc.stderr)]:sel.register(s,selectors.EVENT_READ,n)
  next_sample=0
  while sel.get_map():
   if observe and time.monotonic()>=next_sample:
    sample(proc.pid);next_sample=time.monotonic()+1
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

samples=[]
def sample(leader):
 assert len(samples)<4000
 rows={}
 for d in Path('/proc').iterdir():
  if not d.name.isdecimal():continue
  try:
   fields=(d/'stat').read_text().rsplit(')',1)[1].split();cmd=(d/'cmdline').read_bytes().split(b'\0');cmd=[x.decode(errors='replace')for x in cmd if x];pid=int(d.name)
   rows[pid]={'pid':pid,'ppid':int(fields[1]),'start_ticks':int(fields[19]),'cpu_ticks':int(fields[11])+int(fields[12]),'argv':cmd}
  except(FileNotFoundError,ProcessLookupError,PermissionError):continue
 owned={leader}
 while True:
  extra={n for n,r in rows.items()if r['ppid']in owned}-owned
  if not extra:break
  owned|=extra
 cases=[];browsers=[]
 for pid in owned:
  r=rows.get(pid)
  if not r:continue
  cmd=r['argv']
  if len(cmd)>=3 and Path(cmd[0]).name=='node'and cmd[-2]=='scripts/conformance.mjs'and cmd[-1]in{'MM-'+str(n)for n in range(18,25)}:cases.append(r)
  if cmd and(cmd[0].startswith('/ms-playwright/')or any('chrome-headless-shell'in x for x in cmd[:1])):browsers.append({k:r[k]for k in ['pid','ppid','start_ticks','cpu_ticks']}|{'program':cmd[0]})
 samples.append({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'epoch':time.time(),'leader':leader,'conformance_cases':cases,'browser_processes':browsers,'loadavg':Path('/proc/loadavg').read_text().strip()})
def snapshot():
 names=run('tracked-files',['git','ls-files','-z'])[0].decode().split('\0')[:-1];rows=[]
 for name in sorted(names):
  f=ROOT/name;b=regular(f);s=f.stat();rows.append({'path':name,'bytes':len(b),'sha256':sha(b),'mode':stat.S_IMODE(s.st_mode)})
 return rows
def built_identity():
 base=ROOT/'.prism/matmul';build=json.loads((base/'build.json').read_bytes());manifest=ROOT/build['manifest_path'];model=ROOT/build['model_path'];v=json.loads(model.read_bytes());directory=manifest.parent/'view/browser';assets=[]
 for f in sorted(directory.iterdir()):
  b=regular(f);assets.append({'name':f.name,'bytes':len(b),'sha256':sha(b)})
 assert len(assets)==6 and v['application']['profile']=='prismpm/text-application/4'
 return {'build_id':build['build_id'],'manifest_sha256':sha(manifest.read_bytes()),'model_sha256':sha(model.read_bytes()),'assets':assets}
def report_files(phase):
 base=ROOT/'.prism/matmul';target=ROOT/'.prism'/('mm21-scheduling-'+phase)/'observations';target.mkdir(parents=True,exist_ok=True);assert target.is_dir()and not target.is_symlink()and target.resolve()==target
 for name in ['checks','runtime-oracle']:
  source=base/name
  if source.exists():
   assert source.is_dir()and not source.is_symlink()and not(target/name).exists();source.rename(target/name)
 return str(target)
try:
 assert json.loads(regular(ROOT/'prismpm.lock'))['sdk_image']==IMAGE
 assert sha(regular(ROOT/REL))==(MUTEX if a.inside=='mutex'else BASE)
 if a.inside:
  assert OUT==ROOT/'.prism'/('mm21-scheduling-'+a.inside)and Path('/opt/prismpm/share/inventory.json').is_file()
  before=built_identity();put('generated-before.json',before)
  put('environment.json',{'uid':os.getuid(),'gid':os.getgid(),'cpu_count':os.cpu_count(),'env':{k:os.environ.get(k)for k in['HOME','CARGO_HOME','RUST_TEST_THREADS','CARGO_BUILD_JOBS','CARGO_INCREMENTAL','CARGO_PROFILE_DEV_DEBUG','NODE_OPTIONS']},'cgroup':{n:(Path('/sys/fs/cgroup')/n).read_text()for n in ['cpu.max','cpu.stat','memory.max','memory.current','pids.max']if(Path('/sys/fs/cgroup')/n).is_file()}})
  raw,err,result=run('original-whole-production-seven',['cargo','test','-p','repo-conformance','--test','production','--no-fail-fast'],timeout=3600,allow=True,stdout_max=64*1024**2,stderr_max=64*1024**2,observe=True)
  sample(-1);put('process-samples.json',{'interval_seconds':1,'observations':samples,'peak_sampled_conformance_cases':max([len(s['conformance_cases'])for s in samples],default=0),'scope':'Sampled overlap/CPU/load only, not proof that scheduling caused any browser interval.'})
  text=raw.decode();cases=re.findall(r'^test (conformance_mm_[0-9]+) \.\.\. (ok|FAILED)$',text,re.M);assert len(cases)==7 and {n for n,_ in cases}==EXPECTED
  summary=re.findall(r'^test result: (ok|FAILED)\. (\d+) passed; (\d+) failed; (\d+) ignored; (\d+) measured; (\d+) filtered out;',text,re.M);assert len(summary)==1
  _,passed,failed,ignored,measured,filtered=summary[0];assert int(passed)+int(failed)==7 and int(ignored)==int(measured)==int(filtered)==0 and result['returncode']==(101 if int(failed)else 0)
  after=built_identity();assert before==after;put('generated-after.json',after);observed=report_files(a.inside)
  put('phase-result.json',{'diagnostic_only':True,'phase':a.inside,'original_owner_status':result['returncode'],'all_seven_completed':True,'cases':cases,'observations':observed,'build':after,'qualification':False,'acceptance':False});print(json.dumps({'phase':a.inside,'original_owner_status':result['returncode'],'all_seven_completed':True}),flush=True)
 else:
  assert os.environ.get('GITHUB_REPOSITORY')=='afflom/lexlean-matmul'and os.environ.get('GITHUB_EVENT_NAME')=='push'and os.environ.get('GITHUB_REF')=='refs/heads/'+BRANCH and os.environ.get('GITHUB_RUN_ATTEMPT')=='1'
  head=run('helper-head',['git','rev-parse','HEAD'])[0].decode().strip();assert head==os.environ['GITHUB_SHA'];assert run('sole-parent',['git','rev-list','--parents','-n','1','HEAD'])[0].decode().split()==[head,PARENT]
  assert run('initial-clean',['git','status','--porcelain','--untracked-files=all'])[0]==b''
  expected={'.github/workflows/mm21-browser-scheduling-diagnostic.yml','diagnostics/mm21-scheduling/driver.py','diagnostics/mm21-scheduling/production.serialized.rs'};assert set(run('helper-delta',['git','diff','--name-status',PARENT,head])[0].decode().splitlines())=={'A\t'+n for n in expected}
  initial=snapshot();put('source-before.json',initial)
  for n in expected:put('published/'+Path(n).name,regular(ROOT/n))
  model=json.loads(re.search(r'^\\semanticdata\{(.*)\}$',regular(ROOT/'src/Model.lex.tex').decode(),re.M)[1]);policy={d['name']:d['body']['value']for d in model['declarations']if d['name']in['browserMainThreadGapMaximumMilliseconds','browserCpuSlowdown']};assert policy=={'browserMainThreadGapMaximumMilliseconds':'250','browserCpuSlowdown':'4'};put('policy.json',policy)
  run('pull-exact-public-sdk',['docker','pull','--platform','linux/amd64',IMAGE],timeout=1200)
  im=json.loads(run('image-identity',['docker','image','inspect',IMAGE])[0])[0];assert im['Id']==CONFIG and im['Architecture']=='amd64'and im['Os']=='linux'and IMAGE in im['RepoDigests']and im['Config']['Labels']['org.opencontainers.image.revision']==SDK_SOURCE
  run('one-normal-build',['./scripts/in-sdk.sh','node','scripts/build.mjs'],timeout=14400,stdout_max=64*1024**2,stderr_max=64*1024**2)
  build=built_identity();put('same-build.json',build);assert snapshot()==initial
  # Preserve build-time observations before the first phase; each phase then has fresh report directories.
  report_files('pre-test')
  for phase in ['original','mutex']:
   if phase=='mutex':
    candidate=regular(HERE/'production.serialized.rs');assert sha(candidate)==MUTEX;(ROOT/REL).write_bytes(candidate);overlay=True
   expected_rows=[dict(row)for row in initial]
   if phase=='mutex':
    changed=next(row for row in expected_rows if row['path']==REL);changed['bytes']=len(candidate);changed['sha256']=MUTEX
   current=snapshot();put('source-'+phase+'-before.json',current);assert current==expected_rows
   dest=ROOT/'.prism'/('mm21-scheduling-'+phase);assert not dest.exists();pending.append((phase,dest))
   _,_,controller=run(phase+'-same-build-full-seven',['./scripts/in-sdk.sh','python3',str(HERE/'driver.py'),'--execute','--inside',phase,'--output',str(dest)],timeout=3900,allow=True,stdout_max=64*1024**2,stderr_max=64*1024**2)
   shutil.copytree(dest,OUT/phase)
   assert controller['returncode']==0,'inner diagnostic controller failed; original evidence retained'
   data=json.loads((dest/'phase-result.json').read_bytes());assert data['all_seven_completed']and data['build']==build
   current=snapshot();put('source-'+phase+'-after.json',current);assert current==expected_rows
except BaseException as e:problem={'type':type(e).__name__,'message':str(e)};put('diagnostic-failure.json',problem)
finally:
 CLEANUP_DEADLINE=time.monotonic()+300
 for sig in[signal.SIGHUP,signal.SIGINT,signal.SIGTERM]:signal.signal(sig,signal.SIG_IGN)
 if a.inside:
  retention_failures=[]
  try:
   if not(OUT/'process-samples.json').exists():put('process-samples.json',{'interval_seconds':1,'observations':samples,'peak_sampled_conformance_cases':max([len(s['conformance_cases'])for s in samples],default=0),'scope':'Partial or complete sampled overlap/CPU/load only, not proof that scheduling caused any browser interval.'})
  except BaseException as e:retention_failures.append({'phase':'samples','type':type(e).__name__,'message':str(e)})
  try:report_files(a.inside)
  except BaseException as e:retention_failures.append({'phase':'owner-reports','type':type(e).__name__,'message':str(e)})
  if retention_failures:problem=problem or{'type':'FinalRetentionFailure','message':'Available inner evidence could not all be retained'}
  put('inner-final-retention.json',{'failures':retention_failures,'owner_failure_preserved':problem,'scope':'Finally retains available samples and original phase reports after success, failure or interruption; no owner outcome is changed.'})
 if not a.inside:
  try:
   if overlay:
    assert sha(regular(ROOT/REL))==MUTEX
    original=run('restore-original-source',['git','show','HEAD:'+REL])[0];assert sha(original)==BASE;(ROOT/REL).write_bytes(original)
   if initial is not None:final=snapshot();put('source-after.json',final);assert final==initial
   for phase,dest in pending:
    if dest.exists()and not(OUT/phase).exists():
     assert dest.is_dir()and not dest.is_symlink();shutil.copytree(dest,OUT/phase)
   put('source-final-clean',run('final-clean',['git','status','--porcelain','--untracked-files=all'])[0]);assert (OUT/'source-final-clean').read_bytes()==b''
  except BaseException as e:problem=problem or{'type':type(e).__name__,'message':str(e)};put('source-restoration-refusal.json',{'type':type(e).__name__,'message':str(e)})
 put('controller-result.json',{'scope':'same-build-production-seven-scheduling-diagnostic-only','phase':a.inside,'diagnostic_complete':problem is None,'failure':problem,'threshold_ms':250,'cpu_slowdown':4,'baseline_failure_required':False,'qualification':False,'acceptance':False,'limits':'One ordered pair can support or refuse the contention hypothesis; order/cache/host-load differences remain. Original in-sdk --rm lifecycle is inherited; no broader SDK/consumer acceptance.'})
 index=[]
 for f in sorted(OUT.rglob('*')):
  if f.is_file():b=f.read_bytes();index.append({'path':str(f.relative_to(OUT)),'bytes':len(b),'sha256':sha(b)})
 put('evidence-index.json',index)
raise SystemExit(1 if problem else 0)
