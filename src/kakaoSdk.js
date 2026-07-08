// 카카오맵 JavaScript SDK 로더 + 주소 지오코딩
// KakaoMap 컴포넌트(지도 표시)와 geo.js(주소→좌표 변환)가 함께 사용하므로 별도 모듈로 분리
export const KAKAO_KEY_STORAGE = "kakao-map-appkey";

let sdkPromise = null;

/** localStorage/환경변수에 등록된 카카오맵 JavaScript 키 (없으면 빈 문자열) */
export function getKakaoAppKey() {
  try {
    return localStorage.getItem(KAKAO_KEY_STORAGE) || import.meta.env.VITE_KAKAO_MAP_KEY || "";
  } catch {
    return "";
  }
}

/**
 * 카카오맵 SDK 동적 로드 (1회) — autoload=false 후 kakao.maps.load 콜백 대기
 * services 라이브러리(주소 검색/지오코딩)를 포함해서 로드한다
 */
export function loadKakaoSdk(appKey) {
  if (window.kakao?.maps?.services) return Promise.resolve(window.kakao);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
      appKey
    )}&autoload=false&libraries=services`;
    const timer = setTimeout(() => {
      sdkPromise = null;
      reject(new Error("카카오맵 SDK 로드 시간 초과"));
    }, 10000);
    script.onload = () => {
      clearTimeout(timer);
      if (!window.kakao?.maps) {
        sdkPromise = null;
        reject(new Error("카카오맵 SDK 초기화 실패"));
        return;
      }
      window.kakao.maps.load(() => resolve(window.kakao));
    };
    script.onerror = () => {
      clearTimeout(timer);
      sdkPromise = null;
      reject(new Error("카카오맵 SDK 로드 실패 (앱 키/도메인 확인)"));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

/**
 * 카카오 로컬 API 기반 주소 → 위경도 지오코딩 (appKey 필요)
 * 국내 상세 도로명주소(건물명 포함) 인식률이 OpenStreetMap 보다 훨씬 높다.
 * 실패(키 없음/SDK 로드 실패/검색결과 없음) 시 null 반환
 */
export function geocodeWithKakao(address, appKey) {
  if (!appKey || !address) return Promise.resolve(null);
  return loadKakaoSdk(appKey)
    .then(
      (kakao) =>
        new Promise((resolve) => {
          const geocoder = new kakao.maps.services.Geocoder();
          geocoder.addressSearch(address, (result, status) => {
            if (status === kakao.maps.services.Status.OK && result?.[0]) {
              resolve({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x) });
            } else {
              resolve(null);
            }
          });
        })
    )
    .catch(() => null);
}
