import React, { useEffect, useRef } from "react";
import { TOWER } from "../geo";
import { loadKakaoSdk } from "../kakaoSdk";
import { formatKRW, restaurantIcon, depositStatus } from "../utils";

function markerElement(r, onSelect) {
  const status = depositStatus(r.balance);
  const el = document.createElement("div");
  el.className = `map-marker${status.key === "credit" ? " map-marker--credit" : ""}`;
  el.innerHTML = `
    <div class="map-marker__icon">${restaurantIcon(r)}</div>
    <div class="map-marker__label">
      <strong>${r.name}</strong>
      <span class="${r.balance < 0 ? "is-credit" : ""}">${formatKRW(r.balance)}</span>
    </div>`;
  el.addEventListener("click", () => onSelect(r.id));
  return el;
}

function towerElement() {
  const el = document.createElement("div");
  el.className = "map-tower";
  el.innerHTML = `<div class="map-tower__icon">🏢</div><div class="map-tower__label">대교타워</div>`;
  return el;
}

/**
 * 실좌표 기반 카카오맵 — restaurants: [{ id, name, mainMenu, balance, lat, lng }]
 * tower: { lat, lng } — 대교타워 실좌표 (미전달 시 근사 폴백값 사용)
 * SDK 로드 실패 시 onError() 호출 (호출측에서 SVG 약도로 폴백)
 */
export default function KakaoMap({ appKey, restaurants, onSelect, onError, tower = TOWER }) {
  const containerRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const onErrorRef = useRef(onError);
  onSelectRef.current = onSelect;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let overlays = [];

    loadKakaoSdk(appKey)
      .then((kakao) => {
        if (cancelled || !containerRef.current) return;

        const center = new kakao.maps.LatLng(tower.lat, tower.lng);
        const map = new kakao.maps.Map(containerRef.current, { center, level: 5 });
        map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);

        const bounds = new kakao.maps.LatLngBounds();
        bounds.extend(center);
        overlays.push(
          new kakao.maps.CustomOverlay({
            position: center,
            content: towerElement(),
            yAnchor: 0.5,
            zIndex: 2,
          })
        );

        restaurants.forEach((r) => {
          if (typeof r.lat !== "number" || typeof r.lng !== "number") return;
          const pos = new kakao.maps.LatLng(r.lat, r.lng);
          bounds.extend(pos);
          overlays.push(
            new kakao.maps.CustomOverlay({
              position: pos,
              content: markerElement(r, (id) => onSelectRef.current?.(id)),
              yAnchor: 0.5,
              zIndex: 3,
            })
          );
        });

        overlays.forEach((o) => o.setMap(map));
        if (restaurants.length > 0) map.setBounds(bounds, 48);
      })
      .catch(() => {
        if (!cancelled) onErrorRef.current?.();
      });

    return () => {
      cancelled = true;
      overlays.forEach((o) => o.setMap(null));
    };
  }, [appKey, restaurants, tower]);

  return (
    <div
      ref={containerRef}
      className="h-[520px] w-full rounded-lg border border-list-line-100 bg-surface"
      role="application"
      aria-label="대교타워 주변 식당 지도 (카카오맵)"
    />
  );
}
