// Independent acceptance data and scalar arithmetic. These BigInt references
// execute only in verification; the shipped application remains LexLean.
import assert from 'node:assert/strict';
import { ieeeOracle } from './extended-oracle.mjs';

export const researchFamilies = Object.freeze(['matmul', 'gemm', 'coded', 'table', 'partitioned', 'complex', 'dyadic',
  'tropical', 'recenter', 'ieee', 'ieee-gemm', 'ieee-table', 'encode', 'encode-dyadic', 'bias', 'bias-gemm',
  'complex-gemm', 'complex-bias', 'complex-bias-gemm', 'tropical-gemm', 'complex-encode', 'tropical-encode', 'codec', 'arena']);
export const roundingModes = Object.freeze(['nearest', 'toward-zero', 'saturating', 'wrapping']);
export const traceColumns = Object.freeze(['Phase', 'Index', 'Left', 'Right', 'Product', 'Before', 'After']);
const list = values => values.map(value => value === null ? '-inf' : String(value)).join(',');
const wire = (...values) => values.map(String).join('\t');
const integer = text => { assert.match(text, /^(?:0|[1-9][0-9]*|-[1-9][0-9]*)$/); return BigInt(text); };
const pow = n => 1n << BigInt(n);
const rational = (coefficient, scale = 0) => ({ coefficient: BigInt(coefficient), scale });
const rationalAdd = (a, b) => { const scale = Math.max(a.scale, b.scale); return rational(a.coefficient * pow(scale - a.scale) + b.coefficient * pow(scale - b.scale), scale); };
const rationalMultiply = (a, b) => rational(a.coefficient * b.coefficient, a.scale + b.scale);
const complex = (real, imaginary) => ({ real: BigInt(real), imaginary: BigInt(imaginary) });
const complexAdd = (a, b) => complex(a.real + b.real, a.imaginary + b.imaginary);
const complexMultiply = (a, b) => complex(a.real * b.real - a.imaginary * b.imaginary, a.real * b.imaginary + a.imaginary * b.real);
const tropicalAdd = (a, b) => a === null ? b : b === null ? a : a > b ? a : b;
const tropicalMultiply = (a, b) => a === null || b === null ? null : a + b;
export const scalarReferences = Object.freeze({ rational, rationalAdd, rationalMultiply, complex, complexAdd, complexMultiply,
  tropicalAdd, tropicalMultiply });

