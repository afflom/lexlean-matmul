import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const minimum = -(1n << 63n);
const maximum = (1n << 63n) - 1n;
const largestInput = 10n ** 64n - 1n;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const csv = (values) => values.map(String).join(',');
const request = (...fields) => fields.map(String).join('\t');
const success = (rows, columns, values) => request(1, 'ok', rows, columns, csv(values));
const error = (code) => request(1, 'error', code);

// This scalar BigInt oracle deliberately uses ordinary row/column loops. It
// shares neither the model's reduction tree nor its codebook/table strategy.
function multiply(rows, inner, columns, left, right) {
  assert.equal(left.length, rows * inner);
  assert.equal(right.length, inner * columns);
  const output = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      let value = 0n;
      for (let index = 0; index < inner; index += 1) {
        value += BigInt(left[row * inner + index]) * BigInt(right[index * columns + column]);
      }
      output.push(value);
    }
  }
  return output;
}

function seeded(seed) {
  let state = seed >>> 0;
  return (bound) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % bound;
  };
}

async function runtime() {
  const repository = await realpath(process.cwd());
  const receipt = JSON.parse(await readFile('.prism/matmul/build.json', 'utf8'));
  assert.equal(receipt.schema, 'prismpm/build-result/1');
  assert.match(receipt.build_id, /^[0-9a-f]{64}$/u, 'build receipt must identify one immutable application build');
  assert.equal(receipt.manifest_path, `.prism/build/${receipt.build_id}/manifest.json`);
  const root = await realpath(path.join(repository, '.prism', 'build', receipt.build_id));
  assert.equal(root, path.join(repository, '.prism', 'build', receipt.build_id), 'build root must remain confined');
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.schema, 'prismpm/build-manifest/1');
  const modules = manifest.files.filter((file) => /^core-wasm\/[^/]+\.wasm$/u.test(file.path));
  assert.equal(modules.length, 1, 'exact build must contain one generated Core-Wasm implementation');
  const record = modules[0];
  const wasmPath = path.join(root, record.path);
  assert.equal(await realpath(wasmPath), wasmPath, 'generated Core-Wasm path must remain confined');
  const bytes = await readFile(wasmPath);
  assert.equal(bytes.length, record.byte_length, 'generated Core-Wasm byte length must match its manifest');
  assert.equal(digest(bytes), record.sha256.replace(/^sha256:/u, ''), 'generated Core-Wasm digest must match its manifest');
  const module = await WebAssembly.compile(bytes);
  assert.deepEqual(WebAssembly.Module.imports(module), [], 'modeled Core-Wasm must execute without host imports');
  let calls = 0;
  return {
    buildId: receipt.build_id,
    wasmSha256: digest(bytes),
    get calls() { return calls; },
    async dispatch(value) {
      const input = typeof value === 'string' ? encoder.encode(value) : value;
      assert(input instanceof Uint8Array);
      assert(input.length <= 32768, 'oracle requests must fit the modeled guest allocation bound');
      // A fresh instance gives every request the same bounded allocator state.
      const instance = await WebAssembly.instantiate(module, {});
      const { memory, holo_alloc: allocate, holo_run: run } = instance.exports;
      assert(memory instanceof WebAssembly.Memory);
      assert.equal(typeof allocate, 'function');
      assert.equal(typeof run, 'function');
      const pointer = allocate(input.length) >>> 0;
      new Uint8Array(memory.buffer, pointer, input.length).set(input);
      const packed = BigInt.asUintN(64, run(pointer, input.length));
      const outputPointer = Number(packed >> 32n);
      const outputLength = Number(packed & 0xffff_ffffn);
      assert(outputLength <= 32768, 'generated response exceeds the modeled byte bound');
      assert(outputPointer + outputLength <= memory.buffer.byteLength, 'generated response must stay inside guest memory');
      const output = new Uint8Array(memory.buffer, outputPointer, outputLength).slice();
      calls += 1;
      return decoder.decode(output);
    },
  };
}

