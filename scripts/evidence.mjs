import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const root = path.resolve(import.meta.dirname, '..');
export const evidenceRoot = path.join(root, '.prism/matmul');
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export const canonical = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
    : item);
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, canonical(value) + '\n');
}
export function run(command, args, cwd = root, options = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    timeout: 30 * 60 * 1000, ...options });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
export function sdk() {
  assert(fs.existsSync('/opt/prismpm/share/inventory.json'), 'Run through scripts/in-sdk.sh or the pinned devcontainer.');
  const lock = readJson(path.join(root, 'prismpm.lock'));
  const platform = lock.platforms.find(item => item.platform === `linux/${process.arch === 'x64' ? 'amd64' : process.arch}`);
  assert(platform, 'Executing platform is absent from the SDK lock.');
  const inventory = fs.readFileSync('/opt/prismpm/share/inventory.json');
  assert.equal(inventory.toString(), platform.inventory_document);
  assert.equal(`sha256:${sha(inventory)}`, platform.inventory_digest);
  return lock;
}
export function confined(relative, base = root) {
  assert.equal(typeof relative, 'string');
  assert(!path.isAbsolute(relative));
  const parts = relative.split('/');
  assert(parts.length && parts.every(part => part && part !== '.' && part !== '..'));
  let current = base;
  for (const part of parts) {
    current = path.join(current, part);
    assert(!fs.lstatSync(current).isSymbolicLink(), `Symbolic link in artifact path: ${relative}`);
  }
  return current;
}
export function files(directory, prefix = '') {
  const entries = [];
  for (const name of fs.readdirSync(directory).sort()) {
    const full = path.join(directory, name), relative = prefix + name, stat = fs.lstatSync(full);
    assert(!stat.isSymbolicLink(), `Symbolic link: ${full}`);
    if (stat.isDirectory()) entries.push(...files(full, `${relative}/`));
    else {
      assert(stat.isFile(), `Non-regular artifact: ${full}`);
      entries.push({ path: relative, bytes: stat.size, sha256: sha(fs.readFileSync(full)) });
    }
  }
  return entries;
}
export function sourceModules() {
  return files(path.join(root, 'src')).filter(row => row.path.endsWith('.lex.tex')).map(row => {
    const text = fs.readFileSync(path.join(root, 'src', row.path), 'utf8');
    const match = /^\\semanticdata\{([^\n]*)\}$/m.exec(text);
    assert(match, `${row.path} has no semantic authority`);
    return { ...row, module: /\\begin\{lexlean\}\{([^}]+)\}/.exec(text)[1],
      semantic: JSON.parse(match[1]) };
  });
}
export function sourceDigest() {
  return sha(canonical(['lexlean.toml', 'lexlean.lock', 'prismpm.toml', 'prismpm.lock', 'standards.lock',
    'lean-toolchain', 'lakefile.toml', 'lake-manifest.json'].map(file => ({ path: file, sha256: sha(fs.readFileSync(path.join(root, file))) }))
    .concat(sourceModules().map(({ path: file, sha256 }) => ({ path: `src/${file}`, sha256 })))));
}
export function verificationDigest() {
  return sha(canonical(['scripts', 'model', 'features', '.github'].flatMap(directory =>
    files(path.join(root, directory)).map(row => ({ ...row, path: `${directory}/${row.path}` })))
    .concat(['Justfile', 'Cargo.toml', 'Cargo.lock'].map(file =>
      ({ path: file, sha256: sha(fs.readFileSync(path.join(root, file))) })))));
}
export function readBuild() {
  const build = readJson(path.join(evidenceRoot, 'build.json'));
  assert.equal(build.schema, 'prismpm/build-result/1');
  assert.match(build.build_id, /^[0-9a-f]{64}$/);
  return build;
}
export function capabilityIds() {
  const ids = [...fs.readFileSync(path.join(root, 'model/ids.toml'), 'utf8')
    .matchAll(/^id = "(MM-[0-9]+)"$/gm)].map(match => match[1]);
  assert(ids.length > 0, 'The acceptance model must declare product capabilities.');
  assert.equal(new Set(ids).size, ids.length, 'Duplicate product capability.');
  return ids;
}
export function freshBuild() {
  sdk();
  const receipt = readJson(path.join(evidenceRoot, 'source.json'));
  assert.equal(receipt.source_digest, sourceDigest(), 'Generated evidence belongs to different source or locks.');
  const build = readBuild();
  assert.equal(receipt.build_id, build.build_id);
  assert.equal(receipt.build_result_sha256, sha(fs.readFileSync(path.join(evidenceRoot, 'build.json'))));
  const current = JSON.parse(run('prismpm', ['--json', 'check']));
  assert.equal(current.semantic_id, build.semantic_id, 'SDK linked graph changed since the selected build.');
  const manifest = readJson(confined(build.manifest_path));
  assert.equal(current.model_id, manifest.inputs.model_id, 'Selected build has a different projected model.');
  return build;
}
