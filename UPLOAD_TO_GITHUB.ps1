$ErrorActionPreference = "Stop"
$repoUrl = "https://github.com/1to75uni/localvision-cms.git"
$work = "$env:USERPROFILE\Desktop\localvision-cms-upload-work"

Write-Host "[1/6] 작업 폴더 초기화: $work"
if (Test-Path $work) { Remove-Item $work -Recurse -Force }

Write-Host "[2/6] GitHub 저장소 clone"
git clone $repoUrl $work

Write-Host "[3/6] 기존 파일 삭제(.git 제외)"
Get-ChildItem $work -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force

Write-Host "[4/6] 새 CMS 파일 복사"
$src = Split-Path -Parent $MyInvocation.MyCommand.Path
Copy-Item "$src\*" $work -Recurse -Force

Write-Host "[5/6] commit"
Set-Location $work
git add -A
git commit -m "Deploy CMS v1.8.3 content sync field log"

Write-Host "[6/6] push"
git push origin main
Write-Host "완료: Cloudflare Pages 배포 로그를 확인하세요."
