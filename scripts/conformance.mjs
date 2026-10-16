import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { freshBuild, evidenceRoot, root, readJson, confined, sha, sourceModules, files, sourceDigest, verificationDigest, writeJson } from './evidence.mjs';
import { runRuntimeChecks } from './runtime-oracle.mjs';
import { acceptanceVectors } from './write-errors.mjs';

const id = process.argv[2];
let runtimeReport;
assert.match(id ?? '', /^MM-(0[1-9]|1[0-2])$/);
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
if (['MM-01', 'MM-02', 'MM-03', 'MM-04', 'MM-05', 'MM-06', 'MM-07', 'MM-11'].includes(id)) {
  runtimeReport = await runRuntimeChecks(id);
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
  assert.equal(receipt.schema, 'prismpm/application-verification-manifest/1');
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
  const required = ['lean-version', 'lake-version', 'rustfmt-version', 'rustc-version', 'timeout-version',
    'hologram-oracle-build', 'hologram-oracle', 'core-wasm-validate', 'core-wasm-inspect',
    'application-package-test', 'application-package-no-std', 'application-consumer-lock', 'application-generated-rust-corpus'];
  assert.equal(receipt.processes.length, required.length);
  for (const name of required) assert.equal(receipt.processes.filter(row => row.tool === name).length, 1, name);
  for (const process of receipt.processes) {
    assert.equal(process.exit_code, 0, process.tool);
    assert.match(process.executable_sha256, /^[0-9a-f]{64}$/);
    assert(Array.isArray(process.argv) && process.argv.every(argument => typeof argument === 'string'));
  }
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
  } else if (id === 'MM-10') {
    // The system is a project-owned typed architecture in this SDK version.
    // Its validator and admission theorem must be part of the verified graph.
    const system = sourceModules().find(module => module.module.includes('System'));
    assert(system, 'Missing system authority');
    const proofs = system.semantic.declarations.filter(row => row.kind === 'theorem');
    assert(proofs.length > 0);
    assert(proofs.every(proof => lexlean.declarations.some(row => row.name.endsWith(`.${system.module}.${proof.name}`) && row.result === 'ok')));
  } else {
    const reproduction = readJson(path.join(evidenceRoot, 'reproduction.json'));
    assert.equal(reproduction.schema, 'lexlean-matmul/reproduction/1');
    assert.equal(reproduction.source_digest, source.source_digest);
    assert.equal(reproduction.build_id, build.build_id);
    assert.equal(reproduction.runs.length, 2);
    assert.notEqual(reproduction.runs[0].root, reproduction.runs[1].root);
    assert.deepEqual(reproduction.runs[0].artifacts, reproduction.runs[1].artifacts);
    assert(reproduction.runs[0].artifacts.length > 0);
  }
  console.log(`${id}: verified source, kernel, and application closure ${build.build_id}`);
}
const check = {
  schema: 'lexlean-matmul/conformance-result/1', id, status: 'passed', build_id: build.build_id,
  source_digest: sourceDigest(), verification_digest: verificationDigest(), ...(runtimeReport ? { runtime: runtimeReport } : {}),
};
writeJson(path.join(evidenceRoot, 'checks', `${id}.json`), check);
if (runtimeReport) writeJson(path.join(evidenceRoot, 'runtime-oracle', `${id}.json`), check);
