/* Dependency-free static build. Every page pins its scripts/styles by content hash. */
import {readFile,writeFile,readdir,mkdir,rm,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {prepareProductivitySetup} from './prepare-productivity-setup.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),output=path.join(root,'dist');
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,16);
const names=(await readdir(root)).filter(name=>/\.(js|css)$/.test(name)&&name!=='service-worker.js').sort();
const inputs=await Promise.all(['index.html','service-worker.js','manifest.webmanifest','offline.html',...names].map(async name=>[name,await readFile(path.join(root,name),'utf8')]));
async function fingerprints(directory){
  const values=[];
  for(const entry of (await readdir(path.join(root,directory),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const name=`${directory}/${entry.name}`;
    if(entry.isDirectory())values.push(...await fingerprints(name));else values.push(`${name}:${hash(await readFile(path.join(root,name)))}`);
  }
  return values;
}
const release=hash(inputs.map(([name,text])=>`${name}\n${text}`).join('\n')+(await fingerprints('assets')).join('\n')+(await fingerprints('icons')).join('\n'));
await rm(output,{recursive:true,force:true});await mkdir(path.join(output,'static'),{recursive:true});
const assets=new Map();
for(const [name,source] of inputs.filter(([name])=>names.includes(name))){
  let value=source.replaceAll('__QUEST_RELEASE__',release);
  if(name.endsWith('.css'))value=value.replaceAll('./assets/','/assets/');
  const target=`/static/${path.parse(name).name}.${hash(value)}${path.extname(name)}`;
  assets.set(name,target);await writeFile(path.join(output,target),value);
}
let html=inputs.find(([name])=>name==='index.html')[1];
for(const [name,target] of assets)html=html.replaceAll(`src="./${name}"`,`src="${target}"`).replaceAll(`href="./${name}"`,`href="${target}"`);
html=html.replace('</head>',`<meta name="quest-release" content="${release}"></head>`);
await writeFile(path.join(output,'index.html'),html);
for(const name of ['offline.html','manifest.webmanifest','favicon.svg'])await cp(path.join(root,name),path.join(output,name));
let setupGuide=await readFile(path.join(root,'setup-guide.html'),'utf8');for(const [name,target] of assets)setupGuide=setupGuide.replaceAll(`src="./${name}"`,`src="${target}"`).replaceAll(`href="./${name}"`,`href="${target}"`);await writeFile(path.join(output,'setup-guide.html'),setupGuide);
await prepareProductivitySetup(path.join(output,'setup/productivity.sql'));
for(const name of ['assets','icons'])await cp(path.join(root,name),path.join(output,name),{recursive:true});
const icons=(await readdir(path.join(root,'icons'))).filter(name=>/\.png$/.test(name)).map(name=>`/icons/${name}`);
const precache=['/offline.html','/favicon.svg',...icons,...assets.values()];
const worker=inputs.find(([name])=>name==='service-worker.js')[1].replaceAll('__QUEST_RELEASE__',release).replace('__QUEST_PUBLIC_ASSETS__',JSON.stringify(precache));
await writeFile(path.join(output,'service-worker.js'),worker);
await writeFile(path.join(output,'version.json'),JSON.stringify({release})+'\n');
console.log(`Built Quest ${release}: ${assets.size} versioned scripts/styles; private API responses are not cached.`);
