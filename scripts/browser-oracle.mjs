import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { acceptanceVectors } from './write-errors.mjs';
import { deploymentMetadata } from './system-model.mjs';
import { canonical, confined, evidenceRoot, files, freshBuild, readJson, sha, writeJson } from './evidence.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const decode = bytes => { try { return decoder.decode(bytes); } catch { return null; } };
const responseBytes = vector => Buffer.from(vector.fields.find(field => field.field === 'response').value.hex, 'hex');
const requestBytes = vector => Buffer.from(vector.fields.find(field => field.field === 'request').value.hex, 'hex');

export function capturedBrowserRequest(address, origin, basePath, assetPaths) {
  let url;
  try { url = new URL(address); } catch { return false; }
  if (url.origin !== origin || url.search || url.hash || url.username || url.password) return false;
  return address === `${origin}${basePath}`
    || assetPaths.some(asset => address === `${origin}${basePath}${asset}`);
}

function browserArtifacts(build) {
  const buildRoot = path.dirname(confined(build.manifest_path));
  const manifest = readJson(confined(build.manifest_path));
  const model = readJson(confined(build.model_path));
  const application = model.application;
  assert(['prismpm/text-application/1', 'prismpm/text-application/2'].includes(application.profile));
  const directory = path.join(buildRoot, 'view/browser');
  const assets = files(directory);
  assert.equal(assets.length, 6);
  for (const asset of assets) {
    const record = manifest.files.find(file => file.path === `view/browser/${asset.path}`);
    assert(record, `Unbound browser asset ${asset.path}`);
    assert.equal(asset.bytes, record.byte_length);
    assert.equal(asset.sha256, record.sha256.replace(/^sha256:/, ''));
  }
  const wasm = assets.filter(file => /^[^/]+_bg\.wasm$/.test(file.path));
  assert.equal(wasm.length, 1);
  const javascript = wasm[0].path.replace(/_bg\.wasm$/, '.js');
  assert(assets.some(file => file.path === javascript));
  const vectors = acceptanceVectors().map((vector, index) => ({ index, request: requestBytes(vector), response: responseBytes(vector) }));
  assert.deepEqual(vectors.map(vector => ({ request: [...vector.request], response: [...vector.response] })), application.acceptance_vectors,
    'Browser smoke must use the exact source-owned projected acceptance corpus');
  return { buildRoot, application, directory, assets, javascript, wasm: wasm[0], vectors };
}

async function nodeBinding(artifacts, build) {
  // Import the unchanged wasm-bindgen module. Its own generated imports and
  // marshaling execute; no handwritten Wasm import object or product shim exists.
  const binding = await import(`${pathToFileURL(path.join(artifacts.directory, artifacts.javascript)).href}?build=${build.build_id}`);
  assert.equal(typeof binding.initSync, 'function');
  assert.equal(typeof binding.invoke_bytes, 'function');
  const bytes = fs.readFileSync(path.join(artifacts.directory, artifacts.wasm.path));
  binding.initSync({ module: bytes });
  let answered = 0, rejectedUtf8 = 0, rejectedLength = 0;
  for (const vector of artifacts.vectors) {
    const input = Uint8Array.from(vector.request);
    // The SDK's Text adapter bounds browser input by requestMaximum, while
    // the Core-Wasm allocation ABI also admits guestAllocationMaximum probes.
    const rejection = input.length > artifacts.application.request_maximum ? 'input byte limit'
      : decode(input) === null ? 'invalid input UTF-8' : null;
    if (rejection !== null) {
      assert.throws(() => binding.invoke_bytes(input), error => String(error) === rejection,
        `Browser transport rejection for modeled vector ${vector.index}`);
      if (rejection === 'input byte limit') rejectedLength += 1; else rejectedUtf8 += 1;
    } else {
      const actual = binding.invoke_bytes(input);
      assert(actual instanceof Uint8Array);
      assert(actual.length <= artifacts.application.response_maximum);
      assert(Buffer.from(actual).equals(vector.response), `Browser Wasm differs for modeled vector ${vector.index}`);
      assert.notEqual(decode(actual), null);
      answered += 1;
    }
  }
  assert.throws(() => binding.invoke_bytes('1\tmatmul'), error => String(error) === 'expected Uint8Array');
  assert.throws(() => binding.invoke_bytes(new Uint8Array(artifacts.application.request_maximum + 1)),
    error => String(error) === 'input byte limit');
  assert.throws(() => binding.invoke_bytes(Uint8Array.of(255)), error => String(error) === 'invalid input UTF-8');
  assert(answered > 0);
  assert.equal(answered + rejectedUtf8 + rejectedLength, artifacts.vectors.length);
  return { engine: process.version, answered_vectors: answered, rejected_utf8_vectors: rejectedUtf8,
    rejected_length_vectors: rejectedLength, additional_transport_negatives: 3 };
}

