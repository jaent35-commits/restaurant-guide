# 웹푸시 알림 설정 가이드

가게 등록 · 예치금 충전 · 사용 이력이 등록되면 알림을 켠 모든 팀원 기기에 푸시가 발송됩니다.
(작업을 등록한 본인 기기에는 보내지 않습니다.)

## 구성

```
[앱] 헤더 🔔 버튼 → 알림 권한 + 푸시 구독 → 워커 KV에 구독 저장
[앱] 가게/충전/사용 등록 → 워커가 노션 기록 후 → 모든 구독 기기에 푸시 발송
```

- 발송: Cloudflare Worker (`worker/webpush.js` — VAPID + aes128gcm 자체 구현, 외부 라이브러리 없음)
- 구독 저장소: Cloudflare KV (`PUSH_SUBS`)
- 수신: 서비스워커 `public/sw.js` 의 `push` / `notificationclick` 핸들러

## 최초 설정 (한 번만, worker 폴더에서)

1. **KV 네임스페이스 생성**

   ```bash
   npx wrangler kv namespace create PUSH_SUBS
   ```

   출력된 `id` 를 `wrangler.toml` 의 `[[kv_namespaces]]` → `id` 에 붙여넣기
   (현재 `REPLACE_WITH_KV_NAMESPACE_ID` 로 되어 있음)

2. **VAPID 개인키 등록** (공개키는 wrangler.toml 에 이미 있음)

   ```bash
   npx wrangler secret put VAPID_PRIVATE_KEY
   ```

   값 입력 프롬프트에 아래 키를 붙여넣기:

   ```
   P3jV38mRUsIqbGospmyF09g6Vkf_uImSByneacbFSLY
   ```

   > ⚠ 이 키는 이 파일과 wrangler secret 외에 다른 곳에 올리지 마세요.
   > 키를 새로 만들려면: 아래 명령 실행 후 공개키는 wrangler.toml, 개인키는 secret 에 등록
   >
   > ```bash
   > node -e "const{generateKeyPairSync}=require('crypto');const k=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({format:'jwk'});const b=s=>Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'),'base64');const p=Buffer.concat([Buffer.from([4]),b(k.x),b(k.y)]);console.log('PUBLIC=',p.toString('base64url'));console.log('PRIVATE=',k.d)"
   > ```

3. **워커 재배포**

   ```bash
   npx wrangler deploy
   ```

4. **프론트 재배포** (루트에서)

   ```bash
   npm run deploy
   ```

## 사용 방법

- 사이트 접속(HTTPS 배포 버전) → 헤더 오른쪽 **🔕 버튼** 클릭 → 알림 권한 허용 → 🔔 로 바뀌면 완료
- 다시 누르면 알림 꺼짐

## 참고 사항

- **iOS(아이폰)**: iOS 16.4 이상 + **홈 화면에 추가한 PWA에서만** 푸시 수신 가능. 홈 화면 진입 시 뜨는 설치 안내를 따라 설치 후 앱에서 알림을 켜세요.
- **로컬 dev 서버**: 서비스워커를 등록하지 않으므로(main.jsx) 푸시는 배포 버전에서만 동작합니다.
- 만료된 구독(앱 삭제 등)은 발송 시 404/410 응답을 받으면 KV에서 자동 삭제됩니다.
- 워커에 푸시 설정(KV·키)이 없어도 기존 노션 동기화는 그대로 동작합니다 (엔드포인트가 503만 반환).

## 새 엔드포인트 (worker)

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/push/public-key` | VAPID 공개키 조회 (미설정 시 `{ key: null }`) |
| POST | `/api/push/subscribe` | 구독 등록 `{ subscription }` |
| POST | `/api/push/unsubscribe` | 구독 해제 `{ endpoint }` |
