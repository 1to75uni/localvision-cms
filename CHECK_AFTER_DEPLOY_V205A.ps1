$base = "https://localvision-cms.pages.dev"

Write-Host "==== health ====" -ForegroundColor Cyan
Invoke-RestMethod "$base/api/health?_t=$([DateTimeOffset]::Now.ToUnixTimeMilliseconds())" | ConvertTo-Json -Depth 8

Write-Host "`n==== app-config lv001 ====" -ForegroundColor Cyan
Invoke-RestMethod "$base/api/app-config?id=lv001&_t=$([DateTimeOffset]::Now.ToUnixTimeMilliseconds())" | ConvertTo-Json -Depth 8

Write-Host "`n==== devices lite online status ====" -ForegroundColor Cyan
$data = Invoke-RestMethod "$base/api/devices?lite=1&_t=$([DateTimeOffset]::Now.ToUnixTimeMilliseconds())"
$data.devices |
  Sort-Object online, lastSeenSecondsAgo -Descending |
  Select-Object store, name, online, lastSeenAgo, lastSeenSecondsAgo, onlineTtlSec, app, deviceCode, offlineReason |
  Format-Table -AutoSize

Write-Host "`n정상 기준: lastSeenSecondsAgo <= onlineTtlSec 이면 CMS UI에서도 ONLINE으로 보여야 합니다." -ForegroundColor Green
