import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../',import.meta.url));
const pages = process.argv[2] === '--pages';
const webDirectory = resolve(process.argv[3] ?? resolve(root,'dist/pages'));
const destination = pages ? resolve(webDirectory,'demo.html') :
  process.argv[2] ? resolve(process.argv[2]) : resolve(root,'dist/spotme-local.html');
const read = path => readFile(resolve(root,path),'utf8');
const [template,css,domain,app] = await Promise.all([
  read('apps/web/local/index.html'),read('apps/web/local/style.css'),
  read('packages/domain/demo.mjs'),read('apps/web/local/app.mjs')
]);
const browserApp = app.replace(/^import[^\n]+from '\.\.\/\.\.\/\.\.\/packages\/domain\/demo\.mjs';\n/,'');
if (browserApp === app) throw new Error('Expected one bundled demo domain import.');
const publicTemplate = pages ? template
  .replace('<html lang="en">','<html lang="en-CA" data-spotme-desktop-only>')
  .replace("script-src 'unsafe-inline'","script-src 'self' 'unsafe-inline'")
  .replace('<title>SpotMe — Local demo</title>','<title>SpotMe | Web demo</title>\n  <script src="./device.js"></script>')
  .replace('<strong class="logo">SpotMe<span>••</span></strong>','<a class="logo" href="./">SpotMe<span>••</span></a>')
  .replaceAll('Local demo','Web demo') : template;
const publicStyles = pages ? await read('apps/web/landing/demo.css') : '';
const html = publicTemplate.replace('<!-- STYLES -->',()=>`<style>\n${css}\n${publicStyles}</style>`)
  .replace('<!-- SCRIPT -->',()=>`<script type="module">\n${domain}\n${pages ? "if (document.documentElement.dataset.spotmeView !== 'mobile') {\n" : ''}${pages ? browserApp.replaceAll('Local demo','Web demo') : browserApp}${pages ? '\n}' : ''}</script>`);
await mkdir(dirname(destination),{recursive:true});
await writeFile(destination,html);
if (pages) {
  await Promise.all(['index.html','device.js','hero.jpg'].map(file =>
    copyFile(resolve(root,'apps/web/landing',file),resolve(webDirectory,file))));
}
console.log(destination);
