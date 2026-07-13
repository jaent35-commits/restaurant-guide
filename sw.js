/* 서비스워커 — 앱 셸 캐시로 오프라인/재방문 속도 대응
   전략: 같은 출처 GET 은 네트워크 우선 + 캐시 백업, 내비게이션 실패 시 index.html 폴백.
   크로스오리진(OSM 지도 타일 등)은 브라우저 기본 동작에 맡긴다. */
const CACHE = "restaurant-guide-v2";
const CORE = ["./", "./index.html", "./manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ------------------------------- 웹푸시 ------------------------------- */
/* 워커가 보내는 페이로드: { title, body, tag, url? } */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "🌙 야근식당", {
      body: data.body || "",
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      tag: data.tag || undefined,
      data: { url: data.url || "./" },
    })
  );
});

/* 알림 클릭 → 열려 있는 앱 창 포커스, 없으면 새로 열기 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      return clients.openWindow(event.notification.data?.url || "./");
    })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() =>
        caches.match(request).then(
          (cached) => cached || (request.mode === "navigate" ? caches.match("./index.html") : undefined)
        )
      )
  );
});
