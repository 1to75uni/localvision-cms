$base = "https://localvision-cms.pages.dev"

$urls = @(
  "/api/health",
  "/api/health?deep=1",
  "/api/app-config?id=lv001",
  "/api/devices?lite=1",
  "/api/player-state?store=sulak",
  "/api/player-state?store=googgimin",
  "/api/player-state?store=doljjajang",
  "/api/player-state?store=ogari",
  "/api/notice-active?store=sulak",
  "/api/black-mode?store=doljjajang",
  "/api/player-command?store=sulak",
  "/api/playlist-groups?store=sulak",
  "/api/playlist-schedules?store=sulak"
)

foreach ($u in $urls) {
  $join = $(if ($u.Contains("?")) {"&"} else {"?"})
  $url = $base + $u + $join + "_t=" + [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
  Write-Host "`n==== $url ====" -ForegroundColor Cyan
  try {
    $res = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 25
    Write-Host "HTTP $($res.StatusCode)" -ForegroundColor Green
    $txt = $res.Content
    $txt.Substring(0, [Math]::Min(1800, $txt.Length))
  } catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
  }
}

Write-Host "`n==== app-config playerUrl parameter check ====" -ForegroundColor Yellow
try {
  $app = Invoke-RestMethod "$base/api/app-config?id=lv001&_t=$([DateTimeOffset]::Now.ToUnixTimeMilliseconds())"
  $app.playerUrl
  $must = @("heartbeat=600000", "commandPoll=600000", "noticePollMs=600000", "blackModePollMs=600000", "playerStatePoll=600000", "contentCheck=600000", "appConfigPoll=1800000")
  foreach ($m in $must) {
    if ($app.playerUrl -like "*$m*") { Write-Host "OK $m" -ForegroundColor Green }
    else { Write-Host "MISSING $m" -ForegroundColor Red }
  }
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
}
