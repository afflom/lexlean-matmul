import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runtime, expect, request, success, csv } from './runtime-oracle.mjs';
import { ieeeOracle } from './extended-oracle.mjs';
import { evidenceRoot, sha, writeJson } from './evidence.mjs';

// Independent expected E8 bytes from the pinned upstream e8.rs table. They
// are never read from the product's LexLean source or generated artifacts.
const e8 = [[0,0,0,0,0,0,0,0],[-32,-32,0,0,0,0,0,0],[-32,0,-32,0,0,0,0,0],[-32,0,0,-32,0,0,0,0],[-32,0,0,0,-32,0,0,0],[-32,0,0,0,0,-32,0,0],[-32,0,0,0,0,0,-32,0],[-32,0,0,0,0,0,0,-32],[-32,0,0,0,0,0,0,32],[-32,0,0,0,0,0,32,0],[-32,0,0,0,0,32,0,0],[-32,0,0,0,32,0,0,0],[-32,0,0,32,0,0,0,0],[-32,0,32,0,0,0,0,0],[-32,32,0,0,0,0,0,0],[-16,-16,-16,-16,-16,-16,-16,-16],[-16,-16,-16,-16,-16,-16,16,16],[-16,-16,-16,-16,-16,16,-16,16],[-16,-16,-16,-16,-16,16,16,-16],[-16,-16,-16,-16,16,-16,-16,16],[-16,-16,-16,-16,16,-16,16,-16],[-16,-16,-16,-16,16,16,-16,-16],[-16,-16,-16,-16,16,16,16,16],[-16,-16,-16,16,-16,-16,-16,16],[-16,-16,-16,16,-16,-16,16,-16],[-16,-16,-16,16,-16,16,-16,-16],[-16,-16,-16,16,-16,16,16,16],[-16,-16,-16,16,16,-16,-16,-16],[-16,-16,-16,16,16,-16,16,16],[-16,-16,-16,16,16,16,-16,16],[-16,-16,-16,16,16,16,16,-16],[-16,-16,16,-16,-16,-16,-16,16],[-16,-16,16,-16,-16,-16,16,-16],[-16,-16,16,-16,-16,16,-16,-16],[-16,-16,16,-16,-16,16,16,16],[-16,-16,16,-16,16,-16,-16,-16],[-16,-16,16,-16,16,-16,16,16],[-16,-16,16,-16,16,16,-16,16],[-16,-16,16,-16,16,16,16,-16],[-16,-16,16,16,-16,-16,-16,-16],[-16,-16,16,16,-16,-16,16,16],[-16,-16,16,16,-16,16,-16,16],[-16,-16,16,16,-16,16,16,-16],[-16,-16,16,16,16,-16,-16,16],[-16,-16,16,16,16,-16,16,-16],[-16,-16,16,16,16,16,-16,-16],[-16,-16,16,16,16,16,16,16],[-16,16,-16,-16,-16,-16,-16,16],[-16,16,-16,-16,-16,-16,16,-16],[-16,16,-16,-16,-16,16,-16,-16],[-16,16,-16,-16,-16,16,16,16],[-16,16,-16,-16,16,-16,-16,-16],[-16,16,-16,-16,16,-16,16,16],[-16,16,-16,-16,16,16,-16,16],[-16,16,-16,-16,16,16,16,-16],[-16,16,-16,16,-16,-16,-16,-16],[-16,16,-16,16,-16,-16,16,16],[-16,16,-16,16,-16,16,-16,16],[-16,16,-16,16,-16,16,16,-16],[-16,16,-16,16,16,-16,-16,16],[-16,16,-16,16,16,-16,16,-16],[-16,16,-16,16,16,16,-16,-16],[-16,16,-16,16,16,16,16,16],[-16,16,16,-16,-16,-16,-16,-16],[-16,16,16,-16,-16,-16,16,16],[-16,16,16,-16,-16,16,-16,16],[-16,16,16,-16,-16,16,16,-16],[-16,16,16,-16,16,-16,-16,16],[-16,16,16,-16,16,-16,16,-16],[-16,16,16,-16,16,16,-16,-16],[-16,16,16,-16,16,16,16,16],[-16,16,16,16,-16,-16,-16,16],[-16,16,16,16,-16,-16,16,-16],[-16,16,16,16,-16,16,-16,-16],[-16,16,16,16,-16,16,16,16],[-16,16,16,16,16,-16,-16,-16],[-16,16,16,16,16,-16,16,16],[-16,16,16,16,16,16,-16,16],[-16,16,16,16,16,16,16,-16],[0,-32,-32,0,0,0,0,0],[0,-32,0,-32,0,0,0,0],[0,-32,0,0,-32,0,0,0],[0,-32,0,0,0,-32,0,0],[0,-32,0,0,0,0,-32,0],[0,-32,0,0,0,0,0,-32],[0,-32,0,0,0,0,0,32],[0,-32,0,0,0,0,32,0],[0,-32,0,0,0,32,0,0],[0,-32,0,0,32,0,0,0],[0,-32,0,32,0,0,0,0],[0,-32,32,0,0,0,0,0],[0,0,-32,-32,0,0,0,0],[0,0,-32,0,-32,0,0,0],[0,0,-32,0,0,-32,0,0],[0,0,-32,0,0,0,-32,0],[0,0,-32,0,0,0,0,-32],[0,0,-32,0,0,0,0,32],[0,0,-32,0,0,0,32,0],[0,0,-32,0,0,32,0,0],[0,0,-32,0,32,0,0,0],[0,0,-32,32,0,0,0,0],[0,0,0,-32,-32,0,0,0],[0,0,0,-32,0,-32,0,0],[0,0,0,-32,0,0,-32,0],[0,0,0,-32,0,0,0,-32],[0,0,0,-32,0,0,0,32],[0,0,0,-32,0,0,32,0],[0,0,0,-32,0,32,0,0],[0,0,0,-32,32,0,0,0],[0,0,0,0,-32,-32,0,0],[0,0,0,0,-32,0,-32,0],[0,0,0,0,-32,0,0,-32],[0,0,0,0,-32,0,0,32],[0,0,0,0,-32,0,32,0],[0,0,0,0,-32,32,0,0],[0,0,0,0,0,-32,-32,0],[0,0,0,0,0,-32,0,-32],[0,0,0,0,0,-32,0,32],[0,0,0,0,0,-32,32,0],[0,0,0,0,0,0,-32,-32],[0,0,0,0,0,0,-32,32],[0,0,0,0,0,0,32,-32],[0,0,0,0,0,0,32,32],[0,0,0,0,0,32,-32,0],[0,0,0,0,0,32,0,-32],[0,0,0,0,0,32,0,32],[0,0,0,0,0,32,32,0],[0,0,0,0,32,-32,0,0],[0,0,0,0,32,0,-32,0],[0,0,0,0,32,0,0,-32],[0,0,0,0,32,0,0,32],[0,0,0,0,32,0,32,0],[0,0,0,0,32,32,0,0],[0,0,0,32,-32,0,0,0],[0,0,0,32,0,-32,0,0],[0,0,0,32,0,0,-32,0],[0,0,0,32,0,0,0,-32],[0,0,0,32,0,0,0,32],[0,0,0,32,0,0,32,0],[0,0,0,32,0,32,0,0],[0,0,0,32,32,0,0,0],[0,0,32,-32,0,0,0,0],[0,0,32,0,-32,0,0,0],[0,0,32,0,0,-32,0,0],[0,0,32,0,0,0,-32,0],[0,0,32,0,0,0,0,-32],[0,0,32,0,0,0,0,32],[0,0,32,0,0,0,32,0],[0,0,32,0,0,32,0,0],[0,0,32,0,32,0,0,0],[0,0,32,32,0,0,0,0],[0,32,-32,0,0,0,0,0],[0,32,0,-32,0,0,0,0],[0,32,0,0,-32,0,0,0],[0,32,0,0,0,-32,0,0],[0,32,0,0,0,0,-32,0],[0,32,0,0,0,0,0,-32],[0,32,0,0,0,0,0,32],[0,32,0,0,0,0,32,0],[0,32,0,0,0,32,0,0],[0,32,0,0,32,0,0,0],[0,32,0,32,0,0,0,0],[0,32,32,0,0,0,0,0],[16,-16,-16,-16,-16,-16,-16,16],[16,-16,-16,-16,-16,-16,16,-16],[16,-16,-16,-16,-16,16,-16,-16],[16,-16,-16,-16,-16,16,16,16],[16,-16,-16,-16,16,-16,-16,-16],[16,-16,-16,-16,16,-16,16,16],[16,-16,-16,-16,16,16,-16,16],[16,-16,-16,-16,16,16,16,-16],[16,-16,-16,16,-16,-16,-16,-16],[16,-16,-16,16,-16,-16,16,16],[16,-16,-16,16,-16,16,-16,16],[16,-16,-16,16,-16,16,16,-16],[16,-16,-16,16,16,-16,-16,16],[16,-16,-16,16,16,-16,16,-16],[16,-16,-16,16,16,16,-16,-16],[16,-16,-16,16,16,16,16,16],[16,-16,16,-16,-16,-16,-16,-16],[16,-16,16,-16,-16,-16,16,16],[16,-16,16,-16,-16,16,-16,16],[16,-16,16,-16,-16,16,16,-16],[16,-16,16,-16,16,-16,-16,16],[16,-16,16,-16,16,-16,16,-16],[16,-16,16,-16,16,16,-16,-16],[16,-16,16,-16,16,16,16,16],[16,-16,16,16,-16,-16,-16,16],[16,-16,16,16,-16,-16,16,-16],[16,-16,16,16,-16,16,-16,-16],[16,-16,16,16,-16,16,16,16],[16,-16,16,16,16,-16,-16,-16],[16,-16,16,16,16,-16,16,16],[16,-16,16,16,16,16,-16,16],[16,-16,16,16,16,16,16,-16],[16,16,-16,-16,-16,-16,-16,-16],[16,16,-16,-16,-16,-16,16,16],[16,16,-16,-16,-16,16,-16,16],[16,16,-16,-16,-16,16,16,-16],[16,16,-16,-16,16,-16,-16,16],[16,16,-16,-16,16,-16,16,-16],[16,16,-16,-16,16,16,-16,-16],[16,16,-16,-16,16,16,16,16],[16,16,-16,16,-16,-16,-16,16],[16,16,-16,16,-16,-16,16,-16],[16,16,-16,16,-16,16,-16,-16],[16,16,-16,16,-16,16,16,16],[16,16,-16,16,16,-16,-16,-16],[16,16,-16,16,16,-16,16,16],[16,16,-16,16,16,16,-16,16],[16,16,-16,16,16,16,16,-16],[16,16,16,-16,-16,-16,-16,16],[16,16,16,-16,-16,-16,16,-16],[16,16,16,-16,-16,16,-16,-16],[16,16,16,-16,-16,16,16,16],[16,16,16,-16,16,-16,-16,-16],[16,16,16,-16,16,-16,16,16],[16,16,16,-16,16,16,-16,16],[16,16,16,-16,16,16,16,-16],[16,16,16,16,-16,-16,-16,-16],[16,16,16,16,-16,-16,16,16],[16,16,16,16,-16,16,-16,16],[16,16,16,16,-16,16,16,-16],[16,16,16,16,16,-16,-16,16],[16,16,16,16,16,-16,16,-16],[16,16,16,16,16,16,-16,-16],[16,16,16,16,16,16,16,16],[32,-32,0,0,0,0,0,0],[32,0,-32,0,0,0,0,0],[32,0,0,-32,0,0,0,0],[32,0,0,0,-32,0,0,0],[32,0,0,0,0,-32,0,0],[32,0,0,0,0,0,-32,0],[32,0,0,0,0,0,0,-32],[32,0,0,0,0,0,0,32],[32,0,0,0,0,0,32,0],[32,0,0,0,0,32,0,0],[32,0,0,0,32,0,0,0],[32,0,0,32,0,0,0,0],[32,0,32,0,0,0,0,0],[32,32,0,0,0,0,0,0],[-32,-32,-32,-32,0,0,0,0],[-32,-32,-32,0,-32,0,0,0],[-32,-32,-32,0,0,-32,0,0],[-32,-32,-32,0,0,0,-32,0],[-32,-32,-32,0,0,0,0,-32],[-32,-32,-32,0,0,0,0,32],[-32,-32,-32,0,0,0,32,0],[-32,-32,-32,0,0,32,0,0],[-32,-32,-32,0,32,0,0,0],[-32,-32,-32,32,0,0,0,0],[-32,-32,0,-32,-32,0,0,0],[-32,-32,0,-32,0,-32,0,0],[-32,-32,0,-32,0,0,-32,0],[-32,-32,0,-32,0,0,0,-32],[-32,-32,0,-32,0,0,0,32]];
const e8Digest = 'f4a90d635c5baacf986e3fd4921bf18875b2d94555c1b6a19a078e7918ff6936';
const modes = ['nearest', 'toward-zero', 'saturating', 'wrapping'];
const natural = text => BigInt(text);
const parseCsv = text => text === '' ? [] : text.split(',').map(natural);
const bit = (code, shift) => Number((code >> BigInt(shift)) & 1n);
const parsePlan = text => text.split(';').map(stage => {
  const [kind, ...parameters] = stage.split(':');
  if (kind === 'grid') return { kind, width: Number(parameters[0]), words: parseCsv(parameters[1]).map(value => [value]) };
  if (kind === 'book') return { kind, width: Number(parameters[0]), block: Number(parameters[1]), words: parameters[2].split('/').map(parseCsv) };
  if (kind === 'sign' || kind === 'ternary') return { kind, width: Number(parameters[0]), block: Number(parameters[1]) };
  if (kind === 'e8') return { kind, width: Number(parameters[0]) };
  if (kind === 'packed') return { kind, fields: Number(parameters[0]) };
  if (kind === 'offset') return { kind, zero: natural(parameters[0]) };
  if (kind === 'transcode') return { kind, width: Number(parameters[0]), mapping: parseCsv(parameters[1]) };
  if (kind === 'runs') {
    const entries = parseCsv(parameters[1]);
    return { kind, maximum: Number(parameters[0]), entries: Array.from({ length: entries.length / 2 }, (_, index) => ({ length: Number(entries[2 * index]), code: entries[2 * index + 1] })) };
  }
  throw new Error(`Unrecognized oracle stage ${kind}`);
});
function maximumBlock(stages, index = stages.length - 1) {
  const stage = stages[index];
  if (stage.kind === 'grid') return 1;
  if (stage.kind === 'book' || stage.kind === 'sign' || stage.kind === 'ternary') return stage.block;
  if (stage.kind === 'e8') return 8;
  if (stage.kind === 'runs') return stage.maximum;
  if (stage.kind === 'packed') return stage.fields * maximumBlock(stages, index - 1);
  return maximumBlock(stages, index - 1);
}
function width(stages, index = stages.length - 1) {
  const stage = stages[index];
  if (stage.kind === 'runs') return 32;
  if (stage.kind === 'packed') return 8;
  if (stage.kind === 'offset') return width(stages, index - 1);
  return stage.width;
}
function element(stages, code, position, index = stages.length - 1) {
  const stage = stages[index], block = maximumBlock(stages, index);
  if (stage.kind === 'grid' || stage.kind === 'book') {
    const word = stage.words[Number(code % BigInt(stage.words.length))];
    return word[position % word.length];
  }
  if (stage.kind === 'sign') return position % block < stage.width && bit(code, position % block) ? 1n : -1n;
  if (stage.kind === 'ternary') {
    const shift = 2 * (position % block);
    const digit = shift < stage.width ? Number((code >> BigInt(shift)) & 3n) : 0;
    return digit === 0 ? -1n : digit === 2 ? 1n : 0n;
  }
  if (stage.kind === 'e8') return BigInt(e8[Number(code % 256n)][position % 8]);
  if (stage.kind === 'offset') return element(stages, code, position, index - 1) - stage.zero;
  if (stage.kind === 'transcode') return element(stages, stage.mapping[Number(code % BigInt(stage.mapping.length))], position, index - 1);
  if (stage.kind === 'runs') {
    const run = stage.entries[Number(code)];
    return run ? element(stages, run.code, position % maximumBlock(stages, index - 1), index - 1) : 0n;
  }
  const innerBlock = maximumBlock(stages, index - 1), bits = 8 / stage.fields;
  const subcode = (code >> BigInt(bits * Math.floor(position / innerBlock))) & ((1n << BigInt(bits)) - 1n);
  return element(stages, subcode, position % innerBlock, index - 1);
}
function decode(stages, code) {
  const root = stages.at(-1);
  const count = root.kind === 'runs' ? (root.entries[Number(code)]?.length ?? 0) : maximumBlock(stages);
  return Array.from({ length: count }, (_, position) => element(stages, code, position));
}
function multiply(rows, inner, columns, a, b) {
  const output = [];
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    let value = 0n;
    for (let index = 0; index < inner; index += 1) value += a[row * inner + index] * b[index * columns + column];
    output.push(value);
  }
  return output;
}
function seeded(seed) {
  let state = seed >>> 0;
  return bound => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % bound; };
}
let currentCase;
async function runCase(machine, plan, rows, a, routes = ['direct', 'table']) {
  const stages = parsePlan(plan), decoded = rows.map(row => row.flatMap(code => decode(stages, BigInt(code))));
  const columns = decoded[0]?.length ?? 0, inner = rows.length, m = inner === 0 ? 1 : a.length / inner;
  assert(decoded.every(row => row.length === columns));
  for (const row of rows) assert(row.every(code => BigInt(code) >= 0n && BigInt(code) < (1n << BigInt(width(stages)))));
  const expected = success(m, columns, multiply(m, inner, columns, a, decoded.flat()));
  for (const route of routes) {
    const input = request(1, 'codec', route, plan, m, inner, columns, csv(a), rows.map(csv).join('/'));
    currentCase = { plan, route, request_sha256: sha(input), request_bytes: Buffer.byteLength(input) };
    await expect(machine, input, expected, `total codec ${route}: ${plan}`);
  }
}
async function codecCases(machine) {
  assert.equal(e8.length, 256); assert(e8.every(word => word.length === 8));
  assert.equal(sha(Uint8Array.from(e8.flat().map(value => value & 255))), e8Digest);
  const random = seeded(0x636f6463);
  assert.deepEqual(decode(parsePlan('grid:8:-1,1;packed:8'), 5n), [1n, -1n, 1n, -1n, -1n, -1n, -1n, -1n]);
  await runCase(machine, 'grid:8:-1,1;packed:8', [[5n]], [1n]);
  for (let start = 0; start < 256; start += 8) {
    await runCase(machine, 'grid:8:-3,0,7', [Array.from({ length: 8 }, (_, index) => BigInt(start + index))], [3n]);
  }
  for (let code = 0; code < 256; code += 1) {
    const routes = code % 16 === 0 ? ['direct', 'table'] : ['direct'];
    await runCase(machine, 'sign:8:8', [[BigInt(code)]], [-7n], routes);
    await runCase(machine, 'ternary:8:4', [[BigInt(code)]], [5n], routes);
    await runCase(machine, 'e8:8', [[BigInt(code)]], [2n], routes);
  }
  const plans = [
    'grid:16:-3,0,7', 'book:16:2:1,-2/3,4/-5,0', 'sign:16:8', 'ternary:16:8',
    'grid:8:-1,1;packed:8', 'grid:16:0,1,2,3;packed:4', 'grid:8:0,1,2,3;packed:2',
    'book:16:2:1,2/3,4;packed:2', 'sign:8:4;packed:2', 'ternary:16:2;packed:4', 'book:8:2:1,2/3,4;offset:7',
    'grid:8:-3,0,7;transcode:16:2,0,1,2', 'book:16:2:1,2/3,4;runs:8:3,0,5,1',
    'book:16:2:1,2/3,4;runs:8:3,0,5,1;offset:2',
    'grid:8:-1,1;runs:4:2,0,3,1;packed:2',
    'grid:8:-1,1;runs:4:2,0,3,1;transcode:8:1,0,99',
    'grid:8:0,1;packed:2;offset:7;transcode:16:0,1,2;runs:8:8,0;offset:3;transcode:8:0;packed:1',
    'e8:16;offset:-4', 'e8:8;transcode:16:255,0,1',
  ];
  for (const plan of plans) {
    const stages = parsePlan(plan), root = stages.at(-1), bound = 1n << BigInt(width(stages));
    const candidates = root.kind === 'runs' ? [0n, 1n] : [0n, 1n, 2n, 15n, 255n, 256n, 32767n, 65535n].filter(code => code < bound);
    for (const code of candidates) {
      const count = decode(stages, code).length;
      if (count === 0 || count > 8) continue;
      await runCase(machine, plan, [[code]], [BigInt(random(101) - 50)]);
    }
  }
  for (let test = 0; test < 32; test += 1) {
    const m = 1 + random(4), inner = 1 + random(8), columns = 1 + random(8);
    const a = Array.from({ length: m * inner }, () => BigInt(random(10001) - 5000));
    const rows = Array.from({ length: inner }, () => Array.from({ length: columns }, () => BigInt(random(65536))));
    await runCase(machine, 'grid:16:-17,4,0,9,-2', rows, a);
  }
  await runCase(machine, 'book:16:2:1,2/3,4;runs:8:3,0,5,1', [[0n, 1n], [1n, 0n]], [3n, -5n]);
  await runCase(machine, 'grid:8:-3,0,7', [[0n, 1n]], []);
  await runCase(machine, 'grid:8:-3,0,7', [[], []], [2n, 3n]);
  for (const route of ['direct', 'table']) {
    await expect(machine, request(1, 'codec', route, 'grid:8:-3,0,7', 2, 0, 3, '', ''), success(2, 3, Array(6).fill(0n)), 'zero reduction preserves declared output shape');
  }
  const maximumMagnitude = 10n ** 64n - 1n;
  await runCase(machine, `grid:8:${maximumMagnitude},-${maximumMagnitude}`, [[0n, 1n]], [-maximumMagnitude]);
  await runCase(machine, `grid:8:${maximumMagnitude};offset:-${maximumMagnitude}`, [[0n]], [maximumMagnitude]);
  const negatives = [
    [request(1, 'codec', 'direct', 'grid:8:', 1, 1, 1, 1, 0), 'invalid-code'],
    [request(1, 'codec', 'direct', 'book:16:2:1/2,3', 1, 1, 2, 1, 0), 'invalid-code'],
    [request(1, 'codec', 'direct', 'grid:8:1,2;packed:3', 1, 1, 1, 1, 0), 'invalid-code'],
    [request(1, 'codec', 'direct', 'grid:8:1,2;runs:8:0,0', 1, 1, 1, 1, 0), 'invalid-code'],
    [request(1, 'codec', 'direct', 'grid:8:1,2;runs:8:9,0', 1, 1, 1, 1, 0), 'invalid-code'],
    [request(1, 'codec', 'direct', 'grid:8:1,2;transcode:8:256', 1, 1, 1, 1, 0), 'invalid-code'],
    [request(1, 'codec', 'direct', 'grid:8:1,2', 1, 1, 1, 1, 256), 'invalid-code'],
    [request(1, 'codec', 'direct', 'grid:8:1,2', 1, 1, 2, 1, 0), 'shape-mismatch'],
    [request(1, 'codec', 'direct', 'grid:8:1,2;runs:8:1,0', 1, 1, 0, 1, 99), 'shape-mismatch'],
    [request(1, 'codec', 'direct', 'sign:8:18446744073709551615', 1, 1, 8, 1, 0), 'invalid-code'],
    [request(1, 'codec', 'direct', 'grid:8:1,2;runs:18446744073709551615:1,0', 1, 1, 1, 1, 0), 'invalid-code'],
    [request(1, 'codec', 'direct', 'book:8:2:1,2', 1, 0, 1, '', ''), 'shape-mismatch'],
  ];
  for (const [input, error] of negatives) await expect(machine, input, request(1, 'error', error), `typed codec ${error}`);
}
async function arenaCases(machine) {
  for (const format of ['f32', 'f64']) {
    const fraction = format === 'f32' ? 23n : 52n, bias = format === 'f32' ? 127n : 1023n, sign = format === 'f32' ? 1n << 31n : 1n << 63n;
    const one = bias << fraction, nan = ((2n * bias + 1n) << fraction) + (1n << (fraction - 1n));
    const symbols = [sign, nan + 2n, one, 0n, nan + 1n, sign, one];
    const canonical = [...new Set(symbols.map(String))].map(BigInt).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    assert.equal(canonical.length, 5);
    for (const width of [8, 16]) for (const mode of modes) {
      const codes = [0n, 1n, 2n, 3n, 4n, (1n << BigInt(width)) - 1n];
      const decoded = codes.map(code => canonical[Number(code % BigInt(canonical.length))]);
      const values = decoded.map(code => ieeeOracle.add(ieeeOracle.decode(format, 0n), ieeeOracle.multiply(ieeeOracle.decode(format, one), ieeeOracle.decode(format, code))));
      await expect(machine, request(1, 'arena', format, width, mode, csv(symbols), 1, 1, codes.length, one, csv(codes)),
        success(1, codes.length, values.map(value => ieeeOracle.encode(format, mode, value))), 'canonical IEEE arena retains signed zeros and distinct NaN payload symbols');
    }
  }
}
export async function runCodecChecks(id = 'MM-17') {
  assert.equal(id, 'MM-17');
  const machine = await runtime();
  try { await codecCases(machine); await arenaCases(machine); }
  catch (error) {
    writeJson(path.join(evidenceRoot, 'runtime-oracle', `${id}.failure.json`), { schema: 'lexlean-matmul/runtime-failure/1', status: 'failed', id,
      build_id: machine.buildId, wasm_sha256: machine.wasmSha256, completed_requests: machine.calls, test_case: currentCase,
      error: { kind: error instanceof WebAssembly.RuntimeError ? 'WebAssembly.RuntimeError' : error.name, message: error.message } });
    throw error;
  }
  assert(machine.calls > 0);
  return { schema: 'lexlean-matmul/runtime-acceptance/1', id, build_id: machine.buildId, wasm_sha256: machine.wasmSha256,
    requests: machine.calls, status: 'passed', codec_construction: 'total-compositional-modulo-codebooks', e8_bytes_sha256: e8Digest };
}