async function expect(machine, value, expected, label) {
  const actual = await machine.dispatch(value);
  assert.equal(actual, expected, `${label}: generated runtime differs for ${JSON.stringify(value)}`);
  return actual;
}

async function exactCases(machine) {
  const random = seeded(0x6d61746d);
  const cases = [
    [2, 3, 2, [1n, -2n, 3n, 4n, 5n, -6n], [7n, 8n, -9n, 10n, 11n, -12n]],
    [1, 1, 1, [9007199254740993n], [1n]],
    [1, 1, 1, [maximum], [1n]],
    [1, 1, 1, [minimum], [1n]],
    [1, 1, 1, [largestInput], [largestInput]],
    [1, 3, 1, [largestInput, largestInput, -largestInput], [largestInput, largestInput, largestInput]],
    [1, 2, 1, [largestInput, -largestInput], [largestInput, largestInput]],
    [0, 3, 2, [], [1n, 2n, 3n, 4n, 5n, 6n]],
    [2, 0, 3, [], []],
    [2, 3, 0, [1n, 2n, 3n, 4n, 5n, 6n], []],
  ];
  for (let index = 0; index < 40; index += 1) {
    const rows = 1 + random(8);
    const inner = 1 + random(8);
    const columns = 1 + random(8);
    cases.push([rows, inner, columns,
      Array.from({ length: rows * inner }, () => BigInt(random(41) - 20)),
      Array.from({ length: inner * columns }, () => BigInt(random(41) - 20))]);
  }
  for (const [rows, inner, columns, left, right] of cases) {
    const product = multiply(rows, inner, columns, left, right);
    await expect(machine, request(1, 'matmul', rows, inner, columns, csv(left), csv(right)), success(rows, columns, product), 'integer product');
    const prior = Array.from({ length: rows * columns }, () => BigInt(random(17) - 8));
    const alpha = -largestInput;
    const beta = largestInput;
    const epilogue = product.map((value, index) => alpha * value + beta * prior[index]);
    await expect(machine, request(1, 'gemm', alpha, beta, rows, inner, columns, csv(left), csv(right), csv(prior)), success(rows, columns, epilogue), 'single linear epilogue');
  }
}

async function codecCases(machine) {
  const random = seeded(0x636f6465);
  const tiers = [
    ['binary', 2, (code) => code === 0 ? -1n : 1n],
    ['ternary', 3, (code) => BigInt(code - 1)],
    ['signed8', 256, (code) => BigInt(code < 128 ? code : code - 256)],
    ['full8', 256, (code) => BigInt(code < 128 ? code : code - 256)],
  ];
  for (const [tier, count, decode] of tiers) {
    for (let code = 0; code < count; code += 1) {
      await expect(machine, request(1, 'coded', tier, 1, 1, 1, 7, code), success(1, 1, [7n * decode(code)]), `${tier} code ${code}`);
    }
    for (let index = 0; index < 12; index += 1) {
      const rows = 1 + random(5);
      const inner = 1 + random(8);
      const columns = 1 + random(5);
      const left = Array.from({ length: rows * inner }, () => BigInt(random(63) - 31));
      const codes = Array.from({ length: inner * columns }, () => random(count));
      const output = multiply(rows, inner, columns, left, codes.map(decode));
      await expect(machine, request(1, 'coded', tier, rows, inner, columns, csv(left), csv(codes)), success(rows, columns, output), `${tier} mixed matrix`);
    }
  }
}

