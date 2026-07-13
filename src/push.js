// 웹푸시 구독 헬퍼 — 가게 등록/충전/사용 알림 수신용
// 흐름: 알림 권한 요청 → 서비스워커 pushManager 구독 → 워커(KV)에 구독 등록
import {
  apiEnabled,
  fetchPushPublicKey,
  apiPushSubscribe,
  apiPushUnsubscribe,
  getSavedPushEndpoint,
  savePushEndpoint,
} from "./api";

/** base64url 문자열 → Uint8Array (applicationServerKey 용) */
function urlBase64ToUint8Array(base64) {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export const pushSupported = () =>
  apiEnabled && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function getRegistration() {
  // 서비스워커는 프로덕션에서만 등록됨 (main.jsx) — 없으면 null
  const reg = await navigator.serviceWorker.getRegistration();
  return reg || null;
}

/** 현재 상태: "unsupported" | "denied" | "on" | "off" */
export async function getPushStatus() {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await getRegistration();
  if (!reg) return "off";
  const sub = await reg.pushManager.getSubscription();
  return sub ? "on" : "off";
}

/** 알림 켜기 — 성공 시 구독 객체 반환, 실패 시 Error throw */
export async function enablePush() {
  if (!pushSupported()) throw new Error("이 브라우저는 푸시 알림을 지원하지 않습니다.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("알림 권한이 허용되지 않았습니다.");

  const reg = await getRegistration();
  if (!reg) throw new Error("서비스워커가 아직 등록되지 않았습니다. (배포 버전에서 사용 가능)");

  const { key } = await fetchPushPublicKey();
  if (!key) throw new Error("서버에 푸시가 아직 설정되지 않았습니다.");

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }
  await apiPushSubscribe(sub.toJSON());
  savePushEndpoint(sub.endpoint);
  return sub;
}

/** 알림 끄기 — 브라우저 구독 해지 + 서버 등록 삭제 */
export async function disablePush() {
  const reg = await getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  const endpoint = sub?.endpoint || getSavedPushEndpoint();
  if (sub) await sub.unsubscribe();
  if (endpoint) await apiPushUnsubscribe(endpoint).catch(() => {});
  savePushEndpoint("");
}

/** 앱 시작 시 — 이미 권한이 있고 구독돼 있으면 서버 등록을 조용히 갱신 */
export async function refreshPushSubscription() {
  try {
    if (!pushSupported() || Notification.permission !== "granted") return;
    const reg = await getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await apiPushSubscribe(sub.toJSON());
      savePushEndpoint(sub.endpoint);
    }
  } catch (e) {
    // 갱신 실패는 치명적이지 않음
  }
}
