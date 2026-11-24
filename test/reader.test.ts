import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {analyze,normalize} from '../src/analyzer';
import {relationTree,projectTree,entryTree,readerView} from '../src/reader-model';
import {ProjectReader} from '../src/project';
import {mkdtemp,writeFile,rm,mkdir,symlink} from 'node:fs/promises';
import os from 'node:os';

test('tree projection preserves sibling calls, shared targets and recursion',()=>{
 const root=normalize(process.cwd());const map=analyze({[root+'/a.ts']:'function root(){ left(); right(); } function left(){ shared(); } function right(){ shared(); } function shared(){ shared(); }'},root);
 const tree=relationTree(map,map.nodes.find(n=>n.name==='root')!.id);
 assert.deepEqual(tree.children.map(n=>n.label),['left','right']);
 assert.equal(tree.children[0].children[0].children[0].reference,'cycle');
 assert.equal(tree.children[1].children[0].reference,'shared');
 const capped=relationTree(map,map.nodes.find(n=>n.name==='root')!.id,'call',1);
 assert.equal(capped.children[0].truncated,true);
});
test('project tree nests AST function ownership even when functions share one source line',()=>{
 const root=normalize(process.cwd());const map=analyze({[root+'/src/a.ts']:'function outer(){ const inner = () => 1; return inner(); }'},root);
 const tree=projectTree(map);assert.equal(tree.children[0].label,'src');
 assert.equal(tree.children[0].children[0].children[0].children[0].label,'inner');
});

test('logical entries distinguish module startup, exports and registered callback candidates without inventing calls',()=>{
 const root=normalize(process.cwd());
 const source=`export function api(){ worker(); }
function worker(){ worker(); }
function main(){ api(); }
function unused(){}
main();
router.post('/orders', api);
router.on('ready', () => worker());`;
 const map=analyze({[root+'/src/app.ts']:source},root);
 const byName=(name:string)=>map.nodes.find(n=>n.name===name)!;
 assert.ok(map.entries!.some(e=>e.kind==='startup' && e.symbolId===byName('src/app.ts').id));
 assert.ok(map.entries!.some(e=>e.kind==='export' && e.symbolId===byName('api').id && !e.candidate));
 const callback=map.entries!.find(e=>e.kind==='callback' && e.symbolId===byName('api').id)!;
 assert.equal(callback.line,6);assert.equal(callback.candidate,true);assert.match(callback.label,/orders/);
 assert.equal(map.edges.some(e=>e.kind==='call'&&e.line===6),false,'passing a callback is not invoking it');
 assert.ok(map.entries!.some(e=>e.kind==='candidate'&&e.symbolId===byName('unused').id));
 assert.equal(map.entries!.some(e=>e.kind==='candidate'&&e.symbolId===byName('worker').id),false);
 const before=readerView(map,{[root+'/src/app.ts']:source},'v',byName('main').id);
 const after=readerView(map,{[root+'/src/app.ts']:source},'v',byName('worker').id);
 assert.deepEqual(before.entries,after.entries,'reading a child must preserve the entry roots');
 const api=entryTree(map).children.find(g=>g.label==='导出 API')!.children[0];
 assert.equal(api.children[0].label,'worker');assert.equal(api.children[0].children[0].reference,'cycle');
});

test('logical entries have explicit bounds and preserve exported aliases across files',()=>{
 const root=normalize(process.cwd());
 const map=analyze({[root+'/a.ts']:Array.from({length:100},(_,i)=>`export function api${i}(){}`).join('\n'),[root+'/index.ts']:"export { api0 as publicApi } from './a';"},root);
 assert.ok(map.entries!.some(e=>e.label.startsWith('publicApi')));
 const tree=entryTree(map),group=tree.children.find(g=>g.label==='导出 API')!;
 assert.equal(group.children.length,40);assert.equal(group.truncated,true);
});

test('instance field calls do not masquerade as module startup; static fields remain module initialization',()=>{
 const root=normalize(process.cwd());
 const map=analyze({[root+'/instance.ts']:'function prepare(){} class Reader { queue=prepare(); }',[root+'/static.ts']:'function init(){} class App { static ready=init(); }'},root);
 assert.equal(map.entries!.some(e=>e.kind==='startup'&&e.file.endsWith('/instance.ts')),false);
 assert.equal(map.edges.some(e=>e.kind==='call'&&e.file.endsWith('/instance.ts')),false);
 assert.ok(map.unresolved.some(e=>e.label.includes('实例字段初始化')));
 assert.ok(map.entries!.some(e=>e.kind==='startup'&&e.file.endsWith('/static.ts')));
});

test('parameter explanations preserve comments, types, defaults and symbol identity across shadowing',()=>{
 const root=normalize(process.cwd());
 const source=`/** Calculate an amount.\n * @param items Order line items, before discount.\n * @param rate Tax multiplier.\n */\nexport function calculate(items: number[], rate = 1) {\n const total = items.reduce((sum, rate) => sum + rate, 0);\n return total * rate;\n}`;
 const map=analyze({[root+'/a.ts']:source},root),fn=map.nodes.find(n=>n.name==='calculate')!;
 assert.match(fn.documentation!,/Calculate/);
 assert.equal(fn.parameterDetails![0].type,'number[]');
 assert.equal(fn.parameterDetails![0].descriptionSource,'comment');
 assert.match(fn.parameterDetails![0].description,/Order line items/);
 const rate=fn.parameterDetails![1];assert.equal(rate.defaultValue,'1');assert.equal(rate.optional,true);
 assert.equal(rate.uses.length,1,'the nested callback rate is a different symbol');
 assert.equal(rate.uses[0].line,7);assert.match(rate.uses[0].role,/返回/);
});

test('full-file reading keeps imports and distant lines beyond the old 160-line excerpt',()=>{
 const root=normalize(process.cwd());
 const source="import { helper } from './b';\r\nexport function long(){\r\n"+' helper();\r\n'.repeat(200)+'}\r\nconst after = 42;';
 const map=analyze({[root+'/a.ts']:source,[root+'/b.ts']:'export function helper(){}'},root);
 const fn=map.nodes.find(n=>n.name==='long')!,view=readerView(map,{[root+'/a.ts']:source},'v',fn.id);
 assert.equal(view.sourceTruncated,true);assert.equal(view.file!.text,source);
 assert.match(view.file!.text,/const after = 42/);assert.equal(view.file!.lineCount,204);
 const reference=view.file!.references.find(r=>r.name==='helper'&&r.from>source.indexOf('long'))!;
 assert.equal(source.slice(reference.from,reference.to),'helper');assert.equal(reference.file,root+'/b.ts');
});
test('file snapshots reject stale selection and never follow workspace symlinks',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'scanf-reader-'));
 const outside=await mkdtemp(path.join(os.tmpdir(),'scanf-outside-'));
 try{
  await writeFile(path.join(root,'a.ts'),'export function a(){ return 1 }');
  await writeFile(path.join(outside,'secret.ts'),'export function hidden(){}');
  await symlink(outside,path.join(root,'linked'),'junction');
  const project=new ProjectReader(root);const view=await project.refresh();
  assert.equal(project.map!.nodes.some(n=>n.name==='hidden'),false);
  project.inspect(view.selected!.id,view.revision);
  await writeFile(path.join(root,'a.ts'),'export function changed(){ return 2 }');
  await project.refresh();
  assert.throws(()=>project.inspect(view.selected!.id,view.revision),/版本/);
  assert.equal(project.view().selected!.name,'changed');
 }finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
