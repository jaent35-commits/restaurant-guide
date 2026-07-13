import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

/** 스크롤 시 나타나는 "맨 위로" 플로팅 레이어 버튼 */
export default function ScrollTopButton() {
  const [visible, setVisible] = useState(false);
  const [btnH, setBtnH] = useState(44);
  const btnRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 240);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 버튼 실제 높이 측정 (측정 후 스페이서 높이에 반영)
  useLayoutEffect(() => {
    if (visible && btnRef.current) setBtnH(btnRef.current.offsetHeight);
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      {/*
        버튼은 position:fixed 라 문서 흐름에서 빠져 마지막 콘텐츠를 가린다.
        문서 흐름 안에 '버튼 높이 + 하단 여백(24px)'만큼의 빈 스페이서를 넣어
        스크롤 길이를 늘려 마지막 콘텐츠까지 버튼 위로 올라오게 한다.
      */}
      <div aria-hidden="true" style={{ height: btnH + 24 }} />
      <button
        ref={btnRef}
        type="button"
        aria-label="맨 위로"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="fixed bottom-token-6 right-token-6 z-40 flex items-center gap-token-1 rounded-full border border-border bg-gray-100 px-token-4 py-token-2 text-body2 font-bold text-text-muted shadow-popup hover:border-primary-300 hover:text-primary-400"
      >
        ↑ 맨 위로
      </button>
    </>
  );
}
