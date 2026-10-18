// Verification only: genuine captured assets and normal browser HTTP caching.
// Named omissions mutate presentation URL policy, never the guest mathematics.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {capturedBrowserRequest,browserScriptIdentity} from './browser-oracle.mjs';
import {deploymentMetadata} from './system-model.mjs';
import {evidenceRoot,sha,writeJson} from './evidence.mjs';
import {researchCase} from './research-cases.mjs';

const pins={
  chromium:{version:'157.0.8099.0',executablePath:process.arch==='x64'
    ?'/ms-playwright/chromium_headless_shell-cft-157.0.8099.0/chrome-headless-shell-linux64/chrome-headless-shell'
    :'/ms-playwright/chromium_headless_shell-cft-157.0.8099.0/chrome-headless-shell-linux-arm64/chrome-headless-shell'},
  firefox:{version:'153.0',executablePath:'/ms-playwright/firefox-1538/firefox/firefox'},
  webkit:{version:'26.5',executablePath:'/ms-playwright/webkit-2336/pw_run.sh'},
};
const bindingMarker="bindingUrl.searchParams.set('model_id',MODEL_ID);";
const iconMarker='<link rel="icon" href="data:,">';
const types=name=>name.endsWith('.wasm')?'application/wasm':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':'text/html; charset=utf-8';
const observationError=(asset)=>`research-cache: current model-keyed ${asset} was not acquired from network`;

