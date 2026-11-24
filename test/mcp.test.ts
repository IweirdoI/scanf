import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdtemp,copyFile,rm} from 'node:fs/promises';
import os from 'node:os';

test('built MCP server negotiates stdio, exposes reading entrypoint, disambiguates and returns UI resources',async()=>{
 const client=new Client({name:'scanf-integration-test',version:'1'});
 const isolated=await mkdtemp(path.join(os.tmpdir(),'scanf-packaged-'));
 await copyFile('dist/mcp.js',path.join(isolated,'mcp.js'));await copyFile('dist/reader.html',path.join(isolated,'reader.html'));
 const transport=new StdioClientTransport({command:process.execPath,args:[path.join(isolated,'mcp.js'),'--root',path.resolve('examples')],cwd:isolated,stderr:'pipe'});
 try{
  await client.connect(transport);
  const list=await client.listTools();const open=list.tools.find(t=>t.name==='scanf_open_reader')!;
  assert.equal((open._meta?.ui as any).resourceUri,'ui://scanf/reader-v1.html');
  assert.deepEqual((open._meta?.['openai/ui'] as any).entrypoints,[{type:'thread'}]);
  const found=await client.callTool({name:'scanf_find_symbol',arguments:{query:'checkout'}});
  assert.notEqual(found.isError,true);
  const lookup=found.structuredContent as any;const symbol=lookup.matches.find((m:any)=>m.kind==='function');
  const detail=await client.callTool({name:'scanf_inspect',arguments:{id:symbol.id,revision:lookup.revision}});
  const view=(detail.structuredContent as any).view;
  assert.ok(view.entries.children.some((g:any)=>g.label==='导出 API'));
  assert.deepEqual(view.calls.children.map((n:any)=>n.label),['subtotal','discount','saveOrder']);
  assert.match(view.source,/购物车为空/);
  const note=await client.callTool({name:'scanf_publish_explanation',arguments:{id:symbol.id,revision:lookup.revision,text:'检查购物车，计算价格后保存订单。',evidence:[{line:5,endLine:11}],parameters:[{name:'items',text:'本次结算的购物车条目，传入小计计算并随订单保存。',evidence:[{line:5,endLine:11}]}]}});
  assert.equal((note.structuredContent as any).view.explanation.text,'检查购物车，计算价格后保存订单。');
  assert.match((note.structuredContent as any).view.explanation.parameters[0].text,/购物车条目/);
  const invented=await client.callTool({name:'scanf_publish_explanation',arguments:{id:symbol.id,revision:lookup.revision,text:'无效参数',evidence:[{line:5,endLine:11}],parameters:[{name:'invented',text:'不存在的参数',evidence:[{line:5,endLine:6}]}]}});assert.equal(invented.isError,true);
  const badNote=await client.callTool({name:'scanf_publish_explanation',arguments:{id:symbol.id,revision:lookup.revision,text:'无效引用',evidence:[{line:100,endLine:101}]}});assert.equal(badNote.isError,true);
  const stale=await client.callTool({name:'scanf_inspect',arguments:{id:symbol.id,revision:'wrong'}});assert.equal(stale.isError,true);
  const bad=await client.callTool({name:'scanf_inspect',arguments:{id:'../../outside'}});assert.equal(bad.isError,true);
  assert.notEqual((await client.callTool({name:'scanf_open_reader',arguments:{}})).isError,true,'bad selections must not poison later requests');
  const resources=await client.listResources();assert.ok(resources.resources.some(r=>r.uri==='ui://scanf/reader-v1.html'));
  const html=await client.readResource({uri:'ui://scanf/reader-v1.html'});assert.equal(html.contents[0].mimeType,'text/html;profile=mcp-app');
  assert.ok(String((html.contents[0] as any).text).includes('id="app"'));
 }finally{await client.close();await transport.close();await rm(isolated,{recursive:true,force:true});}
});