async function tableCases(machine) {
  const random = seeded(0x7461626c);
  for (let index = 0; index < 32; index += 1) {
    const rows = 1 + random(5);
    const inner = 1 + random(8);
    const columns = 1 + random(5);
    const book = Array.from({ length: 2 + random(7) }, () => BigInt(random(61) - 30));
    const left = Array.from({ length: rows * inner }, () => BigInt(random(31) - 15));
    const codes = Array.from({ length: inner * columns }, () => random(book.length));
    const product = multiply(rows, inner, columns, left, codes.map((code) => book[code]));
    await expect(machine, request(1, 'table', csv(book), rows, inner, columns, csv(left), csv(codes)), success(rows, columns, product), 'arbitrary codebook product');
  }
  await expect(machine, request(1, 'table', '-5,7,-5,0', 1, 4, 1, '1,2,3,4', '0,1,2,3'), success(1, 1, [-6n]), 'duplicate codebook entries');
}

async function partitionCases(machine) {
  const random = seeded(0x626c6f63);
  for (let inner = 0; inner <= 8; inner += 1) {
    const rows = 2;
    const columns = 3;
    const left = Array.from({ length: rows * inner }, () => BigInt(random(29) - 14));
    const right = Array.from({ length: inner * columns }, () => BigInt(random(31) - 15));
    const expected = success(rows, columns, multiply(rows, inner, columns, left, right));
    for (let block = 0; block <= 8; block += 1) {
      await expect(machine, request(1, 'partitioned', block, rows, inner, columns, csv(left), csv(right)), expected, 'partition and partial final block');
    }
  }
}

async function complexAndDyadicCases(machine) {
  const random = seeded(0x636f6d70);
  const shapes = [[0, 2, 3], [2, 0, 3], [2, 3, 0], [1, 1, 1], [2, 3, 2]];
  for (let index = 0; index < 24; index += 1) shapes.push([1 + random(4), 1 + random(6), 1 + random(4)]);
  for (const [rows, inner, columns] of shapes) {
    const ar = Array.from({ length: rows * inner }, () => BigInt(random(41) - 20));
    const ai = Array.from({ length: rows * inner }, () => BigInt(random(41) - 20));
    const br = Array.from({ length: inner * columns }, () => BigInt(random(41) - 20));
    const bi = Array.from({ length: inner * columns }, () => BigInt(random(41) - 20));
    const rr = multiply(rows, inner, columns, ar, br);
    const ii = multiply(rows, inner, columns, ai, bi);
    const ri = multiply(rows, inner, columns, ar, bi);
    const ir = multiply(rows, inner, columns, ai, br);
    const real = rr.map((value, index) => value - ii[index]);
    const imaginary = ri.map((value, index) => value + ir[index]);
    await expect(machine, request(1, 'complex', rows, inner, columns, csv(ar), csv(ai), csv(br), csv(bi)), request(1, 'ok', rows, columns, csv(real), csv(imaginary)), 'complex matrix product');
    const aScale = Array.from({ length: rows * inner }, () => random(65));
    const bScale = Array.from({ length: inner * columns }, () => random(65));
    const coefficients = [];
    const scales = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        let scale = 0;
        for (let index = 0; index < inner; index += 1) scale = Math.max(scale, aScale[row * inner + index] + bScale[index * columns + column]);
        let coefficient = 0n;
        for (let index = 0; index < inner; index += 1) {
          const sourceScale = aScale[row * inner + index] + bScale[index * columns + column];
          coefficient += ar[row * inner + index] * br[index * columns + column] * (1n << BigInt(scale - sourceScale));
        }
        coefficients.push(coefficient);
        scales.push(scale);
      }
    }
    await expect(machine, request(1, 'dyadic', rows, inner, columns, csv(ar), csv(aScale), csv(br), csv(bScale)), request(1, 'ok', rows, columns, csv(coefficients), csv(scales)), 'dyadic matrix product at exact common scale');
  }
  await expect(machine, request(1, 'complex', 1, 1, 1, largestInput, -largestInput, largestInput, largestInput), request(1, 'ok', 1, 1, 2n * largestInput * largestInput, 0), 'complex product beyond fixed integer width');
  await expect(machine, request(1, 'dyadic', 1, 2, 1, `${largestInput},${-largestInput}`, '0,64', `${largestInput},${largestInput}`, '64,0'), request(1, 'ok', 1, 1, 0, 64), 'large dyadic cancellation');
}

