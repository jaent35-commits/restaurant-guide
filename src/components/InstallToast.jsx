import React, { useEffect, useState } from "react";
import Button from "./Button";
import {
  getInstallPrompt,
  consumeInstallPrompt,
  onInstallPromptChange,
  isStandalone,
  isIos,
} from "../installPrompt";

/* 같은 세션(탭) 안에서는 닫은 뒤 다시 띄우지 않는다 */
const DISMISS_KEY = "rnd-restaurant-guide-install-toast-dismissed";

/**
 * 홈 화면 진입 시 앱 미설치면 하단에 설치 유도 레이어 토스트를 띄운다.
 *  - [앱 설치] 클릭 → 브라우저 설치 프롬프트 → 수락 시 홈 화면에 앱 버튼 생성
 *  - 토스트 바깥 아무 곳이나 클릭 → 닫힘
 *  - iOS(사파리)는 설치 프롬프트 API 가 없어 수동 설치 방법을 안내
 */
export default function InstallToast() {
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone()) return undefined; // 이미 앱으로 실행 중
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return undefined;
    } catch (e) {
      // sessionStorage 접근 불가 시 그냥 진행
    }

    if (isIos()) {
      setIos(true);
      setVisible(true);
      return undefined;
    }

    // 안드로이드/데스크톱 크롬: 설치 가능해지면(beforeinstallprompt) 표시
    if (getInstallPrompt()) setVisible(true);
    return onInstallPromptChange((prompt) => setVisible(!!prompt && !isStandalone()));
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch (e) {
      // 무시
    }
  };

  const install = async () => {
    const prompt = getInstallPrompt();
    if (!prompt) return;
    prompt.prompt(); // 브라우저 설치 확인창 → 수락 시 홈 화면에 앱 버튼 생성
    const choice = await prompt.userChoice.catch(() => null);
    consumeInstallPrompt();
    if (choice?.outcome === "accepted") setVisible(false);
    else dismiss();
  };

  if (!visible) return null;

  return (
    <>
      {/* 바깥 클릭 감지용 투명 레이어 — 클릭 시 토스트 닫힘 */}
      <div className="fixed inset-0 z-[70]" onClick={dismiss} aria-hidden="true" />

      <div
        role="dialog"
        aria-label="앱 설치 안내"
        className="fixed bottom-token-6 left-1/2 z-[80] w-[calc(100%-32px)] max-w-md -translate-x-1/2 rounded-lg border border-popup-line-100 bg-popup-bg-100 p-token-4 shadow-popup"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-token-3">
          <img
            src="./icons/icon-192.png"
            alt=""
            className="h-12 w-12 shrink-0 rounded-lg border border-border"
          />
          <div className="min-w-0 flex-1">
            <p className="text-body2 font-bold text-text">🌙 야근식당 앱을 설치해 보세요</p>
            {ios ? (
              <p className="mt-token-1 text-caption text-text-muted">
                사파리 하단 <span className="font-bold">공유 버튼(↑)</span> →{" "}
                <span className="font-bold">&ldquo;홈 화면에 추가&rdquo;</span> 를 누르면 홈 화면에
                앱 버튼이 생성됩니다.
              </p>
            ) : (
              <p className="mt-token-1 text-caption text-text-muted">
                홈 화면에 앱 버튼이 생겨 더 빠르게 열 수 있어요.
              </p>
            )}
            {!ios && (
              <div className="mt-token-3 flex gap-token-2">
                <Button size="sm" onClick={install}>
                  앱 설치
                </Button>
                <Button size="sm" variant="ghost" onClick={dismiss}>
                  다음에
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
