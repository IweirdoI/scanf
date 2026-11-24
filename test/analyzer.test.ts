import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import ts from 'typescript';
import { analyze, normalize } from '../src/analyzer';

const root = normalize(path.join(process.cwd(), 'fixture'));
const run = (files: Record<string,string>, options: ts.CompilerOptions = {}) => analyze(Object.fromEntries(Object.entries(files).map(([p,text])=>[`${root}/${p}`,text])),root,options);
test('resolves aliases and re-exports by symbol, rather than matching function names',()=>{
  const map=run({'a.ts':'export function work(){ return 1 }','b.ts':"export { work as task } from './a'",'main.ts':"import { task } from './b'; function main(){ return task() }"});
  const main=map.nodes.find(n=>n.name==='main')!, work=map.nodes.find(n=>n.name==='work')!;
  assert.ok(map.edges.some(e=>e.source===main.id&&e.target===work.id&&e.kind==='call'));
  assert.equal(map.edges.filter(e=>e.kind==='import').length,2);
});
test('keeps shadowed functions and callback bodies in their own scopes',()=>{
  const map=run({'a.ts':'function same(){} function outer(){ const same = () => 1; same(); const cb = () => same(); cb(); } same();'});
  const outer=map.nodes.find(n=>n.name==='outer')!, cb=map.nodes.find(n=>n.name==='cb')!;
  const inner=map.nodes.filter(n=>n.name==='same')[1];
  assert.ok(map.edges.some(e=>e.source===outer.id&&e.target===inner.id));
  assert.ok(map.edges.some(e=>e.source===cb.id&&e.target===inner.id));
  assert.equal(map.edges.filter(e=>e.source===outer.id&&e.target===inner.id).length,1);
  assert.ok(map.edges.some(e=>e.source.startsWith('module:')&&e.target===map.nodes.find(n=>n.name==='same')!.id));
});
test('resolves methods, constructors, recursive calls and overload implementations',()=>{
  const map=run({'a.ts':'class A { constructor(){ this.go() } go(){ return 1 } } function f(x:string):string; function f(x:any){ if(x) return f(""); return x; } function main(){ new A(); f(""); }'});
  const go=map.nodes.find(n=>n.name==='A.go')!, ctor=map.nodes.find(n=>n.name==='A.constructor')!, f=map.nodes.find(n=>n.name==='f')!, main=map.nodes.find(n=>n.name==='main')!;
  for(const [source,target] of [[ctor.id,go.id],[main.id,ctor.id],[main.id,f.id],[f.id,f.id]]) assert.ok(map.edges.some(e=>e.source===source&&e.target===target),`${source} -> ${target}`);
});
test('marks unknown calls as unresolved instead of creating false same-name links',()=>{
  const map=run({'a.ts':'function save() {} function main(x:any){ x.save(); fetch("/"); }'});
  const main=map.nodes.find(n=>n.name==='main')!;
  assert.equal(map.edges.filter(e=>e.source===main.id).length,0);
  assert.deepEqual(map.unresolved.filter(e=>e.owner===main.id).map(e=>e.label),['x.save','fetch']);
});
test('extracts nested branches, loop, exceptions, ternary and source positions',()=>{
  const map=run({'a.ts':`function main(x:boolean) {\n if (x) { return x ? 1 : 2; } else {\n for(let i=0;i<2;i++){ console.log(i); }\n }\n try { throw new Error('x') } catch(e) { return 0 } finally { cleanup() }\n}`});
  const fn=map.nodes.find(n=>n.name==='main')!;
  for(const kind of ['条件','返回','条件表达式','否则','循环','尝试','抛错','异常','收尾'])assert.ok(fn.steps?.some(s=>s.kind===kind),kind);
  assert.equal(fn.branches,3); assert.equal(fn.line,1); assert.ok(fn.steps?.some(s=>s.depth===2&&s.line===3));
});
test('handles TSX, dynamic imports, CommonJS and tsconfig path aliases',()=>{
  const map=run({'src/a.ts':'export function action(){}','main.tsx':`import {action} from '@/a'; const lib = require('./src/a'); import('./src/a'); const View = () => <button onClick={() => action()}/>;`},{baseUrl:root,paths:{'@/*':['src/*']},jsx:ts.JsxEmit.Preserve});
  assert.equal(map.edges.filter(e=>e.kind==='import').length,3);
  assert.ok(map.edges.some(e=>e.kind==='call'&&map.nodes.find(n=>n.id===e.target)?.name==='action'));
});
test('reports partial syntax and bounded reading steps',()=>{
  const map=run({'a.ts':`function long(){ ${'console.log(1);'.repeat(100)} }`,'broken.ts':'function broken( {'});
  const fn=map.nodes.find(n=>n.name==='long')!;
  assert.equal(fn.steps?.length,80); assert.equal(fn.stepsTruncated,true); assert.ok(map.warnings.length);
});
test('handles empty input and cyclic imports without fabricating dependencies',()=>{
  assert.equal(run({}).nodes.length,0);
  const map=run({'a.ts':"import './b'; export function a(){}",'b.ts':"import './a'; import 'missing-package';"});
  assert.equal(map.edges.filter(e=>e.kind==='import').length,2);
  assert.ok(map.unresolved.some(u=>u.label==='missing-package'));
});
test('does not treat a locally shadowed require function as a module dependency',()=>{
  const map=run({'a.ts':'function require(name:string){ return name } function main(){ require("./b") }','b.ts':'export const value=1;'});
  assert.equal(map.edges.filter(e=>e.kind==='import').length,0);
  assert.ok(map.edges.some(e=>e.kind==='call'&&map.nodes.find(n=>n.id===e.target)?.name==='require'));
});
