// LocalVision CMS v1.7.5 API retry guard
// 목적: CMS 첫 접속 시 /api/health, /api/stores 등 API가 순간 실패해도 5분 동안 멈춰 보이지 않게 짧게 재시도합니다.
(function () {
  if (window.__LV_CMS_API_RETRY_V175__) return;
  window.__LV_CMS_API_RETRY_V175__ = true;
  var originalFetch = window.fetch.bind(window);
  var API_RE = /\/api\//;
  var delays = [0, 3000, 10000, 30000];

  function shouldRetry(input, init) {
    try {
      var method = String((init && init.method) || 'GET').toUpperCase();
      if (method !== 'GET') return false;
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      return API_RE.test(url);
    } catch (e) {
      return false;
    }
  }

  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  window.fetch = async function (input, init) {
    if (!shouldRetry(input, init)) return originalFetch(input, init);
    var lastError = null;
    for (var i = 0; i < delays.length; i += 1) {
      if (delays[i]) await sleep(delays[i]);
      try {
        var merged = Object.assign({ cache: 'no-store' }, init || {});
        merged.headers = Object.assign({ 'cache-control': 'no-store' }, (init && init.headers) || {});
        var res = await originalFetch(input, merged);
        if (res.ok) return res;
        lastError = new Error('HTTP ' + res.status);
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('LocalVision API retry failed');
  };
})();
