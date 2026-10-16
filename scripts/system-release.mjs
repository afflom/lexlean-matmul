import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonical, capabilityIds, confined, evidenceRoot, files, freshBuild, readBuild, readJson, root, run,
  sdk, sha, sourceDigest, verificationDigest, writeJson } from './evidence.mjs';
import { deploymentMetadata, nativeSystemModel } from './system-model.mjs';
import { runPublishedBrowserChecks } from './browser-oracle.mjs';

const receiptPath = path.join(evidenceRoot, 'system-release.json');
const sourceFreePath = path.join(evidenceRoot, 'source-free-release');
const validationType = 'application/vnd.prismpm.validation.v1+json';
const digest = bytes => `sha256:${sha(bytes)}`;
const expectedFiles = directory => files(directory).map(row => ({
  path: row.path, size: row.bytes, digest: `sha256:${row.sha256}`,
}));

function blob(descriptor, layout = path.join(root, '.prism/oci')) {
  assert.match(descriptor.digest, /^sha256:[0-9a-f]{64}$/);
  const bytes = fs.readFileSync(confined(`blobs/sha256/${descriptor.digest.slice(7)}`, layout));
  assert.equal(bytes.length, descriptor.size);
  assert.equal(digest(bytes), descriptor.digest);
  return bytes;
}

function releaseValidation(inspection, release, buildRoot) {
  assert.equal(inspection.schema, 'prismpm/inspect-result/1');
  assert.equal(inspection.verified, true);
  assert.equal(inspection.root_digest, release.release_digest);
  const rows = inspection.referrers.filter(row => row.artifactType === validationType);
  assert.equal(rows.length, 1, 'Native release must retain one SDK validation referrer');
  const manifest = JSON.parse(blob(rows[0]));
  assert.equal(manifest.artifactType, validationType);
  assert.equal(manifest.subject.digest, release.release_digest);
  assert.equal(manifest.layers.length, 1);
  const validation = JSON.parse(blob(manifest.layers[0]));
  assert.equal(validation.schema, 'prismpm/release-validation/1');
  assert.equal(validation.subject, release.release_digest);
  assert.equal(validation.build_digest, release.build_digest);
  assert.equal(validation.result, 'passed');
  assert.equal(validation.oracle_results.length, 1, 'Browser-system /2 requires its locked SPDX oracle');
  const oracle = validation.oracle_results[0];
  assert.equal(oracle.schema, 'prismpm/validation-result/1');
  assert.equal(oracle.oracle, 'spdx-3.0.1-model');
  assert.equal(oracle.valid, true);
  assert.equal(oracle.subject, digest(fs.readFileSync(path.join(buildRoot, 'projections/spdx.json'))));
  const standards = readJson(path.join(root, 'standards.lock'));
  const locked = standards.oracles.find(row => row.id === oracle.oracle);
  assert(locked, 'SPDX oracle is absent from the locked standards authority');
  assert.equal(oracle.oracle_digest, digest(canonical(locked)));
  assert.deepEqual(oracle.covered, locked.covers);
  assert.deepEqual(oracle.uncovered, locked.does_not_cover);
  const statementBytes = fs.readFileSync(confined(oracle.evidence_path));
  assert.equal(oracle.attestation_digest, digest(statementBytes));
  const statement = JSON.parse(statementBytes);
  assert.equal(statement.predicate.oracle, oracle.oracle);
  assert.equal(statement.predicate.oracle_digest, oracle.oracle_digest);
  assert.equal(statement.predicate.normalized_result, 'valid');
  assert.equal(statement.subject[0].digest.sha256, oracle.subject.slice(7));
  return { validation, oracle, descriptor: rows[0] };
}

function validateExport(exported, release, inventory) {
  assert.equal(exported.schema, 'prismpm/browser-export/1');
  assert.equal(exported.release_digest, release.release_digest);
  assert.equal(exported.model_digest, release.model_digest);
  assert.equal(exported.build_digest, release.build_digest);
  assert.equal(exported.output, 'browser');
  assert.deepEqual(exported.files, inventory);
  assert.equal(exported.files.length, 6);
  assert.equal(exported.tree_digest, digest(canonical(exported.files)));
}

