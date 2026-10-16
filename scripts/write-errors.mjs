import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, sourceModules } from './evidence.mjs';

export function acceptanceVectors() {
  const application = sourceModules().find(module => module.module === 'Application').semantic.declarations;
  function resolve(term) {
    if (term.kind !== 'call') return term;
    assert.equal(term.arguments.length, 0);
    assert(!term.function.module || term.function.module === 'Application');
    const constant = application.find(row => row.kind === 'definition' && row.name === term.function.name);
    assert(constant && constant.parameters.length === 0);
    return resolve(constant.body);
  }
  const declaration = application.find(row => row.name === 'application');
  let list = resolve(declaration.body.fields.find(field => field.field === 'acceptanceVectors').value);
  const vectors = [];
  while (list.kind === 'cons') {
    const vector = resolve(list.head);
    assert.equal(vector.kind, 'record');
    assert.equal(vector.type.name, 'AcceptanceVector');
    vectors.push(vector);
    list = resolve(list.tail);
  }
  assert.equal(list.kind, 'nil');
  return vectors;
}

export function renderErrors() {
  const modules = sourceModules();
  const protocol = modules.find(module => module.module === 'Protocol').semantic.declarations;
  const errors = protocol.find(row => row.kind === 'inductive' && row.name === 'ProtocolError');
  const response = protocol.find(row => row.name === 'errorResponse');
  const vectors = acceptanceVectors();
  assert(vectors.length >= 12, 'The public error contract needs independent byte-level vectors.');
  const expected = vectors.map(row => row.fields.find(field => field.field === 'response').value.hex);
  let result = '<!-- @generated from src/Protocol.lex.tex, src/Core.lex.tex, and src/Application.lex.tex. -->\n\n';
  result += '# Public errors\n\nThe versioned byte interface returns `1`, `error`, and the wire code, separated by tabs.\n\n';
  result += '| Typed variant | Wire code | Modeled negative vectors |\n| --- | --- | --- |\n';
  assert.equal(errors.constructors.length, response.body.branches.length);
  for (const variant of errors.constructors) {
    const branch = response.body.branches.find(row => row.constructor.name === `ProtocolError.${variant.name}`);
    assert(branch && branch.body.kind === 'bytes');
    const text = Buffer.from(branch.body.hex, 'hex').toString('utf8');
    const parts = text.split('\t');
    assert.deepEqual(parts.slice(0, 2), ['1', 'error']);
    assert.equal(parts.length, 3);
    const count = expected.filter(value => value === branch.body.hex).length;
    assert(count > 0, `No modeled negative vector for ${variant.name}`);
    result += `| \`${variant.name}\` | \`${parts[2]}\` | ${count} |\n`;
  }
  const core = modules.find(module => module.module === 'Core').semantic.declarations;
  const matrix = core.find(row => row.kind === 'inductive' && row.name === 'MatrixError');
  result += '\nChecked native matrix APIs return the modeled `MatrixError` result type.\n\n| Typed variant | Negative source theorems |\n| --- | --- |\n';
  for (const variant of matrix.constructors) {
    const witnesses = core.filter(row => row.kind === 'theorem' && row.parameters.length === 0
      && row.statement.kind === 'eq' && row.statement.left.kind === 'call'
      && /^checked/.test(row.statement.left.function.name)
      && row.statement.right.kind === 'constructor'
      && row.statement.right.constructor.name === 'Result.error'
      && row.statement.right.arguments.length === 1
      && row.statement.right.arguments[0].constructor?.name === `MatrixError.${variant.name}`);
    assert(witnesses.length > 0, `No modeled negative theorem for MatrixError.${variant.name}`);
    result += `| \`${variant.name}\` | ${witnesses.map(row => `\`${row.name}\``).join(', ')} |\n`;
  }
  return result;
}
export function checkErrors() {
  assert.equal(fs.readFileSync(path.join(root, 'ERRORS.md'), 'utf8'), renderErrors(), 'ERRORS.md is stale; run just model-write.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--write')) fs.writeFileSync(path.join(root, 'ERRORS.md'), renderErrors());
  else checkErrors();
}
