(function () {
  'use strict';
  var VERSION = 'v1.9.3-black-mode-final';
  var state = { stores: [], modes: {}, loading: false, open: false, message: '' };
  var originalFetch = window.fetch ? window.fetch.bind(window) : null;

  function cleanSlug(value) {
    return String(value || '').toLowerCase().trim().replaceAll(' ', '-').replace(/[^a-z0-9-_]/g, '');
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function api(path, opts) {
    if (!originalFetch) return Promise.reject(new Error('fetch unavailable'));
    return originalFetch(path, Object.assign({ cache: 'no-store' }, opts || {})).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || data.ok === false) throw new Error(data.error || data.message || ('HTTP ' + res.status));
        return data;
      });
    });
  }
  function storeSlug(store) { return cleanSlug(store && (store.slug || store.store || store.id || store.name)); }
  function storeName(store) { return String((store && (store.name || store.slug || store.store || store.id)) || '').trim(); }

  function ensureStyle() {
    if (document.getElementById('lv-black-mode-style')) return;
    var style = document.createElement('style');
    style.id = 'lv-black-mode-style';
    style.textContent = `
      #lv-black-mode-launcher{position:fixed;right:22px;bottom:22px;z-index:2147482000;border:0;border-radius:999px;background:#111827;color:#fff;padding:14px 18px;font-weight:900;font-size:14px;box-shadow:0 12px 30px rgba(0,0,0,.25);cursor:pointer;letter-spacing:-.02em}
      #lv-black-mode-launcher.on{background:#000;color:#fff;box-shadow:0 0 0 4px rgba(239,68,68,.18),0 12px 30px rgba(0,0,0,.28)}
      #lv-black-mode-modal{position:fixed;inset:0;z-index:2147482100;background:rgba(15,23,42,.58);display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
      #lv-black-mode-modal[hidden]{display:none!important}
      .lvbm-card{width:min(960px,96vw);max-height:88vh;overflow:auto;background:#fff;color:#111827;border-radius:24px;box-shadow:0 24px 80px rgba(0,0,0,.35);padding:24px}
      .lvbm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}
      .lvbm-head h2{margin:0;font-size:22px;letter-spacing:-.04em}.lvbm-head p{margin:6px 0 0;color:#6b7280;font-size:14px;line-height:1.45}
      .lvbm-close{border:0;background:#f3f4f6;border-radius:12px;padding:10px 13px;font-size:18px;cursor:pointer}
      .lvbm-toolbar{display:flex;gap:10px;align-items:center;margin:14px 0}.lvbm-toolbar input{flex:1;border:1px solid #d1d5db;border-radius:12px;padding:12px 14px;font-size:14px}.lvbm-toolbar button{border:0;border-radius:12px;background:#e5e7eb;padding:12px 14px;font-weight:800;cursor:pointer}
      .lvbm-message{margin:10px 0 14px;color:#2563eb;font-weight:800;font-size:13px}.lvbm-list{display:grid;gap:10px}
      .lvbm-row{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;border:1px solid #e5e7eb;border-radius:16px;padding:14px;background:#fff}
      .lvbm-title{font-weight:900;font-size:15px}.lvbm-sub{margin-top:4px;color:#6b7280;font-size:12px;line-height:1.35}.lvbm-badge{display:inline-flex;align-items:center;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:900;margin-right:8px;background:#ecfdf5;color:#047857}.lvbm-badge.black{background:#111827;color:#fff}.lvbm-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.lvbm-actions button{border:0;border-radius:12px;padding:10px 12px;font-weight:900;cursor:pointer}.lvbm-on{background:#111827;color:#fff}.lvbm-off{background:#f3f4f6;color:#111827}.lvbm-loading{padding:24px;text-align:center;color:#6b7280;font-weight:800}
      @media(max-width:720px){.lvbm-row{grid-template-columns:1fr}.lvbm-actions{justify-content:stretch}.lvbm-actions button{flex:1}#lv-black-mode-launcher{right:14px;bottom:14px}}
    `;
    document.head.appendChild(style);
  }

  function mount() {
    ensureStyle();
    if (!document.getElementById('lv-black-mode-launcher')) {
      var btn = document.createElement('button');
      btn.id = 'lv-black-mode-launcher';
      btn.type = 'button';
      btn.textContent = '휴무모드';
      btn.addEventListener('click', function () { openModal(); });
      document.body.appendChild(btn);
    }
    if (!document.getElementById('lv-black-mode-modal')) {
      var modal = document.createElement('div');
      modal.id = 'lv-black-mode-modal';
      modal.hidden = true;
      modal.innerHTML = '<div class="lvbm-card"><div class="lvbm-head"><div><h2>휴무모드 / 블랙모드</h2><p>매장 TV 화면을 원격으로 검은 화면으로 전환합니다. ON 기본값은 오늘 23:59 자동 해제입니다.</p></div><button class="lvbm-close" type="button">×</button></div><div class="lvbm-toolbar"><input id="lvbm-search" placeholder="업체명 또는 store 검색"><button id="lvbm-refresh" type="button">새로고침</button></div><div id="lvbm-message" class="lvbm-message"></div><div id="lvbm-list" class="lvbm-list"><div class="lvbm-loading">불러오는 중...</div></div></div>';
      document.body.appendChild(modal);
      modal.querySelector('.lvbm-close').addEventListener('click', closeModal);
      modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
      modal.querySelector('#lvbm-refresh').addEventListener('click', function () { load(true); });
      modal.querySelector('#lvbm-search').addEventListener('input', render);
    }
  }

  function openModal() { state.open = true; mount(); document.getElementById('lv-black-mode-modal').hidden = false; load(false); }
  function closeModal() { state.open = false; var modal = document.getElementById('lv-black-mode-modal'); if (modal) modal.hidden = true; }

  async function load(force) {
    if (state.loading) return;
    if (state.stores.length && !force) { render(); return; }
    state.loading = true; state.message = '매장 상태를 불러오는 중입니다...'; render();
    try {
      var storesRes = await api('/api/stores?_t=' + Date.now());
      var modeRes = await api('/api/black-mode?_t=' + Date.now());
      state.stores = (storesRes.stores || storesRes.items || []).map(function (s) { return Object.assign({}, s, { slug: storeSlug(s) }); }).filter(function (s) { return s.slug; });
      state.modes = {};
      (modeRes.stores || []).forEach(function (m) { state.modes[storeSlug(m)] = m; });
      state.message = '상태 확인 완료 · Player는 최대 60초 안에 반영됩니다.';
      updateLauncher();
    } catch (e) { state.message = '불러오기 실패: ' + (e && e.message || e); }
    finally { state.loading = false; render(); }
  }

  async function setMode(store, on) {
    var slug = storeSlug(store);
    if (!slug) return;
    state.message = (on ? '휴무모드 ON 처리 중...' : '휴무모드 해제 중...'); render();
    try {
      var data = await api('/api/black-mode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ store: slug, blackMode: !!on, reason: on ? '오늘 휴무' : '' })
      });
      if (data.store) state.modes[slug] = data.store;
      state.message = (on ? '휴무모드 ON 완료 · 오늘 23:59 자동 해제' : '휴무모드 OFF 완료 · 정상 송출로 복귀') + ' · 최대 60초 안에 TV 반영';
      updateLauncher(); render();
    } catch (e) { state.message = '처리 실패: ' + (e && e.message || e); render(); }
  }

  function render() {
    mount();
    var msg = document.getElementById('lvbm-message'); if (msg) msg.textContent = state.message || '';
    var list = document.getElementById('lvbm-list'); if (!list) return;
    if (state.loading && !state.stores.length) { list.innerHTML = '<div class="lvbm-loading">불러오는 중...</div>'; return; }
    var q = cleanSlug((document.getElementById('lvbm-search') || {}).value || '');
    var stores = state.stores.filter(function (s) { return !q || cleanSlug(storeName(s) + ' ' + s.slug + ' ' + (s.appId || '')).indexOf(q) >= 0; });
    if (!stores.length) { list.innerHTML = '<div class="lvbm-loading">표시할 업체가 없습니다.</div>'; return; }
    list.innerHTML = stores.map(function (s, i) {
      var slug = storeSlug(s), mode = state.modes[slug] || s || {}, on = !!mode.blackMode;
      var until = mode.blackModeUntilKst || s.blackModeUntilKst || '';
      return '<div class="lvbm-row" data-idx="' + i + '"><div><div class="lvbm-title"><span class="lvbm-badge ' + (on ? 'black' : '') + '">' + (on ? '휴무모드 ON' : '정상 송출') + '</span>' + escapeHtml(storeName(s)) + '</div><div class="lvbm-sub">store=' + escapeHtml(slug) + (s.appId ? ' · ' + escapeHtml(s.appId) : '') + (on && until ? '<br>자동 해제: ' + escapeHtml(until) : '') + '</div></div><div class="lvbm-actions"><button class="lvbm-on" type="button" data-action="on" data-slug="' + escapeHtml(slug) + '">휴무모드 ON</button><button class="lvbm-off" type="button" data-action="off" data-slug="' + escapeHtml(slug) + '">해제</button></div></div>';
    }).join('');
    Array.from(list.querySelectorAll('button[data-action]')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var slug = btn.getAttribute('data-slug');
        var store = state.stores.find(function (x) { return storeSlug(x) === slug; });
        setMode(store, btn.getAttribute('data-action') === 'on');
      });
    });
  }
  function updateLauncher() {
    var btn = document.getElementById('lv-black-mode-launcher'); if (!btn) return;
    var count = Object.keys(state.modes || {}).filter(function (k) { return state.modes[k] && state.modes[k].blackMode; }).length;
    btn.textContent = count ? ('휴무모드 ' + count) : '휴무모드';
    btn.classList.toggle('on', count > 0);
  }

  function init() { if (!document.body) return setTimeout(init, 300); mount(); setTimeout(function () { load(false); }, 1500); }
  init();
})();
