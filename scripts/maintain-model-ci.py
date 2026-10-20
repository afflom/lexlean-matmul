"""Hosted project model maintenance through the exact public locked SDK only."""
import datetime,hashlib,json,os,re,stat,subprocess,sys,tempfile,time
from pathlib import Path
ROOT=Path.cwd().resolve()
RETAINED=ROOT/'.prism/matmul/model-maintenance-ci/retained'
HELPER='scripts/maintain-model-ci.py'
WORKFLOW='.github/workflows/immutable-sdk-model-maintenance.yml'
CONTRACT='.github/immutable-sdk-model-maintenance-input.json'
BRANCH='refs/heads/ci/sdk-final-model-maintenance-02d0d78c-2026-10-20'
CANONICAL7=['.devcontainer/devcontainer.json','.github/workflows/bootstrap.yml',
 '.github/workflows/prismpm.yml','.github/workflows/template-update.yml',
 'prismpm.lock','standards.lock','template.lock']
GENERATED=['CONFORMANCE.md','ERRORS.md']
STDIO_MAX=16*1024*1024
FILE_MAX=4*1024*1024
ARTIFACT_MAX=128*1024*1024
COMMANDS=[]

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def digest(data):
    return hashlib.sha256(data).hexdigest()

def read_regular(relative, maximum=FILE_MAX):
    p = ROOT
    for part in Path(relative).parts:
        assert part not in ('', '.', '..') and not Path(relative).is_absolute()
        p = p / part
        assert not p.is_symlink(), 'Symlink in input/output path: ' + str(p)
    s = p.stat()
    assert stat.S_ISREG(s.st_mode) and s.st_nlink == 1 and s.st_size <= maximum
    return p.read_bytes()

def identity(relative):
    data = read_regular(relative)
    mode = '100755' if (ROOT / relative).stat().st_mode & 0o111 else '100644'
    return {'path': relative, 'bytes': len(data), 'sha256': digest(data), 'git_mode': mode}

def write(name, data):
    p = RETAINED / name
    p.parent.mkdir(parents=True, exist_ok=True)
    assert len(data) <= max(FILE_MAX, STDIO_MAX)
    with p.open('xb') as stream:
        stream.write(data)

def save(name, value):
    write(name, (json.dumps(value, sort_keys=True, indent=2) + '\n').encode())

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

def snapshot():
    names = git('ls-files', '-z').decode().split('\0')[:-1]
    assert len(names) == len(set(names)) and len(names) < 1000
    return [identity(name) for name in sorted(names)]

def copy_output(relative, destination):
    data = read_regular(relative)
    write(destination, data)
    return identity(relative)

def command(name, argv):
    # Capture original process streams. Oversize streams are explicitly refused,
    # never passed onward as complete output or uploaded as a successful record.
    started = now()
    began = time.monotonic()
    with tempfile.TemporaryFile() as stdout, tempfile.TemporaryFile() as stderr:
        result = subprocess.run(argv, cwd=ROOT, stdout=stdout, stderr=stderr)
        row = {'name': name, 'argv': argv, 'started_at': started, 'ended_at': now(),
            'elapsed_seconds': time.monotonic() - began, 'exit_code': result.returncode,
            'streams_complete_in_artifact': True}
        for label, stream in [('stdout', stdout), ('stderr', stderr)]:
            length = stream.tell()
            stream.seek(0)
            h = hashlib.sha256()
            for block in iter(lambda: stream.read(1024 * 1024), b''):
                h.update(block)
            descriptor = {'bytes': length, 'sha256': h.hexdigest()}
            if length <= STDIO_MAX:
                stream.seek(0)
                relative = 'commands/' + name + '.' + label
                write(relative, stream.read())
                descriptor['path'] = relative
            else:
                row['streams_complete_in_artifact'] = False
                descriptor['refused_reason'] = 'stdio-exceeds-16777216-byte-artifact-bound'
            row[label] = descriptor
        COMMANDS.append(row)
        save('commands/' + name + '.json', row)
        assert row['streams_complete_in_artifact'], 'Original stdio exceeds artifact admission bound'
        return row

def must(name, argv):
    row = command(name, argv)
    assert row['exit_code'] == 0, name + ' failed; original status/stdio retained'
    return row


