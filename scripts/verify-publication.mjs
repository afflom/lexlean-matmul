import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { root, files, sha, writeJson, evidenceRoot } from './evidence.mjs';
import { deploymentMetadata } from './system-model.mjs';

const model = deploymentMetadata();
const requested = process.argv[2];
const url = new URL(requested);
assert.equal(url.protocol, 'https:');
assert.equal(url.origin, model.origin);
assert.equal(url.pathname, model.basePath);
assert.equal(url.search + url.hash + url.username + url.password, '');
const directory = path.join(root, model.directory);
const assets = files(directory);
assert.equal(assets.length, 6);
const published = [];
for (const asset of assets) {
  const response = await fetch(new URL(asset.path, url), { redirect: 'error', signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, asset.path);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, asset.bytes, asset.path);
  assert.equal(sha(bytes), asset.sha256, asset.path);
  assert(fs.readFileSync(path.join(directory, asset.path)).equals(bytes), asset.path);
  published.push(asset);
}
writeJson(path.join(evidenceRoot, 'publication.json'), {
  schema: 'lexlean-matmul/publication/1', url: url.href, assets: published,
});
console.log(`Verified all ${assets.length} exact browser assets at ${url.href}`);
