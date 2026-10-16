import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runtime, expect as runtimeExpect, request, success, csv } from './runtime-oracle.mjs';
import { evidenceRoot, sha, writeJson, sourceModules, readJson, confined } from './evidence.mjs';

let currentCase;
async function expect(machine, value, expected, label) {
  currentCase = { label, request_sha256: sha(value), request_bytes: Buffer.byteLength(value) };
  return runtimeExpect(machine, value, expected, label);
}

// Test-only scalar arithmetic. IEEE values use a signed BigInt coefficient and
// binary exponent; the LexLean implementation uses lists of binary digits.
const formats = {
  f32: { fraction: 23, bias: 127, maximumExponent: 255, bits: 32 },
  f64: { fraction: 52, bias: 1023, maximumExponent: 2047, bits: 64 },
};
const modes = ['nearest', 'toward-zero', 'saturating', 'wrapping'];
const largest = 10n ** 64n - 1n;
const finite = (coefficient, exponent = 0) => ({ kind: 'finite', coefficient: BigInt(coefficient), exponent });
const infinity = negative => ({ kind: 'infinity', negative });
const nan = () => ({ kind: 'nan' });
const sign = value => value.kind === 'finite' ? value.coefficient < 0n : value.negative;
const zero = value => value.kind === 'finite' && value.coefficient === 0n;
const power = exponent => 1n << BigInt(exponent);

function decode(format, code) {
  const f = formats[format], raw = BigInt(code);
  assert(raw >= 0n && raw < power(f.bits));
  const fraction = raw & (power(f.fraction) - 1n);
  const exponent = Number((raw >> BigInt(f.fraction)) & BigInt(f.maximumExponent));
  const negative = (raw >> BigInt(f.bits - 1)) !== 0n;
  if (exponent === f.maximumExponent) return fraction === 0n ? infinity(negative) : nan();
  const significand = exponent === 0 ? fraction : power(f.fraction) + fraction;
  return finite(negative ? -significand : significand,
    (exponent === 0 ? 1 - f.bias : exponent - f.bias) - f.fraction);
}

function add(a, b) {
  if (a.kind === 'nan' || b.kind === 'nan') return nan();
  if (a.kind === 'infinity' && b.kind === 'infinity') return a.negative === b.negative ? a : nan();
  if (a.kind === 'infinity') return a;
  if (b.kind === 'infinity') return b;
  const exponent = Math.min(a.exponent, b.exponent);
  return finite(a.coefficient * power(a.exponent - exponent) + b.coefficient * power(b.exponent - exponent), exponent);
}

function multiply(a, b) {
  if (a.kind === 'nan' || b.kind === 'nan') return nan();
  if (a.kind === 'infinity' || b.kind === 'infinity') {
    return zero(a) || zero(b) ? nan() : infinity(sign(a) !== sign(b));
  }
  return finite(a.coefficient * b.coefficient, a.exponent + b.exponent);
}

function roundedShift(magnitude, exponent, nearest) {
  if (exponent >= 0) return magnitude * power(exponent);
  const divisor = power(-exponent), whole = magnitude / divisor, remainder = magnitude % divisor;
  return nearest && (2n * remainder > divisor || (2n * remainder === divisor && (whole & 1n) === 1n)) ? whole + 1n : whole;
}

function encode(format, mode, value) {
  const f = formats[format], fractionPlace = power(f.fraction), signPlace = power(f.bits - 1);
  if (value.kind === 'nan') return BigInt(f.maximumExponent) * fractionPlace + (fractionPlace >> 1n);
  const signed = sign(value) ? signPlace : 0n;
  if (value.kind === 'infinity') return signed + BigInt(f.maximumExponent) * fractionPlace;
  if (value.coefficient === 0n) return 0n;
  const magnitude = value.coefficient < 0n ? -value.coefficient : value.coefficient;
  const nearest = mode === 'nearest';
  let exponent = magnitude.toString(2).length - 1 + value.exponent;
  const minimumNormal = 1 - f.bias;
  if (exponent < minimumNormal) {
    const significand = roundedShift(magnitude, value.exponent - minimumNormal + f.fraction, nearest);
    return signed + significand;
  }
  let significand = roundedShift(magnitude, value.exponent - exponent + f.fraction, nearest);
  if (significand === 2n * fractionPlace) { significand >>= 1n; exponent += 1; }
  if (exponent > f.bias) {
    return signed + (nearest ? BigInt(f.maximumExponent) * fractionPlace : BigInt(f.maximumExponent) * fractionPlace - 1n);
  }
  return signed + BigInt(exponent + f.bias) * fractionPlace + significand - fractionPlace;
}

