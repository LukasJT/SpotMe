import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../',import.meta.url));
const destination = process.argv[2] ? resolve(process.argv[2]) : resolve(root,'dist/spotme-local.html');
const read = path => readFile(resolve(root,path),'utf8');
const [template,css,domain,app] = await Promise.all([
  read('apps/web/local/index.html'),read('apps/web/local/style.css'),
  read('packages/domain/demo.mjs'),read('apps/web/local/app.mjs')
]);
const browserApp = app.replace(/^import[^\n]+from '\.\.\/\.\.\/\.\.\/packages\/domain\/demo\.mjs';\n/,'');
if (browserApp === app) throw new Error('Expected one bundled demo domain import.');
const html = template.replace('<!-- STYLES -->',()=>`<style>\n${css}</style>`)
  .replace('<!-- SCRIPT -->',()=>`<script type="module">\n${domain}\n${browserApp}</script>`);
await mkdir(dirname(destination),{recursive:true});
await writeFile(destination,html);
console.log(destination);
