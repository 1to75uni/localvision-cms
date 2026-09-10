(function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {healthy:'송출 정상',degraded:'일부 송출 장애',preparing:'콘텐츠 준비 중',stale:'상태 확인 지연',unknown:'확인 필요','black-mode':'휴무모드',notice:'공지 송출',hidden:'화면 비활성',playing:'영상 재생',image:'이미지 표시',empty:'콘텐츠 없음',loading:'파일 준비',starting:'시작 확인',retrying:'재시도 중',quarantined:'일시 제외',fallback:'대체 화면',paused:'일시 정지',stopped:'재생 중지'};
  const sideName = side => ({left:'왼쪽',right:'오른쪽',notice:'공지'}[side] || '공통');
  const time = value => {if (!value) return '—'; const date=new Date(value);return Number.isNaN(date.getTime())?String(value):date.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false});};
  const formatSec = n => Number.isFinite(Number(n))?`${Math.max(0,Number(n)).toFixed(1)}초`:'—';
  let root = null, store = new URLSearchParams(location.search).get('store') || '', busy=false, requested=0;
  let deviceData=[], eventData=[], healthError='',logError='',initialized=true, lastRead='';
  let filterDevice='',filterSide='',filterLevel='problem',filterText='';
  const fullPage=Boolean(document.getElementById('lvHealthRoot'));
  async function api(path) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try {
      const response=await fetch(path,{cache:'no-store',credentials:'same-origin',signal:controller.signal});
      const data=await response.json();
      if(!response.ok || data.ok===false) throw new Error(data.error || `HTTP ${response.status}`);
      return data;
    } finally {clearTimeout(timer);}
  }
  function badge(status) {return `<span class="lvh-badge lvh-${esc(status)}">${esc(labels[status] || status || '확인 필요')}</span>`;}
  function laneCard(lane={},name,stale) {
    const active=lane.title || lane.fileName || '등록된 콘텐츠 없음';
    const progress=lane.type==='video'?`${formatSec(lane.currentTime)} / ${formatSec(lane.duration)}`:`${Number(lane.playlistCount)||0}개 콘텐츠`;
    return `<div class="lvh-lane"><div class="lvh-between"><span class="lvh-label">${name}</span>${badge(stale?'stale':lane.status)}</div><strong>${esc(active)}</strong><code>${esc(lane.fileName || '—')}</code><div class="lvh-muted">${esc(progress)} · 보고 시점 기준</div>${lane.reason?`<p class="lvh-note">${esc(lane.reason)}</p>`:''}${lane.lastError?`<p class="lvh-error-text">${esc(lane.lastError.code)} · ${esc(lane.lastError.message)}</p>`:''}</div>`;
  }
  function exclusionsCard(device) {
    const excluded=[...(device.left?.exclusions || []),...(device.right?.exclusions || [])];
    if(!excluded.length)return '<p class="lvh-good-line">보고된 일시 제외 콘텐츠가 없습니다.</p>';
    return `<div class="lvh-table-scroll"><table><thead><tr><th>영역</th><th>미송출 콘텐츠</th><th>사유</th><th>실패</th><th>재시도 가능 시각</th></tr></thead><tbody>${excluded.map(x=>`<tr><td>${esc(sideName(x.side))}</td><td><strong>${esc(x.title || x.fileName || x.itemId)}</strong><code>${esc(x.fileName)}</code></td><td>${esc(x.reason)}<code>${esc(x.code)}</code></td><td>${Number(x.failCount)||0}회</td><td>${esc(time(x.retryAt))}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function deviceCard(device) {
    const status=device.status;
    const outbox=device.outbox || {}, metrics=device.metrics || {};
    const receipt=`${device.receivedAtKst || time(device.receivedAt)} · ${device.ageSeconds || 0}초 전`;
    return `<article class="lvh-device"><header class="lvh-between"><div><span class="lvh-eyebrow">${esc(device.store)}</span><h4>${esc(device.appId || 'Player')} <span>${esc(device.deviceId)}</span></h4></div>${badge(status)}</header><p class="lvh-muted">마지막 상태 수신 ${esc(receipt)}</p><div class="lvh-lanes">${laneCard(device.left,'왼쪽 70%',device.stale)}${laneCard(device.right,'오른쪽 30%',device.stale)}</div><h5>현재 일시 제외 목록</h5>${exclusionsCard(device)}<details><summary>기기 정보 · 복구 · 로그 전달</summary><dl class="lvh-details"><dt>Player / APP</dt><dd>${esc(device.playerVersion)} / ${esc(device.appVersion || '버전 미보고')}</dd><dt>로그 전송 대기</dt><dd>${Number(outbox.pending)||0}건${outbox.lastError?' · '+esc(outbox.lastError):''}</dd><dt>기기 로그 보관</dt><dd>${outbox.durable===false || outbox.volatileStorage?'저장 확인 필요':'정상'} · 보관 한도 초과 ${Number(outbox.dropped)||0}건</dd><dt>이번 실행 집계</dt><dd>시작 ${Number(metrics.started)||0} · 완료 ${Number(metrics.completed)||0} · 오류 ${Number(metrics.failed)||0} · 제외 ${Number(metrics.skipped)||0}</dd><dt>최근 명령</dt><dd>${device.lastCommand?esc(device.lastCommand.command)+' · '+esc(device.lastCommand.status)+' · '+esc(time(device.lastCommand.reportedAt)):'보고 없음'}</dd><dt>스케줄</dt><dd>${esc(device.schedule?.status || '—')}</dd><dt>캐시</dt><dd>${esc(device.cache?.status || '—')} · 설정 예산 ${Number(device.cache?.budgetMB)||0}MB</dd></dl><p class="lvh-muted">native-requested는 APP에 전달했다는 뜻입니다. 실제 완료는 캡처 결과 등으로 확인하세요. 재생 집계는 이번 실행 기준이며 사람 수·광고 도달 수가 아닙니다.</p></details></article>`;
  }
  function filteredEvents() {
    return eventData.filter(e=>{
      if(filterDevice && e.deviceId!==filterDevice)return false;
      if(filterSide && e.extra?.side!==filterSide)return false;
      if(filterLevel==='problem' && !['warning','error','fatal'].includes(e.level))return false;
      if(filterLevel==='skip' && e.errorCode!=='LV-MEDIA-SESSION-SKIP')return false;
      if(filterLevel==='recovered' && e.errorCode!=='LV-MEDIA-RECOVERED')return false;
      const text=[e.message,e.errorCode,e.extra?.fileName,e.extra?.title,e.deviceId].join(' ').toLowerCase();
      return !filterText || text.includes(filterText.toLowerCase());
    });
  }
  function eventRows() {
    const rows=filteredEvents();
    if(!rows.length)return `<p class="lvh-empty">${logError?'로그 조회에 실패했습니다. 오류가 없다는 뜻이 아닙니다.':'현재 필터에 해당하는 최근 기록이 없습니다.'}</p>`;
    return rows.map(e=>`<details class="lvh-event"><summary><span class="lvh-event-side">${esc(sideName(e.extra?.side))}</span><div><strong>${esc(e.extra?.title || e.extra?.fileName || e.errorCode)}</strong><span>${esc(e.message)}</span></div><time>${esc(e.createdAt || time(e.createdAtUtc))}</time></summary><dl class="lvh-details"><dt>오류코드</dt><dd>${esc(e.errorCode)}</dd><dt>파일명</dt><dd>${esc(e.extra?.fileName || '—')}</dd><dt>기기</dt><dd>${esc(e.deviceId || '구버전 · 기기 미식별')}</dd><dt>발생 단계</dt><dd>${esc(e.extra?.phase || '—')}</dd><dt>재생 진행</dt><dd>${formatSec(e.extra?.currentTime)} / ${formatSec(e.extra?.duration)}</dd><dt>반대쪽 상태</dt><dd>${e.extra?.opposite?esc(sideName(e.extra.opposite.side))+' · '+esc(labels[e.extra.opposite.status] || e.extra.opposite.status)+' · '+esc(e.extra.opposite.fileName):'구버전 또는 미보고'}</dd><dt>재시도 가능</dt><dd>${esc(time(e.extra?.retryAt))}</dd><dt>기록 ID</dt><dd>${esc(e.id)}</dd></dl>${e.extra?.truncated?'<p class="lvh-muted">대용량 진단 정보 일부가 축약됐습니다.</p>':''}</details>`).join('');
  }
  function render() {
    if(!root?.isConnected)return;
    const devices=filterDevice?deviceData.filter(d=>d.deviceId===filterDevice):deviceData;
    const problems=deviceData.filter(d=>['degraded','stale','unknown'].includes(d.status)).length;
    root.innerHTML=`<div class="lvh-heading lvh-between"><div><span class="lvh-eyebrow">LOCALVISION · v2.0.6</span><h3>송출 진단${store?' · '+esc(store):''}</h3><p>좌우 재생 상태와 현재 미송출 콘텐츠를 함께 확인합니다.</p></div><div class="lvh-actions">${!fullPage?`<a href="/playback-health.html?store=${encodeURIComponent(store)}" target="_blank" rel="noopener">전체 화면</a>`:''}<button type="button" data-action="refresh">${busy?'확인 중…':'상태 새로고침'}</button></div></div><div class="lvh-summary"><span>보고된 기기 <strong>${deviceData.length}</strong></span><span>확인 필요 <strong>${problems}</strong></span><span>최종 조회 ${esc(lastRead || '—')}</span></div>${healthError?`<div class="lvh-alert" role="alert">기기 상태 조회 실패: ${esc(healthError)}. 아래 내용은 마지막 조회 결과입니다.</div>`:''}<div class="lvh-filters"><label>기기<select data-filter="device"><option value="">모든 기기</option>${deviceData.map(d=>`<option value="${esc(d.deviceId)}" ${filterDevice===d.deviceId?'selected':''}>${esc(d.deviceId)}</option>`).join('')}</select></label><label>영역<select data-filter="side"><option value="">전체 영역</option><option value="left" ${filterSide==='left'?'selected':''}>왼쪽</option><option value="right" ${filterSide==='right'?'selected':''}>오른쪽</option></select></label><label>기록<select data-filter="level">${[['problem','오류·경고'],['skip','일시 제외'],['recovered','복구 완료'],['all','전체 기록']].map(([v,l])=>`<option value="${v}" ${filterLevel===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="lvh-search">파일·제목 검색<input data-filter="text" value="${esc(filterText)}" placeholder="파일명 또는 오류코드"></label></div><div class="lvh-device-list">${devices.length?devices.map(deviceCard).join(''):`<p class="lvh-empty">${healthError?'상태를 확인할 수 없습니다.':initialized?'아직 이 매장에서 새 Player의 상태 보고를 받지 못했습니다.':'첫 상태 보고를 기다리고 있습니다.'} Player v1.8.1 적용 후 확인하세요.</p>`}</div><div class="lvh-between lvh-log-title"><h4>최근 재생·복구 기록</h4><button type="button" data-action="export">진단 JSON 다운로드</button></div>${logError?`<div class="lvh-alert" role="alert">로그 조회 상태: ${esc(logError)}</div>`:''}<div class="lvh-events">${eventRows()}</div><p class="lvh-footnote">60초마다 조회합니다. 기기 정보는 마지막 수신 시점 기준이며 화면·HDMI 출력 자체를 보증하지 않습니다. 일시 제외된 파일은 표시된 시각 이후 재생 순서에 따라 재검사합니다.</p>`;
  }
  async function refresh() {
    if(!root || busy)return;
    busy=true; const sequence=++requested,selected=store;
    const query=selected?'store='+encodeURIComponent(selected)+'&':'';
    const results=await Promise.allSettled([api('/api/player-status?'+query+'_t='+Date.now()),api('/api/player-errors?'+query+'limit=150&_t='+Date.now())]);
    if(sequence!==requested || selected!==store){busy=false;refresh();return;}
    if(results[0].status==='fulfilled'){deviceData=results[0].value.devices || [];initialized=results[0].value.initialized!==false;healthError='';}else healthError=results[0].reason?.message || '연결 실패';
    if(results[1].status==='fulfilled'){eventData=results[1].value.errors || [];logError=results[1].value.degraded?(results[1].value.diagnostics || []).join(' / '):'';}else logError=results[1].reason?.message || '연결 실패';
    busy=false;lastRead=time(new Date().toISOString());render();
  }
  function bind(container) {
    root=container;root.classList.add('lvh-root');
    root.addEventListener('click',e=>{
      const action=e.target.closest('[data-action]')?.dataset.action;
      if(action==='refresh')refresh();
      if(action==='export'){
        const blob=new Blob([JSON.stringify({store,exportedAt:new Date().toISOString(),healthError,logError,devices:deviceData,events:filteredEvents()},null,2)],{type:'application/json'});
        const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=`LocalVision_diagnostics_${store || 'all'}_${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
      }
    });
    root.addEventListener('change',e=>{
      const kind=e.target.dataset.filter;if(!kind)return;
      if(kind==='device')filterDevice=e.target.value;if(kind==='side')filterSide=e.target.value;if(kind==='level')filterLevel=e.target.value;if(kind==='text')filterText=e.target.value;
      render();
    });
    render();refresh();
  }
  function mount() {
    if(!fullPage && !document.querySelector('.lvh-diagnostic-link')) {
      const sidebar=document.querySelector('.sidebar nav');
      if(sidebar){const link=document.createElement('a');link.className='lvh-diagnostic-link';link.href='/playback-health.html';link.textContent='송출 진단 · 전체 기기';sidebar.appendChild(link);}
    }
    if(root?.isConnected)return;
    if(fullPage){bind(document.getElementById('lvHealthRoot'));return;}
    const original=document.querySelector('.error-log-panel');
    if(!original)return;
    const container=document.createElement('section');original.before(container);original.classList.add('lvh-replaced');bind(container);
  }
  window.LVHealthPanel={selectStore(value){const next=String(value || '');if(store!==next){store=next;filterDevice='';deviceData=[];eventData=[];requested++;}mount();refresh();}};
  if(window.__lvSelectedStore)store=window.__lvSelectedStore;
  mount();
  if(!fullPage)new MutationObserver(()=>mount()).observe(document.body,{childList:true,subtree:true});
  setInterval(()=>{if(!document.hidden && root?.isConnected)refresh();},60000);
  if(fullPage) {
    const selection=document.getElementById('lvhStore');
    api('/api/stores').then(data=>{
      const rows=Array.isArray(data)?data:(data.stores || []);
      selection.innerHTML='<option value="">전체 매장</option>'+rows.map(x=>`<option value="${esc(x.slug)}" ${x.slug===store?'selected':''}>${esc(x.name || x.slug)}</option>`).join('');
      if(store && !rows.some(x=>x.slug===store))selection.add(new Option(store,store,true,true));
    }).catch(()=>{if(store)selection.add(new Option(store,store,true,true));});
    selection.addEventListener('change',()=>{store=selection.value;filterDevice='';deviceData=[];eventData=[];requested++;const u=new URL(location.href);store?u.searchParams.set('store',store):u.searchParams.delete('store');history.replaceState(null,'',u);refresh();});
  }
})();
