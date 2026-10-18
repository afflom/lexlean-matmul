import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { capabilityIds, canonical, confined, evidenceRoot, files, readJson, root, run, sdk, sha,
  sourceDigest, verificationDigest, writeJson } from './evidence.mjs';
import { deploymentMetadata, productionPolicy } from './system-model.mjs';

const phases = ['acceptance', 'deployment', 'publication'];
const hash = value => assert.match(value, /^[0-9a-f]{64}$/);
const sha1 = value => assert.match(value, /^[0-9a-f]{40}$/);

export function writePublicationFailure(name, code, error) {
  assert(productionPolicy().productionEvidenceFailureCodes.includes(code), 'publication failure code is absent from the authoritative model');
  writeJson(path.join(evidenceRoot, name), { schema: 'lexlean-matmul/publication-failure/1', status: 'failed',
    commit: run('git', ['rev-parse', 'HEAD']).trim(), source_digest: sourceDigest(), verification_digest: verificationDigest(),
    error: { code, message: String(error.message ?? error).slice(0, 4096) } });
}

export function currentMainPolicy({ commit, current, ref, branch, protectedRef }) {
  sha1(commit); sha1(current);
  assert.equal(ref, `refs/heads/${branch}`, 'publication-ref: deployment must use the modeled branch');
  assert.equal(protectedRef, 'true', 'publication-protection: deployment requires a protected branch');
  assert.equal(commit, current, 'publication-stale-main: execution commit is no longer current main');
  return { commit, current, ref, protected: true };
}

