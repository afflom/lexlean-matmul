import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { freshBuild, confined, root, run, files, writeJson, readJson, sourceDigest, verificationDigest, sha, evidenceRoot } from './evidence.mjs';

const build = freshBuild();
const acceptance = readJson(path.join(evidenceRoot, 'acceptance.json'));
assert.equal(acceptance.status, 'passed');
assert.equal(acceptance.build_id, build.build_id);
assert.equal(acceptance.source_digest, sourceDigest());
assert.equal(acceptance.verification_digest, verificationDigest());
for (const item of acceptance.evidence) assert.equal(sha(fs.readFileSync(confined(item.path, evidenceRoot))), item.sha256);
run('node', ['scripts/conformance.mjs', 'MM-09']);
run('node', ['scripts/conformance.mjs', 'MM-10']);
const directory = path.join(path.dirname(confined(build.manifest_path)), 'view/browser');
const inventory = files(directory);
assert.equal(inventory.length, 6);
const output = path.join(root, 'public');
fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(directory, output, { recursive: true });
assert.deepEqual(files(output), inventory);
writeJson(path.join(evidenceRoot, 'pages.json'), {
  schema: 'lexlean-matmul/pages-projection/1', build_id: build.build_id, assets: inventory,
});
console.log('Staged the exact six-file verified browser projection in public/.');
