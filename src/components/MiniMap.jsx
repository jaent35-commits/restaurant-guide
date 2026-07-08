import React from "react";
import VWorldMap from "./VWorldMap";

/**
 * 식당 위치에 고정된 미니 지도 (상세 화면용) — 브이월드(VWorld) 기반
 * 이동/줌 등 모든 인터랙션 비활성 — 좌표를 보여주기만 한다.
 * 높이는 부모 요소를 100% 채우므로, 감싸는 쪽에서 h-[240px] 등으로 지정한다.
 * restaurant: { name, mainMenu, balance, lat, lng }
 */
export default function MiniMap({ restaurant, height = "100%" }) {
  const { lat, lng } = restaurant ?? {};
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  return (
    <div style={{ height }} className="w-full">
      <VWorldMap restaurants={[restaurant]} interactive={false} zoom={17} />
    </div>
  );
}
