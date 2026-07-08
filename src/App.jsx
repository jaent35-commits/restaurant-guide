import React, { useState } from "react";
import { StoreProvider } from "./store";
import { ToastProvider, ScrollTopButton } from "./components";
import HomePage from "./pages/HomePage";
import ListPage from "./pages/ListPage";
import DetailPage from "./pages/DetailPage";
import ChargePage from "./pages/ChargePage";
import UsePage from "./pages/UsePage";

const NAV = [
  { key: "home", label: "홈" },
  { key: "list", label: "식당 정보" },
  { key: "charge", label: "예치금 충전" },
  { key: "use", label: "사용 등록" },
];

export default function App() {
  // 간단한 내부 라우팅: { page, restaurantId }
  const [route, setRoute] = useState({ page: "home", restaurantId: null });

  const goDetail = (id) => setRoute({ page: "detail", restaurantId: id });
  const goCharge = (id) => setRoute({ page: "charge", restaurantId: id ?? null });
  const goUse = (id) => setRoute({ page: "use", restaurantId: id ?? null });

  return (
    <StoreProvider>
      <ToastProvider>
        <div className="min-h-full">
          <header className="sticky top-0 z-40 border-b border-list-line-100 bg-gray-100">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-token-4 px-token-4 py-token-3 md:py-token-6">
              <h1 className="text-body1 font-bold text-text">
                🌙 R&amp;D센터 야근 식당 이용 가이드
              </h1>
              <nav className="flex gap-token-1">
                {NAV.map((n) => {
                  const active = route.page === n.key || (route.page === "detail" && n.key === "list");
                  return (
                    <button
                      key={n.key}
                      type="button"
                      onClick={() => setRoute({ page: n.key, restaurantId: null })}
                      className={`rounded-full px-token-3 py-token-1 text-body2 transition-colors ${
                        active
                          ? "bg-primary font-bold text-gray-100"
                          : "text-text-muted hover:bg-surface"
                      }`}
                    >
                      {n.label}
                    </button>
                  );
                })}
              </nav>
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-token-4 py-token-5">
            {route.page === "home" && <HomePage goDetail={goDetail} />}
            {route.page === "list" && <ListPage goDetail={goDetail} />}
            {route.page === "detail" && (
              <DetailPage
                restaurantId={route.restaurantId}
                goBack={() => setRoute({ page: "list", restaurantId: null })}
                goCharge={goCharge}
                goUse={goUse}
              />
            )}
            {route.page === "charge" && (
              <ChargePage
                key={route.restaurantId ?? "new"}
                initialRestaurantId={route.restaurantId}
                goDetail={goDetail}
              />
            )}
            {route.page === "use" && (
              <UsePage
                key={route.restaurantId ?? "none"}
                initialRestaurantId={route.restaurantId}
                goDetail={goDetail}
              />
            )}
          </main>

          {/* 홈/식당 정보(리스트·상세) 스크롤 시 "맨 위로" 버튼 */}
          {["home", "list", "detail"].includes(route.page) && <ScrollTopButton />}
        </div>
      </ToastProvider>
    </StoreProvider>
  );
}