const tropicalCsv = (values) => values.map((value) => value === null ? '-inf' : String(value)).join(',');

async function tropicalCases(machine) {
  const random = seeded(0x74726f70);
  const cases = [
    [1, 3, 1, [3n, 3n, null], [2n, 2n, 9n]],
    [1, 2, 2, [null, null], [1n, null, 2n, 3n]],
    [2, 0, 3, [], []],
    [0, 2, 3, [], [1n, 2n, 3n, 4n, 5n, 6n]],
    [1, 1, 1, [largestInput], [largestInput]],
  ];
  for (let index = 0; index < 40; index += 1) {
    const rows = 1 + random(5);
    const inner = 1 + random(8);
    const columns = 1 + random(5);
    const finiteOrMask = () => random(4) === 0 ? null : BigInt(random(41) - 20);
    cases.push([rows, inner, columns, Array.from({ length: rows * inner }, finiteOrMask), Array.from({ length: inner * columns }, finiteOrMask)]);
  }
  for (const [rows, inner, columns, left, right] of cases) {
    const values = [];
    const witnesses = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        let best = null;
        let witness = inner === 0 ? 'none' : 0;
        for (let index = 0; index < inner; index += 1) {
          const a = left[row * inner + index];
          const b = right[index * columns + column];
          const candidate = a === null || b === null ? null : a + b;
          if (candidate !== null && (best === null || candidate > best)) {
            best = candidate;
            witness = index;
          }
        }
        values.push(best);
        witnesses.push(witness);
      }
    }
    await expect(machine, request(1, 'tropical', rows, inner, columns, tropicalCsv(left), tropicalCsv(right)), request(1, 'ok', rows, columns, tropicalCsv(values), csv(witnesses)), 'max-plus product and least attaining witness');
  }
}

async function gaugeCases(machine) {
  const random = seeded(0x67617567);
  const cases = [[], [null, null], [7n, -3n, null, 7n, 0n], [-9n, -4n, null], [largestInput, null, largestInput - 1n]];
  for (let index = 0; index < 32; index += 1) {
    cases.push(Array.from({ length: random(65) }, () => random(4) === 0 ? null : BigInt(random(101) - 50)));
  }
  for (const values of cases) {
    const finite = values.filter((value) => value !== null);
    const maximum = finite.length === 0 ? null : finite.reduce((left, right) => left > right ? left : right);
    const normalized = values.map((value) => value === null ? null : value - maximum);
    const expected = request(1, 'ok', tropicalCsv(normalized), maximum === null ? '-inf' : maximum);
    await expect(machine, request(1, 'recenter', tropicalCsv(values)), expected, 'canonical masked gauge representative');
    await expect(machine, request(1, 'recenter', tropicalCsv(normalized)), request(1, 'ok', tropicalCsv(normalized), maximum === null ? '-inf' : 0), 'gauge idempotence');
  }
  const base = [null, 5n, -8n, 5n, 0n];
  for (const shift of [-largestInput + 10n, -21n, 0n, 97n, largestInput - 10n]) {
    const shifted = base.map((value) => value === null ? null : value + shift);
    await expect(machine, request(1, 'recenter', tropicalCsv(shifted)), request(1, 'ok', '-inf,0,-13,0,-5', 5n + shift), 'shift-invariant gauge representative');
  }
}