function signedEncode(width, mode, coefficient, scale = 0) {
  const negative = coefficient < 0n, magnitude = negative ? -coefficient : coefficient;
  const rounded = roundedShift(magnitude, -scale, mode === 'nearest');
  const value = negative ? -rounded : rounded;
  if (mode === 'wrapping') return BigInt.asIntN(width, value);
  const minimum = -power(width - 1), maximum = power(width - 1) - 1n;
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

function seeded(seed) {
  let state = seed >>> 0;
  return bound => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % bound; };
}

function product(rows, inner, columns, a, b, plus = (a, b) => a + b, times = (a, b) => a * b, initial = 0n) {
  assert.equal(a.length, rows * inner); assert.equal(b.length, inner * columns);
  const output = [];
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    let value = initial;
    for (let index = 0; index < inner; index += 1) value = plus(value, times(a[row * inner + index], b[index * columns + column]));
    output.push(value);
  }
  return output;
}

const floatProduct = (format, rows, inner, columns, a, b) => product(rows, inner, columns,
  a.map(code => decode(format, code)), b.map(code => decode(format, code)), add, multiply, finite(0n));
const floatCodes = (format, mode, values) => values.map(value => encode(format, mode, value));
export const ieeeOracle = Object.freeze({ decode, encode, add, multiply });
const floatLinear = (values, prior, alpha, beta) => values.map((value, index) => {
  const scaled = multiply(finite(alpha), value);
  return beta === 0n ? scaled : add(scaled, multiply(finite(beta), prior[index]));
});

async function wideFiniteEncodingCase(machine) {
  const format = 'f64', f = formats[format];
  const one = BigInt(f.bias) << BigInt(f.fraction), negative = power(f.bits - 1);
  const maximum = (BigInt(f.maximumExponent) << BigInt(f.fraction)) - 1n;
  const a = Array.from({ length: 8 * 4 }, (_, index) => [maximum, 1n, maximum, maximum][index % 4]);
  const b = Array.from({ length: 4 * 8 }, (_, index) => [maximum, 1n, maximum + negative, one][Math.floor(index / 8)]);
  const exact = floatProduct(format, 8, 4, 8, a, b);
  const retained = add(decode(format, maximum), multiply(decode(format, 1n), decode(format, 1n)));
  assert.equal(retained.kind, 'finite');
  assert.equal(retained.coefficient.toString(2).length, 3172);
  assert(exact.every(value => value.kind === 'finite' && value.coefficient === retained.coefficient && value.exponent === retained.exponent));
  const output = floatCodes(format, 'nearest', exact);
  assert(output.every(code => code === maximum), 'A tiny positive residual must retain the largest finite binary64 output');
  const input = request(1, 'ieee', format, 'nearest', 8, 4, 8, csv(a), csv(b));
  assert(Buffer.byteLength(input) <= 16384, 'Wide finite IEEE request must fit the declared byte bound');
  await expect(machine, input, success(8, 8, output), 'binary64 8×8 wide finite encoding with a retained smallest-product sticky bit');
  const prior = Array(64).fill(maximum);
  const scaled = floatLinear(exact, prior.map(code => decode(format, code)), largest, -largest);
  const scaledOutput = floatCodes(format, 'nearest', scaled);
  assert(scaled.every(value => value.kind === 'finite' && value.coefficient === largest && value.exponent === -2148));
  assert(scaledOutput.every(code => code === 0n), 'Exact cancellation must leave only alpha times the smallest-product residual');
  const gemmInput = request(1, 'ieee-gemm', format, 'nearest', largest, -largest, 8, 4, 8, csv(a), csv(b), csv(prior));
  assert(Buffer.byteLength(gemmInput) <= 16384, 'Wide finite GEMM must fit the declared byte bound');
  await expect(machine, gemmInput, success(8, 8, scaledOutput), 'binary64 8×8 wide finite exact integer epilogue cancellation');
}

