import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { freshBuild, evidenceRoot, root, readJson, confined, sha, sourceModules, files, sourceDigest, verificationDigest, writeJson, capabilityIds, run } from './evidence.mjs';
import { runRuntimeChecks } from './runtime-oracle.mjs';
import { runExtendedChecks } from './extended-oracle.mjs';
import { runCodecChecks } from './codec-oracle.mjs';
import { runBrowserChecks } from './browser-oracle.mjs';
import { runProductionChecks } from './production-oracle.mjs';
import { runPublicationReadinessChecks } from './publication-evidence.mjs';
import { acceptanceVectors } from './write-errors.mjs';
import { nativeSystemModel } from './system-model.mjs';
import { readSystemRelease } from './system-release.mjs';

function validateApplicationCustody(receipt, buildRoot, manifest) {
  const keys = (value, expected) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort());
  const hash = value => assert.match(value, /^[0-9a-f]{64}$/);
  keys(receipt, ['acceptance_sha256', 'build_id', 'exporter_owner', 'lexlean_attestation_sha256',
    'model_sha256', 'processes', 'schema']);
  const tools = ['lean-version', 'lake-version', 'rustfmt-version', 'rustc-version', 'timeout-version',
    'hologram-browser-node-version', 'hologram-oracle-build', 'hologram-oracle', 'core-wasm-validate', 'core-wasm-inspect',
    'application-package-test', 'application-package-no-std', 'application-consumer-lock', 'application-generated-rust-corpus',
    'application-lean', 'application-exporter', 'application-export'];
  const validateProcess = process => {
    const exported = process.argv?.[0] === 'exe' && process.argv?.[1] === 'prod-export';
    keys(process, ['argv', 'executable_sha256', 'exit_code', 'stderr', 'stdout', 'tool', ...(exported ? ['exporter'] : [])]);
    assert.equal(process.exit_code, 0, process.tool);
    hash(process.executable_sha256);
    assert.equal(typeof process.tool, 'string');
    assert(process.tool.length > 0);
    assert(Array.isArray(process.argv) && process.argv.every(argument => typeof argument === 'string'));
    for (const stream of ['stdout', 'stderr']) {
      assert.equal(typeof process[stream], 'string');
      assert(Buffer.byteLength(process[stream]) <= 16777216);
      assert(!process[stream].includes('\r'));
    }
  };
  assert.deepEqual(receipt.processes.map(row => row.tool), tools, 'Native verification process closure differs from SDK /2');
  receipt.processes.forEach(validateProcess);
  const owner = receipt.exporter_owner;
  keys(owner, ['phases', 'schema']);
  assert.equal(owner.schema, 'prismpm/verification-exporter-owner/1');
  assert.equal(owner.phases.length, 2);
  const application = readJson(path.join(buildRoot, 'model.prism.json')).application;
  const lexleanBytes = fs.readFileSync(path.join(buildRoot, 'application/lexlean-build-manifest.json'));
  const lexlean = JSON.parse(lexleanBytes);
  const modules = lexlean.outputs.filter(row => row.kind === 'lean').map(row => {
    assert.match(row.path, /^modules\/(?:[A-Za-z_][A-Za-z0-9_]*\/)*[A-Za-z_][A-Za-z0-9_]*\.lean$/);
    return row.path.slice('modules/'.length, -'.lean'.length).replaceAll('/', '.');
  }).sort();
  assert(modules.length > 0 && new Set(modules).size === modules.length);
  assert(application.library_roots.length > 0);
  const arguments_ = ['exe', 'prod-export', ...modules.flatMap(name => ['--module', name]),
    ...application.library_roots.flatMap(name => ['--root', name]), '--ir-module', application.cargo_name.replaceAll('-', '_'),
    '--out', '$APPLICATION_WORK/export'];
  const excluded = new Set(['model.prism.json', 'system.prism.json', 'application/lexlean-snapshot.json',
    'application/lexlean-build-manifest.json', 'projections/browser-system-release.json', 'projections/spdx.json']);
  assert.equal(readJson(path.join(buildRoot, 'system.prism.json')).schema, 'prismpm/system-model/2');
  assert.deepEqual(manifest.files.filter(row => row.path.startsWith('projections/')).map(row => row.path).sort(),
    ['projections/browser-system-release.json', 'projections/spdx.json']);
  const artifacts = manifest.files.filter(row => !excluded.has(row.path) && !row.path.startsWith('lexlean/')
    && !row.path.startsWith('application/lexlean-build/')).map(row => ({
    path: row.path, byte_length: row.byte_length, sha256: row.sha256.replace(/^sha256:/, ''),
  })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  assert(artifacts.length > 0);
  const identity = readJson(path.join(buildRoot, 'application/exporter-identity.json'));
  keys(identity, ['executable', 'schema', 'source_archive_sha256']);
  assert.equal(identity.schema, 'prismpm/exporter-identity/1');
  const lock = readJson(path.join(root, 'prismpm.lock'));
  const platformName = `linux/${process.arch === 'x64' ? 'amd64' : process.arch}`;
  const platform = lock.platforms.find(row => row.platform === platformName);
  assert(platform, 'Exporter custody platform is absent from the SDK lock');
  for (const [index, phase] of owner.phases.entries()) {
    keys(phase, ['artifacts', 'lexlean_manifest_sha256', 'model_sha256', 'phase', 'processes', 'role']);
    assert.equal(phase.phase, ['controller-build', 'replay'][index]);
    assert.equal(phase.role, 'application');
    assert.equal(phase.model_sha256, receipt.model_sha256);
    assert.equal(phase.lexlean_manifest_sha256, sha(lexleanBytes));
    assert.deepEqual(phase.artifacts, artifacts, 'Exporter custody must cover every regenerated application artifact');
    assert.deepEqual(phase.processes.map(row => row.tool), ['application-lean', 'application-exporter', 'application-export']);
    phase.processes.forEach(validateProcess);
    assert.deepEqual(phase.processes[0].argv, ['build', 'PrismGenerated']);
    assert.deepEqual(phase.processes[1].argv, ['build', 'prod-export']);
    assert.deepEqual(phase.processes[2].argv, arguments_);
    for (const row of phase.processes) assert.equal(row.executable_sha256, receipt.processes[1].executable_sha256);
    const execution = phase.processes[2].exporter;
    keys(execution, ['acquisition', 'executable', 'schema', 'source_archive_sha256']);
    assert.equal(execution.schema, 'prismpm/exporter-execution/1');
    hash(execution.source_archive_sha256);
    assert.equal(execution.source_archive_sha256, identity.source_archive_sha256);
    assert.deepEqual(execution.executable, identity.executable);
    keys(execution.executable, ['byte_length', 'mode', 'sha256']);
    hash(execution.executable.sha256);
    assert(Number.isSafeInteger(execution.executable.byte_length) && execution.executable.byte_length > 0
      && execution.executable.byte_length <= 268435456);
    assert(Number.isInteger(execution.executable.mode) && execution.executable.mode >= 0 && execution.executable.mode <= 0o777
      && (execution.executable.mode & 0o111) !== 0);
    const acquisition = execution.acquisition;
    assert.equal(acquisition.schema, 'prismpm/exporter-acquisition/1');
    if (acquisition.mode === 'cold') keys(acquisition, ['mode', 'schema']);
    else {
      keys(acquisition, ['archive_sha256', 'compiler_revision', 'executable_sha256', 'inventory_sha256',
        'manifest_sha256', 'mode', 'platform', 'schema', 'toolchain']);
      assert.equal(acquisition.mode, 'sdk-seed');
      for (const field of ['archive_sha256', 'executable_sha256', 'inventory_sha256', 'manifest_sha256']) hash(acquisition[field]);
      assert.equal(acquisition.archive_sha256, execution.source_archive_sha256);
      assert.equal(acquisition.executable_sha256, execution.executable.sha256);
      assert.equal(acquisition.platform, platformName);
      assert.equal(`sha256:${acquisition.inventory_sha256}`, platform.inventory_digest);
      assert.equal(acquisition.toolchain, fs.readFileSync(path.join(root, 'lean-toolchain'), 'utf8').trim());
      for (const expected of [
        { id: 'lean4-prod-exporter-seed', kind: 'dependency-lock', version: '1', digest: `sha256:${acquisition.manifest_sha256}` },
        { id: 'lean4-prod-exporter', kind: 'binary', version: acquisition.compiler_revision, digest: `sha256:${acquisition.executable_sha256}` },
      ]) assert.deepEqual(platform.inventory.filter(row => row.id === expected.id), [expected]);
    }
  }
  assert.deepEqual(owner.phases[0].processes[2].exporter, owner.phases[1].processes[2].exporter);
  assert.deepEqual(receipt.processes.slice(-3), owner.phases[1].processes, 'Top-level transcript must retain the original replay processes');
}