async function chromiumUi(artifacts, publicationUrl = null) {
  // The toolchain comes from the executing immutable SDK, whose inventory is
  // checked by freshBuild and whose browser trees the SDK verifier has checked.
  const require = createRequire('/opt/prismpm/oracles/package.json');
  assert.equal(require('playwright/package.json').version, '1.62.1');
  const { chromium } = require('playwright');
  const executablePath = process.arch === 'x64'
    ? '/ms-playwright/chromium_headless_shell-cft-157.0.8099.0/chrome-headless-shell-linux64/chrome-headless-shell'
    : '/ms-playwright/chromium_headless_shell-cft-157.0.8099.0/chrome-headless-shell-linux-arm64/chrome-headless-shell';
  assert(['x64', 'arm64'].includes(process.arch));
  const target = deploymentMetadata(), served = new Set(), unexpected = [], pageErrors = [];
  if (publicationUrl !== null) assert.equal(publicationUrl, target.url);
  const responseChecks = [], responseErrors = [], observedAssets = new Map();
  const content = new Map(artifacts.assets.map(asset => [asset.path, fs.readFileSync(path.join(artifacts.directory, asset.path))]));
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const name = url.pathname === target.basePath ? 'index.html' : url.pathname.slice(target.basePath.length);
    if (request.method !== 'GET' || !url.pathname.startsWith(target.basePath) || url.search || !content.has(name)) {
      response.writeHead(404).end(); return;
    }
    served.add(name);
    const type = name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.js') ? 'text/javascript'
      : name.endsWith('.css') ? 'text/css' : name.endsWith('.json') ? 'application/json' : 'text/html';
    response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(content.get(name));
  });
  let browser;
  try {
    if (publicationUrl === null) await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = publicationUrl === null ? `http://127.0.0.1:${server.address().port}` : new URL(publicationUrl).origin;
    const url = publicationUrl ?? `${origin}${target.basePath}`;
    browser = await chromium.launch({ headless: true, executablePath });
    assert.equal(browser.version(), '157.0.8099.0');
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', response => {
      const address = new URL(response.url());
      if (address.origin !== origin || !address.pathname.startsWith(target.basePath)) return;
      const name = address.pathname === target.basePath ? 'index.html' : address.pathname.slice(target.basePath.length);
      if (!content.has(name)) return;
      responseChecks.push((async () => {
        assert.equal(response.status(), 200, name);
        assert((await response.body()).equals(content.get(name)), `Browser received different release bytes for ${name}`);
        served.add(name);
        observedAssets.set(name, { path: name, status: response.status(), content_type: response.headers()['content-type'] ?? '' });
      })().catch(error => responseErrors.push(error.message)));
    });
    await page.route('**/*', route => {
      if (capturedBrowserRequest(route.request().url(), origin, target.basePath, [...content.keys()])) return route.continue();
      unexpected.push(route.request().url()); return route.abort();
    });
    async function ready() {
      await page.goto(url);
      await page.waitForFunction(() => document.getElementById('result').textContent === '' && !document.getElementById('submit').disabled);
      assert.equal(await page.title(), artifacts.application.view.title);
      assert.equal(await page.locator('h1').textContent(), artifacts.application.view.heading);
    }
    async function submit(value, expected) {
      await page.locator('#request').fill(value);
      await page.locator('#submit').click();
      await page.waitForFunction(expected => document.getElementById('result').textContent === expected
        && !document.getElementById('submit').disabled && !document.getElementById('application-form').hasAttribute('aria-busy'), expected);
      assert.equal(page.url(), url, 'Generated form must not navigate');
    }
    await ready();
    const uiIndexes = [], normalizedIndexes = [];
    for (const vector of artifacts.vectors) {
      const input = decode(vector.request);
      if (input === null || vector.request.length > artifacts.application.request_maximum) continue;
      await page.locator('#request').fill(input);
      const value = await page.locator('#request').inputValue();
      if (!Buffer.from(encoder.encode(value)).equals(vector.request)) {
        // HTML textareas normalize line endings. The exact original bytes
        // remain tested above through the real generated binding.
        normalizedIndexes.push(vector.index); continue;
      }
      await submit(input, decode(vector.response));
      assert.equal(await page.locator('#request').getAttribute('aria-invalid'), null);
      uiIndexes.push(vector.index);
    }
    assert(uiIndexes.length > 0);
    const recovery = artifacts.vectors.find(vector => uiIndexes.includes(vector.index) && decode(vector.response).startsWith('1\tok\t'));
    assert(recovery, 'Browser smoke needs a successful mathematical response');
    await submit('x'.repeat(artifacts.application.request_maximum + 1), artifacts.application.view.input_error);
    assert.equal(await page.locator('#request').getAttribute('aria-invalid'), 'true');
    await submit(decode(recovery.request), decode(recovery.response));
    assert.equal(await page.locator('#request').getAttribute('aria-invalid'), null);
    await page.locator('#request').evaluate(element => { element.value = '\ud800'; });
    await page.locator('#submit').click();
    await page.waitForFunction(expected => document.getElementById('result').textContent === expected,
      artifacts.application.view.input_error);
    assert.equal(await page.locator('#request').getAttribute('aria-invalid'), 'true');
    await submit(decode(recovery.request), decode(recovery.response));
    assert.equal(await page.locator('#request').getAttribute('aria-invalid'), null);
    await Promise.all(responseChecks);
    assert.deepEqual(responseErrors, []);
    await ready();
    await submit(decode(recovery.request), decode(recovery.response));
    await Promise.all(responseChecks);
    assert.deepEqual(responseErrors, [], 'Browser responses must equal the captured accepted release assets');
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(unexpected, [], 'Generated browser must execute without external runtime services');
    for (const name of ['index.html', 'app.css', 'app.js', artifacts.javascript, artifacts.wasm.path]) assert(served.has(name), name);
    return { engine: 'chromium', version: browser.version(), playwright: '1.62.1',
      exact_vector_indexes: uiIndexes, textarea_normalized_vector_indexes: normalizedIndexes,
      input_validation_cases: 2, recovery_submissions: 3, served_assets: [...served].sort(),
      response_assets: [...observedAssets.values()].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
      external_requests: 0, page_errors: 0 };
  } finally {
    if (browser) await browser.close();
    if (server.listening) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
}

