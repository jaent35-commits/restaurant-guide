/**
 * 웹푸시 발송 모듈 — 외부 라이브러리 없이 Web Crypto 만으로 구현
 *   - VAPID 인증 (RFC 8292): ES256 JWT 서명
 *   - 페이로드 암호화 (RFC 8291): ECDH P-256 + HKDF + AES-128-GCM (aes128gcm)
 *
 * 필요 환경 변수:
 *   VAPID_PUBLIC_KEY   base64url 인코딩된 P-256 공개키 (raw, 65바이트)
 *   VAPID_PRIVATE_KEY  base64url 인코딩된 개인키 d 값 (32바이트)
 *   VAPID_SUBJECT      (선택) mailto:주소 — 푸시 서비스가 문제 시 연락할 곳
 */

const te = new TextEncoder();

/* ------------------------------ base64url 유틸 ------------------------------ */

export function b64uToBytes(s) {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm.length % 4 ? "=".repeat(4 - (norm.length % 4)) : "";
  const bin = atob(norm + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function bytesToB64u(buf) {
  let bin = "";
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

/* ------------------------------- VAPID (JWT) ------------------------------- */

async function vapidAuthHeader(env, endpoint) {
  const { protocol, host } = new URL(endpoint);
  const pub = b64uToBytes(env.VAPID_PUBLIC_KEY); // 0x04 || x(32) || y(32)
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64u(pub.slice(1, 33)),
    y: bytesToB64u(pub.slice(33, 65)),
    d: env.VAPID_PRIVATE_KEY,
  };
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const header = bytesToB64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64u(
    te.encode(
      JSON.stringify({
        aud: `${protocol}//${host}`,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: env.VAPID_SUBJECT || "mailto:admin@example.com",
      })
    )
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    te.encode(`${header}.${payload}`)
  );
  return `vapid t=${header}.${payload}.${bytesToB64u(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

/* --------------------------- 페이로드 암호화 (RFC 8291) --------------------------- */

async function hkdf(salt, ikm, info, byteLength) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    byteLength * 8
  );
  return new Uint8Array(bits);
}

async function encryptPayload(subscription, plaintext) {
  const uaPublic = b64uToBytes(subscription.keys.p256dh); // 65바이트
  const authSecret = b64uToBytes(subscription.keys.auth); // 16바이트

  // 발송용 임시(ephemeral) 키쌍 생성 → ECDH 공유 비밀
  const asKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256)
  );

  // IKM = HKDF(auth, ecdh, "WebPush: info" || 0x00 || ua_public || as_public)
  const keyInfo = concat(te.encode("WebPush: info\0"), uaPublic, asPublicRaw);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);

  // 레코드 = 평문 || 0x02 (마지막 레코드 구분자)
  const record = concat(te.encode(plaintext), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record)
  );

  // aes128gcm 헤더: salt(16) || record_size(4) || keyid_len(1) || keyid(as_public 65)
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(salt, recordSize, new Uint8Array([asPublicRaw.length]), asPublicRaw, ciphertext);
}

/* --------------------------------- 발송 --------------------------------- */

/**
 * 구독 1건에 푸시 발송.
 * @returns HTTP 상태코드 (404/410 이면 만료된 구독 → 저장소에서 제거해야 함)
 */
export async function sendWebPush(env, subscription, payload) {
  const body = await encryptPayload(subscription, payload);
  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthHeader(env, subscription.endpoint),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "normal",
    },
    body,
  });
  return res.status;
}
