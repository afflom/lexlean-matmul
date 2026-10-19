"""Orchestrate public locked-SDK regeneration; never implement SDK behavior."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import time

ROOT = Path.cwd().resolve()
RETAINED = ROOT / '.prism/matmul/source-regeneration-ci/retained'
EXPECTED_SOURCE = '829cde60b116e8083d89f10d1b6fb42f2b62f8c7'
EXPECTED_PARENT = 'b7e049668d0cd884c63b342e8c4453e20567baec'
BRANCH = 'refs/heads/ci/sdk-text-v4-source-regeneration-2026-10-19'
WORKFLOW = '.github/workflows/matmul-sdk-source-regeneration.yml'
HELPER = 'scripts/regenerate-system-ci.py'
CONTRACT = '.github/source-regeneration-input.json'
CANONICAL7 = ['.devcontainer/devcontainer.json', '.github/workflows/bootstrap.yml',
    '.github/workflows/prismpm.yml', '.github/workflows/template-update.yml',
    'prismpm.lock', 'standards.lock', 'template.lock']
GENERATED = ['src/MatmulSystem.lex.tex', 'lexlean.lock', 'CONFORMANCE.md', 'ERRORS.md']
STDIO_MAX = 16 * 1024 * 1024
FILE_MAX = 4 * 1024 * 1024
ARTIFACT_MAX = 256 * 1024 * 1024
COMMANDS = []

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

def sdk(name, arguments, preparation_refusal=False):
    row = command(name, ['./scripts/in-sdk.sh', *arguments])
    if row['exit_code'] == 0:
        return
    assert preparation_refusal and row['exit_code'] == 3, name + ' failed'
    value = json.loads((RETAINED / row['stdout']['path']).read_text())
    assert value['schema'] == 'prismpm/error-result/1'
    assert value['diagnostic']['code'] == 'PP2101'
    assert re.fullmatch(r'system release binds application model "sha256:[0-9a-f]{64}", but the imported application model is sha256:[0-9a-f]{64}',
        value['diagnostic']['message'])
    # This is an observed failed preparation call, not an accepted fetch.
    row['expected_preparation_refusal'] = value
    save('commands/' + name + '.preparation-refusal.json', value)
    assert (ROOT / '.prism/sdk/stdlib-manifest.json').is_file()

def validate_hydrated_inputs(lock):
    platform = [row for row in lock['platforms'] if row['platform'] == 'linux/amd64']
    assert len(platform) == 1
    source = [row for row in platform[0]['inventory'] if row['id'] == 'stdlib-sources']
    assert len(source) == 1 and re.fullmatch(r'sha256:[0-9a-f]{64}', source[0]['digest'])
    relative = '.prism/sdk/stdlib-manifest.json'
    raw = read_regular(relative)
    manifest = json.loads(raw)
    assert set(manifest) == {'schema', 'archive_sha256', 'files'}
    assert manifest['schema'] == 'prismpm/sdk-inputs/1'
    assert manifest['archive_sha256'] == source[0]['digest'].removeprefix('sha256:')
    rows = manifest['files']
    assert 0 < len(rows) <= 16384 and len({row['path'] for row in rows}) == len(rows)
    actual = []
    base = ROOT / '.prism/sdk/inputs'
    assert base.is_dir() and not base.is_symlink()
    for parent, directories, files in os.walk(base, followlinks=False):
        for name in directories + files:
            p = Path(parent) / name
            assert not p.is_symlink()
            if p.is_file():
                name = str(p.relative_to(base))
                data = read_regular('.prism/sdk/inputs/' + name)
                actual.append({'path': name, 'sha256': digest(data)})
            else:
                assert p.is_dir()
    assert sorted(actual, key=lambda row: row['path']) == sorted(rows, key=lambda row: row['path'])
    write('hydrated-sdk-input-manifest.json', raw)
    save('hydrated-sdk-input-validation.json', {'qualification': False,
        'manifest': identity(relative), 'locked_archive_digest': source[0]['digest'],
        'complete_file_count': len(actual), 'every_regular_file_sha256_matches': True,
        'scope': 'Read-only custody check of files installed by public locked fetch; no extraction or source replacement.'})

def main():
    assert len(sys.argv) == 2 and sys.argv[1] == CONTRACT
    contract_bytes = read_regular(CONTRACT)
    contract = json.loads(contract_bytes)
    write('input-contract.json', contract_bytes)
    assert contract['schema'] == 'lexlean-matmul/immutable-sdk-source-regeneration-input/1'
    assert contract['qualification'] is False
    assert contract['status'] == 'ready', 'Held until actual canonical seven-file SDK binding is reviewed'
    assert contract['consumer_parent'] == EXPECTED_PARENT and contract['expected_sdk_source'] == EXPECTED_SOURCE
    assert os.environ.get('GITHUB_REPOSITORY') == 'afflom/lexlean-matmul'
    assert os.environ.get('GITHUB_EVENT_NAME') == 'push' and os.environ.get('GITHUB_REF') == BRANCH
    execution = git('rev-parse', 'HEAD').decode().strip()
    assert execution == os.environ['GITHUB_SHA'] == os.environ['GITHUB_WORKFLOW_SHA']
    assert git('status', '--porcelain') == b''
    subprocess.run(['git', 'merge-base', '--is-ancestor', EXPECTED_PARENT, execution], check=True)
    before = snapshot()
    save('tracked-before.json', before)
    before_map = {row['path']: row for row in before}
    required = contract['authored_inputs']
    assert len(required) == 219 and len({row['path'] for row in required}) == 219
    for row in required:
        assert identity(row['path']) == {key: row[key] for key in ['path', 'bytes', 'sha256', 'git_mode']}
    binding = contract['canonical_binding']
    assert binding['sdk_source'] == EXPECTED_SOURCE
    assert {row['path'] for row in binding['files']} == set(CANONICAL7) and len(binding['files']) == 7
    for row in binding['files']:
        assert identity(row['path']) == row
    assert identity(HELPER)['sha256'] == contract['helper_sha256']
    assert identity(WORKFLOW)['sha256'] == contract['workflow_sha256']
    copy_output(HELPER, 'authority/regenerate-system-ci.py')
    copy_output(WORKFLOW, 'authority/matmul-sdk-source-regeneration.yml')
    assert set(before_map) == {row['path'] for row in required} | set(CANONICAL7) | {HELPER, WORKFLOW, CONTRACT}
    allowed_branch_delta = set(CANONICAL7) | {'src/MatmulSystem.lex.tex', HELPER, WORKFLOW, CONTRACT}
    assert set(git('diff', '--name-only', EXPECTED_PARENT, 'HEAD').decode().splitlines()) <= allowed_branch_delta
    assert not (ROOT / '.prism/sdk').exists(), 'Use a fresh checkout; never replace SDK input state'
    lock = json.loads(read_regular('prismpm.lock'))
    policy = json.loads(read_regular('template.lock'))
    image = lock['sdk_image']
    assert image == policy['sdk_image'] == binding['sdk_image']
    assert re.fullmatch(r'ghcr\.io/afflom/lexlean-matmul-sdk@sha256:[0-9a-f]{64}', image)
    assert {p['platform'] for p in lock['platforms']} == {'linux/amd64', 'linux/arm64'}
    save('execution.json', {'qualification': False, 'source_commit': execution,
        'consumer_parent': EXPECTED_PARENT, 'expected_sdk_source': EXPECTED_SOURCE,
        'input_contract_sha256': digest(contract_bytes), 'helper': identity(HELPER),
        'workflow': identity(WORKFLOW), 'sdk_image': image,
        'context': {key: os.environ[key] for key in ['GITHUB_REPOSITORY', 'GITHUB_SHA',
            'GITHUB_REF', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_EVENT_NAME',
            'GITHUB_WORKFLOW_REF', 'GITHUB_WORKFLOW_SHA']}})
    must('00-pull-locked-sdk', ['docker', 'pull', image])
    inspect = must('01-inspect-locked-sdk', ['docker', 'image', 'inspect', image])
    observed = json.loads((RETAINED / inspect['stdout']['path']).read_text())
    assert len(observed) == 1 and observed[0]['Architecture'] == 'amd64' and observed[0]['Os'] == 'linux'
    assert observed[0]['Config']['Labels']['org.opencontainers.image.revision'] == EXPECTED_SOURCE
    sdk('02-bootstrap-fetch', ['prismpm', '--json', 'fetch', '--locked'], preparation_refusal=True)
    validate_hydrated_inputs(lock)
    # The existing updater owns its public lexlean-lock calls and computed
    # application-binding repair. No handwritten mutation or alternate model.
    sdk('03-update-system', ['node', 'scripts/update-system.mjs'])
    sdk('04-final-fetch', ['prismpm', '--json', 'fetch', '--locked'])
    sdk('05-model-write', ['just', 'model-write'])
    after = snapshot()
    save('tracked-after.json', after)
    after_map = {row['path']: row for row in after}
    assert before_map.keys() == after_map.keys()
    changed = [name for name in before_map if before_map[name] != after_map[name]]
    assert set(changed) <= set(GENERATED), 'Unexpected tracked source change'
    assert git('ls-files', '--others', '--exclude-standard', '-z') == b''
    diff = git('diff', '--binary', '--', *GENERATED)
    assert len(diff) <= FILE_MAX
    write('generated-source.diff', diff)
    outputs = [copy_output(name, 'generated/' + name) for name in GENERATED]
    for name in CANONICAL7:
        copy_output(name, 'canonical-input/' + name)
    native = copy_output('.prism/matmul/native-system-input.json', 'native-system-input.json')
    native_value = json.loads(read_regular('.prism/matmul/native-system-input.json'))
    assert native_value['schema'] == 'lexlean-matmul/native-system-input/1'
    assert native_value['source_sha256'] == after_map['src/MatmulSystem.lex.tex']['sha256']
    assert native_value['application_model_digest'] == 'sha256:' + native_value['check']['model_id']
    save('generated-output.json', {'qualification': False, 'changed_tracked_paths': changed,
        'allowed_generated_paths': GENERATED, 'generated_files': outputs,
        'native_system_input': native, 'commands': COMMANDS,
        'scope': 'Reviewable source regeneration only; no complete acceptance, installation, merge or deployment.'})

if __name__ == '__main__':
    RETAINED.mkdir(parents=True, exist_ok=False)
    outcome = {'qualification': False, 'started_at': now(), 'status': 'failed',
        'scope': 'Temporary immutable SDK source regeneration only; no acceptance or release qualification.'}
    code = 1
    try:
        main()
        outcome['status'] = 'source-regenerated-for-review'
        code = 0
    except Exception as error:
        outcome['failure'] = {'type': type(error).__name__, 'message': str(error)}
    finally:
        try:
            after = snapshot()
            if not (RETAINED / 'tracked-after.json').exists():
                save('tracked-after.json', after)
            full_diff = git('diff', '--binary')
            assert len(full_diff) <= FILE_MAX
            write('all-tracked-changes.diff', full_diff)
            partial_outputs = []
            for name in GENERATED + ['.prism/matmul/native-system-input.json']:
                if (ROOT / name).exists():
                    partial_outputs.append(copy_output(name, 'final-observation/' + name))
            save('final-observation.json', {'qualification': False,
                'note': 'Actual final filesystem observation, including failed preparation; not an accepted generated result.',
                'tracked_after': after, 'files': partial_outputs,
                'untracked_nonignored': git('ls-files', '--others', '--exclude-standard', '-z').decode().split('\0')[:-1]})
        except Exception as error:
            code = 1
            outcome['status'] = 'failed'
            outcome['final_observation_failure'] = {'type': type(error).__name__, 'message': str(error)}
        outcome['ended_at'] = now()
        outcome['command_exit_codes'] = [{'name': row['name'], 'exit_code': row['exit_code']} for row in COMMANDS]
        save('result.json', outcome)
        rows = []
        for p in sorted(RETAINED.rglob('*')):
            if p.is_file():
                assert not p.is_symlink() and p.stat().st_nlink == 1
                data = p.read_bytes()
                rows.append({'path': str(p.relative_to(RETAINED)), 'bytes': len(data), 'sha256': digest(data)})
        assert len(rows) <= 64 and sum(row['bytes'] for row in rows) <= ARTIFACT_MAX
        save('artifact-manifest.json', {'schema': 'lexlean-matmul/source-regeneration-artifact/1',
            'qualification': False, 'files': rows, 'max_files': 64, 'max_total_bytes': ARTIFACT_MAX})
        print(json.dumps(outcome))
    raise SystemExit(code)
