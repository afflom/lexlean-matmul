import fs from 'node:fs';
import path from 'node:path';
import { evidenceRoot, root, sdk, run, sha, sourceDigest, writeJson } from './evidence.mjs';

sdk();
fs.mkdirSync(evidenceRoot, { recursive: true });
// Failed commands cannot leave an older success receipt available to tests.
for (const name of ['source.json', 'build.json', 'verify.json', 'system-release.json', 'acceptance.json', 'runtime-oracle', 'checks']) {
  fs.rmSync(path.join(evidenceRoot, name), { force: true, recursive: true });
}
run('prismpm', ['fetch', '--locked']);
const initialSource = sourceDigest();
// The SDK reserves build --locked for tagged OCI releases. Portable
// application builds consume the source and authority locks checked above.
const buildBytes = run('prismpm', ['--json', 'build']);
const build = JSON.parse(buildBytes);
fs.writeFileSync(path.join(evidenceRoot, 'build.json'), buildBytes);
// Verification performs a complete build and an independent regeneration.
const verifyBytes = run('prismpm', ['--json', 'verify'], root, { timeout: 60 * 60 * 1000 });
fs.writeFileSync(path.join(evidenceRoot, 'verify.json'), verifyBytes);
if (initialSource !== sourceDigest()) throw new Error('Product sources changed during build and verification.');
writeJson(path.join(evidenceRoot, 'source.json'), {
  schema: 'lexlean-matmul/source-evidence/1', source_digest: initialSource,
  build_id: build.build_id, build_result_sha256: sha(Buffer.from(buildBytes)),
  verify_result_sha256: sha(Buffer.from(verifyBytes)),
});
console.log(`Verified generated application ${build.build_id} in ${root}`);
// Preserve the native release owner's 90-minute aggregate build budget, plus
// the bounded inspection and source-free export performed by its launcher.
run('node', ['scripts/system-release.mjs', 'build'], root, { timeout: 100 * 60 * 1000 });
