# 노션 계정 변경 — 한 번에 실행
#   1) 기존 노션 → 새 노션 계정으로 DB/데이터 복사 (기존 노션은 읽기만 함)
#   2) Cloudflare Worker 에 새 토큰 등록 + 새 DB ID 배포
# 실행: powershell -ExecutionPolicy Bypass -File scripts\switch-notion-account.ps1

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
# 회사망 보안 프로그램이 HTTPS 를 검사하는 환경(SELF_SIGNED_CERT_IN_CHAIN) 대응:
# Node/wrangler 가 Windows 인증서 저장소(브라우저와 동일)를 신뢰하도록 함 — 검사를 끄는 것이 아님
$env:NODE_OPTIONS = "--use-system-ca"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Read-Secret($prompt) {
  $secure = Read-Host $prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Stop-WithMessage($msg) {
  Write-Host "`n✘ $msg" -ForegroundColor Red
  Remove-Item Env:OLD_NOTION_TOKEN, Env:NEW_NOTION_TOKEN -ErrorAction SilentlyContinue
  Read-Host "`n엔터를 누르면 종료합니다"
  exit 1
}

Write-Host "=== 노션 계정 변경 ===" -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Stop-WithMessage "Node.js 가 필요합니다: https://nodejs.org 에서 설치 후 다시 실행하세요."
}

Write-Host "`n토큰은 붙여넣어도 화면에 보이지 않는 게 정상입니다."
$env:OLD_NOTION_TOKEN = Read-Secret "1) 기존 계정 Integration 토큰"
$env:NEW_NOTION_TOKEN = Read-Secret "2) 새 계정 Integration 토큰"
$env:NEW_PARENT_PAGE = (Read-Host "3) 새 계정 페이지 링크").Trim()

# ---------- 1단계: 점검 ----------
Write-Host "`n[1/4] 점검 중 (아무것도 바꾸지 않음)..." -ForegroundColor Cyan
node scripts/migrate-notion-workspace.mjs --dry-run
if ($LASTEXITCODE -ne 0) { Stop-WithMessage "점검 실패 — 위 메시지를 확인하세요." }

$answer = Read-Host "`n위 내용으로 새 계정에 복사할까요? (y/n)"
if ($answer -ne "y") { Stop-WithMessage "취소했습니다. 아무것도 바뀌지 않았습니다." }

# ---------- 2단계: 노션 복사 ----------
Write-Host "`n[2/4] 새 노션 계정으로 복사 중..." -ForegroundColor Cyan
node scripts/migrate-notion-workspace.mjs
if ($LASTEXITCODE -ne 0) { Stop-WithMessage "복사 실패 — 위 메시지를 확인하세요. (기존 노션은 그대로입니다)" }
Remove-Item Env:OLD_NOTION_TOKEN, Env:NEW_NOTION_TOKEN -ErrorAction SilentlyContinue

# ---------- 3단계: Cloudflare 토큰 교체 ----------
Set-Location (Join-Path $root "worker")
Write-Host "`n[3/4] Cloudflare 로그인 확인..." -ForegroundColor Cyan
$who = (npx --yes wrangler whoami 2>&1 | Out-String)
if ($who -match "not authenticated") {
  Write-Host "브라우저가 열리면 Cloudflare 로그인 후 허용(Allow)을 눌러주세요."
  npx --yes wrangler login
  if ($LASTEXITCODE -ne 0) { Stop-WithMessage "Cloudflare 로그인 실패" }
}

Write-Host "`n'Enter a secret value' 가 나오면 [새 계정 토큰]을 한 번 더 붙여넣고 엔터" -ForegroundColor Yellow
npx --yes wrangler secret put NOTION_TOKEN
if ($LASTEXITCODE -ne 0) { Stop-WithMessage "토큰 등록 실패" }

# ---------- 4단계: 새 DB ID 배포 ----------
Write-Host "`n[4/4] Cloudflare 배포 중..." -ForegroundColor Cyan
npx --yes wrangler deploy
if ($LASTEXITCODE -ne 0) { Stop-WithMessage "배포 실패 — 위 메시지를 확인하세요." }

Write-Host "`n✔ 완료! https://rd-restaurant.duckdns.org 에서 Ctrl+F5 후 확인하세요." -ForegroundColor Green
Write-Host "  - 비밀번호 게이트가 기존 비밀번호로 통과되는지"
Write-Host "  - 사용 등록 1건이 새 노션 [입출금 이력]에 생기는지"
Read-Host "`n엔터를 누르면 종료합니다"