async function denseSignificandCases(machine) {
  const code = 0x3ff5555555555555n;
  const values = Array(64).fill(code), prior = Array(64).fill(0n);
  const exact = floatProduct('f64', 8, 8, 8, values, values);
  const scalarProduct = multiply(decode('f64', code), decode('f64', code));
  const eightProducts = multiply(finite(8n), scalarProduct);
  assert(exact.every(value => value.kind === 'finite' && value.coefficient === eightProducts.coefficient && value.exponent === eightProducts.exponent));
  for (const alpha of [1n, largest]) {
    const output = floatCodes('f64', 'nearest', floatLinear(exact, prior.map(value => decode('f64', value)), alpha, 0n));
    assert(output.every(value => value === encode('f64', 'nearest', multiply(finite(alpha), eightProducts))));
    const input = alpha === 1n
      ? request(1, 'ieee', 'f64', 'nearest', 8, 8, 8, csv(values), csv(values))
      : request(1, 'ieee-gemm', 'f64', 'nearest', alpha, 0, 8, 8, 8, csv(values), csv(values), csv(prior));
    assert(Buffer.byteLength(input) <= 16384, 'Dense significand request must fit the declared byte bound');
    await expect(machine, input, success(8, 8, output), `binary64 8×8 dense significands with ${alpha === 1n ? 'direct reduction' : '64-digit integer epilogue'}`);
  }
}

