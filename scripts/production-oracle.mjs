// Product acceptance only. All successful computations execute the unchanged
// generated Wasm; fault injection is confined to explicitly named cases.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { browserArtifacts, capturedBrowserRequest } from './browser-oracle.mjs';
import { canonical, evidenceRoot, sha, writeJson } from './evidence.mjs';
import { deploymentMetadata, productionPolicy } from './system-model.mjs';
import { assertRenderedResult, assertResultShape, fillUiVector, separator, submitUiVector } from './workbench-test.mjs';

const pins = {
  chromium: { version: '157.0.8099.0', executablePath: process.arch === 'x64'
    ? '/ms-playwright/chromium_headless_shell-cft-157.0.8099.0/chrome-headless-shell-linux64/chrome-headless-shell'
    : '/ms-playwright/chromium_headless_shell-cft-157.0.8099.0/chrome-headless-shell-linux-arm64/chrome-headless-shell' },
  firefox: { version: '153.0', executablePath: '/ms-playwright/firefox-1538/firefox/firefox' },
  webkit: { version: '26.5', executablePath: '/ms-playwright/webkit-2336/pw_run.sh' },
};

function exampleCase(operation, example) {
  return { kind: 'guided', operation, values: example.values, result: JSON.parse(example.expected_response),
    wire: JSON.parse(example.expected_response).response };
}

