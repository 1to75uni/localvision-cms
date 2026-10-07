import test from 'node:test'
import assert from 'node:assert/strict'
import {database} from './d1.mjs'
import {ensureCoreSchema} from '../functions/_lib/localvision-core.js'
import {installSync} from '../functions/_lib/sync-v3.js'
import {begin,record,smallUpload} from '../functions/_lib/media-upload-v3.js'
import {inspect} from '../functions/_lib/asset-integrity.js'
import {finishReservation} from '../functions/_lib/storage-v3.js'
import * as upload from '../functions/api/media-upload.js'
import {createAdminSession} from '../functions/_lib/auth.js'
async function env(){const e=database();await ensureCoreSchema(e);await installSync(e);e.DB.sqlite.exec('UPDATE lv_storage SET measured_at='+Date.now());const objects=new Map(),parts=new Map();let A=0;
 e.MEDIA={head:async key=>objects.has(key)?{size:objects.get(key).byteLength}:null,put:async(key,body)=>{A++;const bytes=await new Response(body).arrayBuffer();objects.set(key,bytes);return {size:bytes.byteLength}},createMultipartUpload:async key=>{A++;parts.set(key,new Map());return {uploadId:'upload-'+key}},resumeMultipartUpload:key=>({uploadPart:async(n,body)=>{A++;const bytes=await new Response(body).arrayBuffer();parts.get(key).set(n,bytes);return {partNumber:n,etag:'etag-'+n}},complete:async list=>{A++;const buffers=list.map(p=>Buffer.from(parts.get(key).get(p.partNumber)));const b=Buffer.concat(buffers);objects.set(key,b);return {size:b.byteLength}},abort:async()=>parts.delete(key)}),delete:async key=>objects.delete(key)};
 return {...e,objects,parts,get A(){return A}}}
test('same original uploaded to different stores is shared once with independent content references',async()=>{
 const e=await env(),blob=new Blob(['identical media']),integrity=await inspect(blob.stream()),body={integrity,fileName:'a.png',title:'A',side:'left',store:'one'};
 const one=await begin(e,body);await e.MEDIA.put(one.p.key,blob.stream());await finishReservation(e,one.id,blob.size,one.p.key);await record(new Request('https://cms.test'),e,one.p,one.id);
 const before=e.A,two=await begin(e,{...body,store:'two',fileName:'different-name.png'});assert.equal(two.reused,true);await record(new Request('https://cms.test'),e,two.p,two.id,true);
 const rows=e.DB.sqlite.prepare('SELECT store,r2_key FROM contents').all();assert.equal(rows.length,2);assert.equal(rows[0].r2_key,rows[1].r2_key);assert.equal(e.objects.size>=1,true);assert.ok(e.DB.sqlite.prepare('SELECT bytes FROM lv_storage').get().bytes>=blob.size);assert.equal(e.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM lv_objects WHERE kind='media'").get().n,1)
})
test('missing shared original is uploaded again instead of reusing an orphan ledger entry',async()=>{const e=await env(),blob=new Blob(['media']),integrity=await inspect(blob.stream()),b={integrity,fileName:'a.png',title:'A',side:'left',store:'one'};let r=await begin(e,b);await e.MEDIA.put(r.p.key,blob.stream());await finishReservation(e,r.id,blob.size,r.p.key);e.objects.delete(r.p.key);r=await begin(e,b);assert.equal(r.reused,false)})
test('multipart upload seals complete object before exposing a content row; exact part sizes and order required',async()=>{
 const e=await env(),bytes=new Uint8Array(16*1024*1024+100),integrity=await inspect(new Blob([bytes]).stream()),token=await createAdminSession(e),headers={'x-lv-admin-token':token};
 const post=async body=>upload.onRequestPost({env:e,request:new Request('https://cms.test/api/media-upload',{method:'POST',headers,body:JSON.stringify(body)})});
 let r=await post({action:'begin',integrity,fileName:'a.png',title:'A',side:'left',store:'one'});assert.equal(r.status,200);const start=await r.json();assert.equal(e.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM contents').get().n,0);
 const list=[];for(let n=1;n<=2;n++){const b=bytes.slice((n-1)*16*1024*1024,n*16*1024*1024);r=await upload.onRequestPut({env:e,request:new Request(`https://cms.test/api/media-upload?id=${start.id}&part=${n}`,{method:'PUT',headers:{...headers,'content-length':String(b.byteLength)},body:b})});assert.equal(r.status,200);list.push((await r.json()).part)}
 r=await post({action:'complete',id:start.id,parts:list.slice(0,1)});assert.equal(r.status,400);assert.equal(e.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM contents').get().n,0);
 r=await post({action:'complete',id:start.id,parts:list});assert.equal(r.status,200);assert.equal(e.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM contents').get().n,1);const size=e.DB.sqlite.prepare('SELECT bytes FROM lv_storage').get().bytes;
 r=await post({action:'complete',id:start.id,parts:list});assert.equal(r.status,200);assert.equal(e.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM contents').get().n,1);assert.equal(e.DB.sqlite.prepare('SELECT bytes FROM lv_storage').get().bytes,size)
})
test('unmeasured capacity and unknown upload are rejected without publishing a file',async()=>{const e=await env();e.DB.sqlite.exec('UPDATE lv_storage SET measured_at=0');const integrity=await inspect(new Blob(['media']).stream());await assert.rejects(begin(e,{integrity,fileName:'a.png',title:'A',side:'left',store:'one'}),/용량/);assert.equal(e.A,0);assert.equal(e.objects.size,0)})
