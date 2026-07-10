// PWA 설치 프롬프트 캡처 — beforeinstallprompt 는 React 마운트 전에 발생할 수 있어
// 모듈 로드 시점(앱 진입 즉시)에 리스너를 걸어 이벤트를 보관한다.

let deferredPrompt = null;
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn(deferredPrompt));
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // 브라우저 기본 미니바 대신 우리 토스트로 안내
    deferredPrompt = e;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

/** 보관 중인 설치 프롬프트 이벤트 (없으면 null) */
export const getInstallPrompt = () => deferredPrompt;

/** 프롬프트 사용 후 소진 처리 (한 번 쓰면 재사용 불가) */
export const consumeInstallPrompt = () => {
  deferredPrompt = null;
  notify();
};

/** 프롬프트 상태 변경 구독 → 해제 함수 반환 */
export function onInstallPromptChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 이미 앱(스탠드얼론)으로 실행 중인지 */
export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

/** iOS Safari 여부 — beforeinstallprompt 미지원이라 수동 안내 필요 */
export const isIos = () =>
  /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
  (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