async function ieeeCases(machine) {
  await wideFiniteEncodingCase(machine);
  await denseSignificandCases(machine);
  const random = seeded(0x69656565);
  for (const [format, f] of Object.entries(formats)) {
    const one = BigInt(f.bias) << BigInt(f.fraction), negative = power(f.bits - 1);
    const half = BigInt(f.bias - 1) << BigInt(f.fraction);
    const two = BigInt(f.bias + 1) << BigInt(f.fraction);
    const inf = BigInt(f.maximumExponent) << BigInt(f.fraction);
    const maximum = inf - 1n, minimumNormal = power(f.fraction), maximumSubnormal = minimumNormal - 1n;
    const huge = encode(format, 'nearest', finite(power(f.fraction + 1)));
    const halfUlp = encode(format, 'nearest', finite(1n, -f.fraction - 1));
    const values = [
      [1, 0, 1, [], []], [0, 2, 2, [], [one, one, one, one]], [1, 2, 0, [one, one], []],
      [1, 1, 1, [negative], [one]], [1, 1, 1, [negative], [negative]],
      [1, 3, 1, [huge, one, huge + negative], [one, one, one]],
      [1, 2, 1, [one, halfUlp], [one, one]],
      [1, 2, 1, [one + 1n, halfUlp], [one, one]],
      [1, 1, 1, [1n], [half]], [1, 1, 1, [negative + 1n], [half]],
      [1, 1, 1, [3n], [half]], [1, 1, 1, [maximumSubnormal], [one]],
      [1, 2, 1, [maximumSubnormal, 1n], [one, half]],
      [1, 2, 1, [minimumNormal, maximumSubnormal], [one, one + negative]],
      [1, 1, 1, [maximum], [two]], [1, 1, 1, [maximum + negative], [two]],
      [1, 1, 1, [inf + 1n], [one]], [1, 1, 1, [0n], [inf]],
      [1, 1, 1, [inf + negative + 31n], [one]],
      [1, 2, 1, [inf, inf + negative], [one, one]],
      [1, 1, 1, [inf + negative], [one]],
    ];
    // Fixed independent sentinels guard the oracle's own rounding boundaries.
    assert.equal(encode(format, 'nearest', finite(1n)), one);
    assert.equal(encode(format, 'nearest', finite(1n, 1 - f.bias - f.fraction)), 1n);
    assert.equal(encode(format, 'nearest', finite(-1n, -f.bias - f.fraction)), negative);
    assert.equal(encode(format, 'nearest', add(decode(format, huge), add(finite(1n), decode(format, huge + negative)))), one);
    const nextCode = () => BigInt(random(2)) * negative + BigInt(f.bias - 5 + random(11)) * power(f.fraction) + BigInt(random(100000));
    const seededCases = [];
    for (let index = 0; index < 8; index += 1) {
      const rows = 1 + random(3), inner = random(5), columns = 1 + random(3);
      seededCases.push([rows, inner, columns, Array.from({ length: rows * inner }, nextCode), Array.from({ length: inner * columns }, nextCode)]);
    }
    for (const mode of modes) {
      for (const [rows, inner, columns, a, b] of [...values, ...seededCases]) {
        const output = floatCodes(format, mode, floatProduct(format, rows, inner, columns, a, b));
        await expect(machine, request(1, 'ieee', format, mode, rows, inner, columns, csv(a), csv(b)), success(rows, columns, output), `${format} ${mode} exact reduction`);
      }
      for (const [rows, inner, columns, a, b] of seededCases.slice(0, 4)) {
        const prior = Array.from({ length: rows * columns }, nextCode);
        const alpha = -largest, beta = largest;
        const output = floatCodes(format, mode, floatLinear(floatProduct(format, rows, inner, columns, a, b), prior.map(code => decode(format, code)), alpha, beta));
        await expect(machine, request(1, 'ieee-gemm', format, mode, alpha, beta, rows, inner, columns, csv(a), csv(b), csv(prior)), success(rows, columns, output), `${format} integer scalar GEMM`);
      }
      await expect(machine, request(1, 'ieee-gemm', format, mode, 1, 0, 1, 1, 1, one, one, inf + 1n), success(1, 1, [one]), 'zero beta bypasses old NaN');
      await expect(machine, request(1, 'ieee-gemm', format, mode, 0, 0, 1, 1, 1, inf, one, one), success(1, 1, [encode(format, mode, nan())]), 'zero alpha times infinity');
      const book = [one, one + negative, two, inf + 1n], codes = [0, 1, 2, 1, 2, 0];
      const a = [one, half, two, one, two, half];
      const output = floatCodes(format, mode, floatProduct(format, 2, 3, 2, a, codes.map(code => book[code])));
      await expect(machine, request(1, 'ieee-table', format, mode, csv(book), 2, 3, 2, csv(a), csv(codes)), success(2, 2, output), 'IEEE gather does not propagate unused NaN codebook entry');
    }
    await expect(machine, request(1, 'ieee', format, 'nearest', 8, 0, 8, '', ''), success(8, 8, Array(64).fill(0n)), 'maximum output geometry and empty IEEE reduction');
    // Mix the largest finite product and the smallest subnormal product
    // before cancellation. Binary64 must retain a roughly 4,200-bit span.
    for (const dimension of [2, 8]) {
      const inner = dimension === 2 ? 4 : 8;
      const a = Array.from({ length: dimension * inner }, (_, index) => index % 2 === 0 ? maximum : 1n);
      const b = Array.from({ length: inner * dimension }, (_, index) => {
        const reduction = Math.floor(index / dimension);
        return (reduction % 2 === 0 ? maximum : 1n) + (reduction % 4 >= 2 ? negative : 0n);
      });
      await expect(machine, request(1, 'ieee', format, 'nearest', dimension, inner, dimension, csv(a), csv(b)),
        success(dimension, dimension, Array(dimension * dimension).fill(0n)), `${format} ${dimension}x${dimension} extreme exact cancellation`);
    }
  }
  for (const value of [
    request(1, 'ieee', 'f16', 'nearest', 1, 1, 1, 0, 0),
    request(1, 'ieee', 'f32', 'upward', 1, 1, 1, 0, 0),
    request(1, 'ieee', 'f32', 'nearest', 1, 1, 1, -1, 0),
    request(1, 'ieee', 'f32', 'nearest', 1, 1, 1, power(32), 0),
    request(1, 'ieee', 'f64', 'nearest', 1, 1, 1, power(64), 0),
    request(1, 'ieee-table', 'f32', 'nearest', '', 1, 1, 1, 0, 0),
    request(1, 'ieee-table', 'f32', 'nearest', 0, 1, 1, 1, 0, 1),
  ]) await expect(machine, value, request(1, 'error', 'invalid-code'), 'typed IEEE code rejection');
}

