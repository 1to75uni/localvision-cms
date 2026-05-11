(function () {
  'use strict';

  var VERSION = 'v1.8.7-right-target-ui-fixed';
  var state = {
    stores: [],
    selected: new Set(),
    loaded: false,
    loading: false,
    search: '',
    lastLoadError: '',
  };

  function log() {
    try { console.log.apply(console, ['[LocalVision right targets ' + VERSION + ']'].concat(Array.prototype.slice.call(arguments))); } catch (_) {}
  }

  function cleanSlug(value) {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replaceAll(' ', '-')
      .replace(/[^a-z0-9-_]/g, '');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function storeSlug(store) {
    return cleanSlug(store && (store.slug || store.store || store.id || store.name));
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
      state.selected = new Set(state.stores.map(storeSlug).filter(Boolean));
      renderPanel(true);
    },
    clear: function () {
      state.selected = new Set();
      renderPanel(true);
    },
  };

  var originalFetch = window.fetch ? window.fetch.bind(window) : null;
  if (originalFetch && !window.__LV_RIGHT_TARGETS_FETCH_PATCHED_V187__) {
    window.__LV_RIGHT_TARGETS_FETCH_PATCHED_V187__ = true;
    window.fetch = function (input, init) {
      init = init || {};
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var isUpload = /\/api\/upload(?:\?|$)/.test(url);
        if (isUpload && init.body && typeof FormData !== 'undefined' && init.body instanceof FormData) {
          var side = String(init.body.get('side') || '').toLowerCase();
          if (side === 'right') {
            var payload = selectedPayload();
            if (payload.targetMode === 'selected' && payload.targetStores.length === 0) {
              window.alert('우측 콘텐츠 노출 매장을 최소 1곳 이상 선택해주세요.');
              throw new Error('우측 콘텐츠 노출 매장을 최소 1곳 이상 선택해주세요.');
            }
            init.body.set('targetMode', payload.targetMode);
            init.body.set('targetStores', payload.targetStoresJson);
            init.body.set('targetStoresJson', payload.targetStoresJson);
            init.body.set('targetCount', String(payload.targetCount));
            log('upload target injected', payload);
          }
        }
      } catch (error) {
        return Promise.reject(error);
      }
      return originalFetch(input, init);
    };
  }

  async function loadStores(force) {
    if (!originalFetch) return;
    if (state.loading || (state.loaded && !force)) return;
    state.loading = true;
    state.lastLoadError = '';
    renderPanel(false);
    try {
      var res = await originalFetch('/api/stores?_t=' + Date.now(), { cache: 'no-store' });
      var data = await res.json();
      var stores = Array.isArray(data.stores) ? data.stores : (Array.isArray(data.items) ? data.items : []);
      state.stores = stores.map(function (store) {
        return Object.assign({}, store, { slug: storeSlug(store) });
      }).filter(function (store) { return store.slug; });
      state.selected = new Set(state.stores.map(function (s) { return s.slug; }));
      state.loaded = true;
      log('stores loaded', state.stores.length);
    } catch (error) {
      state.lastLoadError = String(error && error.message || error || '매장 목록 로딩 실패');
      console.warn('[LocalVision right targets] stores load failed', error);
      state.stores = [];
      state.loaded = false;
    } finally {
      state.loading = false;
      renderPanel(true);
    }
  }

  function textOf(el) {
    return String(el && el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function closestByClass(el, cls) {
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains(cls)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function findContentCard() {
    var cards = Array.from(document.querySelectorAll('.form-card, section, div'));
    for (var i = 0; i < cards.length; i++) {
      var el = cards[i];
      if (el.querySelector && el.querySelector('.content-form.upload-form')) return closestByClass(el, 'form-card') || el;
    }
    var headings = Array.from(document.querySelectorAll('h1,h2,h3,strong,p,div'));
    for (var j = 0; j < headings.length; j++) {
      if (textOf(headings[j]) === '새 콘텐츠 추가') return closestByClass(headings[j], 'form-card') || headings[j].parentElement;
    }
    return null;
  }

  function findUploadGrid(card) {
    if (!card) return null;
    return card.querySelector('.content-form.upload-form') || card.querySelector('.form-grid') || card;
  }

  function findSideSelect(card) {
    if (!card) return null;
    var selects = Array.from(card.querySelectorAll('select'));
    return selects.find(function (select) {
      return Array.from(select.options || []).some(function (opt) {
        var value = String(opt.value || '').toLowerCase();
        var label = String(opt.textContent || '');
        return value === 'right' || label.indexOf('우측 30') >= 0 || label.indexOf('전체 공통') >= 0;
      });
    }) || null;
  }

  function isRightSelected(card) {
    var select = findSideSelect(card);
    if (!select) return false;
    var selected = select.options && select.options[select.selectedIndex];
    var value = String(select.value || '').toLowerCase();
    var label = String(selected && selected.textContent || '');
    return value === 'right' || label.indexOf('우측 30') >= 0 || label.indexOf('전체 공통') >= 0;
  }

  function filteredStores() {
    var q = String(state.search || '').trim().toLowerCase();
    if (!q) return state.stores;
    return state.stores.filter(function (s) {
      return [s.name, s.slug, s.appId, s.app_id, s.category, s.address, s.status, s.plan]
        .join(' ')
        .toLowerCase()
        .indexOf(q) >= 0;
    });
  }

  function syncHiddenInputs(panel) {
    var payload = selectedPayload();
    panel.querySelector('[name="targetMode"]').value = payload.targetMode;
    panel.querySelector('[name="targetStores"]').value = payload.targetStoresJson;
    panel.querySelector('[name="targetStoresJson"]').value = payload.targetStoresJson;
    panel.querySelector('[name="targetCount"]').value = String(payload.targetCount);
  }

  function updateSummary(panel) {
    panel = panel || document.getElementById('lv-right-target-panel');
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
    syncHiddenInputs(panel);
  }

  function makeStoreRow(store) {
    var slug = store.slug;
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
    var appId = store.appId || store.app_id || slug;
    text.innerHTML = '<strong>' + escapeHtml(store.name || slug) + '</strong><em>' + escapeHtml(appId + ' · ' + (store.status || '')) + '</em>';
    label.appendChild(checkbox);
    label.appendChild(text);
    return label;
  }

  function getInsertionTarget(card) {
    if (!card) return null;
    var destination = card.querySelector('.upload-destination');
    if (destination) return { mode: 'after', node: destination };
    var button = Array.from(card.querySelectorAll('button')).find(function (btn) { return textOf(btn).indexOf('콘텐츠') >= 0 || textOf(btn).indexOf('업로드') >= 0; });
    if (button) return { mode: 'before', node: button };
    var grid = findUploadGrid(card);
    return grid ? { mode: 'append', node: grid } : { mode: 'append', node: card };
  }

  function ensurePanelPosition(card, panel) {
    var target = getInsertionTarget(card);
    if (!target || !target.node) return;
    if (target.mode === 'after') {
      if (panel.previousElementSibling !== target.node) target.node.insertAdjacentElement('afterend', panel);
    } else if (target.mode === 'before') {
      if (panel.nextElementSibling !== target.node) target.node.parentElement.insertBefore(panel, target.node);
    } else {
      if (panel.parentElement !== target.node) target.node.appendChild(panel);
    }
  }

  function renderPanel(force) {
    var card = findContentCard();
    if (!card) return;
    var rightSelected = isRightSelected(card);
    var panel = document.getElementById('lv-right-target-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'lv-right-target-panel';
      panel.className = 'lv-right-target-panel';
    }
    ensurePanelPosition(card, panel);

    var renderKey = JSON.stringify({
      rightSelected: rightSelected,
      stores: state.stores.map(function (s) { return [s.slug, s.name, s.status, s.appId || s.app_id]; }),
      selected: Array.from(state.selected).sort(),
      search: state.search,
      loading: state.loading,
      error: state.lastLoadError,
    });
    if (!force && panel.dataset.lvRenderKey === renderKey) {
      updateSummary(panel);
      return;
    }
    panel.dataset.lvRenderKey = renderKey;
    panel.innerHTML = '';

    var hidden = document.createElement('div');
    hidden.innerHTML = '<input type="hidden" name="targetMode"><input type="hidden" name="targetStores"><input type="hidden" name="targetStoresJson"><input type="hidden" name="targetCount">';
    panel.appendChild(hidden);

    var head = document.createElement('div');
    head.className = 'lv-target-head';
    head.innerHTML = '<div><strong>우측 콘텐츠 노출 매장 선택 <span class="lv-version-pill">' + VERSION + '</span></strong><p>기본은 전체 매장 노출입니다. 광고 패키지 콘텐츠만 필요한 매장만 체크하세요.</p></div><b data-lv-target-summary></b>';
    panel.appendChild(head);

    if (!rightSelected) {
      var off = document.createElement('p');
      off.className = 'lv-target-off-note';
      off.textContent = '현재 노출 위치가 좌측 70%입니다. 노출 위치를 우측 30% - 전체 공통으로 바꾸면 매장 선택 체크박스가 활성화됩니다.';
      panel.appendChild(off);
      updateSummary(panel);
      return;
    }

    var controls = document.createElement('div');
    controls.className = 'lv-target-controls';

    var allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.textContent = '전체 선택';
    allBtn.addEventListener('click', function () {
      state.selected = new Set(state.stores.map(function (s) { return s.slug; }).filter(Boolean));
      renderPanel(true);
    });

    var clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = '전체 해제';
    clearBtn.addEventListener('click', function () {
      state.selected = new Set();
      renderPanel(true);
    });

    var activeBtn = document.createElement('button');
    activeBtn.type = 'button';
    activeBtn.textContent = '운영중만 선택';
    activeBtn.addEventListener('click', function () {
      state.selected = new Set(state.stores.filter(function (s) { return String(s.status || '').indexOf('운영') >= 0; }).map(function (s) { return s.slug; }).filter(Boolean));
      renderPanel(true);
    });

    var reloadBtn = document.createElement('button');
    reloadBtn.type = 'button';
    reloadBtn.textContent = '매장목록 새로고침';
    reloadBtn.addEventListener('click', function () { loadStores(true); });

    var search = document.createElement('input');
    search.placeholder = '매장 검색';
    search.value = state.search;
    search.addEventListener('input', function () {
      state.search = search.value;
      renderPanel(true);
    });

    controls.appendChild(allBtn);
    controls.appendChild(clearBtn);
    controls.appendChild(activeBtn);
    controls.appendChild(reloadBtn);
    controls.appendChild(search);
    panel.appendChild(controls);

    var warning = document.createElement('p');
    warning.setAttribute('data-lv-target-warning', '1');
    warning.className = 'lv-target-warning';
    warning.textContent = '선택 매장이 0곳입니다. 전체 선택 또는 최소 1개 매장을 선택해야 저장됩니다.';
    panel.appendChild(warning);

    var list = document.createElement('div');
    list.className = 'lv-target-list';
    var rows = filteredStores();
    if (state.loading) {
      list.innerHTML = '<p class="lv-target-empty">매장 목록을 불러오는 중입니다.</p>';
    } else if (state.lastLoadError) {
      list.innerHTML = '<p class="lv-target-empty error">매장 목록을 불러오지 못했습니다: ' + escapeHtml(state.lastLoadError) + '</p>';
    } else if (!state.stores.length) {
      list.innerHTML = '<p class="lv-target-empty">등록된 매장이 없습니다. 이 경우 저장하면 전체 노출로 처리됩니다.</p>';
    } else if (!rows.length) {
      list.innerHTML = '<p class="lv-target-empty">검색 결과가 없습니다.</p>';
    } else {
      rows.forEach(function (store) { list.appendChild(makeStoreRow(store)); });
    }
    panel.appendChild(list);
    updateSummary(panel);
  }

  function installCss() {
    if (document.getElementById('lv-right-target-style-v187')) return;
    var style = document.createElement('style');
    style.id = 'lv-right-target-style-v187';
    style.textContent = `
      #lv-right-target-panel.lv-right-target-panel{grid-column:1/-1;width:100%;box-sizing:border-box;margin:10px 0 8px;padding:16px;border:2px solid rgba(37,99,235,.35);background:linear-gradient(180deg,#f8fbff,#eff6ff);border-radius:18px;box-shadow:0 10px 24px rgba(15,23,42,.08);position:relative;z-index:2}
      #lv-right-target-panel .lv-target-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:12px}
      #lv-right-target-panel .lv-target-head strong{font-size:15px;color:#0f172a;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      #lv-right-target-panel .lv-target-head p{margin:4px 0 0;color:#475569;font-size:13px}
      #lv-right-target-panel .lv-target-head b{white-space:nowrap;background:#1d4ed8;color:#fff;border-radius:999px;padding:7px 10px;font-size:12px}
      #lv-right-target-panel .lv-version-pill{display:inline-block;background:#dbeafe;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:800}
      #lv-right-target-panel .lv-target-controls{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
      #lv-right-target-panel .lv-target-controls button{border:1px solid #cbd5e1;background:white;border-radius:999px;padding:8px 11px;font-weight:800;cursor:pointer;color:#0f172a}
      #lv-right-target-panel .lv-target-controls button:hover{border-color:#2563eb;color:#1d4ed8}
      #lv-right-target-panel .lv-target-controls input{min-width:180px;flex:1;border:1px solid #cbd5e1;border-radius:999px;padding:8px 12px;background:white;color:#0f172a}
      #lv-right-target-panel .lv-target-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px;max-height:240px;overflow:auto;padding-right:4px}
      #lv-right-target-panel .lv-target-store-row{display:flex;align-items:flex-start;gap:8px;background:white;border:1px solid #e2e8f0;border-radius:12px;padding:9px;cursor:pointer;box-sizing:border-box}
      #lv-right-target-panel .lv-target-store-row:hover{border-color:#93c5fd;background:#f8fbff}
      #lv-right-target-panel .lv-target-store-row input{margin-top:3px}
      #lv-right-target-panel .lv-target-store-row span{display:flex;flex-direction:column;gap:2px;min-width:0}
      #lv-right-target-panel .lv-target-store-row strong{font-size:13px;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #lv-right-target-panel .lv-target-store-row em{font-size:11px;color:#64748b;font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #lv-right-target-panel .lv-target-warning{display:none;margin:0 0 10px;color:#b91c1c;font-weight:900;font-size:13px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:9px 11px}
      #lv-right-target-panel .lv-target-empty{grid-column:1/-1;margin:8px 0;color:#64748b;font-size:13px;background:white;border:1px dashed #cbd5e1;border-radius:12px;padding:12px}
      #lv-right-target-panel .lv-target-empty.error{color:#b91c1c;background:#fef2f2;border-color:#fecaca}
      #lv-right-target-panel .lv-target-off-note{margin:0;color:#475569;background:white;border:1px dashed #cbd5e1;border-radius:12px;padding:12px;font-size:13px;font-weight:700}
      .lv-right-target-loaded-badge{position:fixed;right:16px;bottom:16px;z-index:99999;background:#0f172a;color:#fff;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:900;box-shadow:0 10px 30px rgba(15,23,42,.25);opacity:.86;pointer-events:none}
    `;
    document.head.appendChild(style);
  }

  function ensureBadge() {
    if (document.getElementById('lv-right-target-loaded-badge')) return;
    var badge = document.createElement('div');
    badge.id = 'lv-right-target-loaded-badge';
    badge.className = 'lv-right-target-loaded-badge';
    badge.textContent = 'Right Target UI v1.8.7 로드됨';
    document.body.appendChild(badge);
    setTimeout(function () { try { badge.style.display = 'none'; } catch (_) {} }, 6000);
  }

  function bindSideChange() {
    var card = findContentCard();
    var select = findSideSelect(card);
    if (select && !select.dataset.lvTargetBoundV187) {
      select.dataset.lvTargetBoundV187 = '1';
      select.addEventListener('change', function () {
        setTimeout(function () {
          renderPanel(true);
          if (isRightSelected(card)) loadStores(false);
        }, 30);
      });
    }
  }

  function tick() {
    installCss();
    ensureBadge();
    bindSideChange();
    renderPanel(false);
    var card = findContentCard();
    if (card && isRightSelected(card)) loadStores(false);
  }

  var tickTimer = null;
  function scheduleTick() {
    if (tickTimer) return;
    tickTimer = setTimeout(function () {
      tickTimer = null;
      tick();
    }, 80);
  }

  function start() {
    installCss();
    ensureBadge();
    tick();
    try {
      var mo = new MutationObserver(scheduleTick);
      mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'value'] });
    } catch (_) {}
    setInterval(tick, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
