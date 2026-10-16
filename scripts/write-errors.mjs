import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, sourceModules } from './evidence.mjs';

export function acceptanceVectors(modules = sourceModules()) {
  const matches = modules.filter(module => module.module === 'Application');
  assert.equal(matches.length, 1, 'Exactly one Application module is required.');
  assert.equal(matches[0].semantic.spec, 'lexlean/semantic-module/1');
  const application = matches[0].semantic.declarations;
  assert(Array.isArray(application) && application.length <= 65536, 'Bounded Application declarations are required.');
  const declarations = new Map();
  for (const declaration of application) {
    assert.equal(typeof declaration.name, 'string');
    assert(!declarations.has(declaration.name), 'Duplicate Application declaration.');
    declarations.set(declaration.name, declaration);
  }
  const owner = 'Foundation.View.Text.V1.Model';
  const vectorType = { kind: 'named', member: { module: owner, name: 'AcceptanceVector' }, arguments: [] };
  const listType = { kind: 'list', element: vectorType };
  const bytesType = { kind: 'bytes' };
  const listAliases = new Set(), listNodes = new Set();
  let work = 0, totalBytes = 0;
  // Bound every alias visit, including shared constants; no expansion bypasses
  // the same work and byte limits by acquiring a second reference.
  function step() {
    assert(++work <= 65536, 'Acceptance-vector source traversal budget exceeded.');
  }
  const keys = (value, expected) => {
    assert(value && typeof value === 'object' && !Array.isArray(value));
    assert.deepEqual(Object.keys(value).sort(), [...expected].sort());
  };
  function closedDefinition(declaration, type) {
    assert(declaration && declaration.kind === 'definition', 'Unknown or non-definition Application alias.');
    assert.deepEqual(declaration.parameters, [], 'Open Application aliases are forbidden.');
    if (declaration.type_parameters !== undefined) assert.deepEqual(declaration.type_parameters, []);
    assert.deepEqual(declaration.result, type, 'Application alias has the wrong declared result type.');
  }
  function resolve(term, type, tail = false) {
    const active = new Set();
    while (term?.kind === 'call') {
      step();
      keys(term, ['kind', 'function', 'arguments']);
      assert.deepEqual(term.arguments, [], 'Open Application calls are forbidden.');
      const reference = term.function;
      keys(reference, Object.hasOwn(reference, 'module') ? ['module', 'name'] : ['name']);
      assert(!Object.hasOwn(reference, 'module') || reference.module === 'Application', 'Foreign Application aliases are forbidden.');
      assert.equal(typeof reference.name, 'string');
      assert(!active.has(reference.name), 'Cyclic Application alias.');
      assert(active.size < 4096, 'Application alias depth budget exceeded.');
      active.add(reference.name);
      if (tail) {
        assert(!listAliases.has(reference.name), 'Cyclic or shared acceptance-vector list tail.');
        listAliases.add(reference.name);
      }
      const declaration = declarations.get(reference.name);
      closedDefinition(declaration, type);
      term = declaration.body;
    }
    step();
    assert(term && typeof term === 'object', 'Missing closed Application value.');
    return term;
  }
  function bytes(term) {
    const literal = resolve(term, bytesType);
    keys(literal, ['kind', 'hex']);
    assert.equal(literal.kind, 'bytes', 'Acceptance-vector fields must resolve to byte literals.');
    assert.equal(typeof literal.hex, 'string');
    assert.match(literal.hex, /^(?:[0-9a-f]{2})*$/, 'Acceptance-vector bytes must be canonical hexadecimal.');
    totalBytes += literal.hex.length / 2;
    assert(totalBytes <= 16777216, 'Acceptance-vector expanded byte budget exceeded.');
    return literal;
  }
  const declaration = declarations.get('application');
  assert(declaration?.body?.kind === 'record', 'A closed application record is required.');
  const applicationOwner = declaration.body.type?.module;
  assert([owner, 'Foundation.View.Text.V2.Model'].includes(applicationOwner));
  assert.deepEqual(declaration.body.type, { module: applicationOwner, name: 'TextApplication' });
  closedDefinition(declaration, { kind: 'named', member: declaration.body.type, arguments: [] });
  const fields = declaration.body.fields;
  assert(Array.isArray(fields));
  assert.equal(new Set(fields.map(field => field.field)).size, fields.length, 'Duplicate application record field.');
  const selected = fields.find(field => field.field === 'acceptanceVectors');
  assert(selected, 'The application must select acceptance vectors.');
  let list = resolve(selected.value, listType, true);
  const vectors = [];
  while (list.kind === 'cons') {
    keys(list, ['kind', 'head', 'tail']);
    assert(!listNodes.has(list), 'Cyclic or shared acceptance-vector list node.');
    listNodes.add(list);
    const vector = resolve(list.head, vectorType);
    keys(vector, ['kind', 'type', 'fields']);
    assert.equal(vector.kind, 'record');
    assert.deepEqual(vector.type, vectorType.member, 'AcceptanceVector records must belong to Text.V1.Model.');
    assert(Array.isArray(vector.fields));
    assert.deepEqual(vector.fields.map(field => field.field).sort(), ['request', 'response']);
    vectors.push({ ...vector, fields: vector.fields.map(field => {
      keys(field, ['field', 'value']);
      return { ...field, value: bytes(field.value) };
    }) });
    list = resolve(list.tail, listType, true);
  }
  assert.deepEqual(list, { kind: 'nil', element: vectorType });
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
  let result = '<!-- @generated from the typed LexLean errors, source theorems, and application vectors. -->\n\n';
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
  const codec = modules.find(module => module.module === 'Codec')?.semantic.declarations;
  if (codec) {
    const errors = codec.find(row => row.kind === 'inductive' && row.name === 'CodecError');
    result += '\nChecked codec APIs return the modeled `CodecError` result type. The byte adapter maps `InvalidPlan` and `InvalidCode` to `invalid-code`, and `ShapeMismatch` and `Nonconformant` to `shape-mismatch`.\n\n| Typed variant | Negative source theorems |\n| --- | --- |\n';
    for (const variant of errors.constructors) {
      const witnesses = codec.filter(row => row.kind === 'theorem' && row.parameters.length === 0
        && row.statement.kind === 'eq' && row.statement.left.kind === 'call'
        && /^(?:checked|codecChecked)/.test(row.statement.left.function.name)
        && row.statement.right.kind === 'constructor' && row.statement.right.constructor.name === 'Result.error'
        && row.statement.right.arguments[0]?.constructor?.name === `CodecError.${variant.name}`);
      assert(witnesses.length > 0, `No modeled negative theorem for CodecError.${variant.name}`);
      result += `| \`${variant.name}\` | ${witnesses.map(row => `\`${row.name}\``).join(', ')} |\n`;
    }
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