async function encodingCases(machine) {
  const random = seeded(0x656e636f);
  assert.equal(signedEncode(8, 'wrapping', 255n), -1n);
  assert.equal(signedEncode(8, 'nearest', 255n), 127n);
  assert.equal(signedEncode(8, 'nearest', -257n), -128n);
  assert.equal(signedEncode(8, 'nearest', 5n, 1), 2n);
  assert.equal(signedEncode(8, 'nearest', 7n, 1), 4n);
  for (const width of [1, 2, 8, 16, 32, 64]) for (const mode of modes) {
    const values = [-largest, -power(width), -power(width - 1), -3n, 0n, 3n, power(width - 1), power(width), largest];
    for (const value of values) {
      await expect(machine, request(1, 'encode', width, mode, 1, 1, 1, value, 1), success(1, 1, [signedEncode(width, mode, value)]), `${width}-bit ${mode} exact integer encoding`);
    }
    for (const [coefficient, scale] of [[5n, 1], [7n, 1], [-5n, 1], [-7n, 1], [largest, 64], [-largest, 64]]) {
      await expect(machine, request(1, 'encode-dyadic', width, mode, 1, 1, 1, coefficient, scale, 1, 0), success(1, 1, [signedEncode(width, mode, coefficient, scale)]), `${width}-bit ${mode} dyadic terminal encoding`);
    }
  }
  for (let test = 0; test < 24; test += 1) {
    const rows = 1 + random(4), inner = random(9), columns = 1 + random(4), width = 1 + random(64), mode = modes[random(modes.length)];
    const a = Array.from({ length: rows * inner }, () => BigInt(random(100001) - 50000));
    const b = Array.from({ length: inner * columns }, () => BigInt(random(100001) - 50000));
    await expect(machine, request(1, 'encode', width, mode, rows, inner, columns, csv(a), csv(b)), success(rows, columns,
      product(rows, inner, columns, a, b).map(value => signedEncode(width, mode, value))), 'seeded signed terminal encoding');
    const aScale = a.map(() => random(65)), bScale = b.map(() => random(65));
    const exact = product(rows, inner, columns, a.map((value, index) => finite(value, -aScale[index])),
      b.map((value, index) => finite(value, -bScale[index])), add, multiply, finite(0n));
    await expect(machine, request(1, 'encode-dyadic', width, mode, rows, inner, columns, csv(a), csv(aScale), csv(b), csv(bScale)),
      success(rows, columns, exact.map(value => signedEncode(width, mode, value.coefficient, -value.exponent))), 'seeded dyadic exact reduction then terminal encoding');
  }
  await expect(machine, request(1, 'encode', 8, 'nearest', 1, 3, 1, csv([largest, 1n, -largest]), '1,1,1'), success(1, 1, [1n]), 'terminal integer encoding follows exact late cancellation');
  for (const value of [request(1, 'encode', 0, 'nearest', 1, 1, 1, 1, 1), request(1, 'encode', 65, 'nearest', 1, 1, 1, 1, 1),
    request(1, 'encode', 8, 'invalid', 1, 1, 1, 1, 1)]) await expect(machine, value, request(1, 'error', 'invalid-code'), 'typed output-encoding rejection');
  await expect(machine, request(1, 'encode-dyadic', 8, 'nearest', 1, 1, 1, 1, 65, 1, 0), request(1, 'error', 'invalid-scale'), 'dyadic encoding scale envelope');
}

const tropicalCsv = values => values.map(value => value === null ? '-inf' : String(value)).join(',');
const tropicalAdd = (a, b) => a === null ? b : b === null ? a : a > b ? a : b;
const tropicalMultiply = (a, b) => a === null || b === null ? null : a + b;
function tropicalEncode(width, mode, value) {
  if (value === null) return null;
  assert(width >= 2);
  const minimum = -power(width - 1) + 1n, maximum = power(width - 1) - 2n;
  if (mode === 'wrapping') return BigInt.asUintN(128, value - minimum) % (power(width) - 2n) + minimum;
  return value < minimum ? minimum : value > maximum ? maximum : value;
}
const complex = (real, imaginary) => ({ real, imaginary });
const complexAdd = (a, b) => complex(a.real + b.real, a.imaginary + b.imaginary);
const complexMultiply = (a, b) => complex(a.real * b.real - a.imaginary * b.imaginary, a.real * b.imaginary + a.imaginary * b.real);

