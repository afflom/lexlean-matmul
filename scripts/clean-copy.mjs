import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, readJson, sha, canonical, confined } from './evidence.mjs';

const omitted = new Set(['.git', '.prism', '.lexlean', '.lake', 'target', 'public', 'node_modules']);
export function copySource(destination) {
  fs.mkdirSync(destination, { recursive: true });
  function copy(source, target) {
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      if (omitted.has(entry.name)) continue;
      assert(!entry.isSymbolicLink(), `Non-regular source input ${entry.name}`);
      const from = path.join(source, entry.name), to = path.join(target, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(to);
        copy(from, to);
      } else {
        assert(entry.isFile());
        fs.copyFileSync(from, to);
        fs.chmodSync(to, fs.statSync(from).mode & 0o777);
      }
    }
  }
  copy(root, destination);
  // A clean build may reuse immutable downloaded authority inputs, just as
  // Cargo reuses its registry cache. Generated source and compiled artifacts
  // are excluded. The SDK independently verifies these bytes during fetch.
  const authorities = readJson(path.join(root, 'standards.lock')).authorities;
  const copiedAuthorities = new Set();
  for (const authority of authorities) {
    const digest = authority.source.sha256;
    if (digest === null) {
      assert.equal(authority.source.redistribution, 'citation-only');
      continue;
    }
    assert.match(digest, /^[0-9a-f]{64}$/);
    if (copiedAuthorities.has(digest)) continue;
    copiedAuthorities.add(digest);
    const relative = `.prism/cache/authorities/sha256/${digest}`;
    const source = path.join(root, relative);
    if (!fs.existsSync(source)) continue;
    assert.equal(sha(fs.readFileSync(source)), digest, `Corrupt immutable authority cache ${digest}`);
    const target = path.join(destination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  // Image scan inputs are likewise reusable only for the selected immutable
  // SDK, platform, and complete locked OSV database set. These are not product
  // build or acceptance receipts. Every clean root still runs the SDK's
  // fetch/verification, including its own cache validation and freshness check.
  const lock = readJson(path.join(root, 'prismpm.lock'));
  const selected = /@sha256:([0-9a-f]{64})$/.exec(lock.sdk_image);
  assert(selected, 'SDK image must select an immutable SHA256 index');
  const databases = authorities.flatMap(authority => {
    const ecosystem = /^gs:\/\/osv-vulnerabilities\/(.+)\/all\.zip$/.exec(authority.canonical_id);
    return ecosystem ? [{ digest: `sha256:${authority.source.sha256}`, ecosystem: ecosystem[1],
      edition: authority.edition, id: authority.id, source: authority.source }] : [];
  }).sort((left, right) => left.ecosystem < right.ecosystem ? -1 : left.ecosystem > right.ecosystem ? 1 : 0);
  const databaseDigest = `sha256:${sha(canonical(databases))}`;
  for (const { platform } of lock.platforms) {
    assert.match(platform, /^linux\/(amd64|arm64)$/);
    const relative = `.prism/cache/advisory-scans/sha256/${selected[1]}/${platform.replace('/', '-')}.json`;
    if (!fs.existsSync(path.join(root, relative))) continue;
    const source = confined(relative), bytes = fs.readFileSync(source), scan = JSON.parse(bytes);
    assert.equal(scan.schema, 'prismpm/image-advisory-scan/1');
    assert.equal(scan.subject, `sha256:${selected[1]}`);
    assert.equal(scan.reference, lock.sdk_image);
    assert.equal(scan.subject_kind, 'sdk-image');
    assert.equal(scan.platform, platform);
    assert.equal(scan.database_set_digest, databaseDigest);
    assert.equal(scan.result_digest, `sha256:${sha(canonical(scan.result))}`);
    assert.equal(sha(scan.index_manifest), selected[1]);
    const index = JSON.parse(scan.index_manifest);
    const descriptor = index.manifests.find(row => `${row.platform?.os}/${row.platform?.architecture}` === platform
      && (!row.platform.variant || row.platform.variant === ''));
    assert.deepEqual(scan.platform_descriptor, descriptor);
    assert.equal(scan.finding_count, scan.findings.length);
    assert.equal(scan.rejected_count, scan.findings.filter(row => row.rejected === true).length);
    assert.match(scan.scanner_digest, /^sha256:[0-9a-f]{64}$/);
    const target = path.join(destination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    assert.equal(sha(fs.readFileSync(target)), sha(bytes), 'Advisory cache changed while copying');
  }
}
