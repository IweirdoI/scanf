import {mkdir,copyFile,writeFile,stat,cp} from 'node:fs/promises';
import path from 'node:path';
const destination=path.resolve('output/scanf-agent-plugin');
for(const file of ['.codex-plugin/plugin.json','.mcp.json','dist/mcp.js','dist/reader.html','docs/INTEGRATIONS.md','LICENSE','THIRD_PARTY_NOTICES.txt']){
 const target=path.join(destination,file);await mkdir(path.dirname(target),{recursive:true});await copyFile(file,target);
}
const rootIndex=process.argv.indexOf('--root');
await cp('dist/parsers',path.join(destination,'dist/parsers'),{recursive:true});
if(rootIndex>=0){
 const root=process.argv[rootIndex+1];
 if(!root||!path.isAbsolute(root)||!(await stat(root)).isDirectory())throw new Error('--root 必须是可读项目的绝对目录');
 await writeFile(path.join(destination,'.mcp.json'),JSON.stringify({mcpServers:{scanf:{command:process.execPath,args:[path.join(destination,'dist/mcp.js'),'--root',path.resolve(root)]}}},null,2)+'\n');
}
console.log(destination);
