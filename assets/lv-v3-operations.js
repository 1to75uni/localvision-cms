(function(){
'use strict';
const upstreamFetch=window.fetch.bind(window);
let publishTimer=null,publishing=false;
async function publishPending(){
 if(publishing)return;publishing=true;
 try{let result=await post({action:'publish'});for(let i=0;result.pending>0&&!result.paused&&i<110;i++){if(!result.ok)throw new Error('게시 대기');result=await post({action:'publish'})}}
 catch(e){console.warn('LocalVision 게시 전달 대기',e.message);clearTimeout(publishTimer);publishTimer=setTimeout(publishPending,60000)}
 finally{publishing=false}
}
const adminPaths=['/api/contents','/api/upload','/api/media-upload','/api/notice-upload','/api/notices','/api/stores','/api/playlist-groups','/api/playlist-schedules','/api/black-mode','/api/devices','/api/full-backup'];
async function rawFetch(input,init={}){const response=await upstreamFetch(input,init);const u=new URL(typeof input==='string'?input:input.url,location.href);if(response.ok&&adminPaths.includes(u.pathname)&&/POST|PATCH|DELETE/.test(init.method||'')){clearTimeout(publishTimer);publishTimer=setTimeout(publishPending,500)}return response}

async function checked(url,init){const r=await rawFetch(url,{credentials:'same-origin',...init});const b=await r.json();if(!r.ok||!b.ok)throw new Error(b.error||`HTTP ${r.status}`);return b}
const post=body=>checked('/api/sync-admin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
// Existing React forms continue to work. Original-byte hashing occurs in the administrator's browser.
window.fetch=async function(input,init={}){
 const url=new URL(typeof input==='string'?input:input.url,location.href);
 if(url.origin!==location.origin||!['/api/upload','/api/notice-upload'].includes(url.pathname)||!(init.body instanceof FormData))return rawFetch(input,init);
 try{
  const form=init.body,file=form.get('file');if(!file||typeof file==='string')return rawFetch(input,init);
  const integrity=await LVIntegrity.inspect(file.stream(),{onChunk:()=>new Promise(resolve=>setTimeout(resolve,0))});
  const mediaInspection=file.name.toLowerCase().endsWith('.mp4')?LVMediaInspection.validateProfile(await LVMediaInspection.inspectMp4(file)):null;
  form.set('integrity',JSON.stringify(integrity));form.set('mediaInspection',JSON.stringify(mediaInspection));
  if(url.pathname==='/api/notice-upload'){form.set('side','notice');if(!form.get('title'))form.set('title',file.name)}
  if(file.size<=16*1024*1024)return rawFetch(input,{...init,body:form});
  const data=Object.fromEntries([...form].filter(([k])=>k!=='file'));Object.assign(data,{fileName:file.name,integrity,mediaInspection,action:'begin'});
  const call=body=>checked('/api/media-upload',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:init.signal});
  const started=await call(data);if(started.reused)return new Response(JSON.stringify(started.result),{headers:{'content-type':'application/json'}});
  const parts=[];
  try{
   for(let offset=0,number=1;offset<file.size;offset+=started.partBytes,number++){
    const result=await checked(`/api/media-upload?id=${encodeURIComponent(started.id)}&part=${number}`,{method:'PUT',body:file.slice(offset,offset+started.partBytes),signal:init.signal});parts.push(result.part);
   }
   const result=await call({action:'complete',id:started.id,parts});
   return new Response(JSON.stringify(result),{headers:{'content-type':'application/json'}});
  }catch(e){post({action:'maintenance'}).catch(()=>{});throw e}
 }catch(e){return new Response(JSON.stringify({ok:false,error:e.message}),{status:503,headers:{'content-type':'application/json'}})}
};
function text(tag,value,parent){const n=document.createElement(tag);n.textContent=value;parent.append(n);return n}
const link=document.createElement('a');link.href='/operations.html';link.textContent='100대 운영 점검';link.style.cssText='position:fixed;right:14px;bottom:14px;padding:10px 14px;background:#163f50;color:white;border-radius:8px;z-index:1000;text-decoration:none;font:14px sans-serif';
if(!location.pathname.endsWith('/operations.html')){document.body.append(link);setInterval(()=>{if(!document.hidden)publishPending()},60000);return}
const root=document.getElementById('operations'),controls=text('div','',root),status=text('p','확인 중...',root),list=text('div','',root);
let busy=false;
function button(label,task){const n=text('button',label,controls);n.addEventListener('click',async()=>{if(busy)return;busy=true;status.textContent='처리 중...';try{await task();await refresh()}catch(e){status.textContent=e.message}finally{busy=false}})}
button('새로고침',refresh);
button('처음 준비 / 게시 복구',async()=>{let r=await post({action:'install'});if(r.needsInventory){let measured=await post({action:'inventory',restart:true});while(!measured.complete)measured=await post({action:'inventory'});r=await post({action:'publish'})}while(r.pending>0&&!r.paused){if(!r.ok)throw new Error('게시 실패: '+JSON.stringify(r.results));r=await post({action:'publish'})}status.textContent=r.paused?'복원 중 게시 일시 중지: 내용을 확인 후 게시 재개':'준비 완료'});
button('중단된 복원 확인 후 게시 재개',()=>post({action:'resume-publication'}));
button('R2 용량 확인',async()=>{let r=await post({action:'inventory',restart:true});while(!r.complete)r=await post({action:'inventory'});if(r.bytes>=6e9)await post({action:'maintenance'});status.textContent=`현재 ${(r.bytes/1e9).toFixed(3)}GB${r.warning?' · 용량 경고':''}`});
button('만료 임시 업로드 / 7일 표본 정리',()=>post({action:'maintenance'}));
const backup=document.createElement('a');backup.href='/api/full-backup';backup.download='localvision-complete-backup.json';backup.textContent='전체 백업 다운로드';controls.append(backup);
const restore=document.createElement('input');restore.type='file';restore.accept='.json';controls.append(restore);button('선택한 전체 백업 복원',async()=>{const f=restore.files[0];if(!f)throw new Error('백업 파일을 선택하세요.');const b=JSON.parse(await f.text());if(b.schema!==3||!b.complete)throw new Error('완전한 v3 백업이 필요합니다.');await checked('/api/full-backup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'begin-restore'})});for(const table of ['lv_tombstones','stores','contents','notices','devices','playlist_groups','playlist_schedules','black_modes','asset_integrity']){const rows=b.tables[table]||[];for(let i=0;i<rows.length;i+=20){await checked('/api/full-backup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({schema:3,complete:true,tables:{[table]:rows.slice(i,i+20)}})})}}await checked('/api/full-backup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'end-restore'})});let result=await post({action:'publish'});while(result.pending>0)result=await post({action:'publish'})});
async function refresh(){
 try{
 const data=await checked('/api/sync-status');list.replaceChildren();status.textContent=`${data.contactPolicy} · ${data.devices.length}대 · R2 ${(Number(data.storage?.bytes||0)/1e9).toFixed(3)}GB · 게시 대기 ${data.publicationPending}${data.publishingPaused?' · 복원 작업으로 게시 일시 중지: 복원 확인 후 재개하세요.':''}`;
 for(const d of data.devices){
  const card=text('article','',list);text('h2',`${d.store} TV`,card);text('p',`${d.installation} · ${d.freshness} · 마지막 저장 ${new Date(d.savedAt).toLocaleString('ko-KR')} · ${d.changePending?'변경 전달 대기':'최신 편성 적용'}`,card);
  if(d.faultPaging && d.faultPaging.seen<d.faultPaging.total)text('p',`오류 상세 수신 중: ${d.faultPaging.seen}/${d.faultPaging.total} · 현재 장애 ${d.faultCount}개 · 일부 상세는 다음 보고에서 이어 받습니다.`,card);
  for(const side of ['left','right']){
   const section=text('section','',card),faults=d.faults.filter(f=>f.side===side&&f.status!=='recovered');text('h3',`${side.toUpperCase()} · ${faults.length?'일부 송출 장애':d[side]?.status==='playing'||d[side]?.status==='image'?'마지막 저장: 정상 재생 중':d[side]?.status||'확인 대기'}`,section);
   for(const f of d.faults.filter(f=>f.side===side)){const info=text('p','',section);text('strong',f.fileName||f.assetId,info);text('span',` · ${f.status==='excluded'?'현재 일시 제외':f.status==='recovered'?'정상 복구':'재생 장애'} · 최초 ${f.firstAt} · 최근 ${f.lastAt} · 실패 ${f.count}회${f.recoveredAt?' · 복구 '+f.recoveredAt:''}`,info)}
   text('p',`현재 콘텐츠: ${d[side]?.fileName||'-'} · ${d[side]?.status||'확인 대기'}`,section);
  }
  if(d.importantUsed>=30)text('p','우선 저장 예산 사용 완료 · 새 장애 상세 요약은 정기 20분 저장에서 확인합니다.',card);
  if(d.commandResult)text('p',`명령: ${d.commandResult.command} / ${d.commandResult.status} (native-requested는 APP 요청 상태이며 저장 완료가 아닙니다.)`,card);
 }
 if(data.publicationPending&&!data.publishingPaused&&!busy){busy=true;try{await post({action:'publish'})}finally{busy=false}}
 }catch(e){status.textContent='저장 상태 확인 실패: '+e.message+' · 기존 TV 방송은 계속됩니다.'}
}
refresh();setInterval(()=>{if(!document.hidden&&!busy)refresh()},60000);
})();
