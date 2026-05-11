$ErrorActionPreference = "Continue"
$base = "https://localvision-cms.pages.dev"
$store = "sininja"

$paths = @(
  "/api/ping",
  "/api/health",
  "/assets/lv-right-targets-v191.js",
  "/api/health?deep=1",
  "/api/devices",
  "/api/stores",
  "/api/contents",
  "/api/contents?store=_common&side=right",
  "/api/notices",
  "/api/notice-active?store=$store",
  "/api/player-errors?store=$store&limit=20",
  "/api/screenshots?store=$store",
  "/api/backup"
)

foreach ($p in $paths) {
  $url = $base + $p + ($(if ($p.Contains("?")) {"&"} else {"?"})) + "_t=" + [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
  Write-Host "`n============================="
  Write-Host $url
  Write-Host "============================="
  try {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $res = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
    $sw.Stop()
    Write-Host "STATUS:" $res.StatusCode
    Write-Host "TIME:" $sw.ElapsedMilliseconds "ms"
    Write-Host ($res.Content.Substring(0, [Math]::Min(1000, $res.Content.Length)))
  }
  catch {
    Write-Host "ERROR:"
    Write-Host $_.Exception.Message
    try {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $body = $reader.ReadToEnd()
      Write-Host "BODY:"
      Write-Host ($body.Substring(0, [Math]::Min(1000, $body.Length)))
    } catch {}
  }
}
