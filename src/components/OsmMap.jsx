import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TOWER } from "../geo";
import { formatKRW, restaurantIcon, depositStatus } from "../utils";

export function markerHtml(r) {
  const status = depositStatus(r.balance);
  return `
    <div class="map-marker osm-anchor${status.key === "credit" ? " map-marker--credit" : ""}">
      <div class="map-marker__icon">${restaurantIcon(r)}</div>
      <div class="map-marker__label">
        <strong>${r.name}</strong>
        <span class="${r.balance < 0 ? "is-credit" : ""}">${formatKRW(r.balance)}</span>
      </div>
    </div>`;
}

const towerHtml = `
  <div class="map-tower osm-anchor--center">
    <div class="map-tower__icon">🏢</div>
    <div class="map-tower__label">대교타워</div>
  </div>`;

/**
 * OpenStreetMap(Leaflet) 실좌표 지도 — API 키 불필요(무료)
 * restaurants: [{ id, name, mainMenu, balance, lat, lng }]
 * tower: { lat, lng } — 대교타워 실좌표 (미전달 시 근사 폴백값 사용)
 */
export default function OsmMap({ restaurants, onSelect, tower = TOWER }) {
  const containerRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const map = L.map(containerRef.current, {
      center: [tower.lat, tower.lng],
      zoom: 15,
      scrollWheelZoom: true,
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);

    // 대교타워 (클릭 불가 기준점)
    L.marker([tower.lat, tower.lng], {
      icon: L.divIcon({ html: towerHtml, className: "", iconSize: [0, 0] }),
      interactive: false,
      zIndexOffset: -100,
    }).addTo(map);

    const bounds = L.latLngBounds([[tower.lat, tower.lng]]);
    restaurants.forEach((r) => {
      if (typeof r.lat !== "number" || typeof r.lng !== "number") return;
      const marker = L.marker([r.lat, r.lng], {
        icon: L.divIcon({ html: markerHtml(r), className: "", iconSize: [0, 0] }),
      }).addTo(map);
      marker.on("click", () => onSelectRef.current?.(r.id));
      bounds.extend([r.lat, r.lng]);
    });

    if (restaurants.length > 0) map.fitBounds(bounds, { padding: [56, 56] });

    return () => map.remove();
  }, [restaurants, tower]);

  return (
    <div
      ref={containerRef}
      className="relative z-0 h-[520px] w-full rounded-lg border border-list-line-100 bg-surface"
      role="application"
      aria-label="대교타워 주변 식당 지도 (OpenStreetMap)"
    />
  );
}