def main():
    assert len(sys.argv)==2 and sys.argv[1]==CONTRACT
    raw=read_regular(CONTRACT);request=json.loads(raw);save('input-contract.json',request)
    assert request['schema']=='lexlean-matmul/public-sdk-model-maintenance-input/1'
    assert request['qualification'] is False and request['root_reviewed'] is True and request['status']=='ready'
    parent=request['consumer_parent'];sdk_source=request['expected_sdk_source'];image=request['expected_sdk_image']
    assert all(type(v)is str and re.fullmatch('[0-9a-f]{40}',v)for v in[parent,sdk_source])
    assert type(image)is str and re.fullmatch(r'ghcr\.io/afflom/lexlean-matmul-sdk@sha256:[0-9a-f]{64}',image)
    assert os.environ.get('GITHUB_REPOSITORY')=='afflom/lexlean-matmul'
    assert os.environ.get('GITHUB_EVENT_NAME')=='push' and os.environ.get('GITHUB_REF')==BRANCH
    head=git('rev-parse','HEAD').decode().strip();head_tree=git('rev-parse','HEAD^{tree}').decode().strip()
    assert head==os.environ['GITHUB_SHA']==os.environ['GITHUB_WORKFLOW_SHA']
    assert git('rev-list','--parents','-n','1','HEAD').decode().strip().split()==[head,parent]
    assert git('status','--porcelain','--untracked-files=all')==b''
    assert identity(HELPER)['sha256']==request['helper_sha256'] and identity(WORKFLOW)['sha256']==request['workflow_sha256']
    assert set(git('diff','--name-only',parent,'HEAD').decode().splitlines())=={HELPER,WORKFLOW,CONTRACT}
    parent_files=git('ls-tree','-r','--name-only','-z',parent).decode().split('\0')[:-1]
    rows=request['consumer_inputs'];assert type(rows)is list and 0<len(rows)<1000
    assert len({r['path']for r in rows})==len(rows) and {r['path']for r in rows}==set(parent_files)
    for row in rows:
        assert identity(row['path'])==row
        original=git('show',parent+':'+row['path']);assert len(original)==row['bytes'] and digest(original)==row['sha256']
        meta=git('ls-tree',parent,'--',row['path']).decode().split('\t')[0].split();assert meta[0]==row['git_mode'] and meta[1]=='blob'
    binding=request['canonical_binding'];assert type(binding)is dict and binding['sdk_source']==sdk_source and binding['sdk_image']==image
    assert len(binding['files'])==7 and {r['path']for r in binding['files']}==set(CANONICAL7)
    for row in binding['files']:assert identity(row['path'])==row
    lock=json.loads(read_regular('prismpm.lock'));policy=json.loads(read_regular('template.lock'))
    assert lock['sdk_image']==policy['sdk_image']==image and {p['platform']for p in lock['platforms']}=={'linux/amd64','linux/arm64'}
    assert not (ROOT/'.prism/sdk').exists(),'Fresh owned checkout required; no replacement of prior SDK state'
    before=snapshot();save('tracked-before.json',before);before_map={r['path']:r for r in before}
    assert set(before_map)==set(parent_files)|{HELPER,WORKFLOW,CONTRACT}
    for relative in[HELPER,WORKFLOW,'Justfile','scripts/in-sdk.sh','AGENTS.md']:
        copy_output(relative,'authority/'+relative)
    save('execution.json',{'qualification':False,'consumer_parent':parent,'actual_helper_commit':head,
        'actual_helper_tree':head_tree,'sdk_source':sdk_source,'sdk_image':image,
        'helper':identity(HELPER),'workflow':identity(WORKFLOW),'contract_sha256':digest(raw),
        'context':{k:os.environ[k]for k in['GITHUB_REPOSITORY','GITHUB_SHA','GITHUB_REF','GITHUB_RUN_ID',
            'GITHUB_RUN_ATTEMPT','GITHUB_EVENT_NAME','GITHUB_WORKFLOW_REF','GITHUB_WORKFLOW_SHA']},
        'method':'Unchanged scripts/in-sdk.sh and public lock-selected SDK. Writable isolated hosted checkout is required by the owned model writer.',
        'bounds':'Whole hosted job180min. Original829 capture method retains complete streams up to16MiB per stream and refuses larger streams without claiming complete capture. Hosted cancellation can preclude final observation; no success without complete result/artifact.'})
    must('00-pull-locked-public-sdk',['docker','pull',image])
    inspected=must('01-inspect-locked-public-sdk',['docker','image','inspect',image])
    observed=json.loads((RETAINED/inspected['stdout']['path']).read_text());assert len(observed)==1
    assert observed[0]['Architecture']=='amd64' and observed[0]['Os']=='linux' and image in observed[0]['RepoDigests']
    assert observed[0]['Config']['Labels']['org.opencontainers.image.revision']==sdk_source
    must('02-actual-locked-fetch',['./scripts/in-sdk.sh','prismpm','fetch','--locked'])
    must('03-actual-model-writer',['./scripts/in-sdk.sh','just','model-write'])
    must('04-original-model-checks',['./scripts/in-sdk.sh','just','model'])
    after=snapshot();save('tracked-after.json',after);after_map={r['path']:r for r in after};assert before_map.keys()==after_map.keys()
    changed=[p for p in before_map if before_map[p]!=after_map[p]];assert set(changed)<=set(GENERATED),'Unexpected authored/canonical/source change'
    for row in binding['files']:assert identity(row['path'])==row
    assert git('ls-files','--others','--exclude-standard','-z')==b''
    patch=git('diff','--binary','--',*GENERATED);assert len(patch)<=FILE_MAX;write('generated-model.diff',patch)
    outputs=[copy_output(p,'generated/'+p)for p in GENERATED]
    for p in CANONICAL7:copy_output(p,'canonical-input/'+p)
    save('maintenance-output.json',{'qualification':False,'changed_tracked_paths':changed,'allowed_generated_paths':GENERATED,
        'generated_files':outputs,'all_authored_model_and_locks_unchanged':True,'canonical7_unchanged':True,
        'commands':COMMANDS,'scope':'Actual registered model writer and original model recipe through the future adopted public SDK only. No update-system, lock repair, source regeneration, fullVV, acceptance, commit, merge or publication.'})