async function protocolCases(machine) {
  const negative = [
    ['', 'malformed-request'],
    ['1', 'malformed-request'],
    ['2\tmatmul\t1\t1\t1\t1\t1', 'unsupported-version'],
    ['1\tunknown', 'unknown-operation'],
    ['1\tmatmul\t9\t1\t1\t1\t1', 'invalid-dimension'],
    ['1\tmatmul\t-1\t1\t1\t1\t1', 'invalid-dimension'],
    ['1\tmatmul\t01\t1\t1\t1\t1', 'invalid-dimension'],
    ['1\tmatmul\t1\t1\t1\t01\t1', 'invalid-integer'],
    ['1\tmatmul\t1\t1\t1\t-0\t1', 'invalid-integer'],
    ['1\tmatmul\t1\t1\t1\t+1\t1', 'invalid-integer'],
    [request(1, 'matmul', 1, 1, 1, 10n ** 64n, 1), 'invalid-integer'],
    [request(1, 'matmul', 1, 1, 1, -(10n ** 64n), 1), 'invalid-integer'],
    ['1\tmatmul\t1\t2\t1\t1\t1,2', 'shape-mismatch'],
    ['1\tmatmul\t1\t1\t1\t1\t1\textra', 'malformed-request'],
    ['1\tcoded\tunknown\t1\t1\t1\t1\t1', 'unknown-tier'],
    ['1\tcoded\tbinary\t1\t1\t1\t1\t2', 'invalid-code'],
    ['1\tcoded\tternary\t1\t1\t1\t1\t3', 'invalid-code'],
    ['1\tcoded\tsigned8\t1\t1\t1\t1\t256', 'invalid-code'],
    ['1\tcoded\tfull8\t1\t1\t1\t1\t256', 'invalid-code'],
    ['1\tcoded\tbinary\t1\t1\t1\t1\t-1', 'invalid-code'],
    ['1\ttable\t3,4\t1\t1\t1\t1\t2', 'invalid-code'],
    ['1\ttable\t\t1\t1\t1\t1\t0', 'invalid-code'],
    ['1\tpartitioned\t9\t1\t1\t1\t1\t1', 'invalid-dimension'],
    ['1\tdyadic\t1\t1\t1\t1\t65\t1\t0', 'invalid-scale'],
    ['1\tdyadic\t1\t1\t1\t1\t-1\t1\t0', 'invalid-scale'],
    ['1\tdyadic\t1\t1\t1\t1\t01\t1\t0', 'invalid-scale'],
    ['1\tcomplex\t1\t2\t1\t1,2\t3\t4,5\t6,7', 'shape-mismatch'],
    ['1\ttropical\t1\t1\t1\tinf\t1', 'invalid-integer'],
    [request(1, 'recenter', csv(Array(65).fill(0))), 'shape-mismatch'],
    ['x'.repeat(16385), 'request-too-large'],
    ['x'.repeat(32768), 'request-too-large'],
    [new Uint8Array([0xff]), 'malformed-request'],
  ];
  for (const [value, code] of negative) await expect(machine, value, error(code), `typed ${code} rejection`);
}

export async function runRuntimeChecks(id) {
  const machine = await runtime();
  if (id === 'MM-01') await exactCases(machine);
  else if (id === 'MM-02') await codecCases(machine);
  else if (id === 'MM-03') { await tableCases(machine); await partitionCases(machine); }
  else if (id === 'MM-04') await complexAndDyadicCases(machine);
  else if (id === 'MM-05') await tropicalCases(machine);
  else if (id === 'MM-06') await gaugeCases(machine);
  else if (id === 'MM-07') await protocolCases(machine);
  else if (id === 'MM-11') {
    await exactCases(machine);
    await tableCases(machine);
    const value = request(1, 'matmul', 1, 2, 1, '2,3', '5,7');
    const observed = await machine.dispatch(value);
    assert.equal(observed, success(1, 1, [31n]));
    // The same assertion used above must reject a plausible altered result.
    assert.throws(() => assert.equal(observed, success(1, 1, [30n])), assert.AssertionError);
  } else throw new Error(`No runtime acceptance registered for ${id}`);
  assert(machine.calls > 0, 'runtime acceptance must execute the generated dispatcher');
  return { schema: 'lexlean-matmul/runtime-acceptance/1', id, build_id: machine.buildId, wasm_sha256: machine.wasmSha256, requests: machine.calls, status: 'passed' };
}

export { runtime, expect, request, success, csv };
