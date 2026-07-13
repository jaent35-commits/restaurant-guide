# 노션 동기화 설정 가이드

야근식당 가이드 앱이 **노션을 원본 DB로** 사용하도록 하는 설정 절차입니다.
구조: `사이트(정적) → Cloudflare Worker(프록시) → 노션 API`

모든 기기가 같은 노션 데이터를 보게 되고, 앱에서 등록한 충전/사용 내역이
노션 [입출금 이력] DB에, 식당 정보가 [식당 목록] DB에 실시간 기록됩니다.

> 영수증 이미지와 좋아요 "내 투표" 표시는 개인정보/용량 문제로
> 각 기기의 브라우저에만 저장됩니다 (v1 설계).

---

## 1. 노션 Integration 토큰 발급 (5분)

1. https://www.notion.so/my-integrations 접속 → **New integration**
2. 이름: `야근식당 프록시` (아무거나), 워크스페이스 선택 → 생성
3. **Internal Integration Secret** 복사 (`ntn_...` 또는 `secret_...`) — 절대 코드/깃에 넣지 마세요
4. 만든 Integration을 페이지에 연결 (아래 상세 절차)

### 1-4 상세: Integration을 페이지에 연결하는 방법

Integration은 만들기만 해서는 아무 페이지도 읽지 못합니다.
**어떤 페이지를 보여줄지 페이지 쪽에서 직접 허용**해줘야 하며, 그 절차가 "연결"입니다.

1. 노션 앱/웹에서 **[RD센터야근식당이용가이드] 페이지**를 엽니다
   (사이드바 > 개인 페이지(Private) 목록에 있음)
2. 페이지 **우측 상단의 `⋯` (점 3개) 버튼**을 클릭합니다
3. 열린 메뉴를 아래로 스크롤해 **`연결(Connections)`** 항목을 찾습니다
   - 메뉴 버전에 따라 `연결 항목 관리`, `Add connections` 로 표시되기도 합니다
   - 항목 위에 마우스를 올리면 오른쪽으로 하위 메뉴가 펼쳐집니다
4. 검색창에 1-2에서 만든 Integration 이름(예: `야근식당 프록시`)을 입력하고 목록에서 클릭합니다
   - 목록에 안 보이면: Integration을 만든 계정/워크스페이스가 현재 노션 워크스페이스와 같은지 확인하세요
5. **"~에 접근 권한을 부여하시겠습니까?"** 확인 창이 뜨면 **확인(Confirm)** 을 클릭합니다
6. 연결 완료 확인: 같은 `⋯` 메뉴의 연결(Connections) 목록에 Integration 이름이 표시되면 성공입니다

> **왜 페이지 하나만 연결하나요?** 노션 연결 권한은 하위 페이지·DB에 자동 상속됩니다.
> [RD센터야근식당이용가이드] 페이지에 연결하면 그 안의 [식당 목록], [입출금 이력] DB까지
> 함께 접근할 수 있게 되므로 DB마다 따로 연결할 필요가 없습니다.
> (반대로, DB를 나중에 페이지 **밖으로** 옮기면 권한이 끊기니 주의)

## 2. Cloudflare Worker 배포 (10분)

1. https://dash.cloudflare.com 무료 가입 (이미 있으면 생략)
2. 터미널에서:

   ```bash
   cd worker
   npx wrangler login          # 브라우저로 Cloudflare 로그인
   npx wrangler secret put NOTION_TOKEN   # 1번에서 복사한 토큰 붙여넣기
   npx wrangler deploy
   ```

   > **`wrangler login`에서 "You are logged in with an API Token" 오류가 나면?**
   > 환경 변수 `CLOUDFLARE_API_TOKEN`이 이미 설정되어 있어 **로그인이 필요 없는 상태**입니다.
   > `login`은 건너뛰고 바로 다음 명령(`secret put`, `deploy`)을 실행하면 됩니다.
   > 굳이 브라우저(OAuth) 로그인으로 바꾸고 싶다면 PowerShell에서
   > `Remove-Item Env:CLOUDFLARE_API_TOKEN` 실행 후 다시 `npx wrangler login` 하세요.
   >
   > `secret put NOTION_TOKEN`에서 `Enter a secret value:` 프롬프트가 나오면
   > 1번에서 복사한 `ntn_...` 토큰을 붙여넣고 Enter — 입력값은 화면에 표시되지 않는 게 정상입니다.