async function epilogueCases(machine) {
  const random = seeded(0x6570696c);
  const shapes = [[0, 3, 2], [2, 0, 3], [2, 3, 0], [1, 3, 1], [8, 1, 8]];
  for (let test = 0; test < 18; test += 1) shapes.push([1 + random(4), random(9), 1 + random(4)]);
  for (const [rows, inner, columns] of shapes) {
    const values = length => Array.from({ length }, () => BigInt(random(101) - 50));
    const a = values(rows * inner), b = values(inner * columns), c = values(rows * columns), bias = values(columns);
    const alpha = -largest, beta = largest;
    const ab = product(rows, inner, columns, a, b);
    await expect(machine, request(1, 'bias', rows, inner, columns, csv(bias), csv(a), csv(b)), success(rows, columns,
      ab.map((value, index) => value + bias[index % columns])), 'exact column bias');
    await expect(machine, request(1, 'bias-gemm', alpha, beta, rows, inner, columns, csv(bias), csv(a), csv(b), csv(c)), success(rows, columns,
      ab.map((value, index) => alpha * value + beta * c[index] + bias[index % columns])), 'exact biased integer linear epilogue');

    const ai = values(a.length), bi = values(b.length), ci = values(c.length);
    const ca = a.map((value, index) => complex(value, ai[index]));
    const cb = b.map((value, index) => complex(value, bi[index]));
    const cc = c.map((value, index) => complex(value, ci[index]));
    const cab = product(rows, inner, columns, ca, cb, complexAdd, complexMultiply, complex(0n, 0n));
    const linear = cab.map((value, index) => complex(alpha * value.real + beta * cc[index].real, alpha * value.imaginary + beta * cc[index].imaginary));
    const complexResult = output => request(1, 'ok', rows, columns, csv(output.map(value => value.real)), csv(output.map(value => value.imaginary)));
    await expect(machine, request(1, 'complex-gemm', alpha, beta, rows, inner, columns, csv(a), csv(ai), csv(b), csv(bi), csv(c), csv(ci)), complexResult(linear), 'complex exact integer scalars');
    await expect(machine, request(1, 'complex-bias', rows, inner, columns, csv(bias), csv(a), csv(ai), csv(b), csv(bi)), complexResult(cab.map((value, index) => complex(value.real + bias[index % columns], value.imaginary))), 'complex real-valued column bias');
    await expect(machine, request(1, 'complex-bias-gemm', alpha, beta, rows, inner, columns, csv(bias), csv(a), csv(ai), csv(b), csv(bi), csv(c), csv(ci)), complexResult(linear.map((value, index) => complex(value.real + bias[index % columns], value.imaginary))), 'complex biased linear epilogue');
    const width = 1 + random(64), mode = modes[random(modes.length)];
    await expect(machine, request(1, 'complex-encode', width, mode, alpha, beta, rows, inner, columns, csv(a), csv(ai), csv(b), csv(bi), csv(c), csv(ci)), complexResult(linear.map(value => complex(signedEncode(width, mode, value.real), signedEncode(width, mode, value.imaginary)))), 'complex components encode after exact epilogue');

    const ta = a.map(value => random(4) === 0 ? null : value), tb = b.map(value => random(4) === 0 ? null : value), tc = c.map(value => random(4) === 0 ? null : value);
    const tropical = product(rows, inner, columns, ta, tb, tropicalAdd, tropicalMultiply, null);
    const talpha = random(3) === 0 ? null : -largest, tbeta = random(3) === 0 ? null : largest;
    const tlinear = tropical.map((value, index) => tropicalAdd(tropicalMultiply(talpha, value), tropicalMultiply(tbeta, tc[index])));
    const token = value => value === null ? '-inf' : value;
    await expect(machine, request(1, 'tropical-gemm', token(talpha), token(tbeta), rows, inner, columns, tropicalCsv(ta), tropicalCsv(tb), tropicalCsv(tc)), request(1, 'ok', rows, columns, tropicalCsv(tlinear)), 'max-plus linear epilogue preserves masks');
    const tropicalWidth = Math.max(2, width);
    await expect(machine, request(1, 'tropical-encode', tropicalWidth, mode, token(talpha), token(tbeta), rows, inner, columns, tropicalCsv(ta), tropicalCsv(tb), tropicalCsv(tc)), request(1, 'ok', rows, columns, tropicalCsv(tlinear.map(value => tropicalEncode(tropicalWidth, mode, value)))), 'max-plus finite output encoding preserves masks');
  }
  await expect(machine, request(1, 'bias', 1, 3, 1, 7, csv([largest, 1n, -largest]), '1,1,1'), success(1, 1, [8n]), 'bias follows exact late cancellation');
  await expect(machine, request(1, 'bias', 1, 1, 2, 7, 1, '1,2'), request(1, 'error', 'shape-mismatch'), 'bias shape rejection');
  await expect(machine, request(1, 'complex-gemm', 1, 0, 1, 1, 1, 1, 0, 2, 0, '0,9', 0),
    request(1, 'error', 'shape-mismatch'), 'zero beta still rejects unequal old complex component arrays');
  assert.equal(tropicalEncode(8, 'wrapping', -128n), -124n);
  for (const mode of modes) for (const value of [-129n, -128n, -127n, 0n, 126n, 127n, 128n]) {
    await expect(machine, request(1, 'tropical-encode', 8, mode, 0, '-inf', 1, 1, 1, value, 0, '-inf'),
      success(1, 1, [tropicalEncode(8, mode, value)]), 'tropical codec reserves both signed endpoints');
  }
  await expect(machine, request(1, 'tropical-encode', 1, 'nearest', 0, '-inf', 1, 1, 1, 0, 0, '-inf'), request(1, 'error', 'invalid-code'), 'one-bit tropical alphabet rejection');
}

