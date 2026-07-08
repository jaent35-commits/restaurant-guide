import React, { useEffect, useRef, useState } from "react";
import { loadVWorldSdk, getVWorldConfig } from "../vworldSdk";
import { formatKRW, restaurantIcon, depositStatus } from "../utils";

/** 식당 마커 HTML — 홈 전체지도/미니맵 공통 */
export function markerHtml(r) {
  const status = depositStatus(r.balance);
  return `
    <div class="map-marker${status.key === "credit" ? " map-marker--credit" : ""}">
      <div class="map-marker__icon">${restaurantIcon(r)}</div>
      <div class="map-marker__label">
        <strong>${r.name}</strong>
        <span class="${r.balance < 0 ? "is-credit" : ""}">${formatKRW(r.balance)}</span>
      </div>
    </div>`;
}

const towerHtml = `
  <div class="map-tower">
    <div class="map-tower__icon">🏢</div>
    <div class="map-tower__label">대교타워</div>
  </div>`;

/**
 * 브이월드(VWorld) 2D 지도 API 2.0 기반 실좌표 지도
 * - tower 를 넘기면 대교타워 마커도 함께 표시(홈 화면 전체 지도용)
 * - interactive=false 면 이동/줌 등 조작을 막고 좌표만 보여준다(상세 화면 미니맵용)
 * - vworldKey/vworldDomain 을 안 넘기면 localStorage/환경변수에 등록된 값을 사용한다
 */
export default function VWorldMap({
  restaurants = [],
  tower,
  onSelect,
  interactive = true,
  zoom = 16,
  vworldKey,
  vworldDomain,
  onError,
}) {
  const containerRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const fallback = getVWorldConfig();
  const key = vworldKey ?? fallback.key;
  const domain = vworldDomain ?? fallback.domain;

  const center = tower ?? restaurants.find((r) => typeof r.lat === "number" && typeof r.lng === "number");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!key || !domain || !center) return undefined;

    let cancelled = false;
    let map = null;
    setError(null);

    loadVWorldSdk({ key, domain })
      .then((vw) => {
        if (cancelled || !containerRef.current) return;

        map = new vw.ol3.Map({
          mapId: containerRef.current,
          initPosition: new vw.ol3.CameraPosition(
            new vw.ol3.Coordinate(center.lng, center.lat),
            new vw.ol3.Direction(0, -90, 0)
          ),
          logo: false,
          navigation: interactive,
        });
        if (typeof map.setZoom === "function") map.setZoom(zoom);

        const addMarker = (point, html, onClick) => {
          const el = document.createElement("div");
          el.innerHTML = html;
          el.style.cursor = onClick ? "pointer" : "default";
          if (onClick) el.addEventListener("click", onClick);
          const overlay = new vw.ol3.Overlay({
            position: new vw.ol3.Coordinate(point.lng, point.lat),
            element: el,
            positioning: "bottom-center",
            stopEvent: !!onClick,
          });
          map.addOverlay(overlay);
        };

        if (tower) addMarker(tower, towerHtml);
        restaurants.forEach((r) => {
          if (typeof r.lat !== "number" || typeof r.lng !== "number") return;
          addMarker(r, markerHtml(r), interactive ? () => onSelectRef.current?.(r.id) : undefined);
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        onError?.(err);
      });

    return () => {
      cancelled = true;
      try {
        map?.setTarget?.(null);
      } catch {
        // 지도 정리 실패는 무시
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, domain, restaurants, tower, interactive, zoom]);

  if (!key || !domain) {
    return (
      <div className="flex h-full min-h-[160px] w-full flex-col items-center justify-center gap-token-1 rounded-lg border border-dashed border-list-line-100 bg-surface p-token-4 text-center text-caption text-text-muted">
        <span>브이월드 지도 설정이 필요합니다.</span>
        {tower && <span>"지도 설정"에서 인증키 · 등록 도메인을 입력해 주세요.</span>}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full min-h-[160px] w-full flex-col items-center justify-center gap-token-1 rounded-lg border border-list-line-100 bg-surface p-token-4 text-center text-caption text-text-muted">
        <span>지도를 불러오지 못했습니다.</span>
        <span>인증키 · 등록 도메인이 맞는지 확인해 주세요.</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative z-0 h-full w-full rounded-lg border border-list-line-100 bg-surface"
      role={interactive ? "application" : "img"}
      aria-label={tower ? "대교타워 주변 식당 지도 (브이월드)" : "식당 위치 지도 (브이월드)"}
    />
  );
}
