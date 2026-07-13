import React, { useState } from "react";
import { useStore } from "../store";
import { useTowerGeo } from "../geo";
import NaverMap from "../components/NaverMap";

export default function HomePage({ goDetail }) {
  const { restaurantsWithBalance } = useStore();
  const tower = useTowerGeo();
  const [excludeCoupon, setExcludeCoupon] = useState(false);

  const all = restaurantsWithBalance();

  // 예치금 0원 → 홈 목록에서 가리기, ('쿠폰 제외' 시 쿠폰 식당 숨김), 예치금 많은 순 정렬
  const visible = all
    .filter((r) => r.balance !== 0 && (!excludeCoupon || !r.coupon))
    .sort((a, b) => b.balance - a.balance);

  // 지도에는 좌표가 있는 '활성' 가게만 표시(예치금 0원=비활성 가게는 숨김)
  const mapRestaurants = all.filter(
    (r) => r.balance !== 0 && typeof r.lat === "number" && typeof r.lng === "number"
  );

  // 금액을 '원' 포맷으로 직접 변경
  const formatMoney = (amount) => {
    return `${Number(amount).toLocaleString("ko-KR")}원`;
  };

  // 식당 메뉴 이름에 따라 이모지 아이콘 자동 매칭
  const getIcon = (menu = "") => {
    const rules = [
      [/(감자탕|탕|국밥|찌개|전골)/, "🍲"],
      [/(치킨|닭|찜닭)/, "🍗"],
      [/(고기|축산|삼겹|갈비|곱창|정육)/, "🥩"],
      [/(국수|칼국수|면|라멘|우동|파스타)/, "🍜"],
      [/(김밥|분식|떡볶이)/, "🍙"],
      [/(초밥|회|스시|물회)/, "🍣"],
      [/(돈까스|돈가스|카츠|katsu|튀김)/i, "🍤"],
      [/(샌드위치|샌드|서브|토스트)/, "🥪"],
      [/(피자)/, "🍕"],
      [/(버거|햄버거)/, "🍔"],
      [/(카페|커피|디저트)/, "☕"],
      [/(중식|짜장|짬뽕)/, "🥡"],
      [/(도시락|백반|한식)/, "🍱"]
    ];
    for (const [regex, emoji] of rules) {
      if (regex.test(menu)) return emoji;
    }
    return "🍴";
  };

  return (
    <div className="grid gap-token-4 lg:grid-cols-[1fr_360px]">
      {/* 상단 왼쪽 지도 (네이버 지도) */}
      <section className="flex min-h-[420px] flex-col gap-token-2">
        <div className="h-[520px] w-full">
          <NaverMap
            tower={tower}
            restaurants={mapRestaurants}
            onSelect={goDetail}
            zoom={16}
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-caption text-text-muted">
            네이버 지도 · 대교타워 기준 실좌표 표시
          </p>
        </div>
      </section>

      {/* 상단 오른쪽 식당 목록 */}
      <section className="flex flex-col gap-token-3">
        <div className="flex items-center justify-between gap-token-2">
          <h2 className="text-header font-bold text-text">
            등록 식당 <span className="text-text-muted">({visible.length})</span>
          </h2>
          <button
            type="button"
            aria-pressed={excludeCoupon}
            onClick={() => setExcludeCoupon((v) => !v)}
            className={`shrink-0 rounded-full border px-token-3 py-token-1 text-caption font-bold transition-colors ${
              excludeCoupon
                ? "border-primary-300 bg-primary-100 text-primary-400"
                : "border-border text-text-muted hover:border-primary-200"
            }`}
          >
            🎟️ 쿠폰 제외
          </button>
        </div>
        <ul className="flex flex-col gap-token-2">
          {visible.map((r) => {
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => goDetail(r.id)}
                  className={`flex w-full items-center gap-token-3 rounded-lg bg-gray-100 p-token-3 text-left transition-colors ${
                    r.coupon
                      ? "border-2 border-orange-100 hover:border-orange-100"
                      : "border border-list-line-100 hover:border-primary-300"
                  }`}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-100 text-header">
                    {getIcon(r.mainMenu || r.name)}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-token-2">
                      <span className="truncate text-body2 font-bold text-text">{r.name}</span>
                      {r.coupon && (
                        <span className="shrink-0 rounded bg-orange-100/20 px-1.5 py-0.5 text-caption font-bold text-orange-100">
                          🎟️ 쿠폰
                        </span>
                      )}
                      {r.balance < 0 && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-caption font-medium text-red-800">
                          외상
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-caption text-text-muted">{r.mainMenu}</span>
                  </span>

                  <span
                    className={`shrink-0 text-body2 font-bold ${
                      r.balance < 0 ? "text-danger" : "text-primary-400"
                    }`}
                  >
                    {formatMoney(r.balance)}
                  </span>
                </button>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="rounded-lg border border-list-line-100 bg-gray-100 p-token-4 text-center text-body2 text-text-muted">
              표시할 식당이 없습니다. 예치금을 충전해 주세요.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