// Read acceptance evidence only. This never regenerates a model or release.
export function readSystemRelease(build = readBuild()) {
  sdk();
  const receipt = readJson(receiptPath);
  assert.equal(receipt.schema, 'lexlean-matmul/native-system-release/1');
  assert.equal(receipt.status, 'verified');
  assert.equal(receipt.source_digest, sourceDigest());
  assert.equal(receipt.verification_digest, verificationDigest());
  assert.equal(receipt.build_id, build.build_id);
  assert.equal(receipt.build_result_sha256, sha(fs.readFileSync(path.join(evidenceRoot, 'build.json'))));
  assert.equal(receipt.verify_result_sha256, sha(fs.readFileSync(path.join(evidenceRoot, 'verify.json'))));
  const release = receipt.release;
  assert.equal(release.schema, 'prismpm/product-release-result/1');
  assert.equal(release.model_digest, nativeSystemModel().manifest.applicationModelDigest);
  assert.equal(release.model_digest, digest(fs.readFileSync(confined(build.model_path))));
  assert.equal(release.build_digest, digest(fs.readFileSync(confined(build.manifest_path))));
  assert.deepEqual(readJson(confined(release.evidence_path)), release);
  assert.equal(receipt.reference, `ghcr.io/${deploymentMetadata().repository}@${release.release_digest}`);
  assert.equal(receipt.export_directory, '.prism/matmul/source-free-release/browser');
  const sourceFree = confined('.prism/matmul/source-free-release');
  assert.deepEqual(fs.readdirSync(sourceFree).sort(), ['.prism', 'browser']);
  assert.deepEqual(fs.readdirSync(path.join(sourceFree, '.prism')).sort(), ['oci']);
  const inventory = expectedFiles(confined(receipt.export_directory));
  const buildRoot = path.dirname(confined(build.manifest_path));
  assert.deepEqual(inventory, expectedFiles(path.join(buildRoot, 'view/browser')));
  validateExport(receipt.export, release, inventory);
  assert.equal(receipt.export.reference, receipt.reference);
  const evidence = releaseValidation(receipt.inspection, release, buildRoot);
  assert.deepEqual(evidence.oracle, receipt.spdx_oracle);
  for (const row of receipt.evidence) {
    assert.equal(sha(fs.readFileSync(confined(row.path, evidenceRoot))), row.sha256, row.path);
  }
  return receipt;
}

