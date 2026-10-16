import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonical, sha } from './evidence.mjs';
import { validateCapturedBuild } from './system-release.mjs';

const bytes = value => Buffer.from(canonical(value));
const digest = value => `sha256:${sha(value)}`;

// Application selection excludes the containing native system. A real native
// build therefore has different full-graph and selected-application identities.
function fixture() {
  const application = { spec: 'lexlean/semantic-snapshot/1', source_id: sha('application source'),
    semantic_id: sha('application semantics'), compiler_semantics_id: sha('compiler') };
  const applicationSnapshotBytes = bytes(application);
  const modelBytes = bytes({ provenance: { source_id: application.source_id,
    semantic_id: application.semantic_id, compiler_semantics_id: application.compiler_semantics_id } });
  const manifest = { schema: 'prismpm/build-manifest/1', inputs: {
    schema: 'prismpm/build-inputs/2', lexlean_source_id: sha('application and system source'),
    lexlean_semantic_id: sha('application and system semantics'), model_id: sha(modelBytes),
  }, files: [{ path: 'application/lexlean-snapshot.json', byte_length: applicationSnapshotBytes.length,
    sha256: sha(applicationSnapshotBytes) }] };
  const manifestBytes = bytes(manifest), buildId = sha(bytes(manifest.inputs));
  return { modelBytes, manifestBytes, applicationSnapshotBytes, buildId,
    modelDigest: digest(modelBytes), buildDigest: digest(manifestBytes), capturedBuild: {
      schema: 'prismpm/build-result/1', build_id: buildId,
      source_id: manifest.inputs.lexlean_source_id, semantic_id: manifest.inputs.lexlean_semantic_id,
    } };
}

test('native bundle accepts distinct full-graph and selected-application identities', () => {
  const value = fixture();
  assert.notEqual(JSON.parse(value.modelBytes).provenance.source_id, value.capturedBuild.source_id);
  validateCapturedBuild(value);
});

test('native bundle rejects a build result from a different source graph', () => {
  const value = fixture();
  value.capturedBuild.source_id = sha('different source');
  assert.throws(() => validateCapturedBuild(value));
});

test('native bundle rejects an unbound manifest', () => {
  const value = fixture();
  value.manifestBytes = bytes({ ...JSON.parse(value.manifestBytes), extra: true });
  assert.throws(() => validateCapturedBuild(value));
});

test('native bundle rejects an application snapshot outside the captured manifest', () => {
  const value = fixture();
  value.applicationSnapshotBytes = bytes({ ...JSON.parse(value.applicationSnapshotBytes), source_id: sha('other application') });
  assert.throws(() => validateCapturedBuild(value));
});

test('native bundle rejects model provenance that disagrees with its selected snapshot', () => {
  const value = fixture(), model = JSON.parse(value.modelBytes);
  model.provenance.semantic_id = sha('other semantics');
  value.modelBytes = bytes(model);
  value.modelDigest = digest(value.modelBytes);
  const manifest = JSON.parse(value.manifestBytes);
  manifest.inputs.model_id = sha(value.modelBytes);
  value.manifestBytes = bytes(manifest);
  value.buildDigest = digest(value.manifestBytes);
  value.buildId = sha(bytes(manifest.inputs));
  value.capturedBuild.build_id = value.buildId;
  assert.throws(() => validateCapturedBuild(value));
});
