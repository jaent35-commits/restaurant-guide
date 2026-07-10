import React, { useEffect, useRef, useState } from "react";
import { loadNaverMaps, getNaverConfig } from "../naverSdk";
import { formatKRW, restaurantIcon, depositStatus } from "../utils";

/** 식당 마커 HTML — 홈 전체지도/미니맵 공통 (showBalance=false 면 잔액 숨김) */
export function markerHtml(r, showBalance = true) {
  const status = depositStatus(r.balance);
  const balance = showBalance
    ? `<span class="${r.balance < 0 ? "is-credit" : ""}">${formatKRW(r.balance)}</span>`
    : "";
  return `
    <div class="map-marker${status.key === "credit" ? " map-marker--credit" : ""}">
      <div class="map-marker__icon">${restaurantIcon(r)}</div>
      <div class="map-marker__label">
        <strong>${r.name}</strong>
        ${balance}
      </div>
    </div>`;
}

const towerHtml = `
  <div class="map-tower">
    <div class="map-tower__icon">🏢</div>
    <div class="map-tower__label">대교타워</div>
  </div>`;

/** 좌표에 bottom-center 로 고정되는 HTML 마커 아이콘 */
function htmlIcon(naver, html, onClick) {
  // anchor(0,0) + transform 으로 콘텐츠의 하단 중앙을 좌표에 핀 고정
  return {
    content: `<div style="transform:translate(-50%,-100%);cursor:${onClick ? "pointer" : "default"};">${html}</div>`,
    anchor: new naver.maps.Point(0, 0),
  };
}

/**
 * 네이버 지도(JS API v3) 기반 실좌표 지도
 * - tower 를 넘기면 대교타워 마커도 함께 표시(홈 화면 전체 지도용)
 * - interactive=false 면 이동/줌 등 조작을 막고 좌표만 보여준다(상세 화면 미니맵용)
 * - showBalance=false 면 식당 마커에서 잔액을 숨긴다(상세 화면 미니맵용)
 * - clientId 를 안 넘기면 localStorage/환경변수에 등록된 값을 사용한다
 */
export default function NaverMap({
  restaurants = [],
  tower,
  onSelect,
  interactive = true,
  showBalance = true,
  zoom = 16,
  clientId,
  onError,
}) {
  const containerRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const fallback = getNaverConfig();
  const key = clientId ?? fallback.clientId;

  const center = tower ?? restaurants.find((r) => typeof r.lat === "number" && typeof r.lng === "number");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!key || !center) return undefined;

    let cancelled = false;
    let map = null;
    const markers = [];
    setError(null);

    loadNaverMaps({ clientId: key })
      .then((naver) => {
        if (cancelled || !containerRef.current) return;

        map = new naver.maps.Map(containerRef.current, {
          center: new naver.maps.LatLng(center.lat, center.lng),
          zoom,
          draggable: interactive,
          pinchZoom: interactive,
          scrollWheel: interactive,
          keyboardShortcuts: interactive,
          disableDoubleClickZoom: !interactive,
          disableDoubleTapZoom: !interactive,
          disableTwoFingerTapZoom: !interactive,
          scaleControl: false,
          mapDataControl: false,
          logoControl: true, // 네이버 로고는 이용약관상 노출 유지
          zoomControl: interactive,
        });

        const addMarker = (point, html, onClick) => {
          const marker = new naver.maps.Marker({
            position: new naver.maps.LatLng(point.lat, point.lng),
            map,
            icon: htmlIcon(naver, html, onClick),
            clickable: !!onClick,
          });
          if (onClick) naver.maps.Event.addListener(marker, "click", onClick);
          markers.push(marker);
        };

        if (tower) addMarker(tower, towerHtml);
        restaurants.forEach((r) => {
          if (typeof r.lat !== "number" || typeof r.lng !== "number") return;
          addMarker(r, markerHtml(r, showBalance), interactive ? () => onSelectRef.current?.(r.id) : undefined);
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
        markers.forEach((m) => m.setMap(null));
        map?.destroy?.();
      } catch {
        // 지도 정리 실패는 무시
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, restaurants, tower, interactive, showBalance, zoom]);

  if (!key) {
    return (
      <div className="flex h-full min-h-[160px] w-full flex-col items-center justify-center gap-token-1 rounded-lg border border-dashed border-list-line-100 bg-surface p-token-4 text-center text-caption text-text-muted">
        <span>네이버 지도 설정이 필요합니다.</span>
        <span>VITE_NAVER_MAP_CLIENT_ID 환경변수에 Client ID를 입력해 주세요.</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full min-h-[160px] w-full flex-col items-center justify-center gap-token-1 rounded-lg border border-list-line-100 bg-surface p-token-4 text-center text-caption text-text-muted">
        <span>지도를 불러오지 못했습니다.</span>
        <span>Client ID · 등록 웹 서비스 URL이 맞는지 확인해 주세요.</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative z-0 h-full w-full rounded-lg border border-list-line-100 bg-surface"
      role={interactive ? "application" : "img"}
      aria-label={tower ? "대교타워 주변 식당 지도 (네이버)" : "식당 위치 지도 (네이버)"}
    />
  );
}
