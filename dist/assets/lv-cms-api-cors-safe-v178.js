// LocalVision CMS v1.8.5 API Defensive Stability guard
// 목표: CMS 페이지를 여는 즉시 API를 1회 호출하고, 이후 호출은 CMS 화면/정해진 주기에 맡깁니다.
// 원칙: fetch 응답을 60초씩 붙잡아 화면을 멈추게 하지 않습니다. 실패 감지는 빠르게, 재연결 감지는 백그라운드로 처리합니다.
(function () {
  if (window.__LV_CMS_API_IMMEDIATE_V178__) return;
  window.__LV_CMS_API_IMMEDIATE_V178__ = true;

  var originalFetch = window.fetch.bind(window);
  var currentOrigin = window.location.origin;
  var pingTimer = null;
  var lastState = 'idle';

  function nowText() {
    try { return new Date().toLocaleTimeString('ko-KR', { hour12: false }); } catch (_) { return ''; }
  }

  function isApiUrl(input) {
    try {
      var raw = typeof input === 'string' ? input : (input && input.url) || '';
      var u = new URL(raw, currentOrigin);
      return u.pathname.indexOf('/api/') >= 0;
    } catch (_) { return false; }
  }

  function methodOf(init) {
    return String((init && init.method) || 'GET').toUpperCase();
  }

  function apiPathOf(input) {
    var u = toUrlObject(input);
    return u ? u.pathname : '';
  }

  function isCoreServerApi(path) {
    return path === '/api/ping' || path === '/api/health' || path === '/api/stores' || path === '/api/devices' || path === '/api/contents' || path === '/api/notices';
  }

  function isAuxApi(path) {
    return path === '/api/player-errors' || path === '/api/screenshots' || path === '/api/app-config' || path === '/api/playlist' || path === '/api/player-config' || path === '/api/backup';
  }

  function warnAuxApi(path, status) {
    if (!isAuxApi(path)) return;
    setBanner('checking', '서버는 확인 중입니다. 일부 기능 API 응답 확인 필요 · ' + path + ' · HTTP ' + status + ' · ' + nowText());
    setTimeout(function () { if (lastState === 'checking') setBanner('idle', ''); }, 3500);
  }

  function toUrlObject(input) {
    var raw = typeof input === 'string' ? input : (input && input.url) || '';
    try { return new URL(raw, currentOrigin); } catch (_) { return null; }
  }

  function withNoStore(init) {
    var merged = Object.assign({ cache: 'no-store' }, init || {});
    merged.headers = Object.assign({}, (init && init.headers) || {});
    return merged;
  }

  function cacheBust(input) {
    var u = toUrlObject(input);
    if (!u || u.pathname.indexOf('/api/') < 0) return input;
    u.searchParams.set('_lvts', String(Date.now()));
    return u.toString();
  }

  function currentOriginFallback(input) {
    var u = toUrlObject(input);
    if (!u || u.origin === currentOrigin || u.pathname.indexOf('/api/') < 0) return null;
    return currentOrigin + u.pathname + u.search + u.hash;
  }

  function ensureBanner() {
    var el = document.getElementById('lv-api-immediate-banner');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'lv-api-immediate-banner';
    el.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647',
      'max-width:380px', 'padding:12px 14px', 'border-radius:14px',
      'font:13px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
      'box-shadow:0 12px 32px rgba(0,0,0,.22)', 'display:none',
      'background:#111827', 'color:#fff', 'white-space:normal'
    ].join(';');
    el.innerHTML = '<strong style="display:block;margin-bottom:4px">LocalVision 서버 연결</strong>' +
      '<span data-lv-api-msg>API 확인 중입니다.</span>' +
      '<button data-lv-api-retry style="margin-top:8px;display:block;border:0;border-radius:8px;padding:7px 10px;background:#fff;color:#111827;font-weight:700;cursor:pointer">지금 다시 확인</button>';
    function mount() {
      if (document.body && !document.body.contains(el)) document.body.appendChild(el);
      var btn = el.querySelector('[data-lv-api-retry]');
      if (btn) btn.onclick = function () { immediateApiBoot('manual'); };
    }
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
    return el;
  }

  function setBanner(state, message) {
    lastState = state;
    var el = ensureBanner();
    var msg = el.querySelector('[data-lv-api-msg]');
    if (msg) msg.textContent = message || '';
    if (state === 'ok') {
      el.style.display = 'block';
      el.style.background = '#065f46';
      setTimeout(function () { if (lastState === 'ok') el.style.display = 'none'; }, 1800);
    } else if (state === 'checking') {
      el.style.display = 'block';
      el.style.background = '#92400e';
    } else if (state === 'down') {
      el.style.display = 'block';
      el.style.background = '#7f1d1d';
    } else {
      el.style.display = 'none';
    }
  }

  async function lightGet(path) {
    return originalFetch(currentOrigin + path + (path.indexOf('?') >= 0 ? '&' : '?') + '_lvts=' + Date.now(), withNoStore({ method: 'GET' }));
  }

  async function pingOnce() {
    try {
      var res = await lightGet('/api/ping');
      if (res && res.ok) return true;
    } catch (_) {}
    return false;
  }

  function startReconnectLoop(reason) {
    setBanner('down', '서버 재연결 대기 중 · ' + (reason || 'API 실패') + ' · ' + nowText());
    if (pingTimer) return;
    pingTimer = setInterval(async function () {
      var ok = await pingOnce();
      if (ok) {
        clearInterval(pingTimer);
        pingTimer = null;
        setBanner('ok', '서버가 다시 연결되었습니다. ' + nowText());
        window.dispatchEvent(new CustomEvent('localvision:api-reconnected', { detail: { at: Date.now() } }));
      }
    }, 60000);
  }

  // CMS 진입 즉시 서버/API를 가볍게 1회 확인합니다.
  // v1.8.2부터 첫 연결 확인은 /api/ping만 호출합니다.
  // /api/health, /api/stores는 React 화면이 실제로 필요할 때만 호출하게 두어 D1 503/과호출을 줄입니다.
  var lastBootCheckAt = 0;
  async function immediateApiBoot(reason) {
    var now = Date.now();
    if (reason !== 'manual' && now - lastBootCheckAt < 30000) return;
    lastBootCheckAt = now;
    setBanner('checking', 'CMS API ping 확인 중... ' + nowText());
    var ok = await pingOnce();
    if (ok) {
      setBanner('ok', 'API ping 정상 · ' + nowText());
      window.dispatchEvent(new CustomEvent('localvision:api-immediate-ok', { detail: { okCount: 1, reason: reason || 'boot' } }));
    } else {
      startReconnectLoop('ping 실패');
    }
  }

  window.fetch = async function (input, init) {
    if (!isApiUrl(input)) return originalFetch(input, init);
    var method = methodOf(init);
    var target = method === 'GET' ? cacheBust(input) : input;
    var options = withNoStore(init);

    try {
      var res = await originalFetch(target, options);
      if (res && res.ok) return res;

      var fallback = currentOriginFallback(input);
      if (method === 'GET' && fallback && (res.status === 404 || res.status >= 500)) {
        try {
          var fb = await originalFetch(cacheBust(fallback), options);
          if (fb && fb.ok) {
            setBanner('ok', 'API 주소를 현재 CMS 도메인으로 복구했습니다. ' + nowText());
            return fb;
          }
        } catch (_) {}
      }

      if (res.status >= 500) {
        var path = apiPathOf(input);
        if (isCoreServerApi(path)) {
          startReconnectLoop('HTTP ' + res.status);
        } else {
          warnAuxApi(path, res.status);
          // 보조 API 장애는 서버 전체 장애로 보지 않습니다. 실제 서버 상태는 /api/ping이 판단합니다.
          pingOnce().then(function (ok) {
            if (!ok) startReconnectLoop('ping 실패');
          });
        }
      }
      return res;
    } catch (error) {
      var fallback2 = currentOriginFallback(input);
      if (method === 'GET' && fallback2) {
        try {
          var fb2 = await originalFetch(cacheBust(fallback2), options);
          if (fb2 && fb2.ok) {
            setBanner('ok', 'API 주소를 현재 CMS 도메인으로 복구했습니다. ' + nowText());
            return fb2;
          }
        } catch (_) {}
      }
      var path2 = apiPathOf(input);
      if (isCoreServerApi(path2)) {
        startReconnectLoop(error && error.message);
      } else {
        warnAuxApi(path2, 'fetch');
        pingOnce().then(function (ok) {
          if (!ok) startReconnectLoop('ping 실패');
        });
      }
      throw error;
    }
  };

  window.LocalVisionCmsImmediateApiBoot = immediateApiBoot;

  // 즉시 1회 호출: DOM 상태와 무관하게 실행하고, visibility/focus 복귀 때도 한 번 확인합니다.
  immediateApiBoot('script-load');
  window.addEventListener('pageshow', function () { immediateApiBoot('pageshow'); });
  window.addEventListener('focus', function () { immediateApiBoot('focus'); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') immediateApiBoot('visible');
  });
})();
