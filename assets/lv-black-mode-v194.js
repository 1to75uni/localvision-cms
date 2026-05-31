(function () {
  'use strict';
  const VERSION = 'v1.9.5-device-control-black-mode-ui-version-fix';
  const PANEL_ID = 'lv-blackmode-device-panel';
  const MODAL_ID = 'lv-blackmode-modal';
  const DAYS = [
    ['0', '일'], ['1', '월'], ['2', '화'], ['3', '수'], ['4', '목'], ['5', '금'], ['6', '토'],
  ];
  const state = { store: '', mode: null, loading: false, lastKey: '' };

  function apiBase() { return location.origin.replace(/\/$/, ''); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>'"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c])); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function todayKstDateTime2359() {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth()+1)}-${pad2(kst.getUTCDate())}T23:59`;
  }
  function nowKstInputPlus(hours) {
    const now = new Date(Date.now() + (hours || 0) * 3600000 + 9 * 3600000);
    return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth()+1)}-${pad2(now.getUTCDate())}T${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}`;
  }
  function dayText(days) {
    if (!Array.isArray(days) || !days.length) return '요일 미설정';
    return DAYS.filter(([v]) => days.map(String).includes(v)).map(([, t]) => t).join(' · ');
  }
  function isOn(mode) { return !!(mode && (mode.blackMode || mode.active)); }

  function addStyle() {
    if (document.getElementById('lv-blackmode-style')) return;
    const style = document.createElement('style');
    style.id = 'lv-blackmode-style';
    style.textContent = `
      #${PANEL_ID}.lv-black-panel{border:1px solid rgba(20,20,20,.08);border-radius:18px;background:linear-gradient(135deg,#111827,#020617);color:#fff;padding:18px;box-shadow:0 14px 35px rgba(15,23,42,.18)}
      #${PANEL_ID} .lv-bm-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:14px}
      #${PANEL_ID} .lv-bm-eyebrow{margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#93c5fd;font-weight:800}
      #${PANEL_ID} h3{margin:0;font-size:20px;color:#fff}
      #${PANEL_ID} p{margin:5px 0 0;color:#cbd5e1;font-size:13px;line-height:1.45}
      #${PANEL_ID} .lv-bm-badge{white-space:nowrap;border-radius:999px;padding:8px 12px;font-weight:900;font-size:12px;background:#16a34a;color:#fff}
      #${PANEL_ID}.is-active .lv-bm-badge{background:#ef4444;color:#fff;box-shadow:0 0 0 4px rgba(239,68,68,.16)}
      #${PANEL_ID} .lv-bm-info{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}
      #${PANEL_ID} .lv-bm-info div{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:11px}
      #${PANEL_ID} .lv-bm-info span{display:block;color:#94a3b8;font-size:11px;margin-bottom:5px;font-weight:800}
      #${PANEL_ID} .lv-bm-info strong{display:block;color:#f8fafc;font-size:13px;word-break:break-word}
      #${PANEL_ID} .lv-bm-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      #${PANEL_ID} button,.lv-bm-modal button{border:none;border-radius:12px;padding:10px 14px;font-weight:900;cursor:pointer;transition:.15s transform ease,.15s opacity ease}
      #${PANEL_ID} button:hover,.lv-bm-modal button:hover{transform:translateY(-1px)}
      #${PANEL_ID} .lv-bm-primary{background:#3b82f6;color:white}
      #${PANEL_ID} .lv-bm-off{background:#334155;color:white}
      #${PANEL_ID} .lv-bm-danger{background:#ef4444;color:white}
      .lv-bm-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.62);z-index:99998;display:flex;align-items:center;justify-content:center;padding:18px}
      .lv-bm-modal{width:min(720px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:24px;box-shadow:0 30px 80px rgba(0,0,0,.35);padding:22px;color:#0f172a}
      .lv-bm-modal-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:14px;margin-bottom:16px}
      .lv-bm-modal h2{margin:0;font-size:24px}.lv-bm-modal p{margin:6px 0 0;color:#64748b;line-height:1.5}.lv-bm-close{background:#e2e8f0;color:#0f172a}
      .lv-bm-section{border:1px solid #e2e8f0;background:#f8fafc;border-radius:18px;padding:16px;margin-top:12px}.lv-bm-section h3{margin:0 0 10px;font-size:17px}
      .lv-bm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.lv-bm-field label{display:block;font-size:12px;color:#475569;font-weight:900;margin-bottom:6px}
      .lv-bm-field input{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:12px;padding:11px;font-size:14px;background:white;color:#0f172a}
      .lv-bm-days{display:flex;flex-wrap:wrap;gap:8px}.lv-bm-day{display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #cbd5e1;border-radius:999px;padding:8px 11px;font-weight:900}.lv-bm-day input{width:auto}
      .lv-bm-modal-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.lv-bm-blue{background:#2563eb;color:white}.lv-bm-red{background:#dc2626;color:white}.lv-bm-gray{background:#475569;color:white}.lv-bm-green{background:#16a34a;color:white}
      .lv-bm-result{margin-top:12px;border-radius:12px;padding:10px 12px;background:#ecfdf5;color:#065f46;font-size:13px;font-weight:800;display:none}.lv-bm-result.is-error{display:block;background:#fef2f2;color:#991b1b}.lv-bm-result.is-show{display:block}
      @media(max-width:720px){#${PANEL_ID} .lv-bm-info,.lv-bm-grid{grid-template-columns:1fr}.lv-bm-modal{padding:18px}}
    `;
    document.head.appendChild(style);
  }

  function getSelectedStore() {
    const detail = document.querySelector('.device-detail');
    if (!detail) return '';
    const infoCodes = Array.from(detail.querySelectorAll('.info-list code'));
    for (const code of infoCodes) {
      const text = String(code.textContent || '').trim().toLowerCase();
      if (text && /^[a-z0-9_-]+$/.test(text)) return text;
    }
    const text = detail.textContent || '';
    const m = text.match(/store\s*코드\s*([a-z0-9_-]+)/i);
    return m ? m[1].toLowerCase() : '';
  }

  async function fetchMode(store) {
    const res = await fetch(`${apiBase()}/api/black-mode?store=${encodeURIComponent(store)}&t=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
    return data.mode || {};
  }

  async function postMode(payload) {
    const res = await fetch(`${apiBase()}/api/black-mode`, { method:'POST', cache:'no-store', headers:{'content-type':'application/json'}, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
    return data.mode || {};
  }

  function renderPanel(store, mode) {
    const detail = document.querySelector('.device-detail');
    if (!detail || !store) return;
    const grids = detail.querySelectorAll('.detail-grid');
    const target = grids[0] || detail;
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      panel.className = 'lv-black-panel panel';
      target.appendChild(panel);
    }
    const active = isOn(mode);
    panel.className = `lv-black-panel panel${active ? ' is-active' : ''}`;
    const immediate = mode?.immediateActive ? (mode.immediateUntilKst || '직접 해제 전까지') : '꺼짐';
    const schedule = mode?.scheduleEnabled ? `${dayText(mode.scheduleDays)} ${esc(mode.scheduleStart || '00:00')}~${esc(mode.scheduleEnd || '23:59')}` : '꺼짐';
    const reasonText = mode?.reason === 'immediate' ? '즉시 휴무 적용 중' : mode?.reason === 'schedule' ? '정기 스케줄 적용 중' : '정상 송출 중';
    panel.innerHTML = `
      <div class="lv-bm-head">
        <div><p class="lv-bm-eyebrow">Device Control Panel</p><h3>휴무모드 / 블랙모드</h3><p>선택한 업체 <b>${esc(store)}</b> TV 화면만 검은 화면으로 전환합니다.</p></div>
        <span class="lv-bm-badge">${active ? 'BLACK MODE ON' : 'NORMAL'}</span>
      </div>
      <div class="lv-bm-info">
        <div><span>현재 상태</span><strong>${esc(reasonText)}</strong></div>
        <div><span>즉시 휴무</span><strong>${esc(immediate)}</strong></div>
        <div><span>정기 휴무 스케줄</span><strong>${schedule}</strong></div>
        <div><span>TV 반영</span><strong>Player가 60초마다 확인</strong></div>
      </div>
      <div class="lv-bm-actions">
        <button class="lv-bm-primary" data-bm-open>휴무모드 설정</button>
        <button class="lv-bm-danger" data-bm-today>오늘 23:59까지 즉시 휴무</button>
        <button class="lv-bm-off" data-bm-off>즉시 휴무 해제</button>
      </div>
    `;
    panel.querySelector('[data-bm-open]').onclick = () => openModal(store, mode);
    panel.querySelector('[data-bm-today]').onclick = async () => {
      try { state.mode = await postMode({ store, action:'immediate', until: todayKstDateTime2359(), message:'오늘 휴무' }); renderPanel(store, state.mode); }
      catch (e) { alert('휴무모드 적용 실패: ' + e.message); }
    };
    panel.querySelector('[data-bm-off]').onclick = async () => {
      try { state.mode = await postMode({ store, action:'off', message:'즉시 휴무 해제' }); renderPanel(store, state.mode); }
      catch (e) { alert('휴무모드 해제 실패: ' + e.message); }
    };
  }

  function closeModal() { const el = document.getElementById(MODAL_ID); if (el) el.remove(); }
  function showResult(box, msg, isErr) { box.textContent = msg; box.className = `lv-bm-result is-show${isErr ? ' is-error' : ''}`; }

  function openModal(store, mode) {
    closeModal();
    const wrap = document.createElement('div');
    wrap.id = MODAL_ID;
    wrap.className = 'lv-bm-backdrop';
    const checked = new Set((mode?.scheduleDays || []).map(String));
    const daysHtml = DAYS.map(([v, t]) => `<label class="lv-bm-day"><input type="checkbox" value="${v}" ${checked.has(v) ? 'checked' : ''}>${t}</label>`).join('');
    wrap.innerHTML = `
      <div class="lv-bm-modal" role="dialog" aria-modal="true">
        <div class="lv-bm-modal-head">
          <div><h2>휴무모드 설정</h2><p><b>${esc(store)}</b> 업체 TV 화면만 검은 화면으로 전환합니다. 전원은 끄지 않고 Player 위에 검은 오버레이를 씌웁니다.</p></div>
          <button class="lv-bm-close" data-close>닫기</button>
        </div>
        <div class="lv-bm-section">
          <h3>1) 즉시 휴무</h3>
          <div class="lv-bm-grid">
            <div class="lv-bm-field"><label>자동 해제 시간(KST)</label><input type="datetime-local" data-until value="${esc(mode?.immediateUntilKst ? mode.immediateUntilKst.replace(' ', 'T').slice(0,16) : todayKstDateTime2359())}"></div>
            <div class="lv-bm-field"><label>표시 메모</label><input data-message value="${esc(mode?.message || '휴무모드')}"></div>
          </div>
          <div class="lv-bm-modal-actions"><button class="lv-bm-red" data-immediate>즉시 휴무 적용</button><button class="lv-bm-gray" data-off>즉시 휴무 해제</button></div>
        </div>
        <div class="lv-bm-section">
          <h3>2) 정기 휴무 스케줄</h3>
          <p>매주 쉬는 요일과 시간을 저장하면 해당 시간에는 자동으로 블랙모드가 됩니다.</p>
          <div class="lv-bm-days" data-days>${daysHtml}</div>
          <div class="lv-bm-grid" style="margin-top:10px">
            <div class="lv-bm-field"><label>시작 시간</label><input type="time" data-start value="${esc(mode?.scheduleStart || '00:00')}"></div>
            <div class="lv-bm-field"><label>종료 시간</label><input type="time" data-end value="${esc(mode?.scheduleEnd || '23:59')}"></div>
          </div>
          <div class="lv-bm-modal-actions"><button class="lv-bm-blue" data-schedule>정기 스케줄 저장/켜기</button><button class="lv-bm-gray" data-schedule-off>정기 스케줄 끄기</button></div>
        </div>
        <div class="lv-bm-result" data-result></div>
      </div>`;
    document.body.appendChild(wrap);
    const result = wrap.querySelector('[data-result]');
    wrap.querySelector('[data-close]').onclick = closeModal;
    wrap.addEventListener('click', (e) => { if (e.target === wrap) closeModal(); });
    wrap.querySelector('[data-immediate]').onclick = async () => {
      try {
        const until = wrap.querySelector('[data-until]').value || todayKstDateTime2359();
        const message = wrap.querySelector('[data-message]').value || '휴무모드';
        state.mode = await postMode({ store, action:'immediate', until, message });
        renderPanel(store, state.mode); showResult(result, '즉시 휴무모드를 적용했습니다. TV는 최대 60초 안에 검은 화면으로 전환됩니다.', false);
      } catch (e) { showResult(result, e.message, true); }
    };
    wrap.querySelector('[data-off]').onclick = async () => {
      try { state.mode = await postMode({ store, action:'off', message:'즉시 휴무 해제' }); renderPanel(store, state.mode); showResult(result, '즉시 휴무모드를 해제했습니다.', false); }
      catch (e) { showResult(result, e.message, true); }
    };
    wrap.querySelector('[data-schedule]').onclick = async () => {
      try {
        const days = Array.from(wrap.querySelectorAll('[data-days] input:checked')).map((el) => Number(el.value));
        if (!days.length) throw new Error('정기 휴무 요일을 1개 이상 선택해주세요.');
        state.mode = await postMode({ store, action:'schedule', enabled:true, days, start:wrap.querySelector('[data-start]').value || '00:00', end:wrap.querySelector('[data-end]').value || '23:59', message: wrap.querySelector('[data-message]').value || '정기 휴무모드' });
        renderPanel(store, state.mode); showResult(result, '정기 휴무 스케줄을 저장했습니다.', false);
      } catch (e) { showResult(result, e.message, true); }
    };
    wrap.querySelector('[data-schedule-off]').onclick = async () => {
      try { state.mode = await postMode({ store, action:'schedule-off' }); renderPanel(store, state.mode); showResult(result, '정기 휴무 스케줄을 껐습니다.', false); }
      catch (e) { showResult(result, e.message, true); }
    };
  }

  async function mountIfNeeded() {
    addStyle();
    const store = getSelectedStore();
    if (!store) return;
    if (store !== state.store || !document.getElementById(PANEL_ID)) {
      state.store = store;
      renderPanel(store, state.mode || { store, active:false });
      try { state.mode = await fetchMode(store); renderPanel(store, state.mode); } catch (e) { renderPanel(store, { store, active:false, message:'휴무모드 상태 로딩 실패: ' + e.message }); }
    }
  }

  let timer = null;
  function scheduleMount() { clearTimeout(timer); timer = setTimeout(mountIfNeeded, 250); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleMount); else scheduleMount();
  new MutationObserver(scheduleMount).observe(document.documentElement, { childList:true, subtree:true });
  window.LV_BLACK_MODE_UI_VERSION = VERSION;
})();
