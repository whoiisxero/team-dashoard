import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const html=await readFile('dist/index.html','utf8'),files=await readdir('dist/static');
const module=/\/static\/assistant-research\.[a-f0-9]{16}\.js/.exec(html)?.[0],chat=/\/static\/assistant\.[a-f0-9]{16}\.js/.exec(html)?.[0];
assert(module&&chat&&html.indexOf(module)<html.indexOf(chat),'Research must load before Q creates its panel');
assert(/\/static\/assistant-research\.[a-f0-9]{16}\.css/.test(html));
for(const file of files){if(file.endsWith('.js'))assert(!(await readFile('dist/static/'+file,'utf8')).includes('qResearchPreview'),'Simulated preview transport must never ship in the real app');}
const handlers={},origin='https://quest.test',source=await readFile('dist/service-worker.js','utf8');let cacheReads=0,networkReads=0,interceptions=0;
vm.runInNewContext(source,{self:{location:{origin},addEventListener:(name,fn)=>handlers[name]=fn},URL,Request,Set,caches:{open:async()=>({match:async()=>{cacheReads++;return null;}})},fetch:async()=>{networkReads++;return new Response('public asset');}});
for(const request of [
 new Request(origin+'/api/research'),
 new Request(origin+'/api/research?action=job&id=sample'),
 new Request(origin+'/api/research',{headers:{Authorization:'Bearer fixture-session'}}),
 new Request(origin+'/api/research',{method:'POST',body:'{}'}),
 new Request(origin+module,{headers:{Authorization:'Bearer fixture-session'}})
])handlers.fetch({request,respondWith:()=>interceptions++});
assert.equal(interceptions,0);assert.equal(cacheReads,0);assert.equal(networkReads,0);
let asset;handlers.fetch({request:new Request(origin+module),respondWith:promise=>asset=promise});await asset;
assert.equal(cacheReads,1);assert.equal(networkReads,1);
const manifest=JSON.parse(await readFile('worker/vendor/source-manifest.json','utf8'));
for(const [path,digest] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(await readFile('worker/vendor/browser-use/'+path)).digest('hex'),digest,'Vendored source changed: '+path);
console.log('PASS release build: hashed Research assets load in order, simulation excluded from production, Research/API/authenticated requests never enter offline caches, normal public asset caching retained, and all 198 vendored source/license hashes match.');
