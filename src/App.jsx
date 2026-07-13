import React, { useEffect, useRef, useState } from "react";
import { StoreProvider } from "./store";
import { ToastProvider, ScrollTopButton, PushToggle, InstallToast, useToast } from "./components";
import PasswordGate from "./components/PasswordGate";
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

/**
 * 모바일 하드웨어 '뒤로가기' 처리 — 두 번 눌러야 앱이 종료된다.
 * 한 번 누르면 "한 번 더 누르면 종료됩니다" 토스트를 띄우고,
 * 2초 안에 다시 누르면 앱을 종료(히스토리 뒤로)한다.
 * (설치형 PWA / 모바일 웹뷰 등 뒤로가기 버튼이 있는 환경 대상)
 */
function BackExitGuard() {
  const toast = useToast();
  const armedRef = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => {
    // 뒤로가기 버튼이 있는 환경(모바일/설치형)에서만 동작
    const isTouch =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(pointer: coarse)").matches ||
        window.matchMedia?.("(display-mode: standalone)").matches ||
        window.navigator.standalone === true);
    if (!isTouch) return undefined;

    // 뒤로가기를 가로채기 위한 히스토리 항목을 하나 쌓아둔다
    window.history.pushState(null, "", window.location.href);

    const onPopState = () => {
      if (armedRef.current) {
        // 2초 내 두 번째 뒤로가기 → 실제 종료(앱 진입 지점 밖으로 이동)
        window.history.back();
        return;
      }
      // 첫 번째 뒤로가기 → 종료 안내 후 다시 히스토리를 쌓아 앱에 머무름
      window.history.pushState(null, "", window.location.href);
      toast("한 번 더 누르면 앱이 종료됩니다.", "info");
      armedRef.current = true;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        armedRef.current = false;
      }, 2000);
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      clearTimeout(timerRef.current);
    };
  }, [toast]);

  return null;
}

export default function App() {
  const [route, setRoute] = useState({ page: "home", restaurantId: null });

  const goDetail = (id) => setRoute({ page: "detail", restaurantId: id });
  const goCharge = (id) => setRoute({ page: "charge", restaurantId: id ?? null });
  const goUse = (id) => setRoute({ page: "use", restaurantId: id ?? null });

  return (
    <PasswordGate>
      <StoreProvider>
        <ToastProvider>
          <BackExitGuard />
          <div className="min-h-full">
            <header className="sticky top-0 z-40 border-b border-list-line-100 bg-gray-100">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-token-4 px-token-4 py-token-3 md:py-token-6">
                <h1 className="text-body1 font-bold text-text">
                  🌙 R&amp;D센터 야근 식당 이용 가이드
                </h1>
                <nav className="flex gap-token-1">
                  {NAV.map((n) => {
                    const active =
                      route.page === n.key || (route.page === "detail" && n.key === "list");
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
                <PushToggle />
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

            {["home", "list", "detail"].includes(route.page) && <ScrollTopButton />}

            {/* 홈 화면 진입 시 앱 미설치면 설치 유도 토스트 */}
            {route.page === "home" && <InstallToast />}
          </div>
        </ToastProvider>
      </StoreProvider>
    </PasswordGate>
  );
}