export async function warmResearchCacheAssets(page,{url,basePath,content,javascript,requests}) {
  // The server streams the captured head through its data icon, holding the
  // remaining exact bytes until bare assets have entered the normal cache.
  const navigation=await page.goto(url,{waitUntil:'commit'});
  await page.waitForFunction(()=>document.querySelector('link[rel="icon"]')?.getAttribute('href')==='data:,');
  const prefixDom=await page.evaluate(()=>({icons:[...document.querySelectorAll('link[rel="icon"]')].map(node=>node.getAttribute('href')),
    scripts:document.querySelectorAll('script').length,stylesheets:document.querySelectorAll('link[rel="stylesheet"]').length}));
  assert.deepEqual(prefixDom,{icons:['data:,'],scripts:0,stylesheets:0},'research-cache: streamed head executed or loaded an app asset before cache warmup');
  const bare=['app.js',javascript,'app.css'],warmup=[];
  const fetchBodies=()=>page.evaluate(async addresses=>{const rows=[];for(const address of addresses){const response=await fetch(address,{cache:'force-cache',mode:'same-origin',redirect:'error'}),bytes=await response.arrayBuffer();
    rows.push({url:new URL(address,location.href).pathname,status:response.status,bytes:bytes.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')});}return rows;},bare.map(name=>new URL(name,url).href));
  for(let pass=1;pass<=2;pass++) {
    const before=requests.length,bodies=await fetchBodies();
    assert.deepEqual(bodies,bare.map(name=>({url:basePath+name,status:200,bytes:content.get(name).length,sha256:sha(content.get(name))})));
    const delta=requests.length-before;warmup.push({pass,server_gets:delta,bodies});
    if(pass===2)assert.equal(delta,0,'research-cache: second bare-asset fetch did not reuse ordinary HTTP cache');
  }
  return {warmup,navigation,prefixDom};
}

export async function runResearchCacheChecks(artifacts,binding) {
  assert.equal(artifacts.application.profile,'prismpm/text-application/4');
  assert.equal(artifacts.application.view.runtime_binding.model_identity,'current_model');
  assert.equal(artifacts.application.view.execution.wasm_cache_policy,'no-store');
  assert.match(artifacts.modelId,/^[0-9a-f]{64}$/);assert.equal(binding.modelId,artifacts.modelId);
  assert.equal(typeof binding.invoke,'function','research-cache: the genuine adapter must already be checked');
  const identity=browserScriptIdentity(artifacts),target=deploymentMetadata(),content=new Map();
  for(const row of artifacts.assets){assert(!content.has(row.path));const bytes=fs.readFileSync(path.join(artifacts.directory,row.path));
    assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256);content.set(row.path,bytes);}
  assert.equal(content.size,6);assert.equal(JSON.parse(content.get('provenance.json')).model_id,artifacts.modelId);
  assert(content.has(artifacts.javascript)&&content.has(artifacts.wasm.path));
  const view=artifacts.application.view,operation=view.operations.find(op=>op.id==='matmul');assert(operation);
  const fixture=researchCase('matmul',{rows:2,inner:2,columns:2,left:[1n,2n,3n,4n],right:[5n,6n,7n,8n]});
  assert.equal(fixture.expectedResponse,'1\tok\t2\t2\t19,22,43,50');assert.equal(operation.fields.length,fixture.fields.length);
  const key='?model_id='+artifacts.modelId,html=content.get('index.html').toString('utf8'),app=content.get('app.js').toString('utf8');
  assert.equal(html.split(iconMarker).length,2,'research-cache: explicit captured data-icon policy is missing or ambiguous');
  assert(!/<(?:script|link)\b/i.test(html.slice(0,html.indexOf(iconMarker))),'research-cache: data icon must precede app asset references');
  const cssMarker='href="app.css'+key+'"';
  assert.equal(app.split(bindingMarker).length,2,'research-cache: isolated adapter-key omission is ambiguous');
  assert.equal(html.split(cssMarker).length,2,'research-cache: isolated stylesheet-key omission is ambiguous');
  const cases=[{name:'captured-model-keyed-assets',mutated:null},
    {name:'binding-model-key-omitted',mutated:'app.js',bytes:Buffer.from(app.replace(bindingMarker,'')),missing:'adapter'},
    {name:'stylesheet-model-key-omitted',mutated:'index.html',bytes:Buffer.from(html.replace(cssMarker,'href="app.css"')),missing:'stylesheet'}];
  const report={schema:'lexlean-matmul/research-asset-http-cache/1',status:'failed',model_id:artifacts.modelId,assets:artifacts.assets,
    experiment:'current-byte-model-keyed-fetch',
    scope:'Current captured bytes warmed at bare URLs, then the source model-keyed application and real computation. Not a cross-revision experiment. Named omissions alter one presentation URL policy point; guest binding and Wasm bytes remain unchanged.',
    routing_installed:false,cache_disabled:false,service_worker_installed:false,browsers:[],planted_rejections:['binding-model-key-omitted','stylesheet-model-key-omitted']};
  const require=createRequire('/opt/prismpm/oracles/package.json');assert.equal(require('playwright/package.json').version,'1.62.1');
  assert(['x64','arm64'].includes(process.arch));const playwright=require('playwright');
  try {
    for(const [engine,pin]of Object.entries(pins)) {
      const privateHome=fs.mkdtempSync(path.join(os.tmpdir(),'lexlean-matmul-browser-cache-'));fs.chmodSync(privateHome,0o700);
      const env={...process.env,HOME:privateHome};
      for(const [name,directory]of [['XDG_CACHE_HOME','cache'],['XDG_CONFIG_HOME','config'],['XDG_DATA_HOME','data']]){env[name]=path.join(privateHome,directory);fs.mkdirSync(env[name],{mode:0o700});}
      const row={engine,version:pin.version,playwright:'1.62.1',context_mode:'temporary-persistent-profile',observations:[]};report.browsers.push(row);
      try {
        for(const variant of cases) {
          const profile=path.join(privateHome,variant.name);fs.mkdirSync(profile,{mode:0o700});let context;
          try {
            // A normal temporary profile retains WebKit's ordinary HTTP cache;
            // no cache toggle, interception, or retained user profile is used.
            context=await playwright[engine].launchPersistentContext(profile,{headless:true,executablePath:pin.executablePath,env,timeout:operation.trace.timeout_milliseconds});
            assert.equal(context.browser().version(),pin.version);
            const observed=await exercise(context,variant,content,artifacts,target,identity,fixture,operation,view,row.observations);
            try {
              for(const [name,label]of [['app.js','main application'],[artifacts.javascript,'adapter'],['app.css','stylesheet']])
                assert(observed.network_gets[name]>=1,observationError(label));
              assert.equal(variant.missing,undefined,'research-cache: a named omission unexpectedly met model-keyed network policy');
              observed.status='passed';
            }catch(error){
              if(!variant.missing||!String(error.message).startsWith(observationError(variant.missing)))throw error;
              assert.equal(observed.network_gets[variant.missing==='adapter'?artifacts.javascript:'app.css'],0);
              assert.equal(observed.omitted_bare_asset_network_gets,0,'research-cache: omission did not reuse the genuinely warmed bare asset');
              observed.status='intended-rejection';observed.rejection=observationError(variant.missing);
            }
          }finally{await context?.close();}
        }
      } finally {fs.rmSync(privateHome,{recursive:true,force:true});row.private_profile_removed=!fs.existsSync(privateHome);assert(row.private_profile_removed);}
    }
    report.status='passed';return report;
  } finally {writeJson(path.join(evidenceRoot,'runtime-oracle','MM-31.asset-cache.json'),report);}
}

async function exercise(context,variant,content,artifacts,target,identity,fixture,operation,view,observations) {
  let phase='warm';const requests=[],unexpected=[],errors=[],responseErrors=[],responses=[],pending=[];
  const html=variant.mutated==='index.html'?variant.bytes:content.get('index.html'),icon=Buffer.from(iconMarker),iconEnd=html.indexOf(icon)+icon.length;
  const references=['<link rel="stylesheet"','<script'].map(marker=>html.indexOf(Buffer.from(marker))).filter(index=>index>=0),split=Math.min(...references);
  assert(iconEnd>=icon.length&&Number.isInteger(split)&&split>=iconEnd,'research-cache: captured icon must precede stylesheet/module activation');
  const prefix=html.subarray(0,split),remainder=html.subarray(split);assert(Buffer.concat([prefix,remainder]).equals(html));
  let releaseHtml,htmlRequests=0;const heldHtml=new Promise(resolve=>{releaseHtml=resolve;});
  const htmlStream={icon:iconMarker,prefix_bytes:prefix.length,prefix_sha256:sha(prefix),remainder_bytes:remainder.length,remainder_sha256:sha(remainder),
    full_bytes:html.length,full_sha256:sha(html),held:false,released_after_warmup:false};
  const server=createServer((request,response)=>{
    const address=new URL(request.url,'http://127.0.0.1'),name=address.pathname===target.basePath?'index.html':address.pathname.slice(target.basePath.length);
    if(request.method!=='GET'||!capturedBrowserRequest('http://127.0.0.1'+request.url,'http://127.0.0.1',target.basePath,[...content.keys()],identity)){
      unexpected.push(request.url);response.writeHead(404).end();return;
    }
    const bytes=name==='index.html'?html:phase==='current'&&name===variant.mutated?variant.bytes:content.get(name);
    requests.push({phase,url:request.url,path:name,method:request.method,bytes:bytes.length,sha256:sha(bytes),destination:request.headers['sec-fetch-dest']??null});
    response.writeHead(200,{'content-type':types(name),'cache-control':name==='index.html'?'no-store':'public, max-age=600',
      'content-length':bytes.length,Date:new Date().toUTCString(),ETag:'"'+sha(bytes)+'"'});
    if(name==='index.html'){
      htmlRequests++;htmlStream.held=true;response.write(prefix);
      heldHtml.then(()=>{if(!response.destroyed)response.end(remainder);});
    }else response.end(bytes);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port,url=origin+target.basePath,key='?model_id='+artifacts.modelId;
  const workers=[];
  const observed={case:variant.name,status:'running',mutated_asset:variant.mutated,cache_warmup_verified:false,network_gets:{},requests,
    warmup:[],html_stream:htmlStream,responses,worker_urls:[],worker_ready_model_ids:[],actual_matrix_response:'',actual_matrix_cells:[],
    mutation:variant.mutated?{asset:variant.mutated,before_sha256:sha(content.get(variant.mutated)),after_sha256:sha(variant.bytes)}:null};
  observations.push(observed);
  const expectedBody=name=>name==='index.html'?html:phase==='current'&&name===variant.mutated?variant.bytes:content.get(name);
  context.on('request',request=>{if(request.method()!=='GET'||!capturedBrowserRequest(request.url(),origin,target.basePath,[...content.keys()],identity))unexpected.push(request.url());});
  context.on('response',response=>{
    const address=new URL(response.url());if(address.origin!==origin)return;
    const name=address.pathname===target.basePath?'index.html':address.pathname.slice(target.basePath.length),expected=expectedBody(name),entry={phase,url:address.pathname+address.search,path:name,status:response.status(),resource_type:response.request().resourceType(),service_worker:response.fromServiceWorker(),redirected:response.request().redirectedFrom()!==null};
    responses.push(entry);pending.push((async()=>{assert(expected,'research-cache: undeclared response');assert.equal(response.status(),200);assert.equal(response.request().redirectedFrom(),null);assert.equal(entry.service_worker,false);
      const bytes=await response.body();entry.bytes=bytes.length;entry.sha256=sha(bytes);assert(bytes.equals(expected),'research-cache: received body differs from the captured asset or single named mutation');})().catch(error=>responseErrors.push(String(error.message))));
  });
  try {
    await context.addInitScript(()=>{window.__researchCacheWorkers=[];const Actual=window.Worker;window.Worker=class extends Actual{
      constructor(url,options){super(url,options);const row={url:new URL(String(url),location.href).href,ready:[],results:[]};window.__researchCacheWorkers.push(row);
        this.addEventListener('message',({data})=>{if(data?.type==='ready')row.ready.push(data.model_id);else if(data?.type==='result'&&data.output instanceof Uint8Array)row.results.push([...data.output]);});}
    };});
    const page=await context.newPage();page.setDefaultTimeout(view.execution.timeout_milliseconds);page.on('pageerror',error=>errors.push(error.message));page.on('worker',worker=>workers.push(worker));
    const {warmup,navigation,prefixDom}=await warmResearchCacheAssets(page,{url,basePath:target.basePath,content,javascript:artifacts.javascript,requests});
    observed.warmup=warmup;observed.cache_warmup_verified=true;htmlStream.prefix_dom=prefixDom;
    assert.equal(htmlRequests,1,'research-cache: more than one initial HTML response was requested');
    assert(requests.every(row=>row.path==='index.html'||(['app.js',artifacts.javascript,'app.css'].includes(row.path)&&!row.url.includes('?'))),
      'research-cache: app assets were activated before cache warmup completed');
    phase='current';htmlStream.released_after_warmup=true;releaseHtml();
    observed.initial_html=await page.evaluate(html=>{const document=new DOMParser().parseFromString(html,'text/html');return{modules:[...document.querySelectorAll('script')].map(node=>({src:node.getAttribute('src'),type:node.getAttribute('type')})),stylesheets:[...document.querySelectorAll('link[rel="stylesheet"]')].map(node=>node.getAttribute('href'))};},await navigation.text());
    assert.deepEqual(observed.initial_html,{modules:[{src:'app.js'+key,type:'module'}],stylesheets:[variant.missing==='stylesheet'?'app.css':'app.css'+key]});
    await page.waitForFunction(()=>['ready','load_error','response_error','compute_error'].includes(document.querySelector('#status')?.dataset.state));
    assert.equal(await page.locator('#status').getAttribute('data-state'),'ready','research-cache: genuine current model did not initialize');
    assert.equal(await page.locator('#case-model-id').textContent(),artifacts.modelId);
    await page.locator('#operation').selectOption(operation.id);
    for(const [index,field]of operation.fields.entries()) {
      const node=page.locator('#field-'+field.id);if(field.kind==='choice')await node.selectOption(fixture.fields[index]);else await node.fill(fixture.fields[index]);
    }
    await page.locator('#guided-submit').click();
    await page.waitForFunction(()=>['ready','timeout','response_error','compute_error','input_error'].includes(document.querySelector('#status')?.dataset.state));
    assert.equal(await page.locator('#status').getAttribute('data-state'),'ready');
    assert.equal(await page.locator('#result').textContent(),fixture.expectedResponse,'research-cache: actual guest matrix computation differs');
    assert.deepEqual(await page.locator('#result-table tbody td').allTextContents(),['19','22','43','50']);
    observed.actual_matrix_response=await page.locator('#result').textContent();observed.actual_matrix_cells=await page.locator('#result-table tbody td').allTextContents();observed.actual_matrix_request_sha256=sha(fixture.request);
    const wire=await page.evaluate(()=>window.__researchCacheWorkers);assert.equal(wire.length,1);assert.equal(workers.length,1);
    observed.worker_urls=wire.map(row=>row.url);observed.worker_ready_model_ids=wire.flatMap(row=>row.ready);
    assert.deepEqual(observed.worker_urls,[new URL('app.js'+key,url).href]);assert.equal(workers[0].url(),observed.worker_urls[0]);
    assert.deepEqual(observed.worker_ready_model_ids,[artifacts.modelId]);assert.equal(wire[0].results.length,1);
    const reply=Buffer.from(wire[0].results[0]),parsed=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(reply));
    assert.equal(parsed.version,2);assert.equal(parsed.action,'compute');assert.equal(parsed.operation,'matmul');assert.equal(parsed.response,fixture.expectedResponse);
    assert.deepEqual(parsed.cells,['19','22','43','50']);observed.actual_worker_reply_sha256=sha(reply);
    observed.worker_body=await workers[0].evaluate(async()=>{const response=await fetch(self.location.href,{cache:'force-cache',mode:'same-origin',redirect:'error'}),bytes=await response.arrayBuffer();return{url:self.location.href,status:response.status,bytes:bytes.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')};});
    const workerBytes=variant.mutated==='app.js'?variant.bytes:content.get('app.js');
    assert.deepEqual(observed.worker_body,{url:observed.worker_urls[0],status:200,bytes:workerBytes.length,sha256:sha(workerBytes)});
    await Promise.all(pending);assert.deepEqual(responseErrors,[],'research-cache: response-body authentication failed');
    const current=requests.filter(row=>row.phase==='current');
    for(const name of ['app.js',artifacts.javascript,'app.css'])observed.network_gets[name]=current.filter(row=>row.url===target.basePath+name+key).length;
    if(variant.missing)observed.omitted_bare_asset_network_gets=current.filter(row=>row.url===target.basePath+(variant.missing==='adapter'?artifacts.javascript:'app.css')).length;
    observed.bare_wasm_network_gets=current.filter(row=>row.url===target.basePath+artifacts.wasm.path).length;
    assert.equal(observed.bare_wasm_network_gets,1,'research-cache: current Worker did not fetch the genuine bare Wasm exactly once');
    assert(current.filter(row=>row.path===artifacts.wasm.path).every(row=>row.sha256===artifacts.wasm.sha256));
    observed.main_module_responses=responses.filter(row=>row.phase==='current'&&row.url===target.basePath+'app.js'+key);
    assert(observed.main_module_responses.length>=1,'research-cache: actual main/Worker module response missing');
    assert(observed.main_module_responses.some(row=>['script','worker'].includes(row.resource_type)),'research-cache: actual main script response missing');
    assert(observed.main_module_responses.every(row=>row.sha256===sha(workerBytes)));
    assert.deepEqual(unexpected,[],'research-cache: undeclared or operand-bearing request');assert.deepEqual(errors,[],'research-cache: unhandled page error');
    observed.external_requests=0;observed.page_errors=0;observed.service_workers=await page.evaluate(async()=>('serviceWorker'in navigator?(await navigator.serviceWorker.getRegistrations()).length:0));assert.equal(observed.service_workers,0);
    return observed;
  } catch(error){observed.status='failed';observed.error={name:error.name,message:String(error.message).slice(0,4096)};throw error;
  } finally {releaseHtml();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
