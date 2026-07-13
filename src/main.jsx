import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import "./installPrompt"; // beforeinstallprompt 를 앱 진입 즉시 캡처
import { refreshPushSubscription } from "./push";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// 렌더가 끝나면 초기 로딩 스플래시를 페이드아웃 후 제거
requestAnimationFrame(() => {
  const el = document.getElementById("app-loading");
  if (!el) return;
  el.style.opacity = "0";
  el.style.pointerEvents = "none";
  setTimeout(() => el.remove(), 350);
});

// PWA 서비스워커 등록 — 프로덕션 빌드에서만 (dev 는 HMR 과 충돌 방지)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(() => refreshPushSubscription()) // 기존 푸시 구독 서버 등록 갱신
      .catch(() => {/* 등록 실패(비보안 컨텍스트 등)는 앱 동작에 영향 없음 */});
  });
}