export function signedEncoding(width, mode, value) {
  assert(width >= 1 && width <= 64 && roundingModes.includes(mode));
  const x = typeof value === 'bigint' ? rational(value) : value;
  const negative = x.coefficient < 0n, magnitude = negative ? -x.coefficient : x.coefficient;
  const denominator = pow(x.scale), whole = magnitude / denominator, remainder = magnitude % denominator;
  const rounded = mode === 'nearest' && (2n * remainder > denominator || (2n * remainder === denominator && (whole & 1n))) ? whole + 1n : whole;
  const exact = negative ? -rounded : rounded;
  if (mode === 'wrapping') return BigInt.asIntN(width, exact);
  const low = -pow(width - 1), high = pow(width - 1) - 1n;
  return exact < low ? low : exact > high ? high : exact;
}
export function tropicalEncoding(width, mode, value) {
  assert(width >= 2 && width <= 64 && roundingModes.includes(mode));
  if (value === null) return null;
  const low = -pow(width - 1) + 1n, high = pow(width - 1) - 2n;
  return mode === 'wrapping' ? BigInt.asUintN(128, value - low) % (pow(width) - 2n) + low
    : value < low ? low : value > high ? high : value;
}
function ieeeRational(value) {
  return value.exponent >= 0 ? rational(value.coefficient * pow(value.exponent)) : rational(value.coefficient, -value.exponent);
}
export function scalarText(domain, value) {
  if (domain === 'integer') return String(value);
  if (domain === 'complex') return `(${value.real}) + (${value.imaginary})i`;
  if (domain === 'dyadic') return `${value.coefficient} / 2^${value.scale}`;
  if (domain === 'tropical') return value === null ? '-inf' : String(value);
  assert.equal(domain, 'ieee');
  if (value.kind === 'nan') return 'NaN';
  if (value.kind === 'infinity') return value.negative ? '-infinity' : '+infinity';
  return scalarText('dyadic', ieeeRational(value));
}
export function scalarEquivalent(text, domain, value) {
  assert.equal(typeof text, 'string');
  if (domain === 'integer') return integer(text) === value;
  if (domain === 'tropical') return value === null ? text === '-inf' : integer(text) === value;
  if (domain === 'complex') {
    const match = /^\((-?(?:0|[1-9][0-9]*))\) \+ \((-?(?:0|[1-9][0-9]*))\)i$/.exec(text);
    return Boolean(match) && integer(match[1]) === value.real && integer(match[2]) === value.imaginary;
  }
  if (domain === 'ieee' && value.kind !== 'finite') return text === scalarText(domain, value);
  const expected = domain === 'ieee' ? ieeeRational(value) : value;
  const match = /^(-?(?:0|[1-9][0-9]*)) \/ 2\^(0|[1-9][0-9]*)$/.exec(text);
  if (!match || Number(match[2]) > 16384) return false;
  const coefficient = integer(match[1]), scale = Number(match[2]);
  return coefficient * pow(expected.scale) === expected.coefficient * pow(scale);
}
function references(domain) {
  if (domain === 'integer') return { zero: 0n, add: (a, b) => a + b, multiply: (a, b) => a * b };
  if (domain === 'complex') return { zero: complex(0n, 0n), add: complexAdd, multiply: complexMultiply };
  if (domain === 'dyadic') return { zero: rational(0n), add: rationalAdd, multiply: rationalMultiply };
  if (domain === 'tropical') return { zero: null, add: tropicalAdd, multiply: tropicalMultiply };
  return { zero: { kind: 'finite', coefficient: 0n, exponent: 0 }, add: ieeeOracle.add, multiply: ieeeOracle.multiply };
}
function matrix(rows, inner, columns, a, b, arithmetic) {
  return Array.from({ length: rows * columns }, (_, index) => {
    const row = Math.floor(index / columns), column = index % columns;
    let result = arithmetic.zero;
    for (let k = 0; k < inner; k++) result = arithmetic.add(result, arithmetic.multiply(a[row * inner + k], b[k * columns + column]));
    return result;
  });
}
const values = (length, offset = 0) => Array.from({ length }, (_, i) => BigInt((i + offset) % 2 ? -(i + offset + 2) : i + offset + 2));
const hasLinear = family => ['gemm', 'bias-gemm', 'complex-gemm', 'complex-bias-gemm', 'complex-encode', 'tropical-gemm', 'tropical-encode', 'ieee-gemm'].includes(family);
const hasBias = family => ['bias', 'bias-gemm', 'complex-bias', 'complex-bias-gemm'].includes(family);
const isIeee = family => family.startsWith('ieee') || family === 'arena';
const oneBits = format => format === 'f32' ? 1065353216n : 4607182418800017408n;
const domainFor = family => family.startsWith('complex') ? 'complex' : family === 'dyadic' || family === 'encode-dyadic'
  ? 'dyadic' : family.startsWith('tropical') || family === 'recenter' ? 'tropical' : isIeee(family) ? 'ieee' : 'integer';

