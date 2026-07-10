import { useEffect, useState } from "react";

// 실제 좌표(위경도) 관련 상수/유틸
// 대교타워 주소 — 실좌표는 useTowerGeo() 로 지오코딩해서 사용한다
export const TOWER_ADDRESS = "서울시 관악구 보라매로3길 23";
// 지오코딩 실패/오프라인 시에만 쓰는 폴백(근사) 좌표
export const TOWER = { lat: 37.4901, lng: 126.9208 };

/** 시드 식당의 실좌표 폴백 (지오코딩 전/실패 시 임시로 쓰는 근사값) */
export const SEED_GEO = {
  r_jopro: { lat: 37.4928, lng: 126.9245 },
  r_hakju: { lat: 37.4922, lng: 126.9172 },
  r_katsu: { lat: 37.4885, lng: 126.9214 },
  r_jimmy: { lat: 37.4908, lng: 126.923 },
  r_gureum: { lat: 37.4878, lng: 126.9185 },
};

/**
 * SVG 약도 좌표(뷰박스 1000x640, 타워 500,320) → 위경도 근사 변환
 * 주소가 없는 식당의 지도 표시용 폴백(정확하지 않음 — address 입력 시 지오코딩으로 대체됨)
 */
export function svgToGeo({ x = 500, y = 320 } = {}) {
  return {
    lat: TOWER.lat - (y - 320) * 0.0000115, // y 아래쪽 = 남쪽
    lng: TOWER.lng + (x - 500) * 0.0000145,
  };
}

/* -----------------------------------------------------------------------------
   주소 → 위경도 지오코딩
   OpenStreetMap Nominatim (무료/키 불필요) 사용
----------------------------------------------------------------------------- */
const GEOCODE_CACHE_KEY = "rnd-geocode-cache-v3";

function readGeocodeCache() {
  try {
    return JSON.parse(localStorage.getItem(GEOCODE_CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeGeocodeCache(cache) {
  try {
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // 저장 실패는 치명적이지 않으므로 무시
  }
}

async function geocodeWithNominatim(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=kr&q=${encodeURIComponent(
      query
    )}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const rows = await res.json();
    const hit = Array.isArray(rows) ? rows[0] : null;
    if (!hit) return null;

    const lat = parseFloat(hit.lat);
    const lng = parseFloat(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

export async function geocodeAddress(address) {
  const query = (address || "").trim();
  if (!query) return null;

  const cache = readGeocodeCache();
  if (cache[query]) return cache[query];

  const geo = await geocodeWithNominatim(query);
  if (!geo) return null;

  cache[query] = geo;
  writeGeocodeCache(cache);
  return geo;
}

/** 한국 영역의 위경도인지 대략 검증(잘못 뒤바뀐 값/오탐 방지) */
function isKoreaLatLng(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 33 &&
    lat <= 39 &&
    lng >= 124 &&
    lng <= 132
  );
}

/**
 * 지도 공유 링크(구글/네이버/카카오 등)에 박혀 있는 위경도를 직접 추출한다.
 * 좌표가 URL 에 없으면(단축 링크 등) null 을 반환한다.
 */
export function parseCoordsFromUrl(url) {
  const u = (url || "").trim();
  if (!u) return null;

  const tryPair = (a, b) => {
    // (lat,lng) 또는 (lng,lat) 두 순서 모두 시도
    const n1 = parseFloat(a);
    const n2 = parseFloat(b);
    if (isKoreaLatLng(n1, n2)) return { lat: n1, lng: n2 };
    if (isKoreaLatLng(n2, n1)) return { lat: n2, lng: n1 };
    return null;
  };

  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/, // 구글: @lat,lng
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // 구글 상세: !3dlat!4dlng
    /[?&#/]c=(-?\d+\.\d+),(-?\d+\.\d+)/, // 네이버: c=lng,lat
    /[?&](?:lat|y)=(-?\d+\.\d+)[^]*?[?&](?:lng|lon|x)=(-?\d+\.\d+)/i,
    /[?&](?:lng|lon|x)=(-?\d+\.\d+)[^]*?[?&](?:lat|y)=(-?\d+\.\d+)/i,
    /(-?\d{2}\.\d{3,})[,\s/]+(-?\d{2,3}\.\d{3,})/, // 일반 "lat,lng" 쌍
  ];

  for (const re of patterns) {
    const m = u.match(re);
    if (m) {
      const hit = tryPair(m[1], m[2]);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * 식당 좌표 해석 — 우선순위:
 *  1) 입력한 주소(address) → 지오코딩
 *  2) 위치 링크(locationUrl) 안에 박힌 좌표 추출
 *  3) 링크가 URL 이 아니라 주소 텍스트면 → 지오코딩
 */
export async function resolveRestaurantCoords({ address, locationUrl } = {}) {
  const addr = (address || "").trim();
  if (addr) {
    const geo = await geocodeAddress(addr);
    if (geo) return geo;
  }

  const url = (locationUrl || "").trim();
  if (url) {
    const fromUrl = parseCoordsFromUrl(url);
    if (fromUrl) return fromUrl;
    // 링크 형태가 아니면 주소 텍스트로 간주해 지오코딩 시도
    if (!/^https?:\/\//i.test(url)) {
      const geo = await geocodeAddress(url);
      if (geo) return geo;
    }
  }
  return null;
}

/**
 * 대교타워 실좌표 훅 — 최초 렌더는 근사값(TOWER)으로 보여주고,
 * 백그라운드에서 TOWER_ADDRESS 를 지오코딩해 실좌표로 갱신한다.
 */
export function useTowerGeo() {
  const [tower, setTower] = useState(TOWER);

  useEffect(() => {
    let cancelled = false;
    geocodeAddress(TOWER_ADDRESS).then((geo) => {
      if (!cancelled && geo) setTower(geo);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return tower;
}
