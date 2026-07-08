import { useEffect, useState } from "react";
import { geocodeWithVWorld, getVWorldConfig } from "./vworldSdk";

// 실제 좌표(위경도) 관련 상수/유틸
// 대교타워 주소 — 실좌표는 useTowerGeo() 로 지오코딩해서 사용한다
export const TOWER_ADDRESS = "서울시 관악구 보라매로3길 23 7층";
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
   1순위: 브이월드(VWorld) 주소검색 API (지도 설정에 인증키·도메인이 등록된 경우)
          — 국토교통부 공식 주소 DB 기반이라 네이버/카카오 지도와 좌표가 사실상 일치한다.
   2순위(폴백, 브이월드 미설정 시에만): OpenStreetMap Nominatim (무료/키 불필요)
          — 국내 소규모 상가 주소는 데이터가 부실해 위치가 부정확하거나 아예 못 찾을 수 있다.
   - 같은 주소는 localStorage 에 캐시해 재요청하지 않는다 (Nominatim 사용 정책: 초당 1건 권장)
   - 둘 다 실패(오프라인/응답 없음 등) 시 null 반환 — 호출측은 기존 좌표를 그대로 유지한다
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

  const { key: vworldKey } = getVWorldConfig();
  const geo = (vworldKey ? await geocodeWithVWorld(query, vworldKey) : null) ?? (await geocodeWithNominatim(query));
  if (!geo) return null;

  cache[query] = geo;
  writeGeocodeCache(cache);
  return geo;
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
