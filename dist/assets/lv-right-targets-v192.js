(function () {
  'use strict';

  var VERSION = 'v1.9.5-device-control-black-mode-ui-version-fix';
  var state = {
    stores: [],
    contents: [],
    devices: [],
    selected: new Set(),
    loaded: false,
    loading: false,
    search: '',
    lastLoadError: '',
    contentsLoaded: false,
    contentsLoading: false,
    contentsLoadError: '',
    devicesLoaded: false,
    devicesLoading: false,
    devicesLoadError: '',
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
  if (originalFetch && !window.__LV_RIGHT_TARGETS_FETCH_PATCHED_V192__) {
    window.__LV_RIGHT_TARGETS_FETCH_PATCHED_V192__ = true;
    window.fetch = function (input, init) {
      init = init || {};
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var method = String(init.method || 'GET').toUpperCase();
      var isUpload = /\/api\/upload(?:\?|$)/.test(url);
      var isContentWrite = /\/api\/contents(?:\?|$)/.test(url) && method !== 'GET';
      try {
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
      var promise = originalFetch(input, init);
      if (isUpload || isContentWrite) {
        promise.then(function () {
          scheduleContentRefresh('fetch-write:' + (isUpload ? 'upload' : 'contents'));
        }).catch(function () {});
      }
      return promise;
    };
  }


  var contentRefreshTimer = null;
  function scheduleContentRefresh(reason) {
    if (contentRefreshTimer) clearTimeout(contentRefreshTimer);
    contentRefreshTimer = setTimeout(function () {
      contentRefreshTimer = null;
      state.contentsLoaded = false;
      state.contentsLoadError = '';
      log('schedule content refresh', reason || 'unknown');
      Promise.resolve(loadContents(true)).then(function () {
        decorateRightContentCards(true);
        decorateVisibleRightCardsFallback(true);
        scheduleTick();
      }).catch(function () {
        decorateVisibleRightCardsFallback(true);
        scheduleTick();
      });
    }, 650);
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


  function normalizeList(value) {
    if (Array.isArray(value)) return value.map(cleanSlug).filter(Boolean);
    if (value == null) return [];
    var text = String(value || '').trim();
    if (!text) return [];
    try {
      var parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(cleanSlug).filter(Boolean);
    } catch (_) {}
    return text.split(',').map(cleanSlug).filter(Boolean);
  }

  function getContentTarget(content) {
    var stores = normalizeList(content.targetStores || content.target_stores || content.targetStoresJson || content.target_stores_json || '');
    var mode = String(content.targetMode || content.target_mode || '').toLowerCase();
    if (mode !== 'selected') mode = stores.length ? 'selected' : 'all';
    if (mode === 'selected' && !stores.length) mode = 'all';
    return { mode: mode, stores: stores };
  }

  function storeName(store) {
    return String((store && (store.name || store.storeName || store.slug || store.store || store.id)) || '').trim();
  }

  function statusText(value) {
    var text = String(value || '').trim();
    return text || '-';
  }

  function isInsideNavigation(el) {
    if (!el || !el.closest) return false;
    return Boolean(el.closest('aside, nav, [role=\"navigation\"], .sidebar, .side-bar, .side-nav, .sidenav, .gnb, .lnb'));
  }

  function headingTexts() {
    return Array.from(document.querySelectorAll('main h1, main h2, main h3, h1, h2, h3'))
      .filter(function (el) { return !isInsideNavigation(el); })
      .map(textOf)
      .filter(Boolean);
  }

  function isStrictContentManagementPage() {
    var heads = headingTexts();
    var bodyText = textOf(document.body);
    var hasContentTitle = heads.some(function (t) { return t === '콘텐츠 관리' || t.indexOf('업체 · 콘텐츠 · TV 상태') >= 0; });
    var hasNewContentForm = heads.some(function (t) { return t === '새 콘텐츠 추가'; }) || bodyText.indexOf('새 콘텐츠 추가') >= 0;
    var hasRightContentList = bodyText.indexOf('우측 30% 공통 콘텐츠') >= 0 && bodyText.indexOf('좌측 70%') >= 0;
    var isNoticePage = heads.some(function (t) { return t.indexOf('전체화면 공지') >= 0; }) || bodyText.indexOf('새 전체화면 공지 등록') >= 0 || bodyText.indexOf('공지 송출 방식') >= 0;
    return !isNoticePage && (hasNewContentForm || (hasContentTitle && hasRightContentList));
  }

  function removePanelIfOffPage() {
    if (isStrictContentManagementPage()) return;
    var panel = document.getElementById('lv-right-target-panel');
    if (panel) panel.remove();
  }

  function isContentPageLike() {
    return isStrictContentManagementPage();
  }

  async function loadContents(force) {
    if (!originalFetch) return;
    if (state.contentsLoading || (state.contentsLoaded && !force)) return;
    state.contentsLoading = true;
    state.contentsLoadError = '';
    try {
      var res = await originalFetch('/api/contents?store=_common&side=right&_t=' + Date.now(), { cache: 'no-store' });
      var data = await res.json();
      var contents = Array.isArray(data.contents) ? data.contents : (Array.isArray(data.items) ? data.items : []);
      state.contents = contents.map(function (content) {
        return Object.assign({}, content, {
          title: String(content.title || content.fileName || content.file_name || content.id || '').trim(),
          fileName: String(content.fileName || content.file_name || '').trim(),
          r2Key: String(content.r2Key || content.r2_key || '').trim(),
        });
      }).filter(function (content) { return content.title || content.fileName || content.id; });
      state.contentsLoaded = true;
      log('right contents loaded', state.contents.length);
    } catch (error) {
      state.contentsLoadError = String(error && error.message || error || '우측 콘텐츠 목록 로딩 실패');
      state.contentsLoaded = false;
      console.warn('[LocalVision right targets] contents load failed', error);
    } finally {
      state.contentsLoading = false;
      decorateRightContentCards(true);
      decorateVisibleRightCardsFallback(true);
    }
  }

  async function loadDevices(force) {
    if (!originalFetch) return;
    if (state.devicesLoading || (state.devicesLoaded && !force)) return;
    state.devicesLoading = true;
    state.devicesLoadError = '';
    try {
      var res = await originalFetch('/api/devices?_t=' + Date.now(), { cache: 'no-store' });
      var data = await res.json();
      var devices = Array.isArray(data.devices) ? data.devices : (Array.isArray(data.items) ? data.items : []);
      state.devices = devices.map(function (device) {
        return Object.assign({}, device, { slug: cleanSlug(device.store || device.slug || device.id || device.name) });
      }).filter(function (device) { return device.slug; });
      state.devicesLoaded = true;
      log('devices loaded', state.devices.length);
    } catch (error) {
      state.devicesLoadError = String(error && error.message || error || '단말기 상태 로딩 실패');
      state.devicesLoaded = false;
      console.warn('[LocalVision right targets] devices load failed', error);
    } finally {
      state.devicesLoading = false;
    }
  }

  async function loadVisibilityData(force) {
    try {
      await Promise.all([loadStores(force), loadContents(force), loadDevices(force)]);
    } catch (_) {}
    decorateRightContentCards(true);
    decorateVisibleRightCardsFallback(true);
  }

  function getStoreMap() {
    var map = {};
    state.stores.forEach(function (store) { map[storeSlug(store)] = store; });
    return map;
  }

  function getDeviceMap() {
    var map = {};
    state.devices.forEach(function (device) {
      var slug = cleanSlug(device.store || device.slug || device.id || device.name);
      if (slug && (!map[slug] || device.online)) map[slug] = device;
    });
    return map;
  }

  function getTargetRows(content) {
    var target = getContentTarget(content);
    var storeMap = getStoreMap();
    var deviceMap = getDeviceMap();
    var slugs = target.mode === 'selected'
      ? target.stores
      : state.stores.map(function (s) { return storeSlug(s); }).filter(Boolean);
    var rows = slugs.map(function (slug) {
      var store = storeMap[slug] || { slug: slug, name: slug, status: '매장 목록 없음', appId: '' };
      var device = deviceMap[slug] || null;
      return {
        slug: slug,
        name: storeName(store) || slug,
        appId: store.appId || store.app_id || '',
        storeStatus: statusText(store.status),
        deviceOnline: device ? Boolean(device.online) : false,
        deviceKnown: Boolean(device),
        lastSeen: device ? (device.lastSeen || device.lastSeenKst || device.lastSeenAt || '') : '',
        offlineReason: device ? (device.offlineReason || '') : '단말기 기록 없음',
      };
    });
    rows.sort(function (a, b) {
      if (a.deviceOnline !== b.deviceOnline) return a.deviceOnline ? -1 : 1;
      return a.name.localeCompare(b.name, 'ko');
    });
    return rows;
  }

  function targetSummary(content) {
    var target = getContentTarget(content);
    if (target.mode === 'selected') return '선택 매장 ' + target.stores.length + '곳';
    return '전체 매장 ' + state.stores.length + '곳';
  }

  function countKnownRightTitles(txt, current) {
    var count = 0;
    var seen = {};
    state.contents.forEach(function (c) {
      var t = String(c.title || c.fileName || c.file_name || '').trim();
      if (!t || seen[t]) return;
      if (txt.indexOf(t) >= 0) { seen[t] = true; count += 1; }
    });
    return count;
  }

  function findCandidateCardForContent(content) {
    if (!isStrictContentManagementPage()) return null;
    var title = String(content.title || '').trim();
    var fileName = String(content.fileName || content.file_name || '').trim();
    var r2Key = String(content.r2Key || content.r2_key || '').trim();
    if (!title && !fileName && !r2Key) return null;
    var all = Array.from(document.querySelectorAll('article, section, .content-card, .content-row, .panel, .card, div'));
    var matches = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!el || !el.querySelector || el.id === 'root' || isInsideNavigation(el) || el.closest('#lv-right-target-panel') || el.closest('#lv-right-visibility-modal')) continue;
      var txt = textOf(el);
      if (!txt || txt.length > 1400) continue;
      // 업로드 폼 안에는 방금 입력한 파일명/right_9 같은 텍스트가 있어서
      // 콘텐츠 카드로 오인될 수 있습니다. 송출 매장 보기 버튼은 실제 콘텐츠 카드에만 붙입니다.
      if (txt.indexOf('새 콘텐츠 추가') >= 0 || txt.indexOf('파일 업로드 + 콘텐츠 저장') >= 0 || txt.indexOf('파일명 직접 입력') >= 0 || txt.indexOf('콘텐츠 제목') >= 0) continue;
      if (el.querySelector && (el.querySelector('input[type="file"]') || el.querySelector('select'))) continue;
      var titleHit = title && txt.indexOf(title) >= 0;
      var fileHit = fileName && txt.indexOf(fileName) >= 0;
      var keyHit = r2Key && txt.indexOf(r2Key) >= 0;
      var rightHint = txt.indexOf('stores/_common/right') >= 0 || txt.indexOf('공통 우측') >= 0 || txt.indexOf('우측 30') >= 0 || txt.indexOf('미디어 열기') >= 0 || txt.indexOf('저장 위치: stores/_common/right') >= 0;
      if (!((titleHit || fileHit || keyHit) && (rightHint || fileHit || keyHit))) continue;
      // 여러 콘텐츠를 한꺼번에 감싸는 부모 컨테이너에 버튼이 붙으면 right_12가 all처럼 보이는 등 오표시가 생깁니다.
      // 따라서 현재 콘텐츠 외의 right_* 제목이 같이 들어 있는 큰 부모는 제외합니다.
      if (countKnownRightTitles(txt, content) > 1) continue;
      try {
        var rect = el.getBoundingClientRect();
        if ((rect.width && rect.width < 150) || (rect.height && rect.height < 45)) continue;
      } catch (_) {}
      matches.push(el);
    }
    matches.sort(function (a, b) {
      var al = textOf(a).length, bl = textOf(b).length;
      if (al !== bl) return al - bl;
      return (b.querySelectorAll ? b.querySelectorAll('*').length : 0) - (a.querySelectorAll ? a.querySelectorAll('*').length : 0);
    });
    return matches[0] || null;
  }

  function makeVisibilityControls(content) {
    var wrap = document.createElement('div');
    var key = String(content.id || content.title || content.fileName || 'right');
    wrap.className = 'lv-right-visibility-card-tools';
    wrap.setAttribute('data-lv-visibility-for', key);
    var target = getContentTarget(content);
    var pill = document.createElement('span');
    pill.className = 'lv-right-visibility-pill ' + (target.mode === 'selected' ? 'selected' : 'all');
    pill.textContent = '송출 범위: ' + targetSummary(content);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lv-right-visibility-btn';
    btn.textContent = '송출 매장 보기';
    btn.setAttribute('data-lv-visibility-id', String(content.id || ''));
    btn.setAttribute('data-lv-visibility-title', String(content.title || ''));
    btn.setAttribute('data-lv-visibility-file', String(content.fileName || content.file_name || ''));
    btn.setAttribute('data-lv-visibility-r2', String(content.r2Key || content.r2_key || ''));
    btn.setAttribute('aria-label', '송출 매장 보기');
    btn.addEventListener('click', function (ev) {
      if (handleVisibilityTriggerEvent(ev, btn)) handleVisibilityButtonClick(btn);
    });
    btn.addEventListener('pointerdown', function (ev) {
      if (handleVisibilityTriggerEvent(ev, btn)) handleVisibilityButtonClick(btn);
    });
    // v1.9.2: 버튼은 항상 즉시 클릭 가능하게 둡니다.
    // 데이터는 클릭 후 모달 안에서 로딩합니다. React 재렌더링/캡처 충돌을 막기 위해 직접 이벤트 + document 위임을 같이 둡니다.
    wrap.appendChild(pill);
    wrap.appendChild(btn);
    return wrap;
  }

  function decorateRightContentCards(force) {
    if (!state.contentsLoaded || !isContentPageLike()) return;
    var decorated = 0;
    state.contents.forEach(function (content) {
      var card = findCandidateCardForContent(content);
      if (!card) return;
      var key = String(content.id || content.title || content.fileName || 'right');
      var existing = card.querySelector('[data-lv-visibility-for]');
      if (existing && !force) return;
      if (existing) existing.remove();
      var controls = makeVisibilityControls(content);
      var mediaLink = Array.from(card.querySelectorAll('a,button')).find(function (node) { return textOf(node).indexOf('미디어') >= 0; });
      if (mediaLink && mediaLink.parentElement) mediaLink.parentElement.insertBefore(controls, mediaLink.nextSibling);
      else card.appendChild(controls);
      card.dataset.lvRightVisibilityDecorated = key;
      decorated += 1;
    });
    if (decorated) log('visibility buttons decorated', decorated);
  }


  function isUploadLikeBlock(el) {
    if (!el) return false;
    var txt = textOf(el);
    if (txt.indexOf('새 콘텐츠 추가') >= 0 || txt.indexOf('파일 업로드 + 콘텐츠 저장') >= 0 || txt.indexOf('파일명 직접 입력') >= 0 || txt.indexOf('콘텐츠 제목') >= 0) return true;
    if (el.querySelector && (el.querySelector('input[type="file"]') || el.querySelector('select'))) return true;
    return false;
  }

  function cleanupVisibilityControlsInUploadForm() {
    Array.from(document.querySelectorAll('.lv-right-visibility-card-tools')).forEach(function (tools) {
      var block = tools.closest('article, section, .form-card, .content-card, .card, div');
      if (isUploadLikeBlock(block) || tools.closest('#lv-right-target-panel')) tools.remove();
    });
  }

  function uniqueRightNames(txt) {
    var seen = {};
    var re = /right[\s_-]*\d+/ig;
    var m;
    while ((m = re.exec(txt))) {
      var key = m[0].toLowerCase().replace(/[\s-]+/g, '_');
      seen[key] = true;
    }
    return Object.keys(seen);
  }

  function inferRightContentFromCard(card) {
    var txt = textOf(card);
    var names = uniqueRightNames(txt);
    if (!names.length) return null;
    var title = names[0];
    var known = state.contents.find(function (content) {
      var t = String(content.title || '').toLowerCase();
      var f = String(content.fileName || content.file_name || '').toLowerCase();
      return t === title || f.indexOf(title) >= 0 || txt.indexOf(content.fileName || content.file_name || '') >= 0;
    });
    if (known) return known;
    return {
      id: 'visible_' + title,
      title: title,
      fileName: '',
      r2Key: 'stores/_common/right',
      targetMode: 'all',
      targetStores: []
    };
  }

  function decorateVisibleRightCardsFallback(force) {
    if (!isContentPageLike()) return;
    cleanupVisibilityControlsInUploadForm();
    var nodes = Array.from(document.querySelectorAll('main article, main section, main .content-card, main .content-row, main .card, main div'));
    var decorated = 0;
    nodes.forEach(function (el) {
      if (!el || !el.querySelector || el.id === 'root' || isInsideNavigation(el) || el.closest('#lv-right-target-panel') || el.closest('#lv-right-visibility-modal')) return;
      if (isUploadLikeBlock(el)) return;
      if (el.querySelector('[data-lv-visibility-for]') && !force) return;
      var txt = textOf(el);
      if (!txt || txt.length < 30 || txt.length > 900) return;
      if (txt.indexOf('stores/_common/right') < 0 && txt.indexOf('공통 우측') < 0 && txt.indexOf('우측 30') < 0) return;
      if (txt.indexOf('미디어 열기') < 0 && txt.indexOf('저장 위치') < 0) return;
      var names = uniqueRightNames(txt);
      if (names.length !== 1) return;
      // 부모/큰 컨테이너가 아니라 가장 작은 콘텐츠 카드에만 붙입니다.
      var childWithSame = Array.from(el.children || []).some(function (child) {
        var childTxt = textOf(child);
        return childTxt && childTxt !== txt && childTxt.indexOf(names[0]) >= 0 && (childTxt.indexOf('미디어 열기') >= 0 || childTxt.indexOf('저장 위치') >= 0);
      });
      if (childWithSame) return;
      var content = inferRightContentFromCard(el);
      if (!content) return;
      var existing = el.querySelector('[data-lv-visibility-for]');
      if (existing) existing.remove();
      var controls = makeVisibilityControls(content);
      var mediaLink = Array.from(el.querySelectorAll('a,button')).find(function (node) { return textOf(node).indexOf('미디어') >= 0; });
      if (mediaLink && mediaLink.parentElement) mediaLink.parentElement.insertBefore(controls, mediaLink.nextSibling);
      else el.appendChild(controls);
      decorated += 1;
    });
    if (decorated) log('visibility buttons fallback decorated', decorated);
  }

  function findContentForVisibilityButton(btn) {
    if (!btn) return null;
    var id = String(btn.getAttribute('data-lv-visibility-id') || '').trim();
    var title = String(btn.getAttribute('data-lv-visibility-title') || '').trim();
    var fileName = String(btn.getAttribute('data-lv-visibility-file') || '').trim();
    var r2Key = String(btn.getAttribute('data-lv-visibility-r2') || '').trim();
    var found = state.contents.find(function (content) {
      return (id && String(content.id || '') === id) ||
        (title && String(content.title || '') === title) ||
        (fileName && String(content.fileName || content.file_name || '') === fileName) ||
        (r2Key && String(content.r2Key || content.r2_key || '') === r2Key);
    });
    if (found) return found;
    return {
      id: id,
      title: title || fileName || r2Key || '우측 콘텐츠',
      fileName: fileName,
      r2Key: r2Key,
      targetMode: 'all',
      targetStores: []
    };
  }

  function ensureVisibilityModalShell() {
    var modal = document.getElementById('lv-right-visibility-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'lv-right-visibility-modal';
      modal.className = 'lv-right-visibility-modal';
      document.body.appendChild(modal);
    }
    return modal;
  }

  function closeVisibilityModal() {
    var modal = document.getElementById('lv-right-visibility-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.innerHTML = '';
    }
  }

  function openVisibilityLoadingModal(content) {
    var modal = ensureVisibilityModalShell();
    modal.innerHTML = '';
    var backdrop = document.createElement('div');
    backdrop.className = 'lv-right-visibility-backdrop';
    var box = document.createElement('div');
    box.className = 'lv-right-visibility-box lv-right-visibility-loading-box';
    box.innerHTML = '<div class="lv-right-visibility-head">' +
      '<div><p class="lv-modal-eyebrow">Right content visibility · ' + escapeHtml(VERSION) + '</p>' +
      '<h2>' + escapeHtml(content.title || content.fileName || content.id || '우측 콘텐츠') + '</h2>' +
      '<p>송출 매장 정보를 불러오는 중입니다...</p></div>' +
      '<button type="button" class="lv-modal-close" aria-label="닫기">×</button></div>' +
      '<div class="lv-visibility-loading-body"><strong>잠시만 기다려주세요.</strong><span>매장 목록, 단말기 상태, 콘텐츠 송출 범위를 확인하고 있습니다.</span></div>';
    modal.appendChild(backdrop);
    modal.appendChild(box);
    modal.style.display = 'block';
    backdrop.addEventListener('click', closeVisibilityModal);
    box.querySelector('.lv-modal-close').addEventListener('click', closeVisibilityModal);
  }


  function handleVisibilityTriggerEvent(ev, btn) {
    if (!btn) return false;
    try {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      }
    } catch (_) {}
    var now = Date.now();
    var last = Number(btn.getAttribute('data-lv-last-open-at') || '0');
    if (now - last < 500) return false;
    btn.setAttribute('data-lv-last-open-at', String(now));
    return true;
  }

  function handleVisibilityButtonClick(btn) {
    var content = findContentForVisibilityButton(btn);
    openVisibilityLoadingModal(content);
    Promise.resolve(loadVisibilityData(true)).then(function () {
      var fresh = findContentForVisibilityButton(btn) || content;
      openVisibilityModal(fresh);
    }).catch(function (error) {
      var modal = ensureVisibilityModalShell();
      modal.innerHTML = '<div class="lv-right-visibility-backdrop"></div><div class="lv-right-visibility-box"><div class="lv-right-visibility-head"><div><p class="lv-modal-eyebrow">Right content visibility · ' + escapeHtml(VERSION) + '</p><h2>송출 매장 정보를 불러오지 못했습니다</h2><p>' + escapeHtml(error && error.message || error || '알 수 없는 오류') + '</p></div><button type="button" class="lv-modal-close" aria-label="닫기">×</button></div></div>';
      modal.style.display = 'block';
      var backdrop = modal.querySelector('.lv-right-visibility-backdrop');
      var close = modal.querySelector('.lv-modal-close');
      if (backdrop) backdrop.addEventListener('click', closeVisibilityModal);
      if (close) close.addEventListener('click', closeVisibilityModal);
    });
  }

  function installDelegatedVisibilityClick() {
    if (window.__LV_RIGHT_VISIBILITY_DELEGATED_CLICK_V192__) return;
    window.__LV_RIGHT_VISIBILITY_DELEGATED_CLICK_V192__ = true;
    ['pointerdown', 'click'].forEach(function (eventName) {
      document.addEventListener(eventName, function (ev) {
        var target = ev.target;
        var btn = target && target.closest ? target.closest('.lv-right-visibility-btn') : null;
        if (!btn) return;
        if (handleVisibilityTriggerEvent(ev, btn)) handleVisibilityButtonClick(btn);
      }, true);
    });
  }

  function openVisibilityModal(content) {
    if (!state.stores.length || !state.devicesLoaded) {
      loadVisibilityData(false);
    }
    var target = getContentTarget(content);
    var rows = getTargetRows(content);
    var onlineCount = rows.filter(function (r) { return r.deviceOnline; }).length;
    var modeText = target.mode === 'selected' ? '선택 매장 송출' : '전체 매장 송출';
    var modal = document.getElementById('lv-right-visibility-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'lv-right-visibility-modal';
      modal.className = 'lv-right-visibility-modal';
      document.body.appendChild(modal);
    }
    modal.innerHTML = '';
    var backdrop = document.createElement('div');
    backdrop.className = 'lv-right-visibility-backdrop';
    var box = document.createElement('div');
    box.className = 'lv-right-visibility-box';
    var rowsHtml = rows.length ? rows.map(function (row) {
      return '<tr>' +
        '<td><strong>' + escapeHtml(row.name) + '</strong><em>' + escapeHtml(row.slug) + '</em></td>' +
        '<td>' + escapeHtml(row.appId || '-') + '</td>' +
        '<td>' + escapeHtml(row.storeStatus || '-') + '</td>' +
        '<td><span class="lv-tv-state ' + (row.deviceOnline ? 'online' : 'offline') + '">' + (row.deviceOnline ? 'ONLINE' : 'OFFLINE') + '</span></td>' +
        '<td>' + escapeHtml(row.lastSeen || row.offlineReason || '-') + '</td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="5" class="lv-empty-modal-row">표시할 매장 목록이 없습니다.</td></tr>';
    box.innerHTML = '<div class="lv-right-visibility-head">' +
      '<div><p class="lv-modal-eyebrow">Right content visibility · ' + escapeHtml(VERSION) + '</p>' +
      '<h2>' + escapeHtml(content.title || content.fileName || content.id || '우측 콘텐츠') + '</h2>' +
      '<p>' + escapeHtml(modeText) + ' · 대상 ' + rows.length + '곳 · 현재 ONLINE ' + onlineCount + '곳</p></div>' +
      '<button type="button" class="lv-modal-close" aria-label="닫기">×</button></div>' +
      '<div class="lv-right-visibility-stats"><span>송출 범위 <b>' + escapeHtml(targetSummary(content)) + '</b></span><span>온라인 <b>' + onlineCount + '/' + rows.length + '</b></span><span>콘텐츠 ID <b>' + escapeHtml(content.id || '-') + '</b></span></div>' +
      '<div class="lv-right-visibility-table-wrap"><table><thead><tr><th>매장</th><th>APP ID</th><th>매장 상태</th><th>TV 상태</th><th>마지막 접속/사유</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
      '<p class="lv-modal-help">표시는 “이 콘텐츠가 해당 매장의 playlist에 포함되는지” 기준입니다. 실제 재생 순간은 TV 로테이션 순서에 따라 달라질 수 있습니다.</p>';
    modal.appendChild(backdrop);
    modal.appendChild(box);
    modal.style.display = 'block';
    backdrop.addEventListener('click', closeVisibilityModal);
    box.querySelector('.lv-modal-close').addEventListener('click', closeVisibilityModal);
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
    if (!isStrictContentManagementPage()) return null;
    var cards = Array.from(document.querySelectorAll('main .form-card, main section, main div, .form-card, section, div'));
    for (var i = 0; i < cards.length; i++) {
      var el = cards[i];
      if (isInsideNavigation(el)) continue;
      var txt = textOf(el);
      if (txt.indexOf('새 전체화면 공지') >= 0 || txt.indexOf('공지 송출 방식') >= 0) continue;
      if (el.querySelector && el.querySelector('.content-form.upload-form') && txt.indexOf('새 콘텐츠 추가') >= 0) return closestByClass(el, 'form-card') || el;
    }
    var headings = Array.from(document.querySelectorAll('main h1, main h2, main h3, h1,h2,h3,strong,p,div'));
    for (var j = 0; j < headings.length; j++) {
      if (isInsideNavigation(headings[j])) continue;
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
    if (!isStrictContentManagementPage()) { removePanelIfOffPage(); return; }
    var card = findContentCard();
    if (!card) { removePanelIfOffPage(); return; }
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
    if (document.getElementById('lv-right-target-style-v192')) return;
    var style = document.createElement('style');
    style.id = 'lv-right-target-style-v192';
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

      .lv-right-visibility-card-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}
      .lv-right-visibility-pill{display:inline-flex;align-items:center;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8}
      .lv-right-visibility-pill.selected{background:#fff7ed;color:#c2410c;border-color:#fed7aa}
      .lv-right-visibility-btn{border:1px solid #cbd5e1;background:white;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:900;color:#0f172a;cursor:pointer}
      .lv-right-visibility-btn:hover{border-color:#2563eb;color:#1d4ed8;background:#f8fbff}
      .lv-right-visibility-modal{display:none;position:fixed;inset:0;z-index:100000}
      .lv-right-visibility-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.56);backdrop-filter:blur(2px)}
      .lv-right-visibility-box{position:relative;margin:6vh auto 0;width:min(980px,calc(100vw - 28px));max-height:86vh;overflow:hidden;background:white;border-radius:24px;box-shadow:0 30px 80px rgba(15,23,42,.35);border:1px solid #e2e8f0;display:flex;flex-direction:column}
      .lv-right-visibility-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:22px 24px 14px;border-bottom:1px solid #e2e8f0;background:linear-gradient(180deg,#f8fbff,#fff)}
      .lv-right-visibility-head h2{margin:2px 0 6px;font-size:22px;color:#0f172a}
      .lv-right-visibility-head p{margin:0;color:#64748b;font-size:13px}.lv-modal-eyebrow{font-size:11px!important;font-weight:900;color:#2563eb!important;text-transform:uppercase;letter-spacing:.04em}
      .lv-modal-close{border:0;background:#f1f5f9;color:#0f172a;border-radius:999px;width:34px;height:34px;font-size:24px;line-height:1;cursor:pointer;font-weight:800}.lv-modal-close:hover{background:#e2e8f0}
      .lv-right-visibility-stats{display:flex;gap:10px;flex-wrap:wrap;padding:12px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0}.lv-right-visibility-stats span{background:#fff;border:1px solid #e2e8f0;border-radius:999px;padding:8px 11px;color:#64748b;font-size:12px;font-weight:800}.lv-right-visibility-stats b{color:#0f172a}
      .lv-right-visibility-table-wrap{overflow:auto;padding:0 18px 18px}.lv-right-visibility-table-wrap table{width:100%;border-collapse:separate;border-spacing:0 8px;font-size:13px}.lv-right-visibility-table-wrap th{text-align:left;color:#64748b;font-size:12px;padding:8px}.lv-right-visibility-table-wrap td{background:#fff;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;padding:10px 8px;color:#0f172a}.lv-right-visibility-table-wrap td:first-child{border-left:1px solid #e2e8f0;border-radius:12px 0 0 12px}.lv-right-visibility-table-wrap td:last-child{border-right:1px solid #e2e8f0;border-radius:0 12px 12px 0}.lv-right-visibility-table-wrap strong{display:block}.lv-right-visibility-table-wrap em{display:block;font-style:normal;color:#64748b;font-size:11px;margin-top:2px}
      .lv-tv-state{display:inline-flex;border-radius:999px;padding:5px 8px;font-size:11px;font-weight:900}.lv-tv-state.online{background:#dcfce7;color:#166534}.lv-tv-state.offline{background:#fee2e2;color:#991b1b}.lv-empty-modal-row{text-align:center;color:#64748b!important;border:1px dashed #cbd5e1!important;border-radius:12px!important}.lv-modal-help{margin:0;padding:0 24px 20px;color:#64748b;font-size:12px}
      .lv-visibility-loading-body{padding:28px 24px 34px;display:flex;flex-direction:column;gap:8px;color:#475569}.lv-visibility-loading-body strong{font-size:18px;color:#0f172a}.lv-visibility-loading-body span{font-size:13px}.lv-right-visibility-loading-box{min-height:210px}
      .lv-right-target-loaded-badge{position:fixed;right:16px;bottom:16px;z-index:99999;background:#0f172a;color:#fff;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:900;box-shadow:0 10px 30px rgba(15,23,42,.25);opacity:.86;pointer-events:none}
    `;
    document.head.appendChild(style);
  }

  function ensureBadge() {
    if (document.getElementById('lv-right-target-loaded-badge')) return;
    var badge = document.createElement('div');
    badge.id = 'lv-right-target-loaded-badge';
    badge.className = 'lv-right-target-loaded-badge';
    badge.textContent = 'Right Target UI v1.9.5 로드됨';
    document.body.appendChild(badge);
    setTimeout(function () { try { badge.style.display = 'none'; } catch (_) {} }, 6000);
  }

  function bindSideChange() {
    var card = findContentCard();
    var select = findSideSelect(card);
    if (select && !select.dataset.lvTargetBoundV192) {
      select.dataset.lvTargetBoundV192 = '1';
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
    if (!isStrictContentManagementPage()) {
      removePanelIfOffPage();
      return;
    }
    bindSideChange();
    renderPanel(false);
    var card = findContentCard();
    if (card && isRightSelected(card)) loadStores(false);
    loadVisibilityData(false);
    decorateRightContentCards(false);
    decorateVisibleRightCardsFallback(false);
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
    installDelegatedVisibilityClick();
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
