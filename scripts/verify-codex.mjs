// Read-only discovery through a real Codex app-server, without creating a chat or running a model.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
const binary=process.argv[2];
if(!binary)throw new Error('Usage: node scripts/verify-codex.mjs <codex.exe or codex.js>');
const child=spawn(binary.endsWith('.js')?process.execPath:binary,[...(binary.endsWith('.js')?[binary]:[]),'app-server','--stdio'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
const waiting=new Map();let sequence=0;
const lines=createInterface({input:child.stdout});
lines.on('line',line=>{try{const message=JSON.parse(line);const job=waiting.get(message.id);if(job){clearTimeout(job.timer);waiting.delete(message.id);message.error?job.reject(new Error(JSON.stringify(message.error))):job.resolve(message.result);}}catch{}});
child.stderr.resume();
const call=(method,params)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{waiting.delete(id);reject(new Error(`${method}: timeout`));},45000);waiting.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
try{
 await call('initialize',{clientInfo:{name:'scanf_local_check',title:'Scanf connection verification',version:'0.4.0'},capabilities:{experimentalApi:true,requestAttestation:false,explicitGatewayOauth:true}});
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'initialized'})+'\n');
 const status=await call('mcpServerStatus/list',{serverName:'scanf',detail:'full'});
 const server=status.data.find(s=>s.name==='scanf');
 if(!server||server.toolsError||!Object.values(server.tools).some(t=>t.name==='scanf_open_reader'))throw new Error('Scanf tools were not discovered: '+JSON.stringify(server));
 const resource=await call('mcpServer/resource/read',{server:'scanf',uri:'ui://scanf/reader-v1.html'});
 if(!resource.contents.some(c=>c.mimeType==='text/html;profile=mcp-app'))throw new Error('UI resource missing');
 const result={checkedAt:new Date().toISOString(),pluginId:server.pluginId,server:server.name,tools:Object.values(server.tools).map(t=>t.name),uiResource:true,nativeWindowVerified:false};
 await writeFile(path.resolve('output/codex-connection-check.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{for(const job of waiting.values())clearTimeout(job.timer);child.stdin.end();child.kill();lines.close();}
