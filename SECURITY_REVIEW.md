# 보안 점검 · 취약점 분석 보고서

**대상 프로젝트**: RD센터 야근식당 이용가이드 (알디잇츠)
**구성**: React 18 + Vite PWA(프론트엔드) + Cloudflare Worker(노션 동기화 프록시 / 웹푸시)
**점검일**: 2026-07-13
**점검 범위**: `src/**`(프론트엔드), `worker/**`(백엔드), `public/sw.js`, 빌드/저장소 설정
**방법**: 소스 정적 분석, 데이터 흐름 추적, 의존성 감사(`npm audit`), 저장소 위생 점검

> ⚠️ 이 보고서는 **분석 및 권고** 문서입니다. 아래 개선 코드는 제안이며, 실제 반영은 승인 후 진행합니다.
> (이번 작업에서 함께 수행한 코드 표준화/정리 내역은 마지막 [부록 B](#부록-b-이번-표준화정리-작업에서-이미-반영한-사항)에 정리했습니다.)

---

## 1. 요약

| 심각도 | 건수 | 주요 항목 |
|--------|------|-----------|
| 🔴 High | 3 | 무인증 쓰기 API, 저장형 XSS, CORS 전체 허용 |
| 🟠 Medium | 5 | 개인정보 무인증 노출, 입력 검증 부재, 스키마 변경 무방비, 속도 제한 부재, 오류 원문 노출 |
| 🟡 Low | 4 | dev 의존성 취약점, node_modules 커밋, dist 커밋 불일치, 영수증 평문 저장 |
| ⚪ Info | 3 | 지도 키 도메인 제한, VAPID 설정, .env 관리 |

**가장 시급한 조치**: 백엔드 Worker가 **인증 없이 누구나** 식당/거래 데이터를 생성·수정·삭제하고 전체 구독자에게 푸시를 보낼 수 있는 구조입니다(S-01). 이 하나가 다른 위험(XSS 주입 경로, 개인정보 노출, 푸시 스팸)의 공통 진입점이므로 **최우선 해결**을 권합니다.

---

## 2. 취약점 상세

### 🔴 S-01. 백엔드 쓰기 API 인증 부재 (Broken Access Control)

- **위치**: `worker/index.js` L233-235, 전체 라우트
- **현황**: `API_KEY`는 선택값이며 현재 미설정(`.env.production`에 "현재 미사용" 명시). 따라서 아래 검사가 사실상 통과됩니다.

```js
// worker/index.js
if (env.API_KEY && request.headers.get("X-Api-Key") !== env.API_KEY) {
  return json(env, { error: "unauthorized" }, 401);
}
```

- **영향**: Worker 주소(`https://rd-restaurant-notion-proxy.<...>.workers.dev`)만 알면 누구나
  - `POST /api/restaurants`, `POST/PUT/DELETE /api/transactions` 로 노션 DB의 식당·거래를 **생성/변조/삭제**
  - 매 생성마다 **전체 구독 기기에 푸시 발송**(스팸/피싱 문구 주입 가능)
  - `POST /api/setup` 으로 노션 DB **스키마 변경**
- **재현**: 브라우저 콘솔/`curl` 로 인증 헤더 없이 `POST /api/transactions` 요청 → 정상 처리됨.
- **심각도**: **High** (무결성·가용성 직접 훼손, 노출 즉시 악용 가능)
- **개선안**:
  1. 최소한 공유 비밀키 방식을 **활성화**: Worker에 `API_KEY` secret 등록(`npx wrangler secret put API_KEY`) + 프론트 `VITE_API_KEY` 설정. *단, SPA에 박힌 키는 완전한 보호가 아니므로 아래 2를 병행.*
  2. 사내 앱 성격에 맞게 **Cloudflare Access**(사내 SSO/이메일 도메인 `@daekyo.co.kr` 제한) 또는 Turnstile을 Worker 앞단에 두는 방식을 권장.
  3. 쓰기 엔드포인트에 **Origin/Referer 검증**을 추가(아래 S-03과 함께).

---

### 🔴 S-02. 저장형 XSS — 식당명이 지도 마커 HTML로 무이스케이프 주입

- **위치**: `src/components/NaverMap.jsx`(`markerHtml`), `src/components/OsmMap.jsx`(`markerHtml`), `src/components/KakaoMap.jsx`(`markerElement`, `el.innerHTML`)
- **현황**: 식당 `name`을 이스케이프 없이 마커 HTML 문자열에 삽입합니다.

```js
// NaverMap.jsx (동일 패턴이 OsmMap/KakaoMap 에도 존재)
return `
  <div class="map-marker ...">
    <div class="map-marker__icon">${restaurantIcon(r)}</div>
    <div class="map-marker__label">
      <strong>${r.name}</strong>   <!-- ← 무이스케이프 -->
      ${balance}
    </div>
  </div>`;
```

- **영향**: S-01(무인증 쓰기)과 결합 시, 공격자가 식당명을 `<img src=x onerror="...">` 형태로 등록 → 지도를 여는 **모든 사용자 브라우저에서 임의 스크립트 실행**(세션·localStorage 탈취, 푸시 구독 조작 등). 인증을 걸어도 내부 사용자에 의한 자기증식/실수 위험은 남습니다.
- **심각도**: **High**
- **개선안**: 마커 HTML 생성 시 사용자 입력값(`name` 등)을 이스케이프. 공용 유틸 추가 권장:

```js
// src/utils.js 에 추가
export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
```

```js
// 각 마커 생성부에서
<strong>${escapeHtml(r.name)}</strong>
```

  - `restaurantIcon(r)`은 고정 이모지 집합이라 상대적으로 안전하지만, 일관성을 위해 라벨 텍스트 계열은 모두 이스케이프 적용을 권장합니다.

---

### 🔴 S-03. CORS 전체 허용 (`Access-Control-Allow-Origin: *`)

- **위치**: `worker/index.js` L41, `worker/wrangler.toml`(`ALLOWED_ORIGIN = "*"`)
- **현황**: 기본값이 `*` 이라 임의 웹사이트에서 이 API를 호출할 수 있습니다. S-01(무인증)과 겹쳐 위험이 증폭됩니다.
- **심각도**: **High**(단독으로는 Medium이나 무인증과 결합해 상향)
- **개선안**: 배포 도메인으로 제한.

```toml
# worker/wrangler.toml
ALLOWED_ORIGIN = "https://rd-restaurant.duckdns.org"
```

  - 필요 시 다중 오리진 허용 로직으로 확장(요청 `Origin`이 허용 목록에 있을 때만 반사).

---

### 🟠 S-04. 개인정보 무인증 노출 (`GET /api/data`)

- **위치**: `worker/index.js` `GET /api/data`
- **현황**: 인증 없이 전체 식당/거래를 반환. 거래의 `user` 필드에 **직원 실명**("안재광, 김동국..." 등)과 금액·일자가 포함되어 있어 공개 노출 시 개인정보 문제가 됩니다.
- **심각도**: **Medium** (개인정보/기밀성)
- **개선안**: S-01 인증을 읽기 엔드포인트에도 적용. 사내 접근 통제(Cloudflare Access) 하에 두는 것을 권장.

---

### 🟠 S-05. 입력 검증·크기 제한 부재, 경로 파라미터 신뢰

- **위치**: `worker/index.js` `restaurantProps`/`transactionProps`, `PUT/DELETE .../:pageId`
- **현황**:
  - 클라이언트가 보낸 필드를 대부분 그대로 노션 속성으로 매핑(타입/범위 검증 최소).
  - `pageId`를 URL 경로에서 그대로 노션 API로 전달 — 통합(Integration)에 공유된 임의 페이지를 대상으로 조작 가능(권한 범위 내 IDOR 성격).
  - 금액(`amount`), `balanceAfter` 등 숫자에 상·하한/정합성 검증 없음.
- **심각도**: **Medium**
- **개선안**:
  - 각 엔드포인트에 스키마 검증(필수 필드/타입/길이/숫자 범위) 추가. `rt()`가 1900자 슬라이스는 하지만, 서버단에서 명시적 검증·거부 로직 권장.
  - `pageId`가 대상 DB 소속인지 확인(생성 시 저장한 매핑과 대조) 후 처리.

---

### 🟠 S-06. `POST /api/setup` 무인증 — 스키마 변경 가능

- **위치**: `worker/index.js` `POST /api/setup`
- **현황**: 누구나 호출 시 노션 DB에 속성 추가(PATCH) 가능. 반복 호출은 안전하지만 무인증 스키마 조작 경로가 열려 있음.
- **심각도**: **Medium**
- **개선안**: 인증 필수화 + 관리자 전용 경로로 격리(또는 배포 스크립트에서 1회만 실행).

---

### 🟠 S-07. 요청 속도 제한(Rate limiting) 부재

- **위치**: Worker 전역
- **현황**: 무제한 호출 가능 → 푸시 스팸, 노션 API 쿼터 소진, DB 대량 오염 가능.
- **심각도**: **Medium**
- **개선안**: Cloudflare Rate Limiting Rules 또는 Worker 내 KV/Durable Objects 기반 카운터로 IP/엔드포인트별 제한. 푸시 발송 경로는 특히 엄격히.

---

### 🟠 S-08. 오류 응답에 내부 원문 노출

- **위치**: `worker/index.js` L411 `catch (e) { return json(env, { error: String(e.message || e) }, 500); }`
- **현황**: 노션 API 오류 메시지 등 내부 정보가 클라이언트로 그대로 반환될 수 있음(정보 누출).
- **심각도**: **Medium→Low**
- **개선안**: 사용자에겐 일반 메시지("일시적 오류")만 반환, 상세는 `console.error`로 서버 로그에만 기록.

---

### 🟡 S-09. node_modules가 git에 커밋됨  → **이번 작업에서 조치 완료**

- **현황(점검 시)**: `node_modules/` 3,630개 파일이 추적 중이었음(.gitignore에는 등재). 의존성 변조 시 눈에 안 띄고, 저장소 비대·리뷰 방해.
- **조치**: `git rm -r --cached node_modules` 로 추적 해제(디스크 파일은 유지). 커밋 시 반영됩니다.
- **심각도**: Low(위생/공급망 가시성)

---

### 🟡 S-10. dist 산출물 커밋과 .gitignore 불일치

- **현황**: `.gitignore`에 `dist/`가 있으나 빌드 산출물이 저장소에 추적됨. 배포는 `gh-pages -d dist`(별도 브랜치)로 이뤄지므로 main 브랜치의 dist 추적은 불필요·혼동 유발.
- **심각도**: Low
- **개선안**: `git rm -r --cached dist` 로 추적 해제(배포 파이프라인은 영향 없음). *배포 방식 확인 후 진행 권장 — 그래서 이번엔 자동 반영하지 않았습니다.*

---

### 🟡 S-11. 개발 의존성 취약점 (esbuild / vite)

- **현황**: `npm audit` 결과 2건(1 moderate + 1 high). 내용은 esbuild 개발 서버가 임의 사이트의 요청을 받을 수 있는 이슈(GHSA-67mh-4wv8-2f99). **프로덕션 번들에는 영향 없음**, `npm audit --omit=dev`는 0건.
- **심각도**: Low(개발 환경 한정)
- **개선안**: 여유 있을 때 `vite`를 취약점 패치 버전으로 상향(메이저 변경 수반 가능 → 회귀 테스트 필요). 급하지 않음.

---

### 🟡 S-12. 영수증 이미지의 평문 localStorage 저장

- **위치**: `src/store.jsx`(`extrasRef.receipts`), `src/components/FileInput.jsx`
- **현황**: 영수증 이미지를 dataURL로 기기 localStorage에 저장(서버 미전송 — 설계상 의도). 공용/분실 기기에서는 재무 증빙이 평문으로 남을 수 있음.
- **심각도**: Low
- **개선안**: 민감도 낮으면 현행 유지 가능. 필요 시 저장 만료/삭제 기능, 공용 기기 경고 안내 추가.

---

### ⚪ S-13 ~ S-15. 정보성 항목

- **S-13 지도 클라이언트 키**: `wrangler.toml`의 `VAPID_PUBLIC_KEY`, `VITE_NAVER_MAP_CLIENT_ID`는 본래 공개되는 값. 다만 네이버 Client ID는 **NCP 콘솔의 웹 서비스 URL 허용목록**으로 반드시 도메인 제한할 것(무제한이면 타 사이트 도용 가능).
- **S-14 VAPID_SUBJECT**: 실제 연락처(`mailto:eunji_heo@daekyo.co.kr`)로 설정됨 — 양호.
- **S-15 .env 관리**: `.env.production`은 git 미추적(‌`.gitignore`에서 `.env.*` 제외, `.env.example`만 추적) — 양호. 실제 시크릿(NOTION_TOKEN, VAPID_PRIVATE_KEY)은 Worker secret으로만 보관 중 — 양호.

---

## 3. 개선 우선순위 로드맵

| 순위 | 항목 | 조치 | 난이도 |
|------|------|------|--------|
| 1 | S-01 무인증 쓰기 | Cloudflare Access(사내 도메인) 또는 API_KEY 활성화 | 중 |
| 2 | S-03 CORS | `ALLOWED_ORIGIN`을 배포 도메인으로 제한 | 하 |
| 3 | S-02 저장형 XSS | 마커 라벨에 `escapeHtml` 적용 | 하 |
| 4 | S-04/S-06 무인증 읽기·스키마 | 인증 범위를 전체 엔드포인트로 확대 | 하 |
| 5 | S-05 입력 검증 | 엔드포인트별 스키마 검증 추가 | 중 |
| 6 | S-07 속도 제한 | Cloudflare Rate Limiting 규칙 | 하 |
| 7 | S-08 오류 노출 | 일반 메시지 반환 + 서버 로그 분리 | 하 |
| 8 | S-10/S-11 위생 | dist 추적 해제, dev 의존성 상향 | 하 |

빠른 효과 대비 비용이 낮은 **2·3·4·6·7**을 1차 스프린트로, 인증 설계(**1·5**)를 별도 스프린트로 잡는 것을 권합니다.

---

## 부록 A. 점검 근거 (검증 실행)

- `npm run build` → 성공(프론트 번들 정상 생성).
- `npm audit` → dev 2건(moderate/high, esbuild/vite), `--omit=dev` → 0건.
- `eslint .` → 오류 0 / 경고 12(대부분 react-hooks v7 신규 규칙·미사용 catch 바인딩, 기능 위험 아님).
- 저장소: node_modules 추적 파일 3,630 → 0(해제 완료).

## 부록 B. 이번 표준화/정리 작업에서 이미 반영한 사항

> 아래는 보안 항목과 별개로, 요청하신 "소스 표준화·정리·주석·품질 검사"에서 실제 반영한 변경입니다.

- **Prettier 도입**: `.prettierrc.json`(printWidth 100, 기존 스타일 유지), `.prettierignore` 추가. `src`·`worker` 전체 포맷 표준화. 의도적으로 압축한 데이터 배열(시드/아이콘/좌표)은 `// prettier-ignore`로 가독성 보존.
- **ESLint 도입**: `eslint.config.js`(flat config) 추가 — 프론트/서비스워커/Worker 환경 분리. 기존 `lint` 스크립트가 설정 부재로 동작 불가했던 문제 해결. `format`/`format:check` 스크립트 추가.
- **중복 제거(DRY)**: `HomePage.jsx`의 로컬 `getIcon`/`formatMoney`를 공용 `utils`의 `restaurantIcon`/`formatKRW`로 통합(다른 페이지와 아이콘·금액 표기 일관화, 사용자 지정 아이콘도 반영).
- **저장소 위생**: 커밋되어 있던 `node_modules` 추적 해제, 잔여 `vite.config.js.timestamp-*.mjs` 정리 시도(일부 OS 잠금으로 미삭제 — .gitignore로 무시됨).
- **의존성 명시**: `package.json` devDependencies에 eslint/prettier 및 플러그인 고정.

_남은 lint 경고(12건)_는 기능 위험이 아닌 개선 여지(효과 내 setState, ref 동기화 패턴, 미사용 catch 바인딩)로, 동작 보존을 위해 이번엔 경고 수준으로만 노출했습니다. 원하시면 후속 리팩터링으로 정리할 수 있습니다.
