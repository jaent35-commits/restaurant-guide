// 브이월드(VWorld) Open API 2.0 — 국토교통부 국가공간정보포털(www.vworld.kr)
// 지도(2D Map API 2.0) SDK 로더 + 주소검색(지오코딩) API
//
// ⚠ 인증키/도메인은 www.vworld.kr 에서 발급/등록해야 하며, 발급받은 인증키는 등록한
//   도메인에서만 동작한다(등록 도메인은 프로토콜/슬래시 없이 "호스트:포트" 형식 권장).
// ⚠ 지도 JS 초기화 옵션(vw.ol3.Map 생성자 등)은 브이월드 공식 예제 코드 기준으로 작성했다.
//   실제 키 발급 후 브라우저 콘솔 에러가 뜨면 알려달라 — 옵션명을 문서 기준으로 바로 잡겠다.
// ⚠ 지도 SDK(<script> 태그 로드)는 CORS 영향을 받지 않지만, 아래 주소검색 REST API는
//   브라우저 직접 호출 시 CORS 에러가 난다 — 개발 서버 프록시(vite.config.js)로 우회한다.
export const VWORLD_KEY_STORAGE = "vworld-api-key";
export const VWORLD_DOMAIN_STORAGE = "vworld-domain";

/** localStorage/환경변수에 등록된 브이월드 인증키·도메인 (없으면 빈 문자열) */
export function getVWorldConfig() {
  try {
    return {
      key: localStorage.getItem(VWORLD_KEY_STORAGE) || import.meta.env.VITE_VWORLD_KEY || "",
      domain: localStorage.getItem(VWORLD_DOMAIN_STORAGE) || import.meta.env.VITE_VWORLD_DOMAIN || "",
    };
  } catch {
    return { key: "", domain: "" };
  }
}

let sdkPromise = null;
let loadedFor = null; // 마지막으로 로드 시도한 "key:domain" — 값이 바뀌면 스크립트를 다시 로드

/** 브이월드 2D 지도 API 2.0 JS SDK 동적 로드 (key/domain 조합이 바뀌면 재로드) */
export function loadVWorldSdk({ key, domain }) {
  const tag = `${key}::${domain}`;
  if (window.vw?.ol3 && loadedFor === tag) return Promise.resolve(window.vw);

  if (loadedFor !== tag) {
    sdkPromise = null; // 키/도메인이 바뀌면 이전 로드 결과를 무시하고 새로 로드
  }
  if (sdkPromise) return sdkPromise;

  loadedFor = tag;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://map.vworld.kr/js/vworld.js?service=map&request=getmap&key=${encodeURIComponent(
      key
    )}&domain=${encodeURIComponent(domain)}`;
    const timer = setTimeout(() => {
      sdkPromise = null;
      reject(new Error("브이월드 지도 SDK 로드 시간 초과"));
    }, 10000);
    script.onload = () => {
      clearTimeout(timer);
      if (!window.vw?.ol3) {
        sdkPromise = null;
        reject(new Error("브이월드 지도 SDK 초기화 실패 (인증키/도메인 등록 확인)"));
        return;
      }
      resolve(window.vw);
    };
    script.onerror = () => {
      clearTimeout(timer);
      sdkPromise = null;
      reject(new Error("브이월드 지도 SDK 로드 실패 (인증키/도메인 등록 확인)"));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

// 브이월드 주소검색 REST API 는 Access-Control-Allow-Origin 헤더를 내려주지 않아
// 브라우저에서 직접 fetch 하면 CORS 에러가 난다. 개발 중에는 Vite 프록시(vite.config.js
// 의 /vworld-api)를 거쳐 우회하고, 프로덕션 빌드에서는 동일한 프록시가 배포 환경에도
// 구성되어 있어야 한다(없으면 이 호출은 실패하고 OpenStreetMap 으로 폴백된다).
const VWORLD_API_BASE = import.meta.env.DEV ? "/vworld-api" : "https://api.vworld.kr";

/**
 * 브이월드 주소검색 API 2.0 — 주소 → 위경도
 * 도로명주소(road)로 먼저 시도하고, 실패하면 지번주소(parcel)로 재시도한다.
 * 실패 시 null 반환
 */
export async function geocodeWithVWorld(address, key) {
  if (!key || !address) return null;

  for (const type of ["road", "parcel"]) {
    try {
      const url =
        `${VWORLD_API_BASE}/req/address?service=address&request=getcoord&version=2.0` +
        `&crs=epsg:4326&address=${encodeURIComponent(address)}&refine=true&simple=false` +
        `&format=json&type=${type}&key=${encodeURIComponent(key)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) continue;
      const data = await res.json();
      const point = data?.response?.result?.point;
      if (data?.response?.status === "OK" && point) {
        const lat = parseFloat(point.y);
        const lng = parseFloat(point.x);
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
      }
    } catch {
      // 다음 주소 타입으로 재시도
    }
  }
  return null;
}