// Source ownership is checked beside execution: equal IEEE bytes alone do
// not establish that the declared canonical Laurent construction is shipped.
export function atlasSourceContract(modules = sourceModules()) {
  const atlas = modules.find(module => module.module === 'Atlas');
  const floating = modules.find(module => module.module === 'Float');
  assert(atlas && floating, 'MM-16 requires Atlas and Float model sources');
  const definitions = module => new Map(module.semantic.declarations.filter(row => row.kind === 'definition').map(row => [row.name, row]));
  const atlasDefinitions = definitions(atlas), floatDefinitions = definitions(floating);
  const body = floatDefinitions.get('floatMultiply')?.body;
  const finiteProduct = body?.else_value?.then_value;
  assert.equal(finiteProduct?.kind, 'call');
  assert.equal(finiteProduct.function.name, 'finiteFromAtlas');
  assert.equal(finiteProduct.arguments.length, 1);
  assert.deepEqual(finiteProduct.arguments[0].function, { module: 'Atlas', name: 'atlasMultiply' });
  assert.deepEqual(finiteProduct.arguments[0].arguments.map(argument => [argument.value?.name, argument.field]),
    [['x', 'negative'], ['x', 'digits'], ['x', 'scale'], ['y', 'negative'], ['y', 'digits'], ['y', 'scale']]);
  assert(!floatDefinitions.has('productBits'), 'Finite IEEE products must not retain the binary long-multiplication route');
  function walk(node, visit) {
    if (!node || typeof node !== 'object') return;
    visit(node);
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(value => walk(value, visit));
      else if (child && typeof child === 'object') walk(child, visit);
    }
  }
  function calls(name) {
    const definition = atlasDefinitions.get(name);
    assert(definition, `Missing Atlas construction ${name}`);
    const result = new Set();
    walk(definition.body, node => {
      if (node.kind === 'call') {
        assert(!node.function.module || node.function.module === 'Atlas', 'Atlas construction must not delegate its arithmetic');
        result.add(node.function.name);
      }
      assert(!(node.kind === 'primitive' && node.operation === 'multiply'), 'Atlas forms products by its finite digit table');
    });
    return result;
  }
  const requiredEdges = {
    atlasMultiply: ['canonicalWord', 'multiplyWords'],
    canonicalWord: ['atlasNormalizeOwned', 'stripValuation', 'wordFromValuation'],
    multiplyWords: ['addGrade', 'productUnits', 'place'],
    productUnits: ['atomsOwned', 'contractAtoms'],
    atomsOwned: ['nafDigitsOwned', 'atomsAtOwned'],
    atomsAtOwned: ['mu', 'nextGrade'],
    contractAtoms: ['contractRow'],
    contractRow: ['offer', 'digitProduct'],
    offer: ['addSigned', 'atlasShiftBitsOwned'],
  };
  for (const name of atlasDefinitions.keys()) calls(name);
  for (const [name, targets] of Object.entries(requiredEdges)) {
    const observed = calls(name);
    for (const target of targets) assert(observed.has(target), `${name} must execute ${target}`);
  }
  const proofs = atlas.semantic.declarations.filter(row => row.kind === 'theorem');
  for (const name of ['muInvolutive', 'digitProductCommutative', 'zeroAbsorbsProduct', 'modalityMu',
    'valuationTwelveHalves', 'nafThree', 'nafSeven', 'naf64BitOnesNonAdjacent',
    'addressRoundTripNegative65', 'addressRoundTripNegative33', 'addressRoundTripNegative32',
    'addressRoundTripNegative1', 'addressRoundTripPositive0', 'addressRoundTripPositive31',
    'addressRoundTripPositive32', 'addressRoundTripPositive33', 'addressRoundTripPositive65',
    'negativeGradeAddress', 'reconstructPositive3Scale2', 'reconstructNegative3Scale2',
    'lookupProductCase0', 'lookupProductCase6']) {
    assert(proofs.some(proof => proof.name === name), `Missing canonical Atlas certificate ${name}`);
  }
  return { atlas, floating, proofs, requiredEdges };
}

