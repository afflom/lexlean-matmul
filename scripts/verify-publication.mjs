import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, files, sha, writeJson, evidenceRoot, run, sdk, sourceDigest, verificationDigest } from './evidence.mjs';
import { deploymentMetadata } from './system-model.mjs';
import { writePublicationFailure } from './publication-evidence.mjs';

export async function verifyPublishedBytes(argument) {
 let failureCode = 'publication-url-refused';
 try {
  const model = deploymentMetadata();
  const url = new URL(argument);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.origin, model.origin);
  assert.equal(url.pathname, model.basePath);
  assert.equal(url.search + url.hash + url.username + url.password, '');
  const directory = path.join(root, model.directory);
  failureCode = 'publication-integrity-failed';
  const assets = files(directory);
  assert.equal(assets.length, 6);
  const published = [];
  for (const asset of assets) {
    failureCode = 'publication-http-failed';
    const response = await fetch(new URL(asset.path, url), { redirect: 'error', signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200, asset.path);
    failureCode = 'publication-integrity-failed';
    let length = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      length += chunk.byteLength;
      assert(length <= asset.bytes, `Published asset exceeds its accepted byte length: ${asset.path}`);
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    assert.equal(bytes.length, asset.bytes, asset.path);
    assert.equal(sha(bytes), asset.sha256, asset.path);
    assert(fs.readFileSync(path.join(directory, asset.path)).equals(bytes), asset.path);
    published.push(asset);
  }
  writeJson(path.join(evidenceRoot, 'publication.json'), {
    schema: 'lexlean-matmul/publication/1', status: 'passed', url: url.href, assets: published,
    commit: run('git', ['rev-parse', 'HEAD']).trim(), source_digest: sourceDigest(), verification_digest: verificationDigest(),
  });
  fs.rmSync(path.join(evidenceRoot, 'publication.failure.json'), { force: true });
  console.log(`Verified all ${assets.length} exact browser assets at ${url.href}`);
 } catch (error) {
  fs.rmSync(path.join(evidenceRoot, 'publication.json'), { force: true });
  writePublicationFailure('publication.failure.json', failureCode, error);
  throw error;
 }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  sdk();
  await verifyPublishedBytes(process.argv[2]);
}
