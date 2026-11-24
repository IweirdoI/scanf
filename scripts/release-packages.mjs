import {mkdir,copyFile,writeFile,readFile,cp} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
const pkg=JSON.parse(await readFile('package.json','utf8'));
const output=path.resolve('output/release'),mcp=path.resolve('output/release-mcp');
await mkdir(output,{recursive:true});await mkdir(path.join(mcp,'dist'),{recursive:true});
for(const name of ['mcp.js','reader.html'])await copyFile(`dist/${name}`,path.join(mcp,'dist',name));
await cp('dist/parsers',path.join(mcp,'dist/parsers'),{recursive:true});
for(const name of ['LICENSE','THIRD_PARTY_NOTICES.txt'])await copyFile(name,path.join(mcp,name));
await copyFile('scripts/reader-cli.cjs',path.join(mcp,'cli.cjs'));
const portable={name:'scanf-reader',version:pkg.version,description:pkg.description,license:'MIT',engines:{node:'>=22'},bin:{'scanf-reader':'cli.cjs'},files:['cli.cjs','dist','LICENSE','THIRD_PARTY_NOTICES.txt','README.md'],repository:pkg.repository,homepage:pkg.homepage};
await writeFile(path.join(mcp,'package.json'),JSON.stringify(portable,null,2)+'\n');
await writeFile(path.join(mcp,'README.md'),'# Scanf Reader\n\nPrebuilt CLI + MCP server. No source build required.\n\nRun `scanf-reader --help` or visit https://github.com/IweirdoI/scanf#installation.\n\n'+await readFile('docs/INSTALL.md','utf8'));
function pack(cwd){
 const r=spawnSync('npm',['pack','--pack-destination',output],{cwd,shell:process.platform==='win32',encoding:'utf8'});
 if(r.status!==0)throw new Error(r.stderr||r.stdout);console.log(r.stdout.trim());
}
pack(mcp);pack(path.resolve('adapters/dsh'));
const vsix=`scanf-code-reader-${pkg.version}.vsix`;
await copyFile(vsix,path.join(output,vsix));
const names=[vsix,`scanf-reader-${pkg.version}.tgz`,`dsh-scanf-reader-${pkg.version}.tgz`];
const hashes=await Promise.all(names.map(async n=>`${createHash('sha256').update(await readFile(path.join(output,n))).digest('hex')}  ${n}`));
await writeFile(path.join(output,'SHA256SUMS.txt'),hashes.join('\n')+'\n');
console.log('Release assets: '+output);
