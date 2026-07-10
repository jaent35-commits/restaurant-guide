// 노션 동기화 API 클라이언트 — Cloudflare Worker 프록시 호출
// VITE_API_BASE 가 설정되어 있지 않으면 동기화가 꺼지고 기존 localStorage 모드로만 동작한다.

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
const API_KEY = import.meta.env.VITE_API_KEY || "";

export const apiEnabled = !!API_BASE;

/* 이 기기의 푸시 구독 엔드포인트 — 서버가 "작업한 기기"에는 푸시를 안 보내도록 식별용 */
const PUSH_ENDPOINT_KEY = "rnd-restaurant-guide-push-endpoint";
export const getSavedPushEndpoint = () => {
  try {
    return localStorage.getItem(PUSH_ENDPOINT_KEY) || "";
  } catch (e) {
    return "";
  }
};
export const savePushEndpoint = (endpoint) => {
  try {
    if (endpoint) localStorage.setItem(PUSH_ENDPOINT_KEY, endpoint);
    else localStorage.removeItem(PUSH_ENDPOINT_KEY);
  } catch (e) {
    // 저장 실패는 무시 (푸시 제외 대상 식별만 못 할 뿐)
  }
};

async function call(method, path, body) {
  const sender = getSavedPushEndpoint();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { "X-Api-Key": API_KEY } : {}),
      ...(sender ? { "X-Push-Sender": sender } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API ${method} ${path} 실패 (${res.status})`);
  return data;
}

/** 노션에서 전체 데이터 로드 */
export const fetchData = () => call("GET", "/api/data");

/** 노션 DB 스키마 보정 (누락 속성 추가) — 앱 시작 시 1회 시도해도 안전 */
export const setupSchema = () => call("POST", "/api/setup");

/** 식당 생성 → { notionId } */
export const apiCreateRestaurant = (restaurant) =>
  call("POST", "/api/restaurants", { restaurant });

/** 식당 전체 갱신 */
export const apiUpdateRestaurant = (notionId, restaurant) =>
  call("PUT", `/api/restaurants/${notionId}`, { restaurant });

/** 거래 생성 → { notionId } */
export const apiCreateTransaction = ({ transaction, balanceAfter, title, restaurantPageId }) =>
  call("POST", "/api/transactions", { transaction, balanceAfter, title, restaurantPageId });

/** 거래 수정 */
export const apiUpdateTransaction = (notionId, { transaction, balanceAfter, title, restaurantPageId }) =>
  call("PUT", `/api/transactions/${notionId}`, { transaction, balanceAfter, title, restaurantPageId });

/** 거래 삭제 (노션에서는 아카이브) */
export const apiDeleteTransaction = (notionId, { balanceAfter, restaurantPageId }) =>
  call("DELETE", `/api/transactions/${notionId}`, { balanceAfter, restaurantPageId });

/* ------------------------------- 웹푸시 ------------------------------- */

/** VAPID 공개키 조회 — 서버에 푸시 미설정 시 { key: null } */
export const fetchPushPublicKey = () => call("GET", "/api/push/public-key");

/** 푸시 구독 등록 */
export const apiPushSubscribe = (subscription) =>
  call("POST", "/api/push/subscribe", { subscription });

/** 푸시 구독 해제 */
export const apiPushUnsubscribe = (endpoint) =>
  call("POST", "/api/push/unsubscribe", { endpoint });
