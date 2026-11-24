import { build } from 'esbuild';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
const bundles=[];
await build({ entryPoints: ['src/extension.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['vscode'], outfile: 'dist/extension.js', sourcemap: true });
bundles.push(await build({ entryPoints: ['src/worker.ts'], bundle: true, minify: true, platform: 'node', format: 'cjs', outfile: 'dist/worker.js',metafile:true }));
bundles.push(await build({ entryPoints: ['media/app.js'], bundle: true, platform: 'browser', outfile: 'dist/webview.js', minify: true,metafile:true }));
bundles.push(await build({ entryPoints: ['media/reader.js'], bundle: true, platform: 'browser', outfile: 'dist/reader.js', minify: true,metafile:true }));
bundles.push(await build({ entryPoints: ['src/mcp.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: 'dist/mcp.js', minify: true,metafile:true }));
const readerScript=await readFile('dist/reader.js','utf8');
const readerCss=await readFile('media/reader.css','utf8');
await writeFile('dist/reader.html',`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${readerCss}</style></head><body><div id="app"></div><script>${readerScript.replace(/<\/script/gi,'<\\/script')}</script></body></html>`);
const dshClient=await build({ entryPoints:['adapters/dsh/client.ts'],bundle:true,platform:'browser',format:'cjs',external:['react'],write:false });
await mkdir('adapters/dsh/lib',{recursive:true});
await writeFile('adapters/dsh/lib/client.js',`window.__ModuleLoader__.load({id:"dsh-scanf-reader",factory(require){var module={exports:{}};var exports=module.exports;\n${dshClient.outputFiles[0].text}\nreturn module.exports;}});\n`);
bundles.push(await build({ entryPoints:['adapters/dsh/index.ts'],bundle:true,platform:'node',format:'esm',outfile:'adapters/dsh/lib/index.js',minify:true,metafile:true,banner:{js:'import { createRequire } from "node:module"; const require = createRequire(import.meta.url); import { fileURLToPath } from "node:url"; import { dirname as dshDirname } from "node:path"; const __filename = fileURLToPath(import.meta.url); const __dirname = dshDirname(__filename);'} }));
await writeFile('adapters/dsh/LICENSE',await readFile('LICENSE','utf8'));
if (process.argv.includes('--test')) await build({ entryPoints: ['test/extension.integration.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['vscode'], outfile: 'dist/extension.integration.js' });
const packages=new Set(bundles.flatMap(b=>Object.keys(b.metafile.inputs)).map(file=>file.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1]).filter(Boolean));
const licenses=await Promise.all([...packages].sort().map(async name=>{
 const dir=`node_modules/${name}`,pkg=JSON.parse(await readFile(`${dir}/package.json`,'utf8'));
 const files=(await readdir(dir)).filter(file=>/^licen[cs]e(?:\.|$)|^copying/i.test(file));
 const texts=await Promise.all(files.map(file=>readFile(`${dir}/${file}`,'utf8')));
 return `${name}@${pkg.version}\n${'='.repeat(name.length)}\nLicense: ${pkg.license??'see package source'}\n${texts.join('\n')||JSON.stringify({author:pkg.author,repository:pkg.repository})}`;
}));
await writeFile('THIRD_PARTY_NOTICES.txt', licenses.join('\n\n'));

await writeFile('adapters/dsh/lib/reader.html', await readFile('dist/reader.html','utf8'));

await writeFile('adapters/dsh/THIRD_PARTY_NOTICES.txt', await readFile('THIRD_PARTY_NOTICES.txt','utf8'));
