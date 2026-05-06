# LocalVision CMS GitHub 업로드 자동 스크립트
# 사용법:
# 1) 이 ZIP을 C:\Users\pc\Desktop\LocalVision_CMS_CORE01_GITHUB_FIXED 에 압축해제
# 2) PowerShell을 열고 아래 실행:
#    cd C:\Users\pc\Desktop\LocalVision_CMS_CORE01_GITHUB_FIXED
#    powershell -ExecutionPolicy Bypass -File .\UPLOAD_TO_GITHUB.ps1

$ErrorActionPreference = "Stop"

$repoUrl = "https://github.com/1to75uni/localvision-cms.git"
$workRoot = "$env:USERPROFILE\Desktop\localvision-cms-upload-work"
$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "[1/6] 작업 폴더 초기화: $workRoot" -ForegroundColor Cyan
if (Test-Path $workRoot) { Remove-Item $workRoot -Recurse -Force }

Write-Host "[2/6] GitHub 저장소 clone" -ForegroundColor Cyan
git clone $repoUrl $workRoot

Write-Host "[3/6] 기존 파일 삭제(.git 제외)" -ForegroundColor Cyan
Set-Location $workRoot
Get-ChildItem -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force

Write-Host "[4/6] CMS 파일 복사: src/functions/database 폴더 구조 유지" -ForegroundColor Cyan
Get-ChildItem -Path $sourceRoot -Force | Where-Object { $_.Name -ne "UPLOAD_TO_GITHUB.ps1" } | ForEach-Object {
  Copy-Item $_.FullName -Destination $workRoot -Recurse -Force
}

Write-Host "[5/6] 구조 확인" -ForegroundColor Cyan
if (!(Test-Path "$workRoot\index.html")) { throw "index.html 없음" }
if (!(Test-Path "$workRoot\src\main.jsx")) { throw "src\main.jsx 없음" }
if (!(Test-Path "$workRoot\src\App.jsx")) { throw "src\App.jsx 없음" }
if (!(Test-Path "$workRoot\functions\api")) { throw "functions\api 폴더 없음" }
Write-Host "OK: index.html / src/main.jsx / src/App.jsx / functions/api 확인 완료" -ForegroundColor Green

git status --short

Write-Host "[6/6] commit & push" -ForegroundColor Cyan
git add -A
git commit -m "Fix CMS project folder structure for Cloudflare Pages"
git push origin main

Write-Host "완료: Cloudflare Pages에서 다시 Deploy 해주세요." -ForegroundColor Green
