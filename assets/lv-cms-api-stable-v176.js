// LocalVision CMS v1.7.8 CORS SAFE + UI POLISH guard
// 목적: CMS 첫 접속/운영 중 Cloudflare Functions, D1, R2, 브라우저 캐시의 순간 지연으로
//       서버 연결 전 상태가 오래 유지되는 문제를 줄입니다.
(function () {
  if (window.__LV_CMS_API_STABLE_V178__) return;
  window.__LV_CMS_API_STABLE_V178__ = true;

  var originalFetch = window.fetch.bind(window);
  var API_RE = /\/api\//;
  var RETRY_DELAYS = [0, 1500, 3000, 10000, 30000, 60000];
  var pingTimer = null;
  var lastState = 'unknown';
  var lastMessage = '';
  var currentOrigin = window.location.origin;

  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  function nowText() {
    try { return new Date().toLocaleTimeString('ko-KR', { hour12: false }); } catch (_) { return ''; }
  }

  function isApiUrl(input) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      return API_RE.test(url);
    } catch (_) { return false; }
  }

  function methodOf(init) {
    return String((init && init.method) || 'GET').toUpperCase();
  }

  function toUrlObject(input) {
    var raw = typeof input === 'string' ? input : (input && input.url) || '';
    try { return new URL(raw, currentOrigin); } catch (_) { return null; }
  }

  function withNoStore(input, init) {
    var merged = Object.assign({ cache: 'no-store' }, init || {});
    merged.headers = Object.assign({}, (init && init.headers) || {});
    return merged;
  }

  function withCacheBust(input) {
    var u = toUrlObject(input);
    if (!u) return input;
    if (!u.pathname.includes('/api/')) return input;
    if (!u.searchParams.has('_lvts')) u.searchParams.set('_lvts', String(Date.now()));
    return u.toString();
  }

  function currentOriginFallback(input) {
    var u = toUrlObject(input);
    if (!u || u.origin === currentOrigin || !u.pathname.includes('/api/')) return null;
    return currentOrigin + u.pathname + u.search + u.hash;
  }

  function ensureBanner() {
    var el = document.getElementById('lv-api-stable-banner');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'lv-api-stable-banner';
    el.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647',
      'max-width:360px', 'padding:12px 14px', 'border-radius:14px',
      'font:13px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
      'box-shadow:0 12px 32px rgba(0,0,0,.22)', 'display:none',
      'background:#111827', 'color:#fff', 'white-space:normal'
    ].join(';');
    el.innerHTML = '<strong style="display:block;margin-bottom:4px">서버 연결 확인 중</strong>' +
      '<span data-lv-api-msg>잠시 후 자동으로 다시 연결합니다.</span>' +
      '<button data-lv-api-reload style="margin-top:8px;display:block;border:0;border-radius:8px;padding:7px 10px;background:#fff;color:#111827;font-weight:700;cursor:pointer">지금 다시 연결</button>';
    document.addEventListener('DOMContentLoaded', function () {
      if (!document.body.contains(el)) document.body.appendChild(el);
      var btn = el.querySelector('[data-lv-api-reload]');
      if (btn) btn.onclick = function () { window.location.reload(); };
    });
    if (document.body && !document.body.contains(el)) document.body.appendChild(el);
    return el;
  }

  function setState(state, message) {
    lastState = state;
    lastMessage = message || '';
    var el = ensureBanner();
    var msg = el.querySelector('[data-lv-api-msg]');
    if (msg) msg.textContent = lastMessage;
    if (state === 'ok') {
      el.style.display = 'block';
      el.style.background = '#065f46';
      setTimeout(function () {
        if (lastState === 'ok') el.style.display = 'none';
      }, 2500);
    } else if (state === 'retry' || state === 'down') {
      el.style.display = 'block';
      el.style.background = state === 'down' ? '#7f1d1d' : '#92400e';
    } else {
      el.style.display = 'none';
    }
  }

  async function safePingOnce() {
    try {
      var res = await originalFetch(currentOrigin + '/api/ping?_lvts=' + Date.now(), withNoStore(null, { method: 'GET' }));
      if (res && res.ok) {
        setState('ok', '서버가 다시 연결되었습니다. ' + nowText());
        return true;
      }
    } catch (_) {}
    return false;
  }

  function startReconnectLoop(reason) {
    setState('down', '서버 재연결 중... 마지막 오류: ' + String(reason || 'API 실패') + ' · ' + nowText());
    if (pingTimer) return;
    pingTimer = setInterval(async function () {
      var ok = await safePingOnce();
      if (ok) {
        clearInterval(pingTimer);
        pingTimer = null;
        window.dispatchEvent(new CustomEvent('localvision:api-reconnected', { detail: { at: Date.now() } }));
      }
    }, 60000);
  }

  async function tryFetchOnce(input, init) {
    var target = methodOf(init) === 'GET' ? withCacheBust(input) : input;
    return originalFetch(target, withNoStore(target, init));
  }

  window.fetch = async function (input, init) {
    if (!isApiUrl(input)) return originalFetch(input, init);
    var method = methodOf(init);
    var canRetry = method === 'GET';
    if (!canRetry) {
      try {
        var writeRes = await originalFetch(input, withNoStore(input, init));
        if (writeRes.ok) return writeRes;
        if (writeRes.status >= 500) startReconnectLoop('HTTP ' + writeRes.status);
        return writeRes;
      } catch (e) {
        startReconnectLoop(e && e.message);
        throw e;
      }
    }

    var lastError = null;
    for (var i = 0; i < RETRY_DELAYS.length; i += 1) {
      if (RETRY_DELAYS[i]) {
        setState('retry', 'API 재시도 중... ' + Math.round(RETRY_DELAYS[i] / 1000) + '초 대기 · ' + nowText());
        await sleep(RETRY_DELAYS[i]);
      }
      try {
        var res = await tryFetchOnce(input, init);
        if (res.ok) {
          if (lastState === 'retry' || lastState === 'down') setState('ok', 'API 연결이 복구되었습니다. ' + nowText());
          return res;
        }
        lastError = new Error('HTTP ' + res.status);
        // 다른 apiBase가 남아있어 실패한 경우, 현재 CMS 도메인 기준으로 한 번 더 시도합니다.
        var fallback = currentOriginFallback(input);
        if (fallback && (res.status === 404 || res.status === 0 || res.status >= 500)) {
          var fbRes = await tryFetchOnce(fallback, init);
          if (fbRes.ok) {
            setState('ok', 'API 주소를 현재 CMS 도메인으로 자동 복구했습니다. ' + nowText());
            return fbRes;
          }
        }
      } catch (e) {
        lastError = e;
        var fallback2 = currentOriginFallback(input);
        if (fallback2) {
          try {
            var fbRes2 = await tryFetchOnce(fallback2, init);
            if (fbRes2.ok) {
              setState('ok', 'API 주소를 현재 CMS 도메인으로 자동 복구했습니다. ' + nowText());
              return fbRes2;
            }
          } catch (_) {}
        }
      }
    }
    startReconnectLoop(lastError && lastError.message);
    throw lastError || new Error('LocalVision API retry failed');
  };

  // 첫 진입 때 가벼운 ping을 먼저 태워, 서버가 살아있는지 빠르게 확인합니다.
  safePingOnce();
})();