export function validateEvidenceWorkflow(workflow, policy, target) {
  const job = name => {
    const marker = `\n  ${name}:\n`, start = workflow.indexOf(marker);
    assert(start >= 0, `publication-workflow: missing ${name} job`);
    return workflow.slice(start + marker.length).split(/\n  [a-z][a-z-]*:\n/)[0];
  };
  for (const name of ['acceptance', 'deploy', 'verify-publication']) {
    const header = job(name).split('\n    steps:\n')[0];
    const conditions = [...header.matchAll(/^    if: (.*)$/gm)].map(row => row[1]);
    assert.deepEqual(conditions, name === 'deploy'
      ? [`github.ref == 'refs/heads/${target.branch}' && github.ref_protected && github.event_name != 'pull_request'`] : [],
    `publication-workflow: ${name} job condition differs from the modeled release`);
  }
  // This deliberately admits only the authored scalar and literal run forms.
  // Command text in an echo, comment, disabled step, or alternate shell is not execution.
  const executable = (body, name, commands, code, always = false) => {
    const steps = body.split(/\n      - /).filter(step => step.startsWith(`name: ${name}\n`));
    const fail = `${code}: executable ${name} step differs from the modeled gate`;
    assert.equal(steps.length, 1, fail);
    const step = steps[0], lines = step.split('\n');
    const conditions = [...step.matchAll(/^        if: (.*)$/gm)].map(row => row[1]);
    assert.deepEqual(conditions, always ? ['always()'] : [], fail);
    assert(!/^        (?:continue-on-error|shell|uses):/m.test(step), fail);
    const runLines = lines.flatMap((line, index) => /^        run: /.test(line) ? [index] : []);
    assert.equal(runLines.length, 1, fail);
    const index = runLines[0], scalar = lines[index].slice('        run: '.length);
    let actual;
    if (scalar === '|') {
      actual = [];
      for (const line of lines.slice(index + 1)) {
        if (!line.startsWith('          ')) break;
        actual.push(line.slice(10));
      }
    } else actual = [scalar];
    assert.deepEqual(actual, commands, fail);
    return body.indexOf(`name: ${name}\n`);
  };
  const requireUpload = (body, name, directory, { always = true, pages = false } = {}) => {
    const property = (step, key, indent = 8) => step.split('\n')
      .filter(line => line.startsWith(' '.repeat(indent) + key + ': ')).map(line => line.slice(indent + key.length + 2));
    const steps = body.split(/\n      - /).filter(step => pages ? step.startsWith('name: Upload the unchanged Pages artifact\n')
      : property(step, 'name', 10).includes(name));
    assert.equal(steps.length, 1, `publication-retention: expected one ${name} upload`);
    const step = steps[0];
    assert.deepEqual(property(step, 'if'), always ? ['always()'] : [], `publication-retention: ${name} condition differs`);
    assert.deepEqual(property(step, 'uses'), [pages ? target.uploadAction : target.bundleUploadAction], 'publication-retention: upload action differs');
    assert(!/^        (?:run|continue-on-error|shell):/m.test(step), 'publication-retention: upload action must execute and propagate failure');
    const lines = step.split('\n'), starts = lines.flatMap((line, index) => line === '        with:' ? [index] : []);
    assert.equal(starts.length, 1, 'publication-retention: upload input mapping differs');
    const inputs = [];
    for (const line of lines.slice(starts[0] + 1)) {
      if (!line.startsWith('          ')) break;
      inputs.push(line);
    }
    const inputBlock = inputs.join('\n');
    assert.deepEqual(property(inputBlock, 'path', 10), [directory], `publication-retention: ${name} has the wrong evidence directory`);
    assert.deepEqual(property(inputBlock, 'retention-days', 10), [String(policy.evidenceRetentionDays)], 'publication-retention: duration differs from the source model');
    const keys = inputs.map(line => /^          ([a-z-]+): /.exec(line)?.[1]);
    if (!pages) {
      assert.deepEqual(property(inputBlock, 'name', 10), [name], 'publication-retention: artifact name differs');
      assert.deepEqual(property(inputBlock, 'include-hidden-files', 10), ['true'], 'publication-retention: hidden evidence must be included');
      assert.deepEqual(property(inputBlock, 'if-no-files-found', 10), ['error'], 'publication-retention: absent evidence must fail');
    }
    assert.deepEqual(keys.sort(), (pages ? ['path', 'retention-days']
      : ['name', 'path', 'retention-days', 'include-hidden-files', 'if-no-files-found']).sort(), 'publication-retention: upload input keys differ');
  };
  for (const phase of phases) {
    const body = job(phase === 'publication' ? 'verify-publication' : phase === 'deployment' ? 'deploy' : phase);
    const names = { acceptance: 'Capture bounded acceptance observations and outcome',
      deployment: 'Capture the deployment freshness observation and outcome', publication: 'Capture both publication observations and outcome' };
    const url = phase === 'acceptance' ? '' : '$DEPLOYED_URL';
    executable(body, names[phase], [`./scripts/in-sdk.sh node scripts/publication-evidence.mjs capture ${phase} "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" "$GITHUB_SHA" "$JOB_STATUS" "${url}" "$NATIVE_ID" "$NATIVE_DIGEST" "$PAGES_ID"`],
      'publication-retention', true);
    requireUpload(body, `lexlean-matmul-${phase}-evidence`, `.prism/matmul/retained/${phase}`);
  }
  requireUpload(job('acceptance'), target.bundleName, target.bundleDirectory, { always: false });
  requireUpload(job('acceptance'), 'github-pages', target.directory, { always: false, pages: true });
  const deploy = job('deploy');
  if (policy.publicationRequiresCurrentMain) {
    const guard = executable(deploy, 'Require the accepted execution commit to remain current protected main',
      ['./scripts/in-sdk.sh node scripts/publication-evidence.mjs current-main "$GITHUB_SHA" "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" "$GITHUB_REF" "${{ github.ref_protected }}"'], 'publication-freshness');
    assert(guard < deploy.indexOf(`uses: ${target.deployAction}`),
      'publication-freshness: current-main check must precede deployment');
  }
  executable(job('verify-publication'), 'Verify the accepted OCI browser closure through the source-free SDK API',
    [`./scripts/in-sdk.sh node scripts/system-release.mjs verify-bundle ${target.bundleDirectory} "$DEPLOYED_URL"`], 'publication-source-free');
  executable(job('verify-publication'), 'Verify every published HTTPS byte against the uploaded archive',
    ['mkdir -p public', 'tar -xf .prism/pages-publication/artifact.tar -C public',
      './scripts/in-sdk.sh node scripts/verify-publication.mjs "$DEPLOYED_URL"'], 'publication-bytes');
  return true;
}