function validateBundleProvenanceTap(output) {
  const expected = { tests: 5, suites: 0, pass: 5, fail: 0, cancelled: 0, skipped: 0, todo: 0 };
  for (const [name, count] of Object.entries(expected)) {
    const matches = [...output.matchAll(new RegExp(`^# ${name} ([0-9]+)$`, 'gm'))];
    assert.equal(matches.length, 1, `Bundle provenance TAP must contain exactly one ${name} count`);
    assert.equal(matches[0][1], String(count), `Bundle provenance TAP ${name} count differs`);
  }
  const plans = [...output.matchAll(/^1\.\.([0-9]+)$/gm)];
  assert.deepEqual(plans.map(match => match[1]), ['5'], 'Bundle provenance TAP must execute its complete five-test plan');
}

const id = process.argv[2];
let runtimeReport;
assert(capabilityIds().includes(id), `Unregistered capability ${id}`);
if (id === 'MM-10') {
  const native = sourceModules().flatMap(module => module.semantic.declarations)
    .find(declaration => declaration.name === 'systemModel');
  assert.equal(native?.result?.member?.module, 'Production.BrowserSystem',
    'MM-10 requires the native Production.BrowserSystem system-model /2 authority');
  assert.equal(native.result.member.name, 'SystemModel');
  const provenanceTests = run(process.execPath, ['--test', '--test-reporter=tap', 'scripts/bundle-provenance.test.mjs']);
  validateBundleProvenanceTap(provenanceTests);
}
const build = freshBuild();
const buildRoot = path.dirname(confined(build.manifest_path));
assert.equal(buildRoot, path.join(root, '.prism/build', build.build_id));
const manifest = readJson(path.join(buildRoot, 'manifest.json'));
assert.equal(manifest.schema, 'prismpm/build-manifest/1');
// Every check starts with the complete artifact closure, so a stale or wrong
// implementation cannot acquire acceptance from an unrelated successful test.
for (const row of manifest.files) {
  const bytes = fs.readFileSync(confined(row.path, buildRoot));
  assert.equal(bytes.length, row.byte_length, row.path);
  assert.equal(sha(bytes), row.sha256.replace(/^sha256:/, ''), row.path);
}
if (['MM-01', 'MM-02', 'MM-03', 'MM-04', 'MM-05', 'MM-06', 'MM-07', 'MM-11', 'MM-13', 'MM-14', 'MM-15', 'MM-16', 'MM-17'].includes(id)) {
  runtimeReport = id === 'MM-17' ? await runCodecChecks(id) : ['MM-13', 'MM-14', 'MM-15', 'MM-16'].includes(id) ? await runExtendedChecks(id) : await runRuntimeChecks(id);
  console.log(JSON.stringify(runtimeReport));
} else {
  const verifyBytes = fs.readFileSync(path.join(evidenceRoot, 'verify.json'));
  const source = readJson(path.join(evidenceRoot, 'source.json'));
  assert.equal(sha(verifyBytes), source.verify_result_sha256);
  const verify = JSON.parse(verifyBytes);
  assert.equal(verify.schema, 'prismpm/verify-result/1');
  assert.equal(verify.build_id, build.build_id);
  assert.match(verify.attestation_id, /^[0-9a-f]{64}$/);
  assert.equal(verify.verified_root, `.prism/verified/${verify.attestation_id}`);
  const verified = confined(verify.verified_root);
  assert.equal(sha(fs.readFileSync(path.join(verified, 'manifest.json'))), verify.attestation_id);
  const receipt = readJson(path.join(verified, 'manifest.json'));
  const acceptanceBytes = fs.readFileSync(path.join(verified, 'application-acceptance.json'));
  const acceptance = JSON.parse(acceptanceBytes);
  const lexleanBytes = fs.readFileSync(path.join(verified, 'lexlean-attestation.json'));
  const lexlean = JSON.parse(lexleanBytes);
  assert.equal(receipt.schema, 'prismpm/application-verification-manifest/2');
  assert.equal(receipt.build_id, build.build_id);
  assert.equal(receipt.acceptance_sha256, sha(acceptanceBytes));
  assert.equal(receipt.lexlean_attestation_sha256, sha(lexleanBytes));
  assert.equal(receipt.model_sha256, sha(fs.readFileSync(confined(build.model_path))));
  assert.equal(acceptance.schema, 'prismpm/application-acceptance/1');
  assert.equal(acceptance.status, 'verified');
  assert.equal(acceptance.build_id, build.build_id);
  assert.equal(acceptance.source_id, build.source_id);
  assert.equal(lexlean.spec, 'lexlean/attestation/1');
  assert.equal(lexlean.status, 'verified');
  assert.equal(acceptance.lexlean_attestation_id, lexlean.attestation_id);
  assert.equal(lexlean.source_id, build.source_id);
  assert.equal(lexlean.semantic_id, build.semantic_id);
  validateApplicationCustody(receipt, buildRoot, manifest);
  if (id === 'MM-08') {
    const proofs = sourceModules().flatMap(module => module.semantic.declarations
      .filter(declaration => declaration.kind === 'theorem').map(declaration => ({ ...declaration, qualifiedName: `${module.module}.${declaration.name}` })));
    assert(proofs.length >= 8);
    for (const proof of proofs) {
      const name = proof.qualifiedName;
      const observed = lexlean.declarations.find(row => row.name.endsWith(`.${name}`) || row.name === name);
      assert(observed, `No kernel axiom audit for ${name}`);
      assert.equal(observed.result, 'ok');
      assert.deepEqual(observed.observed, proof.axioms, name);
      assert.deepEqual(observed.policy.axioms, proof.axioms, name);
      assert.equal(observed.policy.kind, proof.axioms.length ? 'exact' : 'none', name);
    }
    for (const module of sourceModules()) {
      for (const tool of ['lean', 'leanchecker']) {
        assert(lexlean.processes.some(row => row.tool === tool && row.module.endsWith(`.${module.module}`) && row.exit_code === 0),
          `Missing ${tool} for ${module.module}`);
      }
    }
  } else if (id === 'MM-09') {
    assert.equal(acceptance.artifact_closure, 'verified');
    assert.equal(acceptance.browser_projection, 'verified');
    assert.equal(acceptance.core_wasm.status, 'verified');
    assert.equal(acceptance.hologram_oracle, 'verified');
    assert.equal(acceptance.modeled_vectors, acceptanceVectors().length);
    assert.equal(files(path.join(buildRoot, 'view/browser')).length, 6);
    runtimeReport = await runBrowserChecks(build);
    assert.equal(runtimeReport.modeled_vectors, acceptance.modeled_vectors);
  } else if (id === 'MM-10') {
    const release = readSystemRelease(build);
    const native = nativeSystemModel();
    const systemBytes = fs.readFileSync(path.join(buildRoot, 'system.prism.json'));
    const system = JSON.parse(systemBytes);
    assert.equal(system.schema, 'prismpm/system-model/2');
    assert.equal(system.product.id, native.model.product.id);
    assert.equal(system.product.version, native.model.product.version);
    assert.equal(system.application_profile.application_model_digest, native.manifest.applicationModelDigest);
    assert.equal(system.application_profile.application_model_digest, `sha256:${sha(fs.readFileSync(confined(build.model_path)))}`);
    assert.deepEqual(system.controls, native.manifest.controls);
    assert.equal(system.components[0].id, native.manifest.componentId);
    assert.equal(system.artifacts[0].id, native.manifest.artifactId);
    assert.equal(system.targets[0].id, native.manifest.targetId);
    assert.equal(system.targets[0].kind, 'github-pages-browser');
    assert.equal(system.targets[0].adapter_digest, native.model.targets[0].adapterDigest);
    const binding = readJson(path.join(buildRoot, 'projections/browser-system-release.json'));
    assert.equal(binding.schema, 'prismpm/browser-system-release/1');
    assert.equal(binding.system_digest, `sha256:${sha(systemBytes)}`);
    assert.equal(binding.application_model_digest, native.manifest.applicationModelDigest);
    assert.equal(binding.component, native.manifest.componentId);
    assert.equal(binding.artifact, native.manifest.artifactId);
    assert.equal(binding.target, native.manifest.targetId);
    assert.deepEqual(binding.controls, system.controls);
    const expectedFiles = manifest.files.filter(row => !['system.prism.json', 'manifest.json'].includes(row.path)
      && !row.path.startsWith('projections/')).map(row => ({ path: row.path, size: row.byte_length,
      digest: row.sha256.startsWith('sha256:') ? row.sha256 : `sha256:${row.sha256}` }))
      .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
    assert.deepEqual(binding.files, expectedFiles, 'Native system artifact binding must cover the exact generated application closure');
    const spdx = readJson(path.join(buildRoot, 'projections/spdx.json'));
    assert.equal(spdx['@context'], 'https://spdx.org/rdf/3.0.1/spdx-context.jsonld');
    const spdxDocument = spdx['@graph'].find(row => row.type === 'SpdxDocument');
    assert.equal(spdxDocument.name, native.model.product.id);
    assert.equal(spdxDocument.creationInfo.specVersion, '3.0.1');
    assert(spdx['@graph'].some(row => row.type === 'software_Package' && row.name === native.manifest.componentId));
    assert.equal(release.spdx_oracle.subject, `sha256:${sha(fs.readFileSync(path.join(buildRoot, 'projections/spdx.json')))}`);
    assert.equal(release.spdx_oracle.valid, true);
    const systemModule = sourceModules().find(module => module.module === 'MatmulSystem');
    const proofs = systemModule.semantic.declarations.filter(row => row.kind === 'theorem');
    for (const proof of proofs) {
      assert(lexlean.declarations.some(row => row.name.endsWith(`.MatmulSystem.${proof.name}`) && row.result === 'ok'),
        `Missing native-system kernel proof ${proof.name}`);
    }
  } else if (['MM-18', 'MM-19', 'MM-20', 'MM-21', 'MM-22', 'MM-23'].includes(id)) {
    runtimeReport = await runProductionChecks(build, id);
  } else if (id === 'MM-24') {
    runtimeReport = runPublicationReadinessChecks(build);
  } else if (id === 'MM-12') {
    const reproduction = readJson(path.join(evidenceRoot, 'reproduction.json'));
    assert.equal(reproduction.schema, 'lexlean-matmul/reproduction/1');
    assert.equal(reproduction.source_digest, source.source_digest);
    assert.equal(reproduction.build_id, build.build_id);
    assert.equal(reproduction.runs.length, 2);
    assert.notEqual(reproduction.runs[0].root, reproduction.runs[1].root);
    assert.deepEqual(reproduction.runs[0].artifacts, reproduction.runs[1].artifacts);
    assert(reproduction.runs[0].artifacts.length > 0);
  } else throw new Error(`No conformance implementation registered for ${id}`);
  console.log(`${id}: verified source, kernel, and application closure ${build.build_id}`);
}
const check = {
  schema: 'lexlean-matmul/conformance-result/1', id, status: 'passed', build_id: build.build_id,
  source_digest: sourceDigest(), verification_digest: verificationDigest(), ...(runtimeReport ? { runtime: runtimeReport } : {}),
};
writeJson(path.join(evidenceRoot, 'checks', `${id}.json`), check);
if (runtimeReport) writeJson(path.join(evidenceRoot, 'runtime-oracle', `${id}.json`), check);
