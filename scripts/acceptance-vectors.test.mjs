import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { acceptanceVectors } from './write-errors.mjs';

const bytes = { kind: 'bytes' };
const owner = 'Foundation.View.Text.V1.Model';
const type = { kind: 'named', member: { module: owner, name: 'AcceptanceVector' }, arguments: [] };
const literal = hex => ({ kind: 'bytes', hex });
const call = (name, module) => ({ kind: 'call', function: { ...(module ? { module } : {}), name }, arguments: [] });
const append = (left, right) => ({ kind: 'primitive', operation: 'append', result: bytes, arguments: [left, right] });
function fixture(response, aliases = []) {
  return [{ module: 'Application', semantic: { spec: 'lexlean/semantic-module/1', declarations: [
    ...aliases,
    { kind: 'definition', name: 'application', parameters: [],
      result: { kind: 'named', member: { module: 'Foundation.View.Text.V3.Model', name: 'TextApplication' }, arguments: [] },
      body: { kind: 'record', type: { module: 'Foundation.View.Text.V3.Model', name: 'TextApplication' }, fields: [
        { field: 'acceptanceVectors', value: { kind: 'cons', head: { kind: 'record', type: type.member, fields: [
          { field: 'request', value: literal('31') }, { field: 'response', value: response },
        ] }, tail: { kind: 'nil', element: type } } },
      ] } },
  ] } }];
}
const alias = (name, body, result = bytes) => ({ kind: 'definition', name, parameters: [], result, body });
const read = (response, aliases) => acceptanceVectors(fixture(response, aliases))[0].fields[1].value.hex;

test('closed byte concatenation preserves literal and typed alias bytes', () => {
  assert.equal(read(append(literal('31'), append(call('part'), literal('33'))), [alias('part', literal('32'))]), '313233');
});
test('actual complete corpus preserves the large escaped response exactly', () => {
  const vectors = acceptanceVectors();
  assert.equal(vectors.length, 233);
  const historicalPairs = vectors.slice(0, 184).map(vector =>
    Object.fromEntries(vector.fields.map(field => [field.field, field.value.hex])));
  assert.equal(createHash('sha256').update(JSON.stringify(historicalPairs)).digest('hex'),
    'db6adf93660833f913c7943b3e0317ce578fcdda50bfa44332ac02ffbd7011d4',
    'Every original accepted request and response must remain byte-exact and in order.');
  const response = Buffer.from(vectors[183].fields.find(row => row.field === 'response').value.hex, 'hex');
  assert.equal(response.length, 96221);
  assert.equal(createHash('sha256').update(response).digest('hex'), '339d6475a56e8741ddf171c957a7081b97f9109bec8564583d5e7d31d8ac84c8');
});
test('byte concatenation rejects foreign function calls', () => {
  const expression = { kind: 'call', function: { module: 'Foundation.Bytes', name: 'appendBytes' }, arguments: [literal('31'), literal('32')] };
  assert.throws(() => read(expression), /Foreign Application byte aliases/);
});
test('byte concatenation rejects wrong operators, result types, arities and extra fields', () => {
  for (const expression of [
    { ...append(literal('31'), literal('32')), operation: 'add' },
    { ...append(literal('31'), literal('32')), result: { kind: 'string' } },
    { ...append(literal('31'), literal('32')), arguments: [literal('31')] },
    { ...append(literal('31'), literal('32')), hidden: true },
  ]) assert.throws(() => read(expression));
});
test('byte concatenation rejects malformed byte literals', () => {
  for (const hex of ['0', 'GG', 'AA', '01 02']) assert.throws(() => read(append(literal('31'), literal(hex))), /canonical hexadecimal/);
});
test('byte concatenation rejects cycles through a nested alias', () => {
  assert.throws(() => read(call('part'), [alias('part', append(literal('31'), call('part')))]), /Cyclic Application byte alias/);
});
test('byte concatenation rejects aliases with an incorrect declared type or parameters', () => {
  assert.throws(() => read(call('part'), [alias('part', literal('31'), { kind: 'string' })]), /wrong declared result type/);
  assert.throws(() => read(call('part'), [{ ...alias('part', literal('31')), parameters: [{ name: 'x', type: bytes }] }]), /Open Application aliases/);
});
test('byte concatenation enforces expression depth', () => {
  let expression = literal('31');
  for (let i = 0; i < 129; i++) expression = append(literal(''), expression);
  assert.throws(() => read(expression), /depth budget/);
});
test('byte concatenation charges every node in shared expansions', () => {
  let expression = literal('');
  for (let i = 0; i < 16; i++) expression = append(expression, expression);
  assert.throws(() => read(expression), /source traversal budget/);
});
test('byte concatenation charges repeated alias expansions against the byte budget', () => {
  let expression = call('part');
  for (let i = 0; i < 5; i++) expression = append(expression, expression);
  assert.throws(() => read(expression, [alias('part', literal('00'.repeat(1048576)))]), /expanded byte budget/);
});