export function runPublicationReadinessChecks(build) {
  const target = deploymentMetadata(), policy = productionPolicy();
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/pages.yml'), 'utf8');
  validateEvidenceWorkflow(workflow, policy, target);
  const output = run(process.execPath, ['--test', '--test-reporter=tap', 'scripts/publication-evidence.test.mjs']);
  const counts = { tests: 44, suites: 0, pass: 44, fail: 0, cancelled: 0, skipped: 0, todo: 0 };
  for (const [name, expected] of Object.entries(counts)) {
    assert.deepEqual([...output.matchAll(new RegExp(`^# ${name} ([0-9]+)$`, 'gm'))].map(row => Number(row[1])),
      [expected], `publication-test-plan: ${name} must cover the complete registered owner`);
  }
  assert.deepEqual([...output.matchAll(/^1\.\.([0-9]+)$/gm)].map(row => Number(row[1])), [44]);
  assert.equal([...output.matchAll(/^ok [0-9]+ - /gm)].length, 44);
  return { schema: 'lexlean-matmul/production-publication-acceptance/1', id: 'MM-24', status: 'passed',
    build_id: build.build_id, workflow_sha256: sha(workflow), policy, tests: counts, transcript: output,
    scope: 'modeled-retention-and-predeployment-current-main-observation; live-publication-requires-main-workflow' };
}

function context(args) {
  const [runId, attempt, commit, status, url = '', nativeId = '', nativeDigest = '', pagesId = ''] = args;
  assert.match(runId, /^[1-9][0-9]*$/); assert.match(attempt, /^[1-9][0-9]*$/); sha1(commit);
  assert(['success', 'failure', 'cancelled'].includes(status), 'publication-status: unknown job outcome');
  const target = deploymentMetadata();
  assert.equal(run('git', ['rev-parse', 'HEAD']).trim(), commit, 'publication-commit: checkout differs from this run');
  if (url) assert.equal(url, target.url, 'publication-url: deployed URL differs from the source model');
  if (nativeId) assert.match(nativeId, /^[1-9][0-9]*$/);
  if (nativeDigest) hash(nativeDigest.replace(/^sha256:/, ''));
  if (pagesId) assert.match(pagesId, /^[1-9][0-9]*$/);
  return { run_id: runId, run_attempt: attempt, commit, job_status: status, url,
    workflow_url: `https://github.com/${target.repository}/actions/runs/${runId}/attempts/${attempt}`,
    native_artifact: { id: nativeId, digest: nativeDigest }, pages_artifact: { id: pagesId } };
}

function selectedEvidence(phase) {
  if (phase === 'deployment') return ['deployment-current-main.json'];
  const screenshotDirectory = path.join(evidenceRoot, 'runtime-oracle');
  const screenshots = fs.existsSync(screenshotDirectory) ? files(screenshotDirectory)
    .filter(row => /^(?:production|research)-[a-z-]+\.png$/.test(row.path)).map(row => `runtime-oracle/${row.path}`) : [];
  if (phase === 'publication') return ['native-bundle-browser-publication.json', 'publication.json',
    'native-bundle-browser-publication.failure.json', 'publication.failure.json', ...screenshots];
  const names = ['acceptance.json', 'pages.json', 'build.json', 'verify.json', 'source.json',
    'falsification.json', 'reproduction.json', 'system-release.json', 'system-release-build.json',
    'system-release-inspect.json', 'system-release-export.json'];
  for (const name of ['checks', 'runtime-oracle']) {
    const directory = path.join(evidenceRoot, name);
    if (fs.existsSync(directory)) names.push(...files(directory).filter(row => row.path.endsWith('.json')).map(row => `${name}/${row.path}`));
  }
  const acceptancePath = path.join(evidenceRoot, 'acceptance.json');
  if (fs.existsSync(acceptancePath)) {
    const acceptance = readJson(acceptancePath);
    if (Array.isArray(acceptance.evidence)) names.push(...acceptance.evidence.map(row => row.path));
  }
  return [...new Set([...names, ...screenshots])];
}