export function researchCase(family, options = {}) {
  assert(researchFamilies.includes(family));
  const rows = options.rows ?? 2, inner = options.inner ?? 3, columns = options.columns ?? 2;
  assert([rows, inner, columns].every(n => Number.isInteger(n) && n >= 0 && n <= 8));
  const domain = domainFor(family), format = options.format ?? 'f64', mode = options.mode ?? 'nearest', width = options.width ?? 8;
  const alpha = options.alpha ?? -3n, beta = options.beta ?? 2n;
  const ar = options.left ?? values(rows * inner), br = options.right ?? values(inner * columns, 5);
  const ai = values(rows * inner, 11), bi = values(inner * columns, 17), cr = values(rows * columns, 23), ci = values(rows * columns, 29);
  const as = ar.map((_, i) => i % 5), bs = br.map((_, i) => (i * 3 + 1) % 4), bias = values(columns, 31);
  const arithmetic = references(domain);
  let left = ar, right = br, prior = cr, fields, plan, codes, source, book;
  if (domain === 'complex') { left = ar.map((v, i) => complex(v, ai[i])); right = br.map((v, i) => complex(v, bi[i])); prior = cr.map((v, i) => complex(v, ci[i])); }
  if (domain === 'dyadic') { left = ar.map((v, i) => rational(v, as[i])); right = br.map((v, i) => rational(v, bs[i])); }
  if (domain === 'tropical') { left = ar.map((v, i) => i % 4 === 0 ? null : v); right = br.map((v, i) => i % 3 === 0 ? null : v); prior = cr.map((v, i) => i % 3 === 0 ? null : v); }
  let aBits, bBits, cBits;
  if (domain === 'ieee') {
    const encode = value => ieeeOracle.encode(format, 'nearest', { kind: 'finite', coefficient: value, exponent: -2 });
    aBits = options.leftBits ?? ar.map(encode); bBits = options.rightBits ?? br.map(encode); cBits = options.priorBits ?? cr.map(encode);
    assert.equal(aBits.length, rows * inner); assert.equal(bBits.length, inner * columns); assert.equal(cBits.length, rows * columns);
    left = aBits.map(v => ieeeOracle.decode(format, v)); right = bBits.map(v => ieeeOracle.decode(format, v)); prior = cBits.map(v => ieeeOracle.decode(format, v));
  }
  if (family === 'coded') { codes = br.map((_, i) => BigInt(i % 3)); right = codes.map(v => v - 1n); }
  if (family === 'table') { book = [-7n, 11n, 5n, -7n]; codes = br.map((_, i) => BigInt(i % book.length)); right = codes.map(v => book[Number(v)]); }
  if (family === 'codec') {
    plan = 'ternary:8:1'; codes = Array.from({ length: inner }, (_, row) => Array.from({ length: columns }, (_, col) => BigInt((row + col) % 4)));
    right = codes.flat().map(v => v === 0n ? -1n : v === 2n ? 1n : 0n);
  }
  if (family === 'ieee-table') {
    const one = oneBits(format); book = [one, one + (format === 'f32' ? 8388608n : 4503599627370496n), 0n];
    codes = br.map((_, i) => BigInt(i % book.length)); right = codes.map(v => ieeeOracle.decode(format, book[Number(v)]));
  }
  if (family === 'arena') {
    const one = oneBits(format), sign = format === 'f32' ? pow(31) : pow(63);
    source = [sign, one, 0n, one + (format === 'f32' ? 8388608n : 4503599627370496n), one];
    book = [...new Set(source)].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    codes = br.map((_, i) => BigInt(i % book.length)); right = codes.map(v => ieeeOracle.decode(format, book[Number(v % BigInt(book.length))]));
  }
  if (family === 'recenter') {
    const original = options.vector ?? [3n, null, 7n, -2n]; let maximum = null;
    for (const value of original) maximum = tropicalAdd(maximum, value);
    const normalized = original.map(v => v === null ? null : v - maximum);
    return { family, domain, rows: 1, columns: original.length, inner: original.length, original, maximum,
      request: wire(1, family, list(original)), expectedResponse: wire(1, 'ok', list(normalized), maximum === null ? '-inf' : maximum),
      output: normalized, arithmetic, format, mode, width, alpha, beta, normalize: true };
  }
  const reduced = matrix(rows, inner, columns, left, right, arithmetic);
  const linear = reduced.map((value, index) => {
    if (!hasLinear(family)) return value;
    if (domain === 'integer') return alpha * value + beta * prior[index];
    if (domain === 'complex') return complex(alpha * value.real + beta * prior[index].real, alpha * value.imaginary + beta * prior[index].imaginary);
    if (domain === 'tropical') return tropicalAdd(tropicalMultiply(alpha, value), tropicalMultiply(beta, prior[index]));
    const scaled = ieeeOracle.multiply({ kind: 'finite', coefficient: alpha, exponent: 0 }, value);
    return beta === 0n ? scaled : ieeeOracle.add(scaled,
      ieeeOracle.multiply({ kind: 'finite', coefficient: beta, exponent: 0 }, prior[index]));
  });
  const beforeEncoding = linear.map((value, index) => !hasBias(family) ? value : domain === 'complex'
    ? complex(value.real + bias[index % columns], value.imaginary) : value + bias[index % columns]);
  const output = beforeEncoding.map(value => domain === 'ieee' ? ieeeOracle.encode(format, mode, value)
    : family === 'encode' || family === 'encode-dyadic' ? signedEncoding(width, mode, value)
      : family === 'complex-encode' ? complex(signedEncoding(width, mode, value.real), signedEncoding(width, mode, value.imaginary))
        : family === 'tropical-encode' ? tropicalEncoding(width, mode, value) : value);
  const dims = [rows, inner, columns];
  if (family === 'matmul') fields = [...dims, list(ar), list(br)];
  else if (family === 'gemm') fields = [alpha, beta, ...dims, list(ar), list(br), list(cr)];
  else if (family === 'coded') fields = ['ternary', ...dims, list(ar), list(codes)];
  else if (family === 'table') fields = [list(book), ...dims, list(ar), list(codes)];
  else if (family === 'partitioned') fields = [2, ...dims, list(ar), list(br)];
  else if (family === 'complex') fields = [...dims, list(ar), list(ai), list(br), list(bi)];
  else if (family === 'dyadic') fields = [...dims, list(ar), list(as), list(br), list(bs)];
  else if (family === 'tropical') fields = [...dims, list(left), list(right)];
  else if (family === 'ieee') fields = [format, mode, ...dims, list(aBits), list(bBits)];
  else if (family === 'ieee-gemm') fields = [format, mode, alpha, beta, ...dims, list(aBits), list(bBits), list(cBits)];
  else if (family === 'ieee-table') fields = [format, mode, list(book), ...dims, list(aBits), list(codes)];
  else if (family === 'encode') fields = [width, mode, ...dims, list(ar), list(br)];
  else if (family === 'encode-dyadic') fields = [width, mode, ...dims, list(ar), list(as), list(br), list(bs)];
  else if (family === 'bias') fields = [...dims, list(bias), list(ar), list(br)];
  else if (family === 'bias-gemm') fields = [alpha, beta, ...dims, list(bias), list(ar), list(br), list(cr)];
  else if (family === 'complex-gemm') fields = [alpha, beta, ...dims, list(ar), list(ai), list(br), list(bi), list(cr), list(ci)];
  else if (family === 'complex-bias') fields = [...dims, list(bias), list(ar), list(ai), list(br), list(bi)];
  else if (family === 'complex-bias-gemm') fields = [alpha, beta, ...dims, list(bias), list(ar), list(ai), list(br), list(bi), list(cr), list(ci)];
  else if (family === 'tropical-gemm') fields = [alpha, beta, ...dims, list(left), list(right), list(prior)];
  else if (family === 'complex-encode') fields = [width, mode, alpha, beta, ...dims, list(ar), list(ai), list(br), list(bi), list(cr), list(ci)];
  else if (family === 'tropical-encode') fields = [width, mode, alpha, beta, ...dims, list(left), list(right), list(prior)];
  else if (family === 'codec') fields = ['direct', plan, ...dims, list(ar), codes.map(list).join('/')];
  else if (family === 'arena') fields = [format, 8, mode, list(source), ...dims, list(aBits), list(codes)];
  assert(fields, 'Every family must serialize a real request');
  let expectedResponse;
  if (domain === 'complex') expectedResponse = wire(1, 'ok', rows, columns, list(output.map(x => x.real)), list(output.map(x => x.imaginary)));
  else if (family === 'dyadic') expectedResponse = wire(1, 'ok', rows, columns, list(output.map(x => x.coefficient)), list(output.map(x => x.scale)));
  else if (family === 'tropical') {
    const witnesses = reduced.map((best, index) => {
      if (inner === 0) return 'none'; const row = Math.floor(index / columns), column = index % columns;
      for (let k = 0; k < inner; k++) if (tropicalMultiply(left[row * inner + k], right[k * columns + column]) === best) return String(k);
      assert.fail('An attaining tropical index must exist');
    });
    expectedResponse = wire(1, 'ok', rows, columns, list(output), witnesses.join(','));
  } else expectedResponse = wire(1, 'ok', rows, columns, list(output));
  return { family, domain, rows, columns, inner, request: wire(1, family, ...fields), expectedResponse,
    left, right, prior, reduced, linear, beforeEncoding, output, bias, alpha, beta, format, width, mode,
    arithmetic, fields: fields.map(String), hasLinear: hasLinear(family), hasBias: hasBias(family), normalize: false,
    codecPlan: plan, storedCodes: codes, book, source, aBits, bBits, cBits };
}
export function completeResearchCases() {
  const cases = researchFamilies.map(family => researchCase(family));
  assert.deepEqual(cases.map(x => x.family), [...researchFamilies]);
  return cases;
}
export function expectedAccumulation(fixture, row, column) {
  assert(!fixture.normalize && row >= 0 && row < fixture.rows && column >= 0 && column < fixture.columns);
  const steps = []; let total = fixture.arithmetic.zero;
  for (let index = 0; index < fixture.inner; index++) {
    const left = fixture.left[row * fixture.inner + index], right = fixture.right[index * fixture.columns + column];
    const product = fixture.arithmetic.multiply(left, right), before = total;
    total = fixture.arithmetic.add(total, product); steps.push({ index, left, right, product, before, after: total });
  }
  return steps;
}