async function renderedScreenshots({ page }, view) {
  const operation = view.operations.find(row => row.id === 'matmul'), example = operation.examples[0];
  const prepared = exampleCase(operation, example);
  await page.locator('#operation').selectOption(operation.id);
  await page.locator('#example').selectOption(example.id); await page.locator('#load-example').click();
  await submitUiVector(page, prepared, { fill: false });
  await assertRenderedResult(page, prepared.result, view);
  const screenshots = [];
  for (const [name, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height }); await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
    for (const position of ['top', 'result']) {
      if (position === 'result') await page.locator('#response-heading').scrollIntoViewIfNeeded();
      const filename = `production-${name}-${position}.png`, output = path.join(evidenceRoot, 'runtime-oracle', filename);
      await page.screenshot({ path: output, fullPage: false });
      const bytes = fs.readFileSync(output);
      screenshots.push({ path: `runtime-oracle/${filename}`, width, height, position, bytes: bytes.length, sha256: sha(bytes) });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  return screenshots;
}

export async function withWorkbench(artifacts, work, { engine = 'chromium', publicationUrl = null, observeWorkers = false } = {}) {
  const require = createRequire('/opt/prismpm/oracles/package.json');
  assert.equal(require('playwright/package.json').version, '1.62.1');
  const playwright = require('playwright'), target = deploymentMetadata();
  const content = new Map(artifacts.assets.map(row => [row.path, fs.readFileSync(path.join(artifacts.directory, row.path))]));
  assert.equal(content.size, 6);
  const server = createServer((request, response) => {
    const address = new URL(request.url, 'http://127.0.0.1');
    const name = address.pathname === target.basePath ? 'index.html' : address.pathname.slice(target.basePath.length);
    if (request.method !== 'GET' || !address.pathname.startsWith(target.basePath) || address.search || !content.has(name)) {
      response.writeHead(404).end(); return;
    }
    response.writeHead(200, { 'content-type': name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.js') ? 'text/javascript'
      : name.endsWith('.css') ? 'text/css' : name.endsWith('.json') ? 'application/json' : 'text/html', 'cache-control': 'no-store' }).end(content.get(name));
  });
  let browser, browserHome;
  try {
    if (publicationUrl === null) await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    else assert.equal(publicationUrl, target.url);
    const origin = publicationUrl === null ? `http://127.0.0.1:${server.address().port}` : new URL(publicationUrl).origin;
    const url = publicationUrl ?? origin + target.basePath;
    // CI's nested credential mount can leave the inherited HOME unwritable.
    browserHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lexlean-matmul-browser-'));
    const browserEnvironment = { ...process.env, HOME: browserHome,
      XDG_CACHE_HOME: path.join(browserHome, '.cache'), XDG_CONFIG_HOME: path.join(browserHome, '.config'),
      XDG_DATA_HOME: path.join(browserHome, '.local', 'share') };
    for (const name of ['XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME']) {
      fs.mkdirSync(browserEnvironment[name], { recursive: true, mode: 0o700 });
    }
    browser = await playwright[engine].launch({ headless: true, executablePath: pins[engine].executablePath,
      env: browserEnvironment });
    assert.equal(browser.version(), pins[engine].version);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    if (observeWorkers) await context.addInitScript(workerProbe);
    const requests = [], unexpected = [], consoles = [], errors = [];
    context.on('request', request => {
      const address = request.url(); requests.push({ url: address, method: request.method() });
      if (request.method() !== 'GET' || !capturedBrowserRequest(address, origin, target.basePath, [...content.keys()])) unexpected.push(address);
    });
    context.on('page', page => { page.on('console', message => consoles.push(message.text())); page.on('pageerror', error => errors.push(error.message)); });
    await context.route('**/*', route => capturedBrowserRequest(route.request().url(), origin, target.basePath, [...content.keys()])
      ? route.continue() : route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    const ready = async targetPage => {
      await targetPage.goto(url);
      await targetPage.waitForFunction(copy => document.querySelector('#status')?.textContent === copy
        && !document.querySelector('#guided-submit').disabled, artifacts.application.view.statuses.ready);
    };
    await ready(page);
    const report = await work({ page, context, browser, url, ready, requests, consoles, require, application: artifacts.application });
    assert.deepEqual(unexpected, [], 'MM-23: a calculation initiated an undeclared network request');
    assert.deepEqual(errors, [], 'Production browser raised an unhandled page error');
    return { engine, version: browser.version(), playwright: '1.62.1', ...report,
      external_requests: unexpected.length, page_errors: errors.length, assets: artifacts.assets };
  } finally {
    try { await browser?.close(); } finally {
      if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
      if (browserHome) fs.rmSync(browserHome, { recursive: true, force: true });
    }
  }
}

async function assertOnboarding({ page }, view) {
  assert.equal(await page.title(), view.title);
  assert.equal(await page.locator('h1').textContent(), view.heading);
  for (const text of [view.purpose, view.audience, ...view.guidance]) {
    assert(text.trim().length > 0);
    assert(await page.getByText(text, { exact: true }).first().isVisible(), 'MM-18: source-owned guidance is unavailable');
  }
  assert.equal(await page.getByRole('navigation', { name: view.labels.navigation }).count(), 1);
  for (const section of view.sections) {
    assert(await page.getByRole('heading', { name: section.title, exact: true }).isVisible());
    for (const text of section.paragraphs) assert(await page.getByText(text, { exact: true }).first().isVisible());
  }
  for (const link of view.links) assert.equal(await page.getByRole('link', { name: link.label, exact: true }).getAttribute('href'), link.https_url);
  assert(view.links.some(link => link.https_url.includes('PROTOCOL')), 'MM-18: protocol discovery is absent');
  assert(view.sections.some(section => /limit|bound/i.test(section.title)), 'MM-18: modeled limits are absent');
  return { source_guidance: view.guidance.length, source_sections: view.sections.length, source_links: view.links.length };
}

async function onboarding(context, view) {
  const report = await assertOnboarding(context, view), { page } = context;
  const purpose = await page.getByText(view.purpose, { exact: true }).elementHandle();
  await purpose.evaluate(node => { node.style.display = 'none'; });
  try {
    await assert.rejects(() => assertOnboarding(context, view), /MM-18: source-owned guidance/);
  } finally { await purpose.evaluate(node => node.removeAttribute('style')); await purpose.dispose(); }
  return { ...report, planted_rejections: ['hidden-purpose'] };
}

async function guided({ page, application }, view, interpretationOnly = false) {
  const cases = []; let screenshots = [];
  for (const operation of view.operations) {
    assert(operation.examples.length > 0);
    await page.locator('#operation').selectOption(operation.id);
    for (const example of operation.examples) {
      await page.locator('#example').selectOption(example.id); await page.locator('#load-example').click();
      for (const [index, field] of operation.fields.entries()) {
        assert.equal(await page.getByLabel(field.label, { exact: true }).inputValue(), example.values[index]);
      }
      assert.equal(await page.locator('#expected-response-json').textContent(), example.expected_response);
      assert.equal(await page.locator('#result').textContent(), '', 'MM-19: loading an example fabricated a computed result');
      const prepared = exampleCase(operation, example);
      await submitUiVector(page, prepared, { fill: false });
      await assertRenderedResult(page, prepared.result, view);
      cases.push({ operation: operation.id, example: example.id, expected_sha256: sha(example.expected_response) });
    }
  }
  if (!interpretationOnly) {
    const operation = view.operations.find(row => row.id === 'matmul');
    assert(operation, 'MM-19: the modeled matrix product operation is required');
    const first = operation.examples[0];
    await page.locator('#operation').selectOption(operation.id); await page.locator('#example').selectOption(first.id); await page.locator('#load-example').click();
    const a = [9n, 2n, 3n, 4n], b = [5n, 6n, 7n, 8n];
    const cells = Array.from({ length: 4 }, (_, index) => {
      const row = Math.floor(index / 2), column = index % 2;
      return (a[row * 2] * b[column] + a[row * 2 + 1] * b[2 + column]).toString();
    });
    assert.deepEqual(cells, ['59', '70', '43', '50']);
    const request = '1\tmatmul\t2\t2\t2\t' + a.join(',') + '\t' + b.join(',');
    const response = '1\tok\t2\t2\t' + cells.join(',');
    const values = operation.fields.map(field => ({ m: '2', k: '2', n: '2', a: '9 2\n3 4', b: '5 6\n7 8' })[field.id]);
    assert(values.every(value => typeof value === 'string'));
    const framed = operation.request_prefix + separator + values.join(separator);
    assert(application.acceptance_vectors.every(vector => Buffer.from(vector.request).toString('utf8') !== framed),
      'MM-19: edited calculation must be absent from the source vector lookup');
    assert(view.operations.flatMap(row => row.examples).every(example => JSON.parse(example.expected_response).request !== request),
      'MM-19: edited calculation must be absent from every named source example');
    const result = { ...JSON.parse(first.expected_response), request, response, cells, rows: 2, columns: 2 };
    const prepared = { kind: 'guided', operation, values, result, wire: response };
    await fillUiVector(page, prepared, { selectOperation: false });
    assert.equal(await page.locator('#example').inputValue(), '', 'MM-19: editing retained a misleading named example');
    const prompt = page.locator('#example option:checked');
    assert.equal(await prompt.count(), 1, 'MM-19: an edited draft has no selected example prompt');
    assert.equal(await prompt.textContent(), view.labels.examples,
      'MM-19: an edited draft has no source-owned example prompt');
    assert.equal(await page.locator('#load-example').isDisabled(), true,
      'MM-19: an empty example selection leaves an ineffective Load action');
    await submitUiVector(page, prepared, { fill: false });
    await assertRenderedResult(page, result, view);
    await page.evaluate(bytes => { window.__productionWorkerProbe.replacement = bytes; }, [...Buffer.from(first.expected_response)]);
    try {
      await page.locator('#guided-submit').click();
      await page.waitForFunction(() => !document.querySelector('#guided-form').hasAttribute('aria-busy') && document.querySelector('#result').textContent !== '');
      await assert.rejects(async () => assert.equal(await page.locator('#result').textContent(), response,
        'MM-19: fixture-only execution replaced edited arithmetic'), /MM-19: fixture-only/);
    } finally { await page.evaluate(() => { window.__productionWorkerProbe.replacement = null; }); }
    await submitUiVector(page, prepared, { fill: false }); await assertRenderedResult(page, result, view);
  } else {
    const exact = '9007199254740993';
    await submitUiVector(page, { kind: 'raw', input: `1\tmatmul\t1\t1\t1\t${exact}\t1`, wire: `1\tok\t1\t1\t${exact}` });
    const cell = page.locator('#result-table tbody td');
    assert.equal(await cell.textContent(), exact, 'MM-20: exact cell was coerced through a JavaScript number');
    await cell.evaluate((node, value) => { node.textContent = String(Number(value)); }, exact);
    await assert.rejects(async () => assert.equal(await cell.textContent(), exact, 'MM-20: a rounded display cell escaped the exact oracle'), /MM-20: a rounded display/);
    await cell.evaluate((node, value) => { node.textContent = value; }, exact);
    for (const [input, wire, rows, columns] of [
      ['1\tmatmul\t0\t2\t3\t\t1,2,3,4,5,6', '1\tok\t0\t3\t', 0, 3],
      ['1\tmatmul\t2\t0\t3\t\t', '1\tok\t2\t3\t0,0,0,0,0,0', 2, 3],
      ['1\tmatmul\t2\t3\t0\t1,2,3,4,5,6\t', '1\tok\t2\t0\t', 2, 0],
    ]) {
      await submitUiVector(page, { kind: 'raw', input, wire }); await assertResultShape(page, rows, columns, view);
      if (rows * columns === 0) assert.equal(await page.locator('#result-table-region').isVisible(), false);
      else assert.deepEqual(await page.locator('#result-table tbody td').allTextContents(), Array(rows * columns).fill('0'));
    }
    await page.locator('#result-rows').evaluate(node => { node.textContent = '0'; });
    await assert.rejects(() => assertResultShape(page, 2, 0, view), /MM-20: visible result row count differs/);
    await page.locator('#result-rows').evaluate(node => { node.textContent = '2'; });
    await page.locator('#result-shape').evaluate(node => { node.hidden = true; });
    await assert.rejects(() => assertResultShape(page, 2, 0, view), /MM-20: actual result dimensions/);
    await page.locator('#result-shape').evaluate(node => { node.hidden = false; });
    screenshots = await renderedScreenshots({ page }, view);
  }
  return { executed_examples: cases, edited_actual_computations: interpretationOnly ? 0 : 1,
    zero_dimension_cases: interpretationOnly ? 3 : 0,
    screenshots,
    planted_rejections: interpretationOnly ? ['rounded-exact-cell', 'wrong-result-shape', 'missing-result-shape'] : ['fixture-only-execution'] };
}

export function workerProbe() {
  const Actual = window.Worker;
  const state = window.__productionWorkerProbe = { drop: false, hold: false, replacement: null, ignoreTerminate: false,
    created: 0, terminated: 0, sent: [], workers: [], held: [] };
  window.Worker = class extends Actual {
    constructor(...args) {
      super(...args); state.created++; state.workers.push(this);
      this.addEventListener('message', event => {
        if (event.data?.type !== 'result') return;
        if (state.hold) { event.stopImmediatePropagation(); state.held.push({ worker: this, handler: this.onmessage, data: event.data }); }
        else if (state.replacement) {
          event.stopImmediatePropagation(); this.onmessage?.({ data: { ...event.data, output: Uint8Array.from(state.replacement) } });
        }
      });
      const send = this.postMessage.bind(this), retire = this.terminate.bind(this);
      this.postMessage = (message, transfer) => {
        state.sent.push({ type: message?.type, generation: message?.generation });
        if (!(state.drop && message?.type === 'invoke')) send(message, transfer);
      };
      this.terminate = () => { if (!state.ignoreTerminate) { state.terminated++; retire(); } };
    }
  };
}

async function assertUnblockedRunningStatus(page, expected) {
  const check = async () => {
    const status = page.locator('#status');
    assert(await status.isVisible(), 'MM-21/MM-22: the running live status is not visible');
    assert.equal(await status.textContent(), expected);
    assert.equal(await status.getAttribute('role'), 'status');
    assert.equal(await status.getAttribute('aria-live'), 'polite');
    assert.equal(await status.getAttribute('aria-atomic'), 'true');
    const ancestor = await status.evaluate(node => {
      for (let current = node; current; current = current.parentElement) {
        if (current.getAttribute('aria-busy')?.trim().toLowerCase() === 'true')
          return { tag: current.tagName, id: current.id };
      }
      return null;
    });
    assert.equal(ancestor, null, 'MM-21/MM-22: a busy ancestor can defer the running live status');
  };
  // WAI-ARIA 1.2 permits deferring live-region updates inside a busy container:
  // https://www.w3.org/TR/2023/REC-wai-aria-1.2-20230606/#aria-busy
  // This checks rendered semantics while an authentic guest reply is held.
  await check();
  const previous = await page.locator('#status').evaluate(node => {
    const parent = node.parentElement, before = parent.getAttribute('aria-busy');
    parent.setAttribute('aria-busy', 'true'); return before;
  });
  try { await assert.rejects(check, /MM-21\/MM-22: a busy ancestor can defer/); }
  finally {
    await page.locator('#status').evaluate((node, before) => {
      if (before === null) node.parentElement.removeAttribute('aria-busy');
      else node.parentElement.setAttribute('aria-busy', before);
    }, previous);
  }
  await check();
}

async function wasmCacheChecks(artifacts) {
  const require = createRequire('/opt/prismpm/oracles/package.json');
  assert.equal(require('playwright/package.json').version, '1.62.1');
  const { chromium } = require('playwright'), target = deploymentMetadata();
  const content = new Map(artifacts.assets.map(row => [row.path, fs.readFileSync(path.join(artifacts.directory, row.path))]));
  assert.equal(content.size, 6);
  const wasm = artifacts.assets.filter(row => /^[^/]+_bg\.wasm$/.test(row.path));
  assert.equal(wasm.length, 1);
  const operation = artifacts.application.view.operations.find(row => row.id === 'matmul');
  assert(operation, 'MM-21: cache acceptance requires the actual matrix product');
  const values = operation.fields.map(field => ({ m: '2', k: '2', n: '2', a: '1 2\n3 4', b: '5 6\n7 8' })[field.id]);
  assert(values.every(value => typeof value === 'string'));
  const prepared = { kind: 'guided', operation, values, wire: '1\tok\t2\t2\t19,22,43,50' };
  const requests = [], observations = [], unexpected = [], errors = [];
  let app = content.get('app.js'), caseName = 'modeled-no-store', browser;
  const report = { schema: 'lexlean-matmul/browser-http-cache/1', status: 'failed',
    routing_installed: false, cache_disabled: false, wasm_sha256: wasm[0].sha256, observations };
  const server = createServer((request, response) => {
    const address = new URL(request.url, 'http://127.0.0.1');
    const name = address.pathname === target.basePath ? 'index.html' : address.pathname.slice(target.basePath.length);
    if (request.method !== 'GET' || !address.pathname.startsWith(target.basePath) || address.search || !content.has(name)) {
      unexpected.push(request.url); response.writeHead(404).end(); return;
    }
    const body = name === 'app.js' ? app : content.get(name);
    requests.push({ case: caseName, path: name, bytes: body.length, sha256: sha(body) });
    response.writeHead(200, { 'content-type': name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.js') ? 'text/javascript'
      : name.endsWith('.css') ? 'text/css' : name.endsWith('.json') ? 'application/json' : 'text/html',
    'cache-control': name === wasm[0].path ? 'public, max-age=600' : 'no-store', 'content-length': body.length }).end(body);
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`, url = origin + target.basePath;
    const wasmUrl = new URL(wasm[0].path, url).href;
    browser = await chromium.launch({ headless: true, executablePath: pins.chromium.executablePath });
    assert.equal(browser.version(), pins.chromium.version);
    const exercise = async () => {
      const context = await browser.newContext();
      const observation = { case: caseName, requests: [], cache_warmup_verified: false, fresh_worker_fetch_verified: false };
      observations.push(observation);
      const count = () => requests.filter(row => row.case === caseName && row.path === wasm[0].path).length;
      context.on('request', request => {
        if (request.method() !== 'GET' || !capturedBrowserRequest(request.url(), origin, target.basePath, [...content.keys()])) unexpected.push(request.url());
      });
      context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
      const ready = async page => {
        await page.goto(url);
        await page.waitForFunction(copy => document.querySelector('#status')?.textContent === copy
          && !document.querySelector('#guided-submit').disabled, artifacts.application.view.statuses.ready);
      };
      try {
        const page = await context.newPage(); await ready(page);
        await submitUiVector(page, prepared);
        assert.deepEqual(await page.locator('#result-table tbody td').allTextContents(), ['19', '22', '43', '50']);
        observation.initial_wasm_requests = count();
        const fetchCached = () => page.evaluate(async address => {
          const response = await fetch(address, { cache: 'force-cache' }), bytes = await response.arrayBuffer();
          const digest = await crypto.subtle.digest('SHA-256', bytes);
          return { status: response.status, bytes: bytes.byteLength,
            sha256: [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('') };
        }, wasmUrl);
        for (let index = 0; index < 2; index++) {
          const before = count(), fetched = await fetchCached();
          assert.deepEqual(fetched, { status: 200, bytes: wasm[0].bytes, sha256: wasm[0].sha256 });
          observation.requests.push({ stage: `force-cache-${index + 1}`, server_wasm_requests: count() - before, ...fetched });
          if (index === 1) assert.equal(count(), before, 'MM-21: the ordinary browser HTTP cache was not actually warmed');
        }
        observation.cache_warmup_verified = true;
        const before = count(), next = await context.newPage(); await ready(next);
        observation.requests.push({ stage: 'new-worker', server_wasm_requests: count() - before });
        assert.equal(count() - before, 1, 'MM-21: a new worker reused cached Wasm instead of fetching the current artifact');
        observation.fresh_worker_fetch_verified = true;
        await submitUiVector(next, prepared);
        assert.deepEqual(await next.locator('#result-table tbody td').allTextContents(), ['19', '22', '43', '50']);
        observation.actual_matrix_response = await next.locator('#result').textContent();
      } finally { await context.close(); }
    };
    // Check the operational cache boundary before metadata, so an older runtime
    // is rejected for actual cached-byte reuse rather than an absent policy key.
    await exercise();
    assert.equal(artifacts.application.view.execution.wasm_cache_policy, 'no-store', 'MM-21: source-owned Wasm cache policy differs');
    const marker = 'cache:VIEW.execution.wasm_cache_policy,';
    const source = app.toString('utf8');
    assert.equal(source.split(marker).length, 2, 'MM-21: the isolated cache-option mutation is ambiguous');
    app = Buffer.from(source.replace(marker, '')); caseName = 'wasm-cache-policy-omitted';
    await assert.rejects(exercise, /MM-21: a new worker reused cached Wasm/);
    assert.deepEqual(unexpected, [], 'MM-21: HTTP cache acceptance observed an undeclared request');
    assert.deepEqual(errors, [], 'MM-21: HTTP cache acceptance raised an unhandled page error');
    report.status = 'passed'; report.planted_rejections = ['wasm-cache-policy-omitted'];
    return report;
  } finally {
    report.server_requests = requests;
    await browser?.close();
    if (server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    writeJson(path.join(evidenceRoot, 'runtime-oracle', 'MM-21.http-cache.json'), report);
  }
}

async function recovery({ page, context, url, ready }, view, policy) {
  const prepared = { kind: 'raw', input: '1\tmatmul\t1\t1\t1\t6\t7', wire: '1\tok\t1\t1\t42' };
  const status = (target, copy) => target.waitForFunction(expected => document.querySelector('#status').textContent === expected, copy);
  const slow = await context.newPage(); let release;
  const held = new Promise(resolve => { release = resolve; });
  const delay = async route => { await held; await route.continue(); };
  try {
    await slow.route('**/*.wasm', delay); await slow.goto(url, { waitUntil: 'domcontentloaded' });
    await status(slow, view.statuses.initializing);
    await fillUiVector(slow, prepared);
    assert.equal(await slow.locator('#submit').isDisabled(), true);
    release(); await status(slow, view.statuses.ready);
    await slow.unroute('**/*.wasm', delay);
    assert.equal(await slow.locator('#request').inputValue(), prepared.input);
    await submitUiVector(slow, prepared, { fill: false });
  } finally { release(); await slow.unrouteAll({ behavior: 'wait' }); await slow.close(); }
  const failed = await context.newPage();
  try {
    await failed.route('**/*.wasm', route => route.abort('failed')); await failed.goto(url);
    await status(failed, view.statuses.load_error); await fillUiVector(failed, prepared);
    assert(await failed.locator('#retry').isVisible(), 'MM-21: editing a failed-load draft removed the only recovery control');
    await failed.locator('#reset').click();
    assert(await failed.locator('#retry').isVisible(), 'MM-21: resetting after load failure removed recovery');
    assert.equal(await failed.locator('#guided-submit').isDisabled(), true);
    assert.equal(await failed.locator('#request').inputValue(), prepared.input);
    const operation = view.operations[0], example = operation.examples[0];
    await failed.locator('#operation').selectOption(operation.id);
    await failed.locator('#example').selectOption(example.id); await failed.locator('#load-example').click();
    assert(await failed.locator('#retry').isVisible(), 'MM-21: loading a guided draft after load failure removed recovery');
    await failed.unroute('**/*.wasm'); await failed.locator('#retry').click(); await status(failed, view.statuses.ready);
    assert.equal(await failed.locator('#request').inputValue(), prepared.input);
    for (const [index, field] of operation.fields.entries()) assert.equal(await failed.locator('#field-' + field.id).inputValue(), example.values[index]);
    const guided = exampleCase(operation, example);
    await submitUiVector(failed, guided, { fill: false }); await assertRenderedResult(failed, guided.result, view);
    await submitUiVector(failed, prepared, { fill: false });
  } finally { await failed.close(); }
  const lifecycle = await context.newPage();
  try {
    await lifecycle.clock.install(); await ready(lifecycle);
    await lifecycle.evaluate(() => { window.__productionWorkerProbe.drop = true; });
    await fillUiVector(lifecycle, prepared); await lifecycle.locator('#submit').click(); await status(lifecycle, view.statuses.running);
    const cancelledWorker = lifecycle.workers().at(-1);
    await lifecycle.locator('#cancel').click(); await status(lifecycle, view.statuses.cancelled);
    assert.equal(await lifecycle.locator('#request').inputValue(), prepared.input);
    assert((await lifecycle.evaluate(() => window.__productionWorkerProbe.terminated)) >= 1, 'MM-21: cancellation did not terminate its worker');
    assert(!lifecycle.workers().includes(cancelledWorker), 'MM-21: a cancelled native worker remains alive');
    await lifecycle.evaluate(() => { window.__productionWorkerProbe.drop = false; });
    await submitUiVector(lifecycle, prepared);
    await lifecycle.evaluate(() => { window.__productionWorkerProbe.drop = true; });
    await lifecycle.locator('#submit').click(); await status(lifecycle, view.statuses.running);
    await lifecycle.clock.fastForward(view.execution.timeout_milliseconds + 1); await status(lifecycle, view.statuses.timeout);
    assert.equal(await lifecycle.locator('#request').inputValue(), prepared.input);
    await lifecycle.evaluate(() => { window.__productionWorkerProbe.drop = false; });
    await submitUiVector(lifecycle, prepared, { fill: false, trigger: '#retry' });
    // Hold authentic replies from the actual generated guest. Editing must
    // retire the old owner before a newer calculation is allowed to finish.
    await lifecycle.evaluate(() => { const probe = window.__productionWorkerProbe; probe.hold = true; probe.held = []; });
    await lifecycle.locator('#submit').click();
    await lifecycle.waitForFunction(() => window.__productionWorkerProbe.held.length === 1);
    await assertUnblockedRunningStatus(lifecycle, view.statuses.running);
    const edited = { kind: 'raw', input: '1\tmatmul\t1\t1\t1\t7\t8', wire: '1\tok\t1\t1\t56' };
    const editedWorker = lifecycle.workers().at(-1);
    await lifecycle.locator('#request').fill(edited.input); await status(lifecycle, view.statuses.cancelled);
    assert(!lifecycle.workers().includes(editedWorker), 'MM-21: editing did not retire the old native worker');
    assert.equal(await lifecycle.locator('#request').inputValue(), edited.input);
    assert.equal(await lifecycle.locator('#retry').isVisible(), false, 'MM-21: retry would replace an edited draft with an old invocation');
    await lifecycle.locator('#submit').click();
    await lifecycle.waitForFunction(() => window.__productionWorkerProbe.held.length === 2);
    await lifecycle.evaluate(() => { const reply = window.__productionWorkerProbe.held.shift(); reply.handler({ data: reply.data }); });
    await status(lifecycle, view.statuses.running);
    assert.equal(await lifecycle.locator('#result').textContent(), '', 'MM-21: a retired result replaced a newer pending request');
    await lifecycle.evaluate(() => { const probe = window.__productionWorkerProbe, reply = probe.held.shift(); probe.hold = false; reply.handler({ data: reply.data }); });
    await lifecycle.waitForFunction(expected => document.querySelector('#result').textContent === expected, edited.wire);
    assert.equal(await lifecycle.locator('#request').inputValue(), edited.input);
    await lifecycle.evaluate(() => { const probe = window.__productionWorkerProbe; probe.drop = true; probe.ignoreTerminate = true; });
    await lifecycle.locator('#submit').click(); await status(lifecycle, view.statuses.running);
    const leaked = lifecycle.workers().at(-1);
    await lifecycle.locator('#cancel').click(); await status(lifecycle, view.statuses.cancelled);
    try {
      await assert.rejects(async () => assert(!lifecycle.workers().includes(leaked), 'MM-21: a cancelled native worker remains alive'),
        /MM-21: a cancelled native worker/);
    } finally {
      await lifecycle.evaluate(() => { const probe = window.__productionWorkerProbe; probe.drop = false; probe.ignoreTerminate = false;
        for (const worker of probe.workers) worker.terminate(); });
    }
    await submitUiVector(lifecycle, edited, { fill: false, trigger: '#retry' });
  } finally { await lifecycle.close(); }
  await submitUiVector(page, { kind: 'raw', input: '', wire: '1\terror\tmalformed-request' });
  assert.equal(await page.locator('#request').getAttribute('aria-invalid'), 'true');
  const explanation = await page.locator('#result-error').innerText(), hint = view.errors.find(row => row.code === 'malformed-request');
  assert(hint); for (const copy of [hint.title, hint.explanation, hint.recovery]) assert(explanation.includes(copy));
  await submitUiVector(page, prepared); assert.equal(await page.locator('#request').getAttribute('aria-invalid'), null);
  await fillUiVector(page, { kind: 'raw', input: separator }); await page.locator('#submit').click();
  await status(page, view.statuses.input_error);
  await page.locator('#load-example').click(); await status(page, view.statuses.ready);
  assert.equal(await page.locator('#request').getAttribute('aria-invalid'), null);
  assert.equal(await page.locator('#result').textContent(), '', 'MM-21: loading a draft retained an earlier result');
  const selectedOperation = view.operations.find(operation => operation.id === view.initial_operation);
  const selectedExample = selectedOperation.examples.find(example => example.id === view.initial_example);
  const loaded = exampleCase(selectedOperation, selectedExample);
  await submitUiVector(page, loaded, { fill: false }); await assertRenderedResult(page, loaded.result, view);
  const matrix = Array(64).fill('9218868437227405311').join(',');
  const large = '1\tieee\tf64\tnearest\t8\t8\t8\t' + matrix + '\t' + matrix;
  const session = await context.newCDPSession(page);
  try {
    await session.send('Emulation.setCPUThrottlingRate', { rate: policy.browserCpuSlowdown });
    await page.evaluate(() => { window.__productionTicks = [performance.now()]; window.__productionTicker = setInterval(() => window.__productionTicks.push(performance.now()), 10); });
    await fillUiVector(page, { kind: 'raw', input: large }); await page.locator('#submit').click(); await status(page, view.statuses.running);
    await page.waitForFunction(() => document.querySelector('#result').textContent.startsWith('1\tok\t8\t8\t'));
    await page.waitForTimeout(50);
    const maximum = await page.evaluate(() => { clearInterval(window.__productionTicker); const times = window.__productionTicks;
      return times.slice(1).reduce((max, time, index) => Math.max(max, time - times[index]), 0); });
    assert(maximum <= policy.browserMainThreadGapMaximumMilliseconds, `MM-21: main thread blocked for ${maximum}ms`);
    return { actual_wasm_failure_recoveries: 1, actual_delayed_initializations: 1, cancellation_cases: 1,
      timeout_cases: 1, draft_edit_retirements: 1, stale_authentic_reply_refusals: 1, corrected_typed_errors: 1,
      failed_engine_draft_recoveries: ['raw-edit', 'reset', 'guided-example'], loaded_example_error_recoveries: 1,
      running_live_status_checks: 1, screen_reader_speech_tested: false,
      maximum_main_thread_gap_ms: maximum, cpu_slowdown: policy.browserCpuSlowdown,
      planted_rejections: ['native-worker-retirement-omitted', 'busy-live-status-ancestor'] };
  } finally { await session.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await session.detach(); }
}

async function accessibility({ page, ready, require }, view) {
  const axePath = require.resolve('axe-core/axe.min.js'), axe = fs.readFileSync(axePath, 'utf8');
  assert.equal(require('axe-core/package.json').version, '4.13.0');
  assert.equal(sha(axe), 'c24f097bd2f451d4f933e8bc7d8d539f8672a2ebcb5cc9f9f3eec8ca9470a0c1');
  const assess = async () => {
    await page.addScriptTag({ content: axe });
    return page.evaluate(async () => { const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
      return { violations: result.violations.map(row => row.id), incomplete: result.incomplete.map(row => row.id), passes: result.passes.map(row => row.id) }; });
  };
  await ready(page);
  assert.equal(await page.locator('#status').getAttribute('role'), 'status');
  assert.equal(await page.locator('#status').getAttribute('aria-live'), 'polite');
  assert.equal(await page.locator('#status').getAttribute('aria-atomic'), 'true');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#skip-to-workbench').evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Enter'); assert.equal(await page.locator('#workbench-main').evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Tab'); assert.equal(await page.locator('#operation').evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Home'); await page.keyboard.press('Tab'); await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab'); assert.equal(await page.locator('#load-example').evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Space');
  let reached = false;
  for (let count = 0; count < 100; count++) {
    await page.keyboard.press('Tab');
    if (await page.locator('#guided-submit').evaluate(node => node === document.activeElement)) { reached = true; break; }
  }
  assert(reached, 'MM-22: keyboard cannot reach the guided calculation');
  const focus = await page.locator('#guided-submit').evaluate(node => ({ style: getComputedStyle(node).outlineStyle, width: parseFloat(getComputedStyle(node).outlineWidth) }));
  assert.notEqual(focus.style, 'none'); assert(focus.width >= 2);
  const operationId = await page.locator('#operation').inputValue(), exampleId = await page.locator('#example').inputValue();
  const operation = view.operations.find(row => row.id === operationId), example = operation.examples.find(row => row.id === exampleId);
  await page.evaluate(() => { const probe = window.__productionWorkerProbe; probe.hold = true; probe.held = []; });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__productionWorkerProbe.held.length === 1);
  await assertUnblockedRunningStatus(page, view.statuses.running);
  await page.evaluate(() => { const probe = window.__productionWorkerProbe, reply = probe.held.shift();
    probe.hold = false; reply.handler({ data: reply.data }); });
  await page.waitForFunction(value => document.querySelector('#result').textContent === value, JSON.parse(example.expected_response).response);
  const modes = [];
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme }); const result = await assess();
    assert.deepEqual(result.violations, [], `MM-22: ${colorScheme} accessibility violations`);
    assert.deepEqual(result.incomplete, [], `MM-22: ${colorScheme} accessibility oracle was incomplete`);
    modes.push({ color_scheme: colorScheme, ...result });
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 320, height: 640 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'MM-22: page overflows at 320 CSS pixels');
  for (const control of await page.locator('button,input,select,textarea').all()) {
    if (!await control.isVisible()) continue;
    const size = await control.boundingBox(); assert(size.width >= 24 && size.height >= 24, 'MM-22: an interactive target is too small');
  }
  await page.screenshot({ path: path.join(evidenceRoot, 'runtime-oracle', 'production-mobile-' + (await page.context().browser().browserType().name()) + '.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  const resized = await page.addStyleTag({ content: 'html{font-size:200% !important}' });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'MM-22: content overflows after 200% text resizing');
  await resized.evaluate(node => node.remove());
  const input = await page.locator('#field-' + operation.fields[0].id).elementHandle();
  const originalId = await input.getAttribute('id'), originalPlaceholder = await input.getAttribute('placeholder');
  await input.evaluate(node => { node.removeAttribute('id'); node.removeAttribute('placeholder'); });
  try { assert((await assess()).violations.includes('label'), 'MM-22: real missing-label defect escaped the oracle'); }
  finally {
    await input.evaluate((node, saved) => { node.id = saved.id; if (saved.placeholder !== null) node.setAttribute('placeholder', saved.placeholder); },
      { id: originalId, placeholder: originalPlaceholder });
    await input.dispose();
  }
  await page.locator('#guided-submit').evaluate(node => { node.style.background = '#fff'; node.style.color = '#aaa'; });
  assert((await assess()).violations.includes('color-contrast'), 'MM-22: real contrast defect escaped the oracle');
  await page.locator('#guided-submit').evaluate(node => node.removeAttribute('style'));
  assert.deepEqual((await assess()).violations, []);
  return { keyboard_only_completions: 1, widths: [320, 1280], text_resize_percent: 200, modes,
    running_live_status_checks: 1, screen_reader_speech_tested: false,
    planted_rejections: ['missing-label', 'low-contrast', 'busy-live-status-ancestor'],
    scope: 'finite-rendered-WCAG-2.2-and-WAI-ARIA-1.2-checks; not-complete-standard-acceptance' };
}

async function noPersistentHistory(page) {
  const storage = await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length,
    databases: (await indexedDB.databases()).length, caches: (await caches.keys()).length,
    service_workers: (await navigator.serviceWorker.getRegistrations()).length }));
  assert.deepEqual(storage, { local: 0, session: 0, databases: 0, caches: 0, service_workers: 0 }, 'MM-23: persistent calculation history escaped the privacy boundary');
  return storage;
}

async function privacy({ page, context, requests, consoles }, view) {
  const privacy = view.sections.find(row => row.id === 'privacy' || /privacy|browser.local/i.test(row.title));
  assert(privacy, 'MM-23: browser-local execution and history policy is not discoverable');
  const text = privacy.paragraphs.join(' ');
  assert.match(text, /browser/i); assert.match(text, /history/i);
  const sentinel = '987654321098765432109876543210987654321098765432109876543210';
  await submitUiVector(page, { kind: 'raw', input: `1\tmatmul\t1\t1\t1\t${sentinel}\t1`, wire: `1\tok\t1\t1\t${sentinel}` });
  const hostile = '<img src=x onerror=alert(1)>';
  await submitUiVector(page, { kind: 'raw', input: `1\tmatmul\t1\t1\t1\t${hostile}\t1`, wire: '1\terror\tinvalid-integer' });
  assert.equal(await page.locator('img').count(), 0);
  assert(requests.every(request => !request.url.includes(sentinel) && !request.url.includes('draft=') && request.method === 'GET'));
  assert(consoles.every(message => !message.includes(sentinel) && !message.includes(hostile)), 'MM-23: private operands entered console output');
  const storage = await noPersistentHistory(page);
  assert.deepEqual((await context.storageState()).cookies, []);
  for (const link of view.links) {
    const url = new URL(link.https_url); assert.equal(url.protocol, 'https:'); assert.equal(url.username + url.password, '');
    assert(!url.href.includes(sentinel));
    const anchor = page.getByRole('link', { name: link.label, exact: true });
    assert.equal(await anchor.getAttribute('href'), link.https_url);
    if (await anchor.getAttribute('target') === '_blank') assert.match(await anchor.getAttribute('rel'), /noreferrer|noopener/);
  }
  await page.evaluate(value => localStorage.setItem('calculation-history', value), sentinel);
  try { await assert.rejects(() => noPersistentHistory(page), /MM-23: persistent calculation history/); }
  finally { await page.evaluate(() => localStorage.removeItem('calculation-history')); }
  await noPersistentHistory(page);
  return { operand_bearing_requests: 0, operand_bearing_console_messages: 0, storage, safe_links: view.links.length,
    planted_rejections: ['persistent-calculation-history'],
    scope: 'application submissions; initial assets and explicit documentation navigation still use the network' };
}

export async function runProductionChecks(build, id) {
  const artifacts = browserArtifacts(build);
  try { return await runProductionArtifactChecks(artifacts, id); }
  catch (error) {
    writeJson(path.join(evidenceRoot, 'runtime-oracle', `${id}.failure.json`), {
      schema: 'lexlean-matmul/production-browser-failure/1', id, status: 'failed', build_id: build.build_id,
      assets: artifacts.assets, error: { name: error.name, message: String(error.message).slice(0, 4096) } });
    throw error;
  }
}

export async function captureProductionScreenshots(artifacts) {
  fs.mkdirSync(path.join(evidenceRoot, 'runtime-oracle'), { recursive: true });
  return withWorkbench(artifacts, async context => ({ screenshots: await renderedScreenshots(context, artifacts.application.view) }));
}

export async function runProductionArtifactChecks(artifacts, id = 'all', publicationUrl = null) {
  assert(['prismpm/text-application/3', 'prismpm/text-application/4'].includes(artifacts.application.profile));
  const view = artifacts.application.view, policy = productionPolicy();
  const checks = { 'MM-18': context => onboarding(context, view), 'MM-19': context => guided(context, view),
    'MM-20': context => guided(context, view, true), 'MM-21': context => recovery(context, view, policy),
    'MM-22': context => accessibility(context, view), 'MM-23': context => privacy(context, view) };
  const ids = id === 'all' ? Object.keys(checks) : [id];
  const evidence = [];
  fs.mkdirSync(path.join(evidenceRoot, 'runtime-oracle'), { recursive: true });
  for (const selected of ids) {
    assert(Object.hasOwn(checks, selected));
    const httpCache = selected === 'MM-21' ? await wasmCacheChecks(artifacts) : null;
    for (const engine of selected === 'MM-22' ? Object.keys(pins) : ['chromium']) {
      evidence.push({ id: selected, ...(await withWorkbench(artifacts, checks[selected], { engine, publicationUrl,
        observeWorkers: ['MM-19', 'MM-21', 'MM-22'].includes(selected) })), ...(httpCache ? { http_cache: httpCache } : {}) });
    }
  }
  return { schema: 'lexlean-matmul/production-browser-acceptance/1', id, status: 'passed',
    profile: artifacts.application.profile, application_sha256: sha(canonical(artifacts.application)), evidence,
    skipped: 0, filtered: 0, scope: 'declared-workbench-journeys-and-finite-browser-quality-checks' };
}
