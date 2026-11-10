# 노션 계정(워크스페이스) 변경 가이드

기존 노션 계정의 [식당 목록] / [입출금 이력] / [앱 접근 비밀번호] DB를 **새 노션 계정으로 옮기는** 절차입니다.
앱 화면 코드와 Worker 코드는 바뀌지 않고, **Worker가 바라보는 노션 토큰과 DB ID만** 교체됩니다.

```
기존: 사이트 → Worker → 노션(기존 계정)
변경: 사이트 → Worker → 노션(새 계정)      ← 토큰 + DB ID 만 교체
```

- 사이트 주소, Worker 주소(`VITE_API_BASE`), 웹푸시 구독은 **그대로**입니다 (재빌드·재배포 불필요).
- 사용자 브라우저에 저장된 영수증 이미지, 내 투표는 **그대로 유지**됩니다 (앱ID 보존).
- 기존 계정의 노션 데이터는 **읽기만** 하고 수정하지 않으므로 백업으로 남습니다.

---

## 1. 새 계정 준비 (5분)

1. 새 노션 계정에서 DB를 넣을 **상위 페이지**를 하나 만듭니다 (예: `RD센터야근식당이용가이드`)
2. 새 계정으로 https://www.notion.so/my-integrations → **New integration** 생성
   - 기능(Capabilities): 콘텐츠 읽기 / 업데이트 / 삽입 모두 체크(기본값)
   - **Internal Integration Secret**(새 토큰) 복사
3. 1번 페이지의 `⋯` → **연결(Connections)** → 방금 만든 Integration 연결
   (절차는 `NOTION_SYNC_SETUP.md` 1-4 참고)

## 2. 기존 토큰 확인

Worker에 등록된 시크릿은 다시 볼 수 없으므로, **기존 계정**으로 https://www.notion.so/my-integrations 에서
기존 Integration(`야근식당 프록시`)을 열어 Secret을 **Show → 복사**합니다.

## 3. 이관 스크립트 실행 (3분)

**간단한 방법 — 실행 파일 하나로 3~4단계 전체 진행** (토큰/링크를 물어보면 붙여넣기만 하면 됨):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\switch-notion-account.ps1
```

> 토큰은 **붙여넣기(Ctrl+V/우클릭) 후 엔터** — 화면에 안 보이는 게 정상입니다.
> 기존 토큰 → 새 토큰 순서로, **하나씩 복사해서** 붙여넣으세요 (같은 값을 두 번 넣으면 중단됨).

수동으로 단계별 실행하려면 프로젝트 루트에서 PowerShell (토큰을 `Read-Host` 로 입력하면 명령 히스토리에 남지 않습니다):

```powershell
$env:OLD_NOTION_TOKEN = Read-Host "기존 계정 토큰"
$env:NEW_NOTION_TOKEN = Read-Host "새 계정 토큰"
$env:NEW_PARENT_PAGE  = "1번에서 만든 페이지 URL"   # 노션 '링크 복사' 값 그대로