export function validateSuccessfulEvidence(phase, ci, directory = evidenceRoot) {
  for (const [value, pattern, name] of [
    [ci.native_artifact?.id, /^[1-9][0-9]*$/, 'native artifact ID'],
    [ci.native_artifact?.digest, /^(?:sha256:)?[0-9a-f]{64}$/, 'native artifact digest'],
    [ci.pages_artifact?.id, /^[1-9][0-9]*$/, 'Pages artifact ID'],
  ]) assert(typeof value === 'string' && pattern.test(value), `publication-artifact-identity: missing or invalid ${name}`);
  const read = name => readJson(confined(name, directory));
  if (phase === 'acceptance') {
    const acceptance = read('acceptance.json');
    assert.equal(acceptance.status, 'passed');
    assert.equal(acceptance.source_digest, sourceDigest());
    assert.equal(acceptance.verification_digest, verificationDigest());
    assert.deepEqual(acceptance.evidence.filter(row => row.path.startsWith('checks/')).map(row => row.path).sort(),
      capabilityIds().map(id => `checks/${id}.json`).sort(), 'publication-acceptance: incomplete capability closure');
    for (const row of acceptance.evidence) assert.equal(sha(fs.readFileSync(confined(row.path, directory))), row.sha256);
  } else if (phase === 'publication') {
    const native = read('native-bundle-browser-publication.json'), bytes = read('publication.json');
    assert.equal(native.commit, ci.commit);
    assert.equal(bytes.schema, 'lexlean-matmul/publication/1', 'publication-byte-receipt: unexpected observation schema');
    assert.equal(bytes.status, 'passed', 'publication-byte-receipt: the archive-byte observation did not pass');
    assert.equal(bytes.commit, ci.commit, 'publication-byte-receipt: the archive-byte observation belongs to another commit');
    assert.equal(bytes.source_digest, sourceDigest(), 'publication-byte-receipt: source identity differs');
    assert.equal(bytes.verification_digest, verificationDigest(), 'publication-byte-receipt: verification identity differs');
    assert.equal(native.observation.scope, 'browser-byte-integrity-only');
    assert.equal(native.browser_ui.status, 'passed');
    assert.equal(native.browser_ui.production.status, 'passed');
    const research = native.browser_ui.research;
    assert(Array.isArray(research), 'publication-research-closure: missing research verification');
    assert(typeof native.browser_ui.model_sha256 === 'string' && /^[0-9a-f]{64}$/.test(native.browser_ui.model_sha256),
      'publication-research-closure: missing actual model identity');
    assert.deepEqual(research.map(row => row.id), ['MM-25', 'MM-26', 'MM-27', 'MM-28', 'MM-29', 'MM-30', 'MM-31'],
      'publication-research-closure: incomplete research verification');
    for (const row of research) {
      assert(row.status === 'passed' && row.profile === 'prismpm/text-application/4'
        && row.model_id === native.browser_ui.model_sha256 && row.publication_url === ci.url
        && row.skipped === 0 && row.filtered === 0, 'publication-research-closure: stale, failed or omitted research work');
      if (['MM-30', 'MM-31'].includes(row.id)) assert.deepEqual(row.browsers?.map(browser => browser.engine),
        ['chromium', 'firefox', 'webkit'], 'publication-research-closure: missing browser engine');
    }
    assert.equal(native.observation.url, ci.url);
    assert.equal(bytes.url, ci.url);
    assert.deepEqual(native.observation.files.map(row => ({ path: row.path, bytes: row.size, sha256: row.digest.slice(7) })), bytes.assets);
    assert.equal(native.source_digest, sourceDigest());
    assert.equal(native.verification_digest, verificationDigest());
  } else {
    const current = read('deployment-current-main.json');
    assert.equal(current.status, 'passed');
    assert.equal(current.commit, ci.commit);
  }
}

