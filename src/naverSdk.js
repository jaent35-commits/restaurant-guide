// 네이버 클라우드 플랫폼 Maps — JavaScript API v3 SDK 로더
// 인증: ncpKeyId (구 ncpClientId) — NCP 콘솔에서 발급받은 Client ID
// 스크립트: https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=...
export const NAVER_CLIENT_ID_STORAGE = "naver-map-client-id";

/** localStorage/환경변수에 등록된 네이버 지도 Client ID (없으면 빈 문자열) */
export function getNaverConfig() {
  try {
    return {
      clientId:
        localStorage.getItem(NAVER_CLIENT_ID_STORAGE) ||
        import.meta.env.VITE_NAVER_MAP_CLIENT_ID ||
        "",
    };
  } catch {
    return { clientId: import.meta.env?.VITE_NAVER_MAP_CLIENT_ID || "" };
  }
}

let sdkPromise = null;
let loadedFor = null;

/** 네이버 지도 JS API v3 SDK 동적 로드 */
export function loadNaverMaps({ clientId }) {
  if (!clientId) return Promise.reject(new Error("네이버 지도 Client ID가 없습니다."));

  // 이미 로드된 경우 재사용
  if (window.naver?.maps && loadedFor === clientId) return Promise.resolve(window.naver);

  // Client ID가 바뀌면 새로 로드
  if (loadedFor !== clientId) sdkPromise = null;
  if (sdkPromise) return sdkPromise;

  loadedFor = clientId;
  sdkPromise = new Promise((resolve, reject) => {
    // 동일 Client ID의 기존 스크립트가 있으면 재사용
    const existing = document.querySelector('script[data-naver-maps="true"]');
    const finish = () => {
      if (window.naver?.maps) resolve(window.naver);
      else {
        sdkPromise = null;
        reject(new Error("네이버 지도 SDK 초기화 실패 (Client ID/도메인 등록 확인)"));
      }
    };

    if (existing && window.naver?.maps) {
      resolve(window.naver);
      return;
    }

    const script = existing || document.createElement("script");
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`;
    script.async = true;
    script.dataset.naverMaps = "true";

    const timer = setTimeout(() => {
      sdkPromise = null;
      reject(new Error("네이버 지도 SDK 로드 시간 초과"));
    }, 10000);

    script.onload = () => {
      clearTimeout(timer);
      finish();
    };
    script.onerror = () => {
      clearTimeout(timer);
      sdkPromise = null;
      reject(new Error("네이버 지도 SDK 로드 실패 (Client ID/도메인 등록 확인)"));
    };

    if (!existing) document.head.appendChild(script);
  });
  return sdkPromise;
}
