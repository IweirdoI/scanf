import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as React from 'react';

test('DSH browser bundle registers one isolated factory under the package id and exports the native sidebar adapter',()=>{
 const registrations:any[]=[];
 const script=readFileSync('adapters/dsh/lib/client.js','utf8');
 runInNewContext(script,{URL,window:{__ModuleLoader__:{load:(entry:any)=>registrations.push(entry)}}});
 assert.equal(registrations.length,1);assert.equal(registrations[0].id,'dsh-scanf-reader');
 const plugin=registrations[0].factory((id:string)=>{assert.equal(id,'react');return React;});
 assert.deepEqual([...plugin.inject],['sidebarRightTabs','sidebarRight','slots','connection']);
 const tabs:any[]=[],seats:any[]=[];
 plugin.apply({effect:(fn:()=>unknown)=>fn(),sidebarRight:{},sidebarRightTabs:{register:(tab:any)=>tabs.push(tab)},slots:{inject:(_seat:string,fn:()=>unknown)=>fn(),register:(seat:any,component:any)=>seats.push({seat,component})}});
 assert.equal(tabs[0].kind,'scanf-reader');assert.equal(seats[0].seat.key,tabs[0].id);
 assert.equal(Array.isArray(tabs[0].guide),true,'installed DSH rc.5 expects a guide-entry array');
 assert.equal(tabs[0].guide[0].id,'scanf-reader-open');
 const pkg=JSON.parse(readFileSync('adapters/dsh/package.json','utf8'));
 assert.equal(pkg.exports['./client'],'./lib/client.js');assert.equal(pkg.dsh.bundle.patch,'./cordis.patch.yml');
 assert.equal(plugin.localReaderUrl('http://127.0.0.1:9624/#'+'a'.repeat(48)),'http://127.0.0.1:9624/#'+'a'.repeat(48));
 assert.throws(()=>plugin.localReaderUrl('https://example.com/#'+'a'.repeat(48)));
 assert.equal(plugin.sourceAddress('E:/code/a b/main.ts'),'dsh-resource://file/absolute/E:/code/a%20b/main.ts');
 assert.equal(plugin.sourceAddress('E:/code/a b/main.ts','session-one'),'dsh-resource://file/session/session-one/E:/code/a%20b/main.ts');
 assert.throws(()=>plugin.sourceAddress('https://evil.test/main.ts'));
 assert.throws(()=>plugin.sourceAddress('E:/code/../secret.ts'));
});