export function ieeeTerminalCases() {
  return ['f32', 'f64'].flatMap(format => {
    const fraction = format === 'f32' ? 23n : 52n, exponent = format === 'f32' ? 8n : 11n;
    const one = oneBits(format), two = one + (1n << fraction), sign = 1n << (fraction + exponent);
    const infinity = ((1n << exponent) - 1n) << fraction;
    const half = one - (1n << fraction);
    const tiny = ieeeOracle.encode(format, 'nearest', {kind:'finite',coefficient:1n,exponent:-Number(fraction)-1});
    return roundingModes.flatMap(mode => [
      researchCase('ieee', {format,mode,rows:1,inner:2,columns:1,leftBits:[one,tiny],rightBits:[one,one]}),
      researchCase('ieee', {format,mode,rows:1,inner:1,columns:1,leftBits:[infinity-1n],rightBits:[two]}),
      researchCase('ieee', {format,mode,rows:1,inner:1,columns:1,leftBits:[1n],rightBits:[half]}),
      researchCase('ieee', {format,mode,rows:1,inner:1,columns:1,leftBits:[sign|1n],rightBits:[half]}),
      researchCase('ieee', {format,mode,rows:1,inner:2,columns:1,leftBits:[infinity,sign|infinity],rightBits:[one,one]}),
      researchCase('ieee-gemm', {format,mode,rows:1,inner:1,columns:1,alpha:1n,beta:0n,leftBits:[one],rightBits:[two],priorBits:[infinity|1n]}),
    ]);
  });
}

