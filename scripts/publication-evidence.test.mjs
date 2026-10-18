import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { root } from './evidence.mjs';
import { deploymentMetadata, productionPolicy } from './system-model.mjs';
import { currentMainPolicy, validateEvidenceWorkflow } from './publication-evidence.mjs';

const target = deploymentMetadata(), policy = productionPolicy();
const workflow = fs.readFileSync(path.join(root, '.github/workflows/pages.yml'), 'utf8');
const commit = 'a'.repeat(40), other = 'b'.repeat(40);
const current = () => ({ commit, current: commit, ref: `refs/heads/${target.branch}`, branch: target.branch, protectedRef: 'true' });

test('acceptance retention includes the complete referenced source-defensive receipt', () => {
  receiptFixture(`
    seedSuccessfulObservationMetadata('acceptance');
    const name = 'research-defensive/' + 'd'.repeat(64) + '/receipt.json';
    writeJson(path.join(evidenceRoot, name), { qualification: false, scope: 'test-only receipt retention metadata' });
    const acceptance = readJson(path.join(evidenceRoot, 'acceptance.json'));
    acceptance.evidence.push({ path: name, sha256: sha(fs.readFileSync(path.join(evidenceRoot, name))) });
    writeJson(path.join(evidenceRoot, 'acceptance.json'), acceptance);
    const captured = captureEvidence('acceptance', ci);
    const retained = captured.files.find(row => row.path === 'observations/' + name);
    assert(retained, 'research-retention: full referenced source-defensive receipt was omitted');
    assert.equal(retained.sha256, acceptance.evidence.at(-1).sha256);
    assert.deepEqual(readJson(path.join(evidenceRoot, 'retained/acceptance/observations', name)),
      readJson(path.join(evidenceRoot, name)));
  `);
});

test('publication retention includes research browser screenshots', () => {
  receiptFixture(`
    const name = 'runtime-oracle/research-webkit-mobile-case.png';
    fs.mkdirSync(path.dirname(path.join(evidenceRoot, name)), { recursive: true });
    // Signature-only bytes exercise packaging; this is not a rendered UI claim.
    const bytes = Buffer.from([137,80,78,71,13,10,26,10]);
    fs.writeFileSync(path.join(evidenceRoot, name), bytes);
    const captured = captureEvidence('publication', ci);
    const retained = captured.files.find(row => row.path === 'observations/' + name);
    assert(retained, 'research-retention: research browser screenshot was omitted');
    assert.equal(retained.sha256, sha(bytes));
    assert(fs.readFileSync(path.join(evidenceRoot, 'retained/publication/observations', name)).equals(bytes));
  `);
});

test('successful publication requires the complete current-model research closure', () => {
  receiptFixture(`
    seedSuccessfulObservationMetadata('publication');
    const name = path.join(evidenceRoot, 'native-bundle-browser-publication.json');
    const native = readJson(name), model = 'e'.repeat(64);
    native.browser_ui.model_sha256 = model;
    const complete = Array.from({ length: 7 }, (_, index) => ({
      id: 'MM-' + (25 + index), status: 'passed', profile: 'prismpm/text-application/4',
      model_id: model, publication_url: ci.url, skipped: 0, filtered: 0,
      ...(index >= 5 ? { browsers: ['chromium','firefox','webkit'].map(engine => ({ engine })) } : {}),
    }));
    native.browser_ui.research = complete;
    const mutations = [undefined, complete.slice(1),
      complete.map((row, index) => index ? row : { ...row, status: 'failed' }),
      complete.map((row, index) => index ? row : { ...row, model_id: 'f'.repeat(64) }),
      complete.map((row, index) => index ? row : { ...row, skipped: 1 }),
      complete.map((row, index) => index === 5 ? { ...row, browsers: row.browsers.slice(1) } : row),
    ];
    for (const research of mutations) {
      fs.writeFileSync(name, JSON.stringify({ ...native, browser_ui: { ...native.browser_ui, research } }));
      assert.throws(() => validateSuccessfulEvidence('publication', ci), /publication-research-closure:/);
    }
  `);
});

