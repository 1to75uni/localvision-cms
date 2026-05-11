(function () {
  'use strict';

  var VERSION = 'v1.8.6-right-target-stores';
  var state = {
    stores: [],
    selected: new Set(),
    loaded: false,
    loading: false,
    search: '',
    lastSummary: '',
  };

  function cleanSlug(value) {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replaceAll(' ', '-')
      .replace(/[^a-z0-9-_]/g, '');
  }

  function storeLabel(store) {
    var name = store.name || store.slug || '';
    var appId = store.appId || store.app_id || '';
    var status = store.status || '';
    return name + (appId ? ' · ' + appId : '') + (status ? ' · ' + status : '');
  }

  function selectedPayload() {
    var total = state.stores.length;
    var selected = Array.from(state.selected).map(cleanSlug).filter(Boolean);
    var allSelected = total === 0 || selected.length >= total;
    return {
      targetMode: allSelected ? 'all' : 'selected',
      targetStores: allSelected ? [] : selected,
      targetStoresJson: allSelected ? '[]' : JSON.stringify(selected),
      targetCount: allSelected ? total : selected.length,
      totalCount: total,
      allSelected: allSelected,
    };
  }

  window.LV_RIGHT_TARGETS = {
    version: VERSION,
    getPayload: selectedPayload,
    selectAll: function () {
      state.selected = new Set(state.stores.map(function (s) { return cleanSlug(s.slug); }).filter(Boolean));
      renderPanel();
    },
  };

  var originalFetch = window.fetch;
  window.fetch = function (input, init) {
    init = init || {};
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var method = String(init.method || (input && input.method) || 'GET').toUpperCase();
      var isUpload = /\/api\/upload(?:\?|$)/.test(url);
      var payload = selectedPayload();

      if (isUpload && init.body && typeof FormData !== 'undefined' && init.body instanceof FormData) {
        var side = String(init.body.get('side') || '').toLowerCase();
        if (side === 'right') {
          if (payload.targetMode === 'selected' && payload.targetStores.length === 0) {
            throw new Error('우측 콘텐츠 노출 매장을 최소 1곳 이상 선택해주세요.');
          }
          init.body.set('targetMode', payload.targetMode);
          init.body.set('targetStores', payload.targetStoresJson);
        }
      }
    } catch (error) {
      return Promise.reject(error);
    }
    return originalFetch.call(this, input, init);
  };

  async function loadStores() {
    if (state.loading || state.loaded) return;
    state.loading = true;
    try {
      var res = await originalFetch('/api/stores?_t=' + Date.now(), { cache: 'no-store' });
      var data = await res.json();
      state.stores = Array.isArray(data.stores) ? data.stores : [];
      state.selected = new Set(state.stores.map(function (s) { return cleanSlug(s.slug); }).filter(Boolean));
      state.loaded = true;
    } catch (error) {
      console.warn('[LocalVision right targets] stores load failed', error);
      state.stores = [];
    } finally {
      state.loading = false;
      renderPanel();
    }
  }

  function contentForm() {
    return document.querySelector('.content-form.upload-form');
  }

  function sideSelect(form) {
    if (!form) return null;
    return Array.from(form.querySelectorAll('select')).find(function (select) {
      return Array.from(select.options || []).some(function (opt) { return opt.value === 'right'; });
    });
  }

  function isRightSelected() {
    var form = contentForm();
    var select = sideSelect(form);
    return select && select.value === 'right';
  }

  function filteredStores() {
    var q = String(state.search || '').trim().toLowerCase();
    if (!q) return state.stores;
    return state.stores.filter(function (s) {
      return [s.name, s.slug, s.appId, s.app_id, s.category, s.address, s.status].join(' ').toLowerCase().includes(q);
    });
  }

  function makeStoreRow(store) {
    var slug = cleanSlug(store.slug);
    var label = document.createElement('label');
    label.className = 'lv-target-store-row';
    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.selected.has(slug);
    checkbox.addEventListener('change', function () {
      if (checkbox.checked) state.selected.add(slug);
      else state.selected.delete(slug);
      updateSummary();
    });
    var text = document.createElement('span');
    text.innerHTML = '<strong>' + escapeHtml(store.name || slug) + '</strong><em>' + escapeHtml((store.appId || store.app_id || slug) + ' · ' + (store.status || '')) + '</em>';
    label.appendChild(checkbox);
    label.appendChild(text);
    return label;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function updateSummary() {
    var panel = document.getElementById('lv-right-target-panel');
    if (!panel) return;
    var payload = selectedPayload();
    var summary = panel.querySelector('[data-lv-target-summary]');
    if (summary) {
      summary.textContent = payload.allSelected
        ? '전체 매장 노출 · ' + payload.totalCount + '곳'
        : '선택 매장 노출 · ' + payload.targetStores.length + ' / ' + payload.totalCount + '곳';
    }
    var warning = panel.querySelector('[data-lv-target-warning]');
    if (warning) warning.style.display = (!payload.allSelected && payload.targetStores.length === 0) ? 'block' : 'none';
  }

  function renderPanel() {
    var form = contentForm();
    if (!form) return;
    var destination = form.querySelector('.upload-destination');
    if (!destination) return;

    var panel = document.getElementById('lv-right-target-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'lv-right-target-panel';
      panel.className = 'lv-right-target-panel';
      destination.insertAdjacentElement('afterend', panel);
    }

    var visible = isRightSelected();
    panel.style.display = visible ? 'block' : 'none';
    if (!visible) return;

    var renderKey = JSON.stringify({
      stores: state.stores.map(function (s) { return [s.slug, s.name, s.status, s.appId || s.app_id]; }),
      selected: Array.from(state.selected).sort(),
      search: state.search,
      loading: state.loading
    });
    if (panel.dataset.lvRenderKey === renderKey) {
      updateSummary();
      return;
    }
    panel.dataset.lvRenderKey = renderKey;

    var rows = filteredStores();
    panel.innerHTML = '';

    var head = document.createElement('div');
    head.className = 'lv-target-head';
    head.innerHTML = '<div><strong>우측 콘텐츠 노출 매장 선택</strong><p>기본은 전체 매장 노출입니다. 광고 패키지 콘텐츠만 필요한 매장만 체크하세요.</p></div><b data-lv-target-summary></b>';
    panel.appendChild(head);

    var controls = document.createElement('div');
    controls.className = 'lv-target-controls';

    var allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.textContent = '전체 선택';
    allBtn.addEventListener('click', function () {
      state.selected = new Set(state.stores.map(function (s) { return cleanSlug(s.slug); }).filter(Boolean));
      renderPanel();
    });

    var clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = '전체 해제';
    clearBtn.addEventListener('click', function () {
      state.selected = new Set();
      renderPanel();
    });

    var activeBtn = document.createElement('button');
    activeBtn.type = 'button';
    activeBtn.textContent = '운영중만 선택';
    activeBtn.addEventListener('click', function () {
      state.selected = new Set(state.stores.filter(function (s) { return String(s.status || '').includes('운영'); }).map(function (s) { return cleanSlug(s.slug); }).filter(Boolean));
      renderPanel();
    });

    var search = document.createElement('input');
    search.placeholder = '매장 검색';
    search.value = state.search;
    search.addEventListener('input', function () {
      state.search = search.value;
      renderPanel();
    });

    controls.appendChild(allBtn);
    controls.appendChild(clearBtn);
    controls.appendChild(activeBtn);
    controls.appendChild(search);
    panel.appendChild(controls);

    var warning = document.createElement('p');
    warning.setAttribute('data-lv-target-warning', '1');
    warning.className = 'lv-target-warning';
    warning.textContent = '선택 매장이 0곳입니다. 전체 선택 또는 최소 1개 매장을 선택해야 저장됩니다.';
    panel.appendChild(warning);

    var list = document.createElement('div');
    list.className = 'lv-target-list';
    if (state.loading) {
      list.innerHTML = '<p class="lv-target-empty">매장 목록을 불러오는 중입니다.</p>';
    } else if (!state.stores.length) {
      list.innerHTML = '<p class="lv-target-empty">매장 목록을 불러오지 못했습니다. 그래도 저장하면 전체 노출로 처리됩니다.</p>';
    } else if (!rows.length) {
      list.innerHTML = '<p class="lv-target-empty">검색 결과가 없습니다.</p>';
    } else {
      rows.forEach(function (store) { list.appendChild(makeStoreRow(store)); });
    }
    panel.appendChild(list);
    updateSummary();
  }

  function installCss() {
    if (document.getElementById('lv-right-target-style')) return;
    var style = document.createElement('style');
    style.id = 'lv-right-target-style';
    style.textContent = `
      .lv-right-target-panel{grid-column:1/-1;margin:6px 0 4px;padding:16px;border:1px solid rgba(37,99,235,.22);background:#f8fbff;border-radius:18px;box-shadow:0 8px 20px rgba(15,23,42,.05)}
      .lv-target-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:12px}.lv-target-head strong{font-size:15px;color:#0f172a}.lv-target-head p{margin:4px 0 0;color:#64748b;font-size:13px}.lv-target-head b{white-space:nowrap;background:#1d4ed8;color:#fff;border-radius:999px;padding:7px 10px;font-size:12px}
      .lv-target-controls{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.lv-target-controls button{border:1px solid #cbd5e1;background:white;border-radius:999px;padding:8px 11px;font-weight:700;cursor:pointer}.lv-target-controls input{min-width:180px;flex:1;border:1px solid #cbd5e1;border-radius:999px;padding:8px 12px;background:white}
      .lv-target-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px;max-height:220px;overflow:auto;padding-right:4px}.lv-target-store-row{display:flex;align-items:flex-start;gap:8px;background:white;border:1px solid #e2e8f0;border-radius:12px;padding:9px;cursor:pointer}.lv-target-store-row input{margin-top:3px}.lv-target-store-row span{display:flex;flex-direction:column;gap:2px}.lv-target-store-row strong{font-size:13px;color:#111827}.lv-target-store-row em{font-size:11px;color:#64748b;font-style:normal}.lv-target-warning{display:none;margin:0 0 10px;color:#b91c1c;font-weight:800;font-size:13px}.lv-target-empty{grid-column:1/-1;margin:8px 0;color:#64748b;font-size:13px}
    `;
    document.head.appendChild(style);
  }

  function bindSideChange() {
    var form = contentForm();
    var select = sideSelect(form);
    if (select && !select.dataset.lvTargetBound) {
      select.dataset.lvTargetBound = '1';
      select.addEventListener('change', function () { setTimeout(renderPanel, 30); });
    }
  }

  function tick() {
    installCss();
    bindSideChange();
    renderPanel();
    if (isRightSelected()) loadStores();
  }

  var mo = new MutationObserver(function () { tick(); });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      mo.observe(document.body, { childList: true, subtree: true });
      tick();
    });
  } else {
    mo.observe(document.body, { childList: true, subtree: true });
    tick();
  }
})();
