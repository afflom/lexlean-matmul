import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const implementation = fs.readFileSync(new URL('./evidence.mjs', import.meta.url));

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'matmul-evidence-custody-'));
  for (const name of ['scripts', 'model', 'features', '.github', 'crates/conformance/tests', 'xtask/src', '.cargo']) {
    fs.mkdirSync(path.join(directory, name), { recursive: true });
  }
  for (const name of ['Justfile', 'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'rustfmt.toml', 'clippy.toml',
    'deny.toml', 'template-contract.json', 'template.lock', 'AGENTS.md', 'VERIFICATION.md', '.cargo/config.toml',
    'crates/conformance/Cargo.toml', 'crates/conformance/tests/production.rs', 'xtask/src/main.rs']) {
    fs.writeFileSync(path.join(directory, name), 'initial verification policy\n');
  }
  fs.writeFileSync(path.join(directory, 'scripts/evidence.mjs'), implementation);
  return directory;
}

for (const owner of ['crates/conformance/tests/production.rs', 'crates/conformance/Cargo.toml',
  'xtask/src/main.rs', '.cargo/config.toml', 'deny.toml']) {
  test(`changing ${owner} invalidates prior acceptance custody`, async () => {
    const directory = fixture();
    try {
      const { verificationDigest } = await import(pathToFileURL(path.join(directory, 'scripts/evidence.mjs')).href);
      const before = verificationDigest();
      fs.writeFileSync(path.join(directory, owner), 'changed verification policy\n');
      assert.notEqual(verificationDigest(), before, `Stale acceptance survived a change to ${owner}`);
      fs.writeFileSync(path.join(directory, owner), 'initial verification policy\n');
      assert.equal(verificationDigest(), before);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
}

test('identical verification owners have stable custody across separate roots', async () => {
  const left = fixture(), right = fixture();
  try {
    const owners = await Promise.all([left, right].map(directory => import(pathToFileURL(path.join(directory, 'scripts/evidence.mjs')).href)));
    assert.equal(owners[0].verificationDigest(), owners[1].verificationDigest());
  }
  finally { for (const directory of [left, right]) fs.rmSync(directory, { recursive: true, force: true }); }
});
