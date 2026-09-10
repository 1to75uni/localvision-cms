import {inspect,validate} from './integrity.js';
const ddl=`CREATE TABLE IF NOT EXISTS asset_integrity (content_id TEXT PRIMARY KEY, url TEXT NOT NULL, manifest_json TEXT NOT NULL, updated_at TEXT NOT NULL)`;
export async function saveIntegrity(env,id,url,manifest){
 validate(manifest);
 const write=()=>env.DB.prepare(`INSERT INTO asset_integrity(content_id,url,manifest_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(content_id) DO UPDATE SET url=excluded.url,manifest_json=excluded.manifest_json,updated_at=excluded.updated_at`).bind(id,url,JSON.stringify(manifest),new Date().toISOString()).run();
 try{await write()}catch(e){if(!/no such table.*asset_integrity/i.test(String(e.message)))throw e;await env.DB.prepare(ddl).run();await write();}
}
export async function attachIntegrity(env,items){
 const ids=[...new Set(items.map(x=>x.id).filter(Boolean))];const rows=[];
 try{for(let i=0;i<ids.length;i+=80){const batch=ids.slice(i,i+80);const r=await env.DB.prepare(`SELECT content_id,url,manifest_json FROM asset_integrity WHERE content_id IN (${batch.map(()=>'?').join(',')})`).bind(...batch).all();rows.push(...r.results);}}
 catch(e){if(!/no such table.*asset_integrity/i.test(String(e.message)))throw e;return items;}
 const byId=new Map(rows.map(r=>[r.content_id,r]));
 for(const item of items){const row=byId.get(item.id);if(row && row.url===item.url){item.integrity=validate(JSON.parse(row.manifest_json));}}
 return items;
}
export {inspect};