function buildRelease() {
  const build = freshBuild();
  const initialSource = sourceDigest(), initialVerification = verificationDigest();
  const target = deploymentMetadata();
  assert.match(target.nativeSystem.product.version, /^[0-9]+\.[0-9]+\.[0-9]+$/);
  const tag = `ghcr.io/${target.repository}:${target.nativeSystem.product.version}`;
  fs.rmSync(receiptPath, { force: true });
  // This is the SDK's locked product_build path, including system projection
  // oracles and retained source-free proof/verification evidence.
  const releaseBytes = run('prismpm', ['--json', 'build', '--locked', '--tag', tag]);
  const release = JSON.parse(releaseBytes);
  assert.equal(release.schema, 'prismpm/product-release-result/1');
  assert.equal(release.reference, tag);
  assert.match(release.release_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(release.model_digest, digest(fs.readFileSync(confined(build.model_path))));
  assert.equal(release.build_digest, digest(fs.readFileSync(confined(build.manifest_path))));
  const reference = `ghcr.io/${target.repository}@${release.release_digest}`;
  const inspectionBytes = run('prismpm', ['--json', 'inspect', reference]);
  const inspection = JSON.parse(inspectionBytes);
  const buildRoot = path.dirname(confined(build.manifest_path));
  const { oracle } = releaseValidation(inspection, release, buildRoot);

  // Exercise the source-free API in a separate project root containing only
  // the captured OCI store. Product source/configuration/lock files are absent.
  fs.rmSync(sourceFreePath, { recursive: true, force: true });
  fs.mkdirSync(path.join(sourceFreePath, '.prism'), { recursive: true, mode: 0o700 });
  fs.chmodSync(sourceFreePath, 0o700);
  fs.cpSync(confined('.prism/oci'), path.join(sourceFreePath, '.prism/oci'), { recursive: true });
  assert.deepEqual(fs.readdirSync(sourceFreePath), ['.prism']);
  const exportBytes = run('prismpm', ['--json', 'export-browser', reference, '--output', 'browser'], sourceFreePath);
  const exported = JSON.parse(exportBytes);
  const inventory = expectedFiles(path.join(sourceFreePath, 'browser'));
  validateExport(exported, release, inventory);
  assert.equal(exported.reference, reference);
  assert.deepEqual(inventory, expectedFiles(path.join(buildRoot, 'view/browser')));
  assert.equal(sourceDigest(), initialSource, 'Product sources changed during release construction');
  assert.equal(verificationDigest(), initialVerification, 'Acceptance scripts changed during release construction');
  const evidence = [];
  for (const [name, bytes] of [['system-release-build.json', releaseBytes], ['system-release-inspect.json', inspectionBytes],
    ['system-release-export.json', exportBytes]]) {
    fs.writeFileSync(path.join(evidenceRoot, name), bytes);
    evidence.push({ path: name, sha256: sha(bytes) });
  }
  writeJson(receiptPath, {
    schema: 'lexlean-matmul/native-system-release/1', status: 'verified', build_id: build.build_id,
    source_digest: initialSource, verification_digest: initialVerification,
    build_result_sha256: sha(fs.readFileSync(path.join(evidenceRoot, 'build.json'))),
    verify_result_sha256: sha(fs.readFileSync(path.join(evidenceRoot, 'verify.json'))),
    release, reference, inspection, spdx_oracle: oracle, export: exported,
    export_directory: '.prism/matmul/source-free-release/browser', evidence,
  });
  readSystemRelease(build);
  console.log(`Verified native browser-system release and source-free six-file export ${reference}`);
}

function acceptedRelease() {
  const release = readSystemRelease(freshBuild());
  const acceptance = readJson(path.join(evidenceRoot, 'acceptance.json'));
  assert.equal(acceptance.status, 'passed');
  assert.equal(acceptance.build_id, release.build_id);
  assert.equal(acceptance.source_digest, release.source_digest);
  assert.equal(acceptance.verification_digest, release.verification_digest);
  assert(acceptance.evidence.some(row => row.path === 'system-release.json'
    && row.sha256 === sha(fs.readFileSync(receiptPath))), 'Full acceptance must cover the native release receipt');
  for (const row of acceptance.evidence) assert.equal(sha(fs.readFileSync(confined(row.path, evidenceRoot))), row.sha256);
  return release;
}

function publishRelease() {
  const release = acceptedRelease();
  const transfer = JSON.parse(run('prismpm', ['--json', 'push', release.reference]));
  assert.equal(transfer.schema, 'prismpm/push-result/1');
  assert.equal(transfer.reference, release.reference);
  assert.equal(transfer.release_digest, release.release.release_digest);
  assert.equal(transfer.verified, true);
  writeJson(path.join(evidenceRoot, 'system-release-publication.json'), transfer);
  console.log(`Published the unchanged verified OCI release ${release.reference}`);
}

function verifyPublication(url) {
  const release = acceptedRelease();
  assert.equal(url, deploymentMetadata().url);
  const result = JSON.parse(run('prismpm', ['--json', 'verify-browser-publication', release.reference, '--url', url], sourceFreePath));
  assert.equal(result.schema, 'prismpm/browser-publication-integrity/1');
  assert.equal(result.scope, 'browser-byte-integrity-only');
  assert.equal(result.reference, release.reference);
  assert.equal(result.release_digest, release.release.release_digest);
  assert.equal(result.model_digest, release.release.model_digest);
  assert.equal(result.build_digest, release.release.build_digest);
  assert.equal(result.tree_digest, release.export.tree_digest);
  assert.deepEqual(result.files, release.export.files);
  assert.equal(result.url, url);
  assert.equal(result.requests, 7);
  assert.equal(result.redirects, 0);
  writeJson(path.join(evidenceRoot, 'system-release-browser-publication.json'), result);
  console.log(`SDK source-free verification matched all six release assets and the index at ${url}`);
}

function bundleRelease() {
  const release = acceptedRelease(), target = deploymentMetadata();
  const acceptanceBytes = fs.readFileSync(path.join(evidenceRoot, 'acceptance.json'));
  const acceptance = JSON.parse(acceptanceBytes), pages = readJson(path.join(evidenceRoot, 'pages.json'));
  assert.equal(pages.release_reference, release.reference);
  assert.equal(pages.export_tree_digest, release.export.tree_digest);
  assert.deepEqual(expectedFiles(confined(target.directory)), release.export.files);
  const commit = run('git', ['rev-parse', 'HEAD']).trim();
  assert.match(commit, /^[0-9a-f]{40}$/);
  const output = path.join(root, target.bundleDirectory);
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  fs.cpSync(confined('.prism/oci'), path.join(output, 'oci'), { recursive: true });
  fs.cpSync(confined(target.directory), path.join(output, 'browser'), { recursive: true });
  const modelBytes = fs.readFileSync(confined(readBuild().model_path));
  assert.equal(digest(modelBytes), release.release.model_digest);
  fs.writeFileSync(path.join(output, 'model.prism.json'), modelBytes);
  const retained = new Set(['acceptance.json', 'pages.json', 'build.json', 'verify.json', 'source.json',
    ...acceptance.evidence.map(row => row.path), ...release.evidence.map(row => row.path)]);
  for (const relative of retained) {
    const input = confined(relative, evidenceRoot), destination = path.join(output, 'evidence', relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(input, destination);
  }
  const payload = files(output);
  writeJson(path.join(output, 'bundle.json'), {
    schema: 'lexlean-matmul/browser-release-bundle/1', commit, source_digest: release.source_digest,
    verification_digest: release.verification_digest, build_id: release.build_id,
    sdk_lock_sha256: sha(fs.readFileSync(path.join(root, 'prismpm.lock'))),
    standards_lock_sha256: sha(fs.readFileSync(path.join(root, 'standards.lock'))),
    acceptance_sha256: sha(acceptanceBytes), release_receipt_sha256: sha(fs.readFileSync(receiptPath)),
    reference: release.reference, release_digest: release.release.release_digest,
    model_digest: release.release.model_digest, build_digest: release.release.build_digest,
    tree_digest: release.export.tree_digest, url: target.url, assets: release.export.files, files: payload,
  });
  console.log(`Bundled accepted OCI, source-free browser assets, and bound evidence for ${commit}`);
}

// A separate publication job consumes inert captured bytes. It does not load a
// source graph, acquire SDK inputs, compile, or recreate acceptance evidence.
async function verifyBundle(relative, url) {
  const target = deploymentMetadata();
  assert.equal(relative, target.bundleDirectory);
  assert.equal(url, target.url);
  const bundleRoot = confined(relative), bundleBytes = fs.readFileSync(confined('bundle.json', bundleRoot));
  const bundle = JSON.parse(bundleBytes);
  assert.equal(bundle.schema, 'lexlean-matmul/browser-release-bundle/1');
  assert.equal(bundle.commit, run('git', ['rev-parse', 'HEAD']).trim());
  assert.equal(bundle.source_digest, sourceDigest());
  assert.equal(bundle.verification_digest, verificationDigest());
  assert.equal(bundle.sdk_lock_sha256, sha(fs.readFileSync(path.join(root, 'prismpm.lock'))));
  assert.equal(bundle.standards_lock_sha256, sha(fs.readFileSync(path.join(root, 'standards.lock'))));
  assert.equal(bundle.url, target.url);
  assert.deepEqual(files(bundleRoot).filter(row => row.path !== 'bundle.json'), bundle.files);
  const readEvidence = name => fs.readFileSync(confined(`evidence/${name}`, bundleRoot));
  const acceptanceBytes = readEvidence('acceptance.json'), acceptance = JSON.parse(acceptanceBytes);
  const releaseBytes = readEvidence('system-release.json'), release = JSON.parse(releaseBytes);
  assert.equal(sha(acceptanceBytes), bundle.acceptance_sha256);
  assert.equal(sha(releaseBytes), bundle.release_receipt_sha256);
  assert.equal(acceptance.schema, 'lexlean-matmul/acceptance/1');
  assert.equal(acceptance.status, 'passed');
  for (const item of [acceptance, release]) {
    assert.equal(item.build_id, bundle.build_id);
    assert.equal(item.source_digest, bundle.source_digest);
    assert.equal(item.verification_digest, bundle.verification_digest);
  }
  assert.equal(release.schema, 'lexlean-matmul/native-system-release/1');
  assert.equal(release.status, 'verified');
  assert.equal(release.build_result_sha256, sha(readEvidence('build.json')));
  assert.equal(release.verify_result_sha256, sha(readEvidence('verify.json')));
  assert.equal(release.reference, bundle.reference);
  assert.equal(bundle.reference, `ghcr.io/${target.repository}@${bundle.release_digest}`);
  for (const name of ['release_digest', 'model_digest', 'build_digest']) assert.equal(release.release[name], bundle[name]);
  assert.equal(bundle.model_digest, nativeSystemModel().manifest.applicationModelDigest);
  const modelBytes = fs.readFileSync(confined('model.prism.json', bundleRoot));
  assert.equal(digest(modelBytes), bundle.model_digest);
  const model = JSON.parse(modelBytes), capturedBuild = JSON.parse(readEvidence('build.json'));
  const capturedSource = JSON.parse(readEvidence('source.json'));
  assert.equal(model.provenance.source_id, capturedBuild.source_id);
  assert.equal(model.provenance.semantic_id, capturedBuild.semantic_id);
  assert.equal(capturedSource.build_id, bundle.build_id);
  assert.equal(capturedSource.source_digest, bundle.source_digest);
  assert.equal(capturedSource.build_result_sha256, sha(readEvidence('build.json')));
  assert.equal(bundle.tree_digest, release.export.tree_digest);
  assert.deepEqual(bundle.assets, release.export.files);
  assert.deepEqual(expectedFiles(confined('browser', bundleRoot)), bundle.assets);
  assert(acceptance.evidence.some(row => row.path === 'system-release.json' && row.sha256 === bundle.release_receipt_sha256));
  for (const row of acceptance.evidence) assert.equal(sha(readEvidence(row.path)), row.sha256, row.path);
  for (const row of release.evidence) assert.equal(sha(readEvidence(row.path)), row.sha256, row.path);
  const checks = acceptance.evidence.filter(row => row.path.startsWith('checks/'));
  assert.deepEqual(checks.map(row => row.path).sort(), capabilityIds().map(id => `checks/${id}.json`).sort());
  for (const row of checks) {
    const check = JSON.parse(readEvidence(row.path));
    assert.equal(`checks/${check.id}.json`, row.path);
    assert.equal(check.status, 'passed');
    assert.equal(check.build_id, bundle.build_id);
    assert.equal(check.source_digest, bundle.source_digest);
    assert.equal(check.verification_digest, bundle.verification_digest);
  }
  const restored = path.join(evidenceRoot, 'browser-bundle-verifier');
  fs.rmSync(restored, { recursive: true, force: true });
  fs.mkdirSync(path.join(restored, '.prism'), { recursive: true, mode: 0o700 });
  fs.chmodSync(restored, 0o700);
  fs.cpSync(confined('oci', bundleRoot), path.join(restored, '.prism/oci'), { recursive: true });
  assert.deepEqual(fs.readdirSync(restored), ['.prism']);
  const exported = JSON.parse(run('prismpm', ['--json', 'export-browser', bundle.reference, '--output', 'browser'], restored));
  validateExport(exported, release.release, bundle.assets);
  assert.equal(exported.reference, bundle.reference);
  assert.deepEqual(expectedFiles(path.join(restored, 'browser')), bundle.assets);
  const observed = JSON.parse(run('prismpm', ['--json', 'verify-browser-publication', bundle.reference, '--url', url], restored));
  assert.equal(observed.schema, 'prismpm/browser-publication-integrity/1');
  assert.equal(observed.scope, 'browser-byte-integrity-only');
  assert.equal(observed.reference, bundle.reference);
  for (const name of ['release_digest', 'model_digest', 'build_digest', 'tree_digest']) assert.equal(observed[name], bundle[name]);
  assert.deepEqual(observed.files, bundle.assets);
  assert.equal(observed.url, url);
  assert.equal(observed.requests, 7);
  assert.equal(observed.redirects, 0);
  const browserUi = await runPublishedBrowserChecks({ directory: path.join(restored, 'browser'), model, url });
  assert.equal(browserUi.model_sha256, bundle.model_digest.slice(7));
  writeJson(path.join(evidenceRoot, 'native-bundle-browser-publication.json'), {
    schema: 'lexlean-matmul/browser-bundle-publication/1', commit: bundle.commit,
    bundle_sha256: sha(bundleBytes), acceptance_sha256: bundle.acceptance_sha256,
    source_digest: bundle.source_digest, verification_digest: bundle.verification_digest, observation: observed, browser_ui: browserUi,
  });
  console.log(`SDK HTTPS integrity and Chromium UI checks passed for ${bundle.reference} at ${url}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  sdk();
  switch (process.argv[2]) {
    case 'build': buildRelease(); break;
    case 'publish': publishRelease(); break;
    case 'verify-publication': verifyPublication(process.argv[3]); break;
    case 'bundle': bundleRelease(); break;
    case 'verify-bundle': await verifyBundle(process.argv[3], process.argv[4]); break;
    default: throw new Error('Expected system-release.mjs build | publish | bundle | verify-publication URL | verify-bundle DIRECTORY URL');
  }
}
