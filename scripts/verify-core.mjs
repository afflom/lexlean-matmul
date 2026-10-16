import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { root, evidenceRoot, sdk, run, sha, readJson, writeJson } from './evidence.mjs';

// This diagnostic checks the unchanged mathematical authority in isolation.
// It cannot produce the complete application acceptance receipt used by Pages.
const lock = sdk();
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lexlean-matmul-core-'));
try {
  fs.mkdirSync(path.join(directory, 'src'));
  const source = fs.readFileSync(path.join(root, 'src/Core.lex.tex'));
  fs.writeFileSync(path.join(directory, 'src/Core.lex.tex'), source);
  for (const file of ['lean-toolchain', 'lakefile.toml', 'lake-manifest.json']) {
    fs.copyFileSync(path.join(root, file), path.join(directory, file));
  }
  const configuration = fs.readFileSync(path.join(root, 'lexlean.toml'), 'utf8')
    .replace(/^name = .*$/m, 'name = "lexlean-matmul-core"')
    .replace(/^source_roots = .*$/m, 'source_roots = ["src"]')
    .replace(/^entrypoints = .*$/m, 'entrypoints = ["src/Core.lex.tex"]')
    .replace(/\[\[lexicon_source\]\]\npackage = "prism\.(arch|qual|sec)"[\s\S]*?(?=\n\[|$)/g, '');
  fs.writeFileSync(path.join(directory, 'lexlean.toml'), configuration);
  run('lexlean', ['lock'], directory);
  const result = JSON.parse(run('lexlean', ['--diagnostic-format', 'json', 'verify'], directory));
  assert.equal(result.success, true);
  assert.equal(result.modules.length, 1);
  assert.match(result.attestation_id, /^[0-9a-f]{64}$/);
  const attestation = readJson(path.join(directory, '.lexlean/verified', result.attestation_id, 'attestation.json'));
  assert.equal(attestation.status, 'verified');
  assert.equal(sha(source), sha(fs.readFileSync(path.join(root, 'src/Core.lex.tex'))));
  writeJson(path.join(evidenceRoot, 'core-proof.json'), {
    schema: 'lexlean-matmul/core-proof/1', qualification: 'mathematical-module-only',
    sdk_image: lock.sdk_image, source_sha256: sha(source), result, attestation,
  });
  console.log(`Unchanged Core verified; attestation ${result.attestation_id}. Application acceptance is separate.`);
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