// Exact14 editable example outcomes retained from authenticated accepted main7c74.
export const preservedResearchExamples = Object.freeze([
  {
    "operation": "matmul",
    "example": "basic-2x2",
    "request": "1\tmatmul\t2\t2\t2\t1,2,3,4\t5,6,7,8",
    "response": "1\tok\t2\t2\t19,22,43,50"
  },
  {
    "operation": "matmul",
    "example": "rectangular",
    "request": "1\tmatmul\t2\t3\t2\t1,2,3,4,5,6\t7,8,9,10,11,12",
    "response": "1\tok\t2\t2\t58,64,139,154"
  },
  {
    "operation": "matmul",
    "example": "exact-cancellation",
    "request": "1\tmatmul\t1\t3\t1\t9007199254740992,1,-9007199254740992\t1,1,1",
    "response": "1\tok\t1\t1\t1"
  },
  {
    "operation": "gemm",
    "example": "scaled-update",
    "request": "1\tgemm\t2\t1\t1\t1\t1\t2\t3\t4",
    "response": "1\tok\t1\t1\t16"
  },
  {
    "operation": "coded",
    "example": "ternary-symbols",
    "request": "1\tcoded\tternary\t1\t3\t1\t1,2,3\t0,1,2",
    "response": "1\tok\t1\t1\t2"
  },
  {
    "operation": "table",
    "example": "ternary-table",
    "request": "1\ttable\t-1,0,1\t1\t3\t1\t1,2,3\t0,1,2",
    "response": "1\tok\t1\t1\t2"
  },
  {
    "operation": "float",
    "example": "single-rounding",
    "request": "1\tieee\tf32\tnearest\t1\t3\t1\t1065353216,864026624,3212836864\t1065353216,1065353216,1065353216",
    "response": "1\tok\t1\t1\t864026624"
  },
  {
    "operation": "float",
    "example": "binary64-product",
    "request": "1\tieee\tf64\tnearest\t1\t1\t1\t4607182418800017408\t4611686018427387904",
    "response": "1\tok\t1\t1\t4611686018427387904"
  },
  {
    "operation": "tropical",
    "example": "least-witness",
    "request": "1\ttropical\t1\t2\t1\t1,1\t2,2",
    "response": "1\tok\t1\t1\t3\t0"
  },
  {
    "operation": "complex",
    "example": "complex-product",
    "request": "1\tcomplex\t1\t1\t1\t1\t2\t3\t4",
    "response": "1\tok\t1\t1\t-5\t10"
  },
  {
    "operation": "dyadic",
    "example": "dyadic-product",
    "request": "1\tdyadic\t1\t1\t1\t3\t1\t5\t2",
    "response": "1\tok\t1\t1\t15\t3"
  },
  {
    "operation": "encode",
    "example": "encode-once",
    "request": "1\tencode\t8\twrapping\t1\t1\t1\t200\t2",
    "response": "1\tok\t1\t1\t-112"
  },
  {
    "operation": "codec",
    "example": "packed-symbols",
    "request": "1\tcodec\tdirect\tgrid:8:-1,0,1;packed:4\t1\t1\t4\t7\t36",
    "response": "1\tok\t1\t4\t-7,0,7,-7"
  },
  {
    "operation": "codec",
    "example": "packed-table",
    "request": "1\tcodec\ttable\tgrid:8:-1,0,1;packed:4\t1\t1\t4\t7\t36",
    "response": "1\tok\t1\t4\t-7,0,7,-7"
  }
]);
