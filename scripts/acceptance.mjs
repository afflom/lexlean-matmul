import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { freshBuild, root, evidenceRoot, sourceDigest, verificationDigest, readJson, sha, writeJson } from './evidence.mjs';

const build = freshBuild();
const source = sourceDigest(), verification = verificationDigest();
const ids = [...fs.readFileSync(path.join(root, 'model/ids.toml'), 'utf8').matchAll(/^id = "(MM-[0-9]+)"$/gm)].map(match => match[1]);
assert.equal(ids.length, 12);
const evidence = [];
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
}
for (const name of ['falsification.json', 'reproduction.json']) {
  const receipt = readJson(path.join(evidenceRoot, name));
  assert.equal(receipt.source_digest, source);
  assert.equal(receipt.verification_digest, verification);
  evidence.push({ path: name, sha256: sha(fs.readFileSync(path.join(evidenceRoot, name))) });
}
writeJson(path.join(evidenceRoot, 'acceptance.json'), {
  schema: 'lexlean-matmul/acceptance/1', status: 'passed', build_id: build.build_id,
  source_digest: source, verification_digest: verification, evidence,
});
console.log('All twelve declared capabilities, clean reproduction, and planted defects passed.');