function atlasCertificateClosure(machine, contract) {
  const verifyBytes = fs.readFileSync(path.join(evidenceRoot, 'verify.json'));
  const verify = JSON.parse(verifyBytes);
  const source = readJson(path.join(evidenceRoot, 'source.json'));
  assert.equal(source.build_id, machine.buildId);
  assert.equal(sha(verifyBytes), source.verify_result_sha256);
  const build = readJson(path.join(evidenceRoot, 'build.json'));
  assert.equal(build.build_id, machine.buildId);
  assert.equal(verify.schema, 'prismpm/verify-result/1');
  assert.equal(verify.build_id, machine.buildId);
  assert.match(verify.attestation_id, /^[0-9a-f]{64}$/);
  assert.equal(verify.verified_root, `.prism/verified/${verify.attestation_id}`);
  const verified = confined(verify.verified_root);
  const manifestBytes = fs.readFileSync(path.join(verified, 'manifest.json'));
  assert.equal(sha(manifestBytes), verify.attestation_id);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.build_id, machine.buildId);
  const certificateBytes = fs.readFileSync(path.join(verified, 'lexlean-attestation.json'));
  assert.equal(sha(certificateBytes), manifest.lexlean_attestation_sha256);
  const certificate = JSON.parse(certificateBytes);
  assert.equal(certificate.spec, 'lexlean/attestation/1');
  assert.equal(certificate.status, 'verified');
  assert.equal(certificate.source_id, build.source_id);
  assert.equal(certificate.semantic_id, build.semantic_id);
  for (const proof of contract.proofs) {
    const observed = certificate.declarations.find(row => row.name === `LexLeanMatmul.Atlas.${proof.name}`);
    assert(observed, `Missing kernel evidence for Atlas.${proof.name}`);
    assert.equal(observed.result, 'ok');
    assert.deepEqual(observed.observed, proof.axioms ?? []);
    assert.deepEqual(observed.policy.axioms, proof.axioms ?? []);
    assert.equal(observed.policy.kind, (proof.axioms ?? []).length ? 'exact' : 'none');
  }
  for (const module of ['Atlas', 'Float']) for (const tool of ['lean', 'leanchecker']) {
    assert(certificate.processes.some(row => row.tool === tool && row.module.endsWith(`.${module}`) && row.exit_code === 0),
      `Missing ${tool} replay for ${module}`);
  }
  return { atlas_source_sha256: contract.atlas.sha256, float_source_sha256: contract.floating.sha256,
    kernel_attestation_id: certificate.attestation_id, atlas_theorems: contract.proofs.length,
    construction: 'canonical-valuation-naf-ternary-contraction' };
}

export async function runExtendedChecks(id) {
  const contract = id === 'MM-16' ? atlasSourceContract() : undefined;
  const machine = await runtime();
  const atlasEvidence = contract ? atlasCertificateClosure(machine, contract) : undefined;
  const failure = path.join(evidenceRoot, 'runtime-oracle', `${id}.failure.json`);
  fs.rmSync(failure, { force: true });
  try {
    if (id === 'MM-13' || id === 'MM-16') await ieeeCases(machine);
    else if (id === 'MM-14') await encodingCases(machine);
    else if (id === 'MM-15') await epilogueCases(machine);
    else throw new Error(`No extended runtime acceptance registered for ${id}`);
  } catch (error) {
    writeJson(failure, { schema: 'lexlean-matmul/runtime-failure/1', status: 'failed', id,
      build_id: machine.buildId, wasm_sha256: machine.wasmSha256, completed_requests: machine.calls,
      test_case: currentCase, error: { kind: error instanceof WebAssembly.RuntimeError ? 'WebAssembly.RuntimeError' : error.name,
        message: error.message } });
    throw error;
  }
  assert(machine.calls > 0);
  return { schema: 'lexlean-matmul/runtime-acceptance/1', id, build_id: machine.buildId,
    wasm_sha256: machine.wasmSha256, requests: machine.calls, status: 'passed',
    ...(atlasEvidence ? { atlas: atlasEvidence } : {}) };
}