// Exercise the real writer in an isolated copy of its source authorities. These
// fixtures test failure retention; they never manufacture accepted math evidence.
function receiptFixture(body) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'matmul-publication-receipt-'));
  const authorities = new Set(['src', 'scripts', 'model', 'features', '.github', 'crates', 'xtask', '.cargo',
    'lexlean.toml', 'lexlean.lock', 'prismpm.toml', 'prismpm.lock', 'standards.lock', 'lean-toolchain',
    'lakefile.toml', 'lake-manifest.json', 'Justfile', 'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml',
    'rustfmt.toml', 'clippy.toml', 'deny.toml', 'template-contract.json', 'template.lock', 'AGENTS.md', 'VERIFICATION.md']);
  try {
    fs.cpSync(root, directory, { recursive: true,
      filter: input => input === root || authorities.has(path.relative(root, input).split(path.sep)[0]) });
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
      import assert from 'node:assert/strict';
      import fs from 'node:fs';
      import path from 'node:path';
      import { spawnSync } from 'node:child_process';
      import { captureEvidence, validateSuccessfulEvidence } from './scripts/publication-evidence.mjs';
      import { verifyPublishedBytes } from './scripts/verify-publication.mjs';
      import { verifyPublishedRuntime } from './scripts/system-release.mjs';
      import { productionPolicy, deploymentMetadata } from './scripts/system-model.mjs';
      import { capabilityIds, evidenceRoot, readJson, writeJson, sourceDigest, verificationDigest, sha } from './scripts/evidence.mjs';
      const policy = productionPolicy(), target = deploymentMetadata();
      const ci = { run_id: '123', run_attempt: '2', commit: '${commit}', job_status: 'failure', url: target.url,
        workflow_url: 'https://github.com/' + target.repository + '/actions/runs/123/attempts/2',
        native_artifact: { id: '456', digest: 'sha256:' + 'c'.repeat(64) }, pages_artifact: { id: '789' } };
      function researchPublicationMetadata() {
        const model = 'e'.repeat(64);
        return { model_sha256: model, research: Array.from({ length: 7 }, (_, index) => ({
          qualification: false, id: 'MM-' + (25 + index), status: 'passed', profile: 'prismpm/text-application/4',
          model_id: model, publication_url: ci.url, skipped: 0, filtered: 0,
          ...(index >= 5 ? { browsers: ['chromium','firefox','webkit'].map(engine => ({ engine })) } : {}),
        })) };
      }
      function seedSuccessfulObservationMetadata(phase) {
        // Test-only receipt metadata, never mathematical or SDK qualification.
        const identity = { qualification: false, commit: ci.commit,
          source_digest: sourceDigest(), verification_digest: verificationDigest() };
        if (phase === 'acceptance') {
          const evidence = capabilityIds().map(id => {
            const name = 'checks/' + id + '.json';
            writeJson(path.join(evidenceRoot, name), { qualification: false, id, status: 'fixture-only' });
            return { path: name, sha256: sha(fs.readFileSync(path.join(evidenceRoot, name))) };
          });
          writeJson(path.join(evidenceRoot, 'acceptance.json'), { ...identity, status: 'passed', evidence });
        } else if (phase === 'deployment') {
          writeJson(path.join(evidenceRoot, 'deployment-current-main.json'), { ...identity, status: 'passed' });
        } else {
          const assets = ['app.css', 'app.js', 'index.html', 'lexlean_matmul.js', 'lexlean_matmul_bg.wasm', 'provenance.json']
            .map(name => ({ path: name, bytes: 1, sha256: 'd'.repeat(64) }));
          writeJson(path.join(evidenceRoot, 'native-bundle-browser-publication.json'), { ...identity,
            observation: { scope: 'browser-byte-integrity-only', url: ci.url,
              files: assets.map(row => ({ path: row.path, size: row.bytes, digest: 'sha256:' + row.sha256 })) },
            browser_ui: { status: 'passed', production: { status: 'passed' }, ...researchPublicationMetadata() } });
          writeJson(path.join(evidenceRoot, 'publication.json'), { ...identity,
            schema: 'lexlean-matmul/publication/1', status: 'passed', url: ci.url, assets });
        }
      }
      function initializeFixtureCommit() {
        for (const args of [['init', '--quiet'], ['-c', 'user.name=Receipt fixture', '-c', 'user.email=fixture@example.invalid',
          'commit', '--quiet', '--allow-empty', '-m', 'test-only publication fixture']]) {
          const child = spawnSync('git', args, { encoding: 'utf8' });
          assert.equal(child.status, 0, child.stderr);
        }
      }
      function archiveFixture() {
        initializeFixtureCommit();
        const content = new Map(['app.css', 'app.js', 'index.html', 'lexlean_matmul.js', 'lexlean_matmul_bg.wasm', 'provenance.json']
          .map(name => [name, Buffer.from('test-only byte consumer fixture: ' + name)]));
        fs.mkdirSync(target.directory, { recursive: true });
        for (const [name, bytes] of content) fs.writeFileSync(path.join(target.directory, name), bytes);
        let mode = 'success', calls = 0;
        globalThis.fetch = async address => {
          calls++; const name = new URL(address).pathname.split('/').at(-1), original = content.get(name);
          assert(original, 'unexpected fixture fetch');
          if (mode === 'http') return new Response('absent', { status: 404 });
          let body = Buffer.from(original);
          if (mode === 'overrun') body = Buffer.concat([body, Buffer.from('extra')]);
          if (mode === 'digest') body[0] ^= 1;
          return new Response(body, { status: 200 });
        };
        return { setMode(value) { mode = value; calls = 0; }, calls() { return calls; } };
      }
      function assertConsumerFailure(name, code, successName) {
        assert.equal(fs.existsSync(path.join(evidenceRoot, successName)), false, 'stale success observation survived');
        const bytes = fs.readFileSync(path.join(evidenceRoot, name)), receipt = JSON.parse(bytes);
        assert.equal(receipt.status, 'failed'); assert.equal(receipt.error.code, code);
        assert(policy.productionEvidenceFailureCodes.includes(code));
        assert(receipt.error.message.length > 0 && receipt.error.message.length <= 4096);
        assert(bytes.length <= policy.evidenceMaximumBytes);
        assert.equal(receipt.source_digest, sourceDigest()); assert.equal(receipt.verification_digest, verificationDigest());
        assert.match(receipt.commit, /^[0-9a-f]{40}$/);
        return receipt;
      }
      ${body}
    `], { cwd: directory, encoding: 'utf8', timeout: 30000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `receipt fixture failed:\n${result.stdout}\n${result.stderr}`);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('publication accepts current protected modeled main', () => {
  assert.equal(currentMainPolicy(current()).current, commit);
});
test('publication refuses a superseded execution commit', () => {
  assert.throws(() => currentMainPolicy({ ...current(), current: other }), /publication-stale-main/);
});
test('publication refuses a different branch', () => {
  assert.throws(() => currentMainPolicy({ ...current(), ref: 'refs/heads/other' }), /publication-ref/);
});
test('publication refuses an unprotected branch', () => {
  assert.throws(() => currentMainPolicy({ ...current(), protectedRef: 'false' }), /publication-protection/);
});
test('publication refuses an unobserved or malformed current commit', () => {
  assert.throws(() => currentMainPolicy({ ...current(), current: '' }));
});
test('actual Pages workflow retains all modeled evidence and source-free checks', () => {
  assert.equal(validateEvidenceWorkflow(workflow, policy, target), true);
});
test('actual native bundle retention cannot be reduced to one day', () => {
  const mutant = workflow.replace(`retention-days: ${policy.evidenceRetentionDays}`, 'retention-days: 1');
  assert.notEqual(mutant, workflow);
  assert.throws(() => validateEvidenceWorkflow(mutant, policy, target), /publication-retention/);
});
test('actual failed-gate evidence upload cannot be made conditional on success', () => {
  const marker = 'name: Retain acceptance observations, including failed gates\n        if: always()';
  const mutant = workflow.replace(marker, marker.replace('if: always()', 'if: success()'));
  assert.notEqual(mutant, workflow);
  assert.throws(() => validateEvidenceWorkflow(mutant, policy, target), /publication-retention/);
});
test('actual final publication observations cannot be omitted', () => {
  const mutant = workflow.replace('publication-evidence.mjs capture publication', 'echo omitted-publication-capture');
  assert.notEqual(mutant, workflow);
  assert.throws(() => validateEvidenceWorkflow(mutant, policy, target), /publication-retention/);
});
test('actual current-main check cannot be removed', () => {
  const mutant = workflow.replace('publication-evidence.mjs current-main', 'echo removed-current-main');
  assert.notEqual(mutant, workflow);
  assert.throws(() => validateEvidenceWorkflow(mutant, policy, target), /publication-freshness/);
});
test('actual source-free publication verification cannot be removed', () => {
  const mutant = workflow.replace(`system-release.mjs verify-bundle ${target.bundleDirectory}`, 'echo removed-source-free-check');
  assert.notEqual(mutant, workflow);
  assert.throws(() => validateEvidenceWorkflow(mutant, policy, target), /publication-source-free/);
});
test('actual final archive-byte comparison cannot be removed', () => {
  const mutant = workflow.replace('scripts/verify-publication.mjs', 'scripts/omitted-byte-check.mjs');
  assert.notEqual(mutant, workflow);
  assert.throws(() => validateEvidenceWorkflow(mutant, policy, target), /publication-bytes/);
});
test('a printed current-main command cannot satisfy the deployment gate', () => {
  const marker = 'run: ./scripts/in-sdk.sh node scripts/publication-evidence.mjs current-main';
  const mutant = workflow.replace(marker, marker.replace('run: ', 'run: echo '));
  assert.notEqual(mutant, workflow);
  assert.throws(() => validateEvidenceWorkflow(mutant, policy, target), /publication-freshness: executable/);
});
test('a printed publication capture cannot satisfy durable evidence', () => {
  const marker = 'run: ./scripts/in-sdk.sh node scripts/publication-evidence.mjs capture publication';
  const mutant = workflow.replace(marker, marker.replace('run: ', 'run: echo '));
  assert.notEqual(mutant, workflow);
  assert.throws(() => validateEvidenceWorkflow(mutant, policy, target), /publication-retention: executable/);
});
test('a commented current-main command cannot satisfy the deployment gate', () => {
  const marker = '        run: ./scripts/in-sdk.sh node scripts/publication-evidence.mjs current-main';
  const mutant = workflow.replace(marker, marker.replace('        run:', '        # run:'));
  assert.notEqual(mutant, workflow);
  assert.throws(() => validateEvidenceWorkflow(mutant, policy, target), /publication-freshness: executable/);
});
test('a disabled current-main step cannot satisfy the deployment gate', () => {
  const marker = '        run: ./scripts/in-sdk.sh node scripts/publication-evidence.mjs current-main';
  const mutant = workflow.replace(marker, '        if: false\n' + marker);
  assert.notEqual(mutant, workflow);
  assert.throws(() => validateEvidenceWorkflow(mutant, policy, target), /publication-freshness: executable/);
});
test('a success-only capture cannot retain failed publication observations', () => {
  const marker = 'name: Capture both publication observations and outcome\n        if: always()';
  const mutant = workflow.replace(marker, marker.replace('always()', 'success()'));
  assert.notEqual(mutant, workflow);
  assert.throws(() => validateEvidenceWorkflow(mutant, policy, target), /publication-retention: executable/);
});
test('a printed source-free verification cannot satisfy live publication', () => {
  const marker = 'run: ./scripts/in-sdk.sh node scripts/system-release.mjs verify-bundle';
  const mutant = workflow.replace(marker, marker.replace('run: ', 'run: echo '));
  assert.notEqual(mutant, workflow);
  assert.throws(() => validateEvidenceWorkflow(mutant, policy, target), /publication-source-free: executable/);
});
test('a printed archive-byte command cannot satisfy live publication', () => {
  const marker = '          ./scripts/in-sdk.sh node scripts/verify-publication.mjs';
  const mutant = workflow.replace(marker, marker.replace('./scripts/', 'echo ./scripts/'));
  assert.notEqual(mutant, workflow);
  assert.throws(() => validateEvidenceWorkflow(mutant, policy, target), /publication-bytes: executable/);
});
test('a disabled evidence upload cannot hide its condition in a comment', () => {
  const marker = 'name: Retain final publication observations, including failed checks\n        if: always()';
  const mutant = workflow.replace(marker, marker.replace('if: always()', 'if: false # if: always()'));
  assert.notEqual(mutant, workflow);
  assert.throws(() => validateEvidenceWorkflow(mutant, policy, target), /publication-retention:.*condition/);
});
test('a wrong evidence upload path cannot hide the expected path in a comment', () => {
  const marker = '          path: .prism/matmul/retained/publication';
  const mutant = workflow.replace(marker, '          path: absent # path: .prism/matmul/retained/publication');
  assert.notEqual(mutant, workflow);
  assert.throws(() => validateEvidenceWorkflow(mutant, policy, target), /publication-retention:.*directory/);
});
test('a no-op upload command cannot hide the pinned action in a comment', () => {
  const marker = `        uses: ${target.bundleUploadAction}`;
  const index = workflow.lastIndexOf(marker);
  assert(index > 0);
  const mutant = workflow.slice(0, index) + workflow.slice(index).replace(marker, `        run: echo retained # uses: ${target.bundleUploadAction}`);
  assert.throws(() => validateEvidenceWorkflow(mutant, policy, target), /publication-retention:.*action/);
});
test('the actual Pages archive cannot expire before the modeled evidence period', () => {
  const marker = `path: ${target.directory}\n          retention-days: ${policy.evidenceRetentionDays}`;
  const mutant = workflow.replace(marker, marker.replace(`retention-days: ${policy.evidenceRetentionDays}`, 'retention-days: 1'));
  assert.notEqual(mutant, workflow);
  assert.throws(() => validateEvidenceWorkflow(mutant, policy, target), /publication-retention:.*duration/);
});
test('the native bundle upload cannot select another directory', () => {
  const mutant = workflow.replace(`path: ${target.bundleDirectory}`, 'path: absent-native-bundle');
  assert.notEqual(mutant, workflow);
  assert.throws(() => validateEvidenceWorkflow(mutant, policy, target), /publication-retention:.*directory/);
});
test('the native bundle upload cannot select another action', () => {
  const mutant = workflow.replace(`uses: ${target.bundleUploadAction}`, 'uses: example/omitted@' + '0'.repeat(40));
  assert.notEqual(mutant, workflow);
  assert.throws(() => validateEvidenceWorkflow(mutant, policy, target), /publication-retention:.*action/);
});
test('the native bundle upload cannot be disabled', () => {
  const marker = '        id: native-release\n';
  const mutant = workflow.replace(marker, marker + '        if: false\n');
  assert.notEqual(mutant, workflow);
  assert.throws(() => validateEvidenceWorkflow(mutant, policy, target), /publication-retention:.*condition/);
});
test('the deployment job cannot hide a disabled condition behind the modeled guard', () => {
  const marker = `    if: github.ref == 'refs/heads/${target.branch}' && github.ref_protected && github.event_name != 'pull_request'`;
  const mutant = workflow.replace(marker, marker.replace('if: ', 'if: false # '));
  assert.notEqual(mutant, workflow);
  assert.throws(() => validateEvidenceWorkflow(mutant, policy, target), /publication-workflow:.*condition/);
});
test('a failed deployment retains its real typed observation, run identity and byte hashes', () => receiptFixture(`
  const observation = { status: 'failed', commit: ci.commit, error: { code: 'publication-current-main-refused' } };
  writeJson(path.join(evidenceRoot, 'deployment-current-main.json'), observation);
  const receipt = captureEvidence('deployment', ci);
  assert.equal(receipt.status, 'failed'); assert.equal(receipt.error.code, 'evidence-job-failed');
  assert.equal(receipt.run_id, '123'); assert.equal(receipt.run_attempt, '2'); assert.equal(receipt.commit, ci.commit);
  assert.equal(receipt.source_digest, sourceDigest()); assert.equal(receipt.verification_digest, verificationDigest());
  assert.equal(receipt.retention_days, policy.evidenceRetentionDays); assert.equal(receipt.native_artifact.id, '456');
  assert.equal(receipt.files.length, 1);
  const copied = fs.readFileSync(path.join(evidenceRoot, 'retained/deployment', receipt.files[0].path));
  assert.equal(sha(copied), receipt.files[0].sha256); assert.equal(copied.length, receipt.files[0].bytes);
  assert.deepEqual(JSON.parse(copied), observation);
`));
test('a successful job with absent publication observations retains failure and refuses acceptance', () => receiptFixture(`
  assert.throws(() => captureEvidence('publication', { ...ci, job_status: 'success' }), /ENOENT/);
  const receipt = readJson(path.join(evidenceRoot, 'retained/publication/receipt.json'));
  assert.equal(receipt.status, 'failed'); assert.equal(receipt.error.code, 'publication-evidence-invalid');
  assert.deepEqual(receipt.files, []); assert.equal(receipt.commit, ci.commit);
`));
test('oversized selected observations produce a bounded failed receipt', () => receiptFixture(`
  writeJson(path.join(evidenceRoot, 'deployment-current-main.json'), { payload: 'x'.repeat(4096) });
  const bound = 2048;
  assert.throws(() => captureEvidence('deployment', ci, { ...policy, evidenceMaximumBytes: bound }), /publication-evidence-limit/);
  const directory = path.join(evidenceRoot, 'retained/deployment');
  const receipt = readJson(path.join(directory, 'receipt.json'));
  assert.equal(receipt.status, 'failed'); assert.equal(receipt.error.code, 'publication-evidence-invalid');
  assert.deepEqual(receipt.files, []); assert.equal(receipt.bytes, 0);
  assert(fs.statSync(path.join(directory, 'receipt.json')).size <= bound);
`));
test('a native bundle from another commit cannot receive this run identity', () => receiptFixture(`
  writeJson(path.join(evidenceRoot, 'deployment-current-main.json'), { status: 'failed', commit: ci.commit });
  writeJson(path.join(target.bundleDirectory, 'bundle.json'), { commit: '${other}' });
  assert.throws(() => captureEvidence('deployment', ci), /Expected values to be strictly equal/);
  const receipt = readJson(path.join(evidenceRoot, 'retained/deployment/receipt.json'));
  assert.equal(receipt.status, 'failed'); assert.equal(receipt.error.code, 'publication-evidence-invalid');
  assert.equal(receipt.commit, ci.commit); assert.equal(receipt.bundle, undefined);
`));
test('the independent archive-byte receipt must retain successful status and this revision', () => receiptFixture(`
  const assets = ['app.css', 'app.js', 'index.html', 'lexlean_matmul.js', 'lexlean_matmul_bg.wasm', 'provenance.json']
    .map(name => ({ path: name, bytes: 1, sha256: 'd'.repeat(64) }));
  const identity = { commit: ci.commit, source_digest: sourceDigest(), verification_digest: verificationDigest() };
  const native = { ...identity, observation: { scope: 'browser-byte-integrity-only', url: ci.url,
    files: assets.map(row => ({ path: row.path, size: row.bytes, digest: 'sha256:' + row.sha256 })) },
    browser_ui: { status: 'passed', production: { status: 'passed', skipped: 0, filtered: 0 }, ...researchPublicationMetadata() } };
  const bytes = { ...identity, schema: 'lexlean-matmul/publication/1', status: 'passed', url: ci.url, assets };
  writeJson(path.join(evidenceRoot, 'native-bundle-browser-publication.json'), native);
  const write = value => writeJson(path.join(evidenceRoot, 'publication.json'), value);
  write(bytes); validateSuccessfulEvidence('publication', ci);
  for (const changed of [{ status: 'failed' }, { commit: '${other}' }, { source_digest: 'e'.repeat(64) },
    { verification_digest: 'f'.repeat(64) }]) {
    write({ ...bytes, ...changed });
    assert.throws(() => validateSuccessfulEvidence('publication', ci), /publication-byte-receipt:/);
  }
`));
test('the actual HTTPS byte consumer refuses a different URL before fetching and retires success', () => receiptFixture(`
  const fixture = archiveFixture(); await verifyPublishedBytes(target.url);
  fixture.setMode('success');
  await assert.rejects(() => verifyPublishedBytes('https://example.invalid/elsewhere/'));
  assert.equal(fixture.calls(), 0);
  assertConsumerFailure('publication.failure.json', 'publication-url-refused', 'publication.json');
`));
test('the actual HTTPS byte consumer records HTTP404 and retires success', () => receiptFixture(`
  const fixture = archiveFixture(); await verifyPublishedBytes(target.url); fixture.setMode('http');
  await assert.rejects(() => verifyPublishedBytes(target.url), /app.css/);
  assert.equal(fixture.calls(), 1);
  assertConsumerFailure('publication.failure.json', 'publication-http-failed', 'publication.json');
`));
test('the actual HTTPS byte consumer bounds an oversized body and retires success', () => receiptFixture(`
  const fixture = archiveFixture(); await verifyPublishedBytes(target.url); fixture.setMode('overrun');
  await assert.rejects(() => verifyPublishedBytes(target.url), /exceeds its accepted byte length/);
  assertConsumerFailure('publication.failure.json', 'publication-integrity-failed', 'publication.json');
`));
test('the actual HTTPS byte consumer refuses a changed digest and retires success', () => receiptFixture(`
  const fixture = archiveFixture(); await verifyPublishedBytes(target.url); fixture.setMode('digest');
  await assert.rejects(() => verifyPublishedBytes(target.url), /app.css/);
  assertConsumerFailure('publication.failure.json', 'publication-integrity-failed', 'publication.json');
`));
test('the owning browser failure boundary records runtime failure and retires success', () => receiptFixture(`
  initializeFixtureCommit();
  writeJson(path.join(evidenceRoot, 'native-bundle-browser-publication.json'), { status: 'stale test-only success' });
  let observed = false;
  const artifacts = { directory: 'test-only fixture', model: {}, url: target.url };
  await assert.rejects(() => verifyPublishedRuntime(artifacts, async actual => {
    observed = true; assert.equal(actual, artifacts);
    throw new Error('test-only browser process failed: ' + 'x'.repeat(8192));
  }), /test-only browser process failed/);
  assert(observed, 'the browser consumer was not invoked');
  const receipt = assertConsumerFailure('native-bundle-browser-publication.failure.json', 'publication-runtime-failed',
    'native-bundle-browser-publication.json');
  assert.equal(receipt.error.message.length, 4096);
`));
for (const [name, invalid] of [
  ['native artifact ID', "{ ...ci, native_artifact: { ...ci.native_artifact, id: value } }"],
  ['native artifact digest', "{ ...ci, native_artifact: { ...ci.native_artifact, digest: value } }"],
  ['Pages artifact ID', "{ ...ci, pages_artifact: { id: value } }"],
]) {
  test('every successful phase requires its valid ' + name, () => receiptFixture(`
    for (const phase of ['acceptance', 'deployment', 'publication']) {
      seedSuccessfulObservationMetadata(phase);
      assert.equal(captureEvidence(phase, { ...ci, job_status: 'success' }).status, 'passed');
      for (const value of ['', 'invalid']) {
        const changed = ${invalid};
        assert.throws(() => captureEvidence(phase, { ...changed, job_status: 'success' }), /publication-artifact-identity:/);
        const receipt = readJson(path.join(evidenceRoot, 'retained', phase, 'receipt.json'));
        assert.equal(receipt.status, 'failed'); assert.equal(receipt.error.code, 'publication-evidence-invalid');
      }
    }
  `));
}
test('failed phases retain partial observations when no artifact was uploaded', () => receiptFixture(`
  writeJson(path.join(evidenceRoot, 'deployment-current-main.json'), { status: 'failed', commit: ci.commit });
  const receipt = captureEvidence('deployment', { ...ci, native_artifact: { id: '', digest: '' }, pages_artifact: { id: '' } });
  assert.equal(receipt.status, 'failed'); assert.equal(receipt.error.code, 'evidence-job-failed');
  assert.equal(receipt.native_artifact.id, ''); assert.equal(receipt.native_artifact.digest, '');
  assert.equal(receipt.pages_artifact.id, ''); assert.equal(receipt.files.length, 1);
`));