export async function runBrowserChecks(build = freshBuild()) {
  const artifacts = browserArtifacts(build);
  try {
    const node = await nodeBinding(artifacts, build);
    const chromium = await chromiumUi(artifacts);
    return { schema: 'lexlean-matmul/browser-runtime-acceptance/1', id: 'MM-09', status: 'passed', build_id: build.build_id,
      backend: 'unchanged-sdk-wasm-bindgen-text-adapter', assets: artifacts.assets,
      wasm_sha256: artifacts.wasm.sha256,
      binding_javascript_sha256: artifacts.assets.find(asset => asset.path === artifacts.javascript).sha256,
      modeled_vectors: artifacts.vectors.length,
      corpus_sha256: sha(canonical(artifacts.vectors.map(vector => ({ request: vector.request.toString('hex'), response: vector.response.toString('hex') })))),
      node, chromium };
  } catch (error) {
    writeJson(path.join(evidenceRoot, 'runtime-oracle/MM-09.failure.json'), {
      schema: 'lexlean-matmul/browser-runtime-failure/1', status: 'failed', id: 'MM-09', build_id: build.build_id,
      wasm_sha256: artifacts.wasm.sha256, error: { kind: error.name ?? typeof error, message: String(error.message ?? error) },
    });
    throw error;
  }
}

// Publication consumes the captured accepted model and restored SDK export.
// No source acquisition, graph load, compiler, or fresh-build gate runs here.
export async function runPublishedBrowserChecks({ directory, model, url }) {
  assert.equal(url, deploymentMetadata().url);
  assert(['prismpm/model-document/2', 'prismpm/model-document/5'].includes(model.schema));
  assert(['prismpm/text-application/1', 'prismpm/text-application/2'].includes(model.application.profile));
  const assets = files(directory), wasm = assets.filter(asset => /^[^/]+_bg\.wasm$/.test(asset.path));
  assert.equal(assets.length, 6);
  assert.equal(wasm.length, 1);
  const javascript = wasm[0].path.replace(/_bg\.wasm$/, '.js');
  assert(assets.some(asset => asset.path === javascript));
  const vectors = model.application.acceptance_vectors.map((vector, index) => ({ index,
    request: Buffer.from(vector.request), response: Buffer.from(vector.response) }));
  assert.deepEqual(vectors.map(vector => ({ request: vector.request.toString('hex'), response: vector.response.toString('hex') })),
    acceptanceVectors().map(vector => ({ request: requestBytes(vector).toString('hex'), response: responseBytes(vector).toString('hex') })),
    'Published UI vectors must retain the accepted source-owned corpus');
  const chromium = await chromiumUi({ application: model.application, directory, assets, wasm: wasm[0], javascript, vectors }, url);
  return { schema: 'lexlean-matmul/browser-ui-publication/1', status: 'passed', url,
    scope: 'accepted-browser-assets-and-rendered-modeled-vectors', model_sha256: sha(canonical(model)), assets, chromium };
}
