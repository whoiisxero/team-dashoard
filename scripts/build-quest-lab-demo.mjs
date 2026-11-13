import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = resolve(process.argv[2] || '/workspace/outputs/Quest-Lab-Demo.html');
const css = await readFile(resolve(root, 'quest-lab.css'), 'utf8');
const js = await readFile(resolve(root, 'quest-lab.js'), 'utf8');
if (/<\/style/i.test(css) || /<\/script/i.test(js)) throw Error('Unexpected inline closing tag');
const html = [
  '<!doctype html><html lang="en"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
  '<meta name="color-scheme" content="dark"><meta name="robots" content="noindex,nofollow">',
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; font-src \'none\'; base-uri \'none\'; form-action \'none\'">',
  '<title>Quest Lab · Interactive demo</title><style>', css, '</style></head>',
  '<body class="ql-standalone"><main id="questLabMount"></main>',
  '<p class="ql-demo-footnote">Quest Lab / Local concept demo. This file works offline.<br>All names, nodes, candles and future paths are synthetic. No account, workspace or live market data is used.</p>',
  '<script>', js, '\nwindow.questLabDemo = window.mountQuestLab(document.getElementById("questLabMount"));</script>',
  '</body></html>'
].join('');
await mkdir(resolve(destination, '..'), {recursive: true});
await writeFile(destination, html);
console.log(destination);