node scripts/migrate-notion-workspace.mjs --dry-run   # ① 점검만 (아무것도 안 바뀜)
node scripts/migrate-notion-workspace.mjs             # ② 실제 이관
```

스크립트가 하는 일:

1. 기존 DB 3개의 스키마와 데이터를 읽음
2. 새 상위 페이지 아래에 같은 이름·속성의 DB 3개 생성 (식당↔이력 relation 재연결)
3. 모든 행 복사 → 건수 검증
4. `worker/wrangler.toml` 의 `RESTAURANTS_DB_ID` / `TRANSACTIONS_DB_ID` / `PASSWORD_DB_ID` 를 새 값으로 교체

마지막에 **"확인이 필요한 항목"** 이 나오면 노션에서 직접 보완하세요. 자동 복사되지 않는 것:

| 항목 | 이유 | 영향 |
|---|---|---|
| 페이지 본문(행을 열었을 때의 내용) | 앱이 사용하지 않음 | 필요 시 수동 복사 |
| 수식(formula) 속성 | API 수식 형식 호환 문제 | 앱 미사용 — 노션 보기용이면 재작성 |
| 사람(people), 파일 첨부 속성 | 계정이 달라 이전 불가 | 앱 미사용 |
| status 타입 속성 | API로 생성 불가 | select 로 변환 (앱은 select 로 기록하므로 정상) |

## 4. Worker 토큰 교체 & 재배포 (2분)

```bash
cd worker
npx wrangler secret put NOTION_TOKEN   # 새 계정 토큰 붙여넣기
npx wrangler deploy                    # 바뀐 DB ID 반영
```

**wrangler 로그인이 안 될 때 — Cloudflare 대시보드에서 직접 변경**

https://dash.cloudflare.com → Workers & Pages → `rd-restaurant-notion-proxy` → Settings → Variables and Secrets 에서
아래 3개를 **편집(덮어쓰기)** 후 **Deploy** 한 번:

| 이름 | 값 |
|---|---|
| `NOTION_TOKEN` (Secret) | 새 계정 토큰 |
| `RESTAURANTS_DB_ID` | 스크립트가 출력한 새 값 (= 바뀐 `wrangler.toml` 값) |
| `TRANSACTIONS_DB_ID` | 〃 |

> 대시보드로 바꾼 경우에도 바뀐 `worker/wrangler.toml` 은 **반드시 커밋**하세요.
> 안 그러면 다음 `wrangler deploy` 때 예전 DB ID 로 되돌아갑니다.

> **순서 주의**: 3번(이관)과 4번(배포) 사이에 앱에서 등록한 충전/사용 내역은 기존 계정에만 기록됩니다.
> 사용이 적은 시간대에 진행하거나, 그 사이 등록분은 새 노션에 직접 추가하세요.

## 5. 확인

1. https://rd-restaurant.duckdns.org 접속 (Ctrl+F5) → 비밀번호 게이트가 **기존 비밀번호**로 통과되는지
2. 식당 목록/잔액이 이전과 같은지
3. 사용 등록 1건 → **새 계정** 노션 [입출금 이력]에 행이 생기는지
4. 문제가 있으면 `npx wrangler tail` 로 Worker 로그 확인

## 되돌리기

기존 계정 데이터는 그대로이므로, 아래만 되돌리면 즉시 원복됩니다.

```bash
git checkout worker/wrangler.toml        # 기존 DB ID 로 복구
cd worker
npx wrangler secret put NOTION_TOKEN     # 기존 계정 토큰
npx wrangler deploy
```

## 문제 해결

- **"새 상위 페이지에 접근할 수 없습니다"**: 새 Integration을 그 페이지에 연결했는지(1-3) 확인
- **"같은 제목의 DB가 이미 있습니다"**: 이전 실행이 중간에 실패한 흔적 — 새 페이지에서 해당 DB를 지우고 재실행
- **"기존 토큰으로 … 읽을 수 없습니다"**: 이미 이관해서 toml 이 바뀐 상태면 `git checkout worker/wrangler.toml` 후 재실행
- **`SELF_SIGNED_CERT_IN_CHAIN`**: 회사망 보안 프로그램이 HTTPS 를 검사하는 환경. 실행 파일은 자동 대응하며,
  수동 실행 시 먼저 `$env:NODE_OPTIONS = "--use-system-ca"` (Windows 인증서 저장소 사용 — 검사를 끄는 게 아님)
- **Cloudflare 로그인 화면 "There was a problem with verification"**: 브라우저/회사 PC 보안 문제인 경우가 많음.
  휴대폰(모바일 데이터)이나 다른 브라우저로 로그인해 위 "대시보드에서 직접 변경" 방법 사용

## 이관 기록

- 2026-11-10: 기존 계정 → 새 계정 "알디잇츠 데이터베이스" 페이지로 이관 (식당 8 / 이력 22).
  기존 계정 DB는 원본 백업으로 남아 있음 (기존 식당 DB `397a7720ae28800fbb25d4dd2236a29d`).