if __name__=='__main__':
    RETAINED.mkdir(parents=True,exist_ok=False)
    outcome={'qualification':False,'status':'failed','started_at':now(),
        'scope':'Hosted model-maintenance evidence only; not SDK/consumer/release acceptance.'};code=1
    try:
        main();outcome['status']='actual-model-maintenance-complete-for-review';code=0
    except Exception as error:
        outcome['failure']={'type':type(error).__name__,'message':str(error)}
    finally:
        try:
            after=snapshot()
            if not (RETAINED/'tracked-after.json').exists():save('tracked-after.json',after)
            patch=git('diff','--binary');assert len(patch)<=FILE_MAX;write('all-tracked-changes.diff',patch)
            for relative in GENERATED:
                if (ROOT/relative).is_file():copy_output(relative,'final-observation/'+relative)
            save('final-observation.json',{'qualification':False,'tracked_after':after,
                'untracked_nonignored':git('ls-files','--others','--exclude-standard','-z').decode().split('\0')[:-1],
                'scope':'Actual final observation, including failed maintenance; no repaired/admitted result inferred.'})
        except Exception as error:
            code=1;outcome['status']='failed';outcome['final_observation_failure']={'type':type(error).__name__,'message':str(error)}
        outcome['ended_at']=now();outcome['command_exit_codes']=[{'name':r['name'],'exit_code':r['exit_code']}for r in COMMANDS]
        save('result.json',outcome);files=[]
        for p in sorted(RETAINED.rglob('*')):
            if p.is_file():
                assert not p.is_symlink() and p.stat().st_nlink==1;b=p.read_bytes();files.append({'path':str(p.relative_to(RETAINED)),'bytes':len(b),'sha256':digest(b)})
        assert len(files)<=64 and sum(r['bytes']for r in files)<=ARTIFACT_MAX
        save('artifact-manifest.json',{'schema':'lexlean-matmul/public-sdk-model-maintenance-artifact/1','qualification':False,'files':files,'max_files':64,'max_total_bytes':ARTIFACT_MAX})
        print(json.dumps(outcome))
    raise SystemExit(code)
