import test from 'node:test';import assert from 'node:assert/strict';
import {meterDatabase} from '../functions/_lib/d1-meter.js';
import {readFileSync} from 'node:fs';
test('read-only probe counts D1 metadata for first/all/run/batch without an accounting write',async()=>{
 let reads=0;const db={prepare(){return {bind(){return this},async all(){reads++;return {results:[{name:'x'}],meta:{rows_read:3,rows_written:0}}},async run(){return {meta:{rows_read:1,rows_written:2}}}}},async batch(xs){return Promise.all(xs.map(x=>x.run()))}};
 const {DB,stats}=meterDatabase(db);assert.equal(await DB.prepare('select').bind(1).first('name'),'x');await DB.prepare('select').all();await DB.batch([DB.prepare('update').bind(2)]);
 assert.deepEqual(stats,{rowsRead:7,rowsWritten:2,queries:3});assert.equal(reads,2);
});
test('actual CMS API wrapper rejects a degraded HTTP 200 and switches to unavailable',async()=>{
 const source=readFileSync(new URL('../assets/index-v212-stable.js',import.meta.url),'utf8');const start=source.indexOf('async function St('),end=source.indexOf('async function Ct(',start);
 const states=[];const St=new Function('fetch','FormData','O',source.slice(start,end)+';return St;')(async()=>new Response(JSON.stringify({ok:true,degraded:true,error:'quota'})),FormData,s=>states.push(s));
 await assert.rejects(St('/api/backup'),/quota/);assert.deepEqual(states,['unavailable']);
});