3. 배포가 끝나면 출력되는 주소를 메모:
   `https://rd-restaurant-notion-proxy.<계정>.workers.dev`

   > **`<계정>`이란?** Cloudflare 가입 시 자동 배정되는 내 계정의 **workers.dev 서브도메인**입니다
   > (직접 정하는 값이 아니에요). `npx wrangler deploy`가 성공하면 마지막 줄에
   > `Deployed ... https://rd-restaurant-notion-proxy.xxxx.workers.dev` 처럼 **완성된 주소가 그대로 출력**되므로,
   > 그 전체 URL을 복사해서 쓰면 됩니다. 나중에 다시 확인하려면
   > Cloudflare 대시보드 → Workers & Pages → rd-restaurant-notion-proxy 에서 볼 수 있습니다.

> DB ID는 `worker/wrangler.toml`에 이미 넣어 두었습니다.
> 보안을 높이려면 `ALLOWED_ORIGIN`을 사이트 주소로 바꾸세요.

## 3. 사이트 빌드 & 배포 (5분)

1. 프로젝트 루트에 `.env.production` 파일 생성:

   ```
   VITE_API_BASE=https://rd-restaurant-notion-proxy.<계정>.workers.dev
   ```

   - `<계정>` 부분은 직접 채우는 게 아니라, **2-3단계에서 `wrangler deploy`가 출력한
     전체 주소를 그대로** 붙여넣으면 됩니다 (예: `VITE_API_BASE=https://rd-restaurant-notion-proxy.eunji-heo.workers.dev`)

2. 빌드 & 배포:

   ```bash
   npm run deploy    # build 후 gh-pages 브랜치로 배포
   ```

## 4. 확인

1. https://rd-restaurant.duckdns.org 접속 (강력 새로고침 Ctrl+F5)
2. 첫 로드 시 자동으로:
   - 노션 DB에 누락 속성(가는 길, 메모, 쿠폰, 좋아요/싫어요, 앱ID, 앱데이터)이 추가되고
   - 노션의 식당/이력 데이터가 화면에 표시됩니다
3. 앱에서 **사용 등록** 한 건 입력 → 노션 [입출금 이력]에 새 행이 생기고
   [식당 목록]의 현재 잔액/상태가 갱신되는지 확인
4. 노션에서 직접 수정한 값은 **다음 새로고침 때** 앱에 반영됩니다

---

## 동작 방식 요약

| 항목 | 저장 위치 |
|---|---|
| 식당 정보, 충전/사용 이력, 좋아요 수 | 노션 (모든 기기 공유) |
| 영수증 이미지, 내가 누른 투표 표시 | 브라우저 localStorage (기기별) |
| 오프라인/워커 장애 시 | 마지막 데이터로 계속 동작, 콘솔에 경고 |

- 노션 기록 실패는 화면을 막지 않습니다 (콘솔 `[노션 동기화 실패]` 경고).
- `VITE_API_BASE`를 비우고 빌드하면 이전처럼 localStorage 단독 모드로 돌아갑니다.

## 문제 해결

- **401 unauthorized**: 워커에 `API_KEY` 시크릿을 설정했다면 `.env.production`에 `VITE_API_KEY`도 설정
- **Notion ... 404**: Integration이 페이지에 연결됐는지(1-4단계) 확인
- **CORS 오류**: `wrangler.toml`의 `ALLOWED_ORIGIN` 값 확인 후 재배포
- 워커 로그 실시간 확인: `npx wrangler tail`
