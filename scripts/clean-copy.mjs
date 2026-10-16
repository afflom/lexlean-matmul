import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, readJson, sha } from './evidence.mjs';

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
  for (const authority of authorities) {
    const digest = authority.source.sha256;
    assert.match(digest, /^[0-9a-f]{64}$/);
    const relative = `.prism/cache/authorities/sha256/${digest}`;
    const source = path.join(root, relative);
    if (!fs.existsSync(source)) continue;
    assert.equal(sha(fs.readFileSync(source)), digest, `Corrupt immutable authority cache ${digest}`);
    const target = path.join(destination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}
