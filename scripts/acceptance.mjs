import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { freshBuild, evidenceRoot, root, sourceDigest, verificationDigest, readJson, sha, writeJson,
  capabilityIds, canonical, confined, sourceModules, sdk } from './evidence.mjs';
import { readSystemRelease } from './system-release.mjs';
import { acceptanceVectors } from './write-errors.mjs';
import { researchDefensiveFixtureSource } from './research-defensive.mjs';

const build = freshBuild();
const source = sourceDigest(), verification = verificationDigest();
const ids = capabilityIds();
const application = readJson(confined(build.model_path)).application;
readSystemRelease(build);
const evidence = [];
const screenshots = new Map();
function collectScreenshots(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.path === 'string' && /^runtime-oracle\/(?:production|research)-[a-z-]+\.png$/.test(value.path)) {
    const bytes = fs.readFileSync(confined(value.path, evidenceRoot));
    assert.equal(bytes.length, value.bytes);
    assert.equal(sha(bytes), value.sha256, 'A rendered screenshot changed after its owning browser check.');
    if (screenshots.has(value.path)) assert.equal(screenshots.get(value.path), value.sha256);
    screenshots.set(value.path, value.sha256);
  }
  for (const child of Object.values(value)) if (Array.isArray(child)) child.forEach(collectScreenshots);
  else if (child && typeof child === 'object') collectScreenshots(child);
}
for (const id of ids) {
  const relative = `checks/${id}.json`;
  const bytes = fs.readFileSync(path.join(evidenceRoot, relative));
  const receipt = JSON.parse(bytes);
  assert.equal(receipt.id, id);
  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.build_id, build.build_id);
  assert.equal(receipt.source_digest, source);
  assert.equal(receipt.verification_digest, verification, 'Acceptance checker changed during or after the gate');
  evidence.push({ path: relative, sha256: sha(bytes) });
  collectScreenshots(receipt.runtime);
  if (id === 'MM-31') {
    assert(Array.isArray(receipt.runtime) && receipt.runtime.length === 1 && receipt.runtime[0].id === id);
    const diagnostic = receipt.runtime[0].source_defensive;
    assert.equal(diagnostic?.schema, 'lexlean-matmul/research-defensive/1');
    assert.equal(diagnostic.qualification, false);
    const matched = /^\.prism\/matmul\/(research-defensive\/([0-9a-f]{64})\/receipt\.json)$/.exec(diagnostic.receipt_path);
    assert(matched, 'The source-defensive receipt must remain inside its bound evidence namespace.');
    const fullBytes = fs.readFileSync(confined(matched[1], evidenceRoot)), full = JSON.parse(fullBytes);
    assert.equal(sha(fullBytes), diagnostic.receipt_sha256);
    assert.equal(full.schema, diagnostic.schema); assert.equal(full.qualification, false);
    assert.equal(full.product_build_id, build.build_id); assert.equal(full.product_source_digest, source);
    assert.equal(full.sdk_image, sdk().sdk_image);
    const modules = sourceModules(), fixtureHash = sha(researchDefensiveFixtureSource(modules));
    assert.equal(full.fixture_module_sha256, fixtureHash);
    const expectedKey = sha(canonical({ source_digest: source, product_build_id: build.build_id,
      fixture_sha256: fixtureHash, driver_sha256: sha(fs.readFileSync(path.join(root, 'scripts/research-defensive.mjs'))) }));
    assert.equal(full.key, expectedKey); assert.equal(matched[2], expectedKey);
    assert.deepEqual(full.source_inputs.map(row => [row.path, row.original_sha256]),
      modules.map(module => [`src/${module.path}`, module.sha256]));
    for (const row of full.source_inputs) {
      assert.match(row.fixture_sha256, /^[0-9a-f]{64}$/);
      assert.equal(row.transformation, row.path === 'src/Application.lex.tex' ? 'entry-root-and-library-root-only' : 'unchanged');
      if (row.transformation === 'unchanged') assert.equal(row.fixture_sha256, row.original_sha256);
    }
    assert.deepEqual(full.compiler_stages.map(row => row.stage), ['lock', 'kernel-verify', 'build']);
    for (const row of full.compiler_stages) {
      assert.equal(row.status, 0);
      for (const name of ['stdout_sha256', 'stderr_sha256']) assert.match(row[name], /^[0-9a-f]{64}$/);
    }
    const vectors = acceptanceVectors();
    assert.deepEqual(full.execution.normal_vectors, vectors.map((vector, index) => ({ index,
      request_sha256: sha(Buffer.from(vector.fields.find(row => row.field === 'request').value.hex, 'hex')),
      response_sha256: sha(Buffer.from(vector.fields.find(row => row.field === 'response').value.hex, 'hex')) })));
    assert.equal(diagnostic.normal_vectors, vectors.length);
    assert.equal(full.execution.build_id, diagnostic.fixture_build_id);
    for (const name of ['manifest_sha256', 'core_wasm_sha256']) assert.match(full.execution[name], /^[0-9a-f]{64}$/);
    const outcomes = full.execution.defensive_outcomes;
    for (const row of outcomes) {
      assert.match(row.sha256, /^[0-9a-f]{64}$/);
      assert(Number.isSafeInteger(row.bytes) && row.bytes > 0 && row.bytes <= application.response_maximum);
    }
    assert.deepEqual(outcomes.map(row => row.name), ['prepared-trace', 'prepared-response', 'response-at-bound', 'response-over-bound']);
    assert.equal(outcomes[0].error, 'research-trace-disagreement');
    assert.equal(outcomes[1].error, 'research-invalid-response');
    assert.equal(outcomes[2].bytes, application.response_maximum);
    assert.equal(outcomes[2].sha256, sha(Buffer.alloc(application.response_maximum, 120)));
    assert.equal(outcomes[3].error, 'research-response-too-large');
    assert.equal(diagnostic.defensive_checks, outcomes.length);
    evidence.push({ path: matched[1], sha256: diagnostic.receipt_sha256 });
  }
}
for (const [relative, hash] of screenshots) evidence.push({ path: relative, sha256: hash });
for (const name of ['falsification.json', 'reproduction.json', 'system-release.json']) {
  const receipt = readJson(path.join(evidenceRoot, name));
  assert.equal(receipt.source_digest, source);
  assert.equal(receipt.verification_digest, verification);
  evidence.push({ path: name, sha256: sha(fs.readFileSync(path.join(evidenceRoot, name))) });
}
writeJson(path.join(evidenceRoot, 'acceptance.json'), {
  schema: 'lexlean-matmul/acceptance/1', status: 'passed', build_id: build.build_id,
  source_digest: source, verification_digest: verification, evidence,
});
console.log(`All ${ids.length} declared capabilities, clean reproduction, and planted defects passed.`);
