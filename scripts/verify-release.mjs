import {mkdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const {version}=JSON.parse(await readFile('package.json','utf8'));
const target=path.resolve('output/release-verification');await mkdir(target,{recursive:true});
const archive=path.resolve(`output/release/scanf-reader-${version}.tgz`);
const extracted=spawnSync('tar',['-xzf',archive,'-C',target],{encoding:'utf8'});assert.equal(extracted.status,0,extracted.stderr);
const cli=path.join(target,'package','cli.cjs');
let r=spawnSync(process.execPath,[cli,'--version'],{encoding:'utf8'});assert.equal(r.status,0);assert.equal(r.stdout.trim(),version);
r=spawnSync(process.execPath,[cli,'setup','--root',path.resolve('examples')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
const config=JSON.parse(r.stdout).mcpServers.scanf;assert.equal(config.command,process.execPath);
const transport=new StdioClientTransport({command:process.execPath,args:[cli,'mcp','--root',path.resolve('examples')],stderr:'pipe'});
const client=new Client({name:'scanf-release-verification',version:'1.0.0'});
try{await client.connect(transport);const {tools}=await client.listTools();assert.equal(tools.length,5);for(const query of ['checkout','run_worker','clampCount','clamp_count']){const result=await client.callTool({name:'scanf_find_symbol',arguments:{query}});assert.ok(!result.isError);assert.ok(result.structuredContent.matches.length,query+' must be discoverable in the prebuilt package');}console.log('Packed CLI --version / setup / stdio MCP + 5 tools / mixed-language grammars: passed.');}finally{await client.close();}
