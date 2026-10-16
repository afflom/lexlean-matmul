import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sdk, freshBuild, readJson, run, writeJson, sourceDigest, verificationDigest, evidenceRoot, files } from './evidence.mjs';
import { copySource } from './clean-copy.mjs';

sdk();
const selected = freshBuild();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'lexlean-matmul-reproduction-'));
try {
  const runs = [];
  for (const name of ['first', 'different-absolute-root']) {
    const directory = path.join(temporary, name);
    copySource(directory);
    run('prismpm', ['fetch', '--locked'], directory);
    const build = JSON.parse(run('prismpm', ['--json', 'build', '--locked'], directory));
    assert.equal(build.build_id, selected.build_id, 'Clean root changed the product build identity');
    const output = path.dirname(path.join(directory, build.manifest_path));
    const manifest = readJson(path.join(output, 'manifest.json'));
    const artifacts = files(output);
    assert.equal(artifacts.length, manifest.files.length + 1, 'Unregistered generated artifact');
    runs.push({ root: directory, artifacts });
  }
  assert.deepEqual(runs[0].artifacts, runs[1].artifacts, 'Generated closure differs between clean roots');
  writeJson(path.join(evidenceRoot, 'reproduction.json'), {
    schema: 'lexlean-matmul/reproduction/1', source_digest: sourceDigest(), verification_digest: verificationDigest(), build_id: selected.build_id, runs,
  });
  console.log(`Two clean roots reproduced ${runs[0].artifacts.length} exact application artifacts.`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