export function captureEvidence(phase, ci, policy = productionPolicy()) {
  assert(phases.includes(phase));
  const output = path.join(evidenceRoot, 'retained', phase);
  fs.rmSync(output, { recursive: true, force: true }); fs.mkdirSync(output, { recursive: true });
  const receipt = { schema: 'lexlean-matmul/retained-ci-evidence/1', phase, ...ci,
    status: ci.job_status === 'success' ? 'passed' : 'failed', retention_days: policy.evidenceRetentionDays,
    source_digest: sourceDigest(), verification_digest: verificationDigest(),
    sdk_lock_sha256: sha(fs.readFileSync(path.join(root, 'prismpm.lock'))), files: [] };
  try {
    let total = 0;
    for (const name of selectedEvidence(phase)) {
      if (!fs.existsSync(path.join(evidenceRoot, name))) continue;
      const input = confined(name, evidenceRoot), bytes = fs.readFileSync(input);
      total += bytes.length;
      assert(total <= policy.evidenceMaximumBytes, 'publication-evidence-limit: selected evidence exceeds its modeled byte bound');
      if (name.endsWith('.json')) JSON.parse(bytes);
      else assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'publication-evidence-format: screenshot is not a PNG');
      const destination = path.join(output, 'observations', name);
      fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes);
      receipt.files.push({ path: `observations/${name}`, bytes: bytes.length, sha256: sha(bytes) });
    }
    if (ci.job_status === 'success') validateSuccessfulEvidence(phase, ci);
    else receipt.error = { code: 'evidence-job-failed', message: 'The preceding job did not complete its acceptance boundary.' };
    receipt.bytes = total;
    const bundlePath = path.join(root, deploymentMetadata().bundleDirectory, 'bundle.json');
    if (fs.existsSync(bundlePath)) {
      const bytes = fs.readFileSync(bundlePath), bundle = JSON.parse(bytes);
      assert.equal(bundle.commit, ci.commit);
      receipt.bundle = { sha256: sha(bytes), release_digest: bundle.release_digest, model_digest: bundle.model_digest,
        build_digest: bundle.build_digest, tree_digest: bundle.tree_digest, acceptance_sha256: bundle.acceptance_sha256 };
    }
    assert(total + Buffer.byteLength(canonical(receipt)) + 1 <= policy.evidenceMaximumBytes,
      'publication-evidence-limit: observations and receipt exceed their modeled byte bound');
  } catch (error) {
    receipt.status = 'failed';
    receipt.error = { code: 'publication-evidence-invalid', message: String(error.message).slice(0, 4096) };
    receipt.bytes = receipt.files.reduce((total, row) => total + row.bytes, 0);
    if (receipt.bytes + Buffer.byteLength(canonical(receipt)) + 1 > policy.evidenceMaximumBytes) {
      fs.rmSync(path.join(output, 'observations'), { recursive: true, force: true });
      receipt.files = []; receipt.bytes = 0;
    }
    writeJson(path.join(output, 'receipt.json'), receipt);
    throw error;
  }
  if (receipt.error) assert(policy.productionEvidenceFailureCodes.includes(receipt.error.code));
  writeJson(path.join(output, 'receipt.json'), receipt);
  return receipt;
}

async function checkCurrentMain(args) {
  const [commit, runId, attempt, ref, protectedRef] = args, target = deploymentMetadata(), policy = productionPolicy();
  sha1(commit); assert.match(runId, /^[1-9][0-9]*$/); assert.match(attempt, /^[1-9][0-9]*$/);
  const receipt = { schema: 'lexlean-matmul/current-main-publication/1', commit, run_id: runId, run_attempt: attempt,
    branch: target.branch, policy: policy.publicationRequiresCurrentMain, status: 'failed' };
  try {
    assert.equal(run('git', ['rev-parse', 'HEAD']).trim(), commit);
    assert(policy.publicationRequiresCurrentMain, 'publication-freshness: current-main policy must remain enabled');
    const response = await fetch(`https://api.github.com/repos/${target.repository}/git/ref/heads/${target.branch}`,
      { redirect: 'error', signal: AbortSignal.timeout(30000), headers: { accept: 'application/vnd.github+json' } });
    assert.equal(response.status, 200, 'publication-main-observation: could not observe current protected main');
    const observed = await response.json();
    assert.equal(observed.ref, `refs/heads/${target.branch}`);
    Object.assign(receipt, currentMainPolicy({ commit, current: observed.object.sha, ref, branch: target.branch, protectedRef }),
      { status: 'passed', observed_at: new Date().toISOString() });
  } catch (error) {
    receipt.error = { code: 'publication-current-main-refused', message: String(error.message).slice(0, 4096) };
    throw error;
  } finally { writeJson(path.join(evidenceRoot, 'deployment-current-main.json'), receipt); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  sdk();
  if (process.argv[2] === 'current-main') await checkCurrentMain(process.argv.slice(3));
  else {
    assert.equal(process.argv[2], 'capture');
    const receipt = captureEvidence(process.argv[3], context(process.argv.slice(4)));
    console.log(canonical({ phase: receipt.phase, status: receipt.status, files: receipt.files.length, bytes: receipt.bytes }));
  }
}
