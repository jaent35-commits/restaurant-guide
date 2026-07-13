import React, { useEffect, useRef, useState } from "react";

/** 스크롤 시 나타나는 "맨 위로" 플로팅 레이어 버튼 */
export default function ScrollTopButton() {
  const [visible, setVisible] = useState(false);
  const btnRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 240);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 버튼이 떠 있는 동안, 마지막 콘텐츠가 버튼에 가려지지 않도록
  // 문서 하단에 버튼 높이(+여백)만큼 빈 패딩을 만든다.
  useEffect(() => {
    if (!visible) {
      document.body.style.paddingBottom = "";
      return undefined;
    }
    const h = btnRef.current?.offsetHeight ?? 44;
    // 버튼 높이 + 하단 오프셋(bottom-token-6 ≈ 24px) 만큼 확보
    document.body.style.paddingBottom = `${h + 24}px`;
    return () => {
      document.body.style.paddingBottom = "";
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <button
      ref={btnRef}
      type="button"
      aria-label="맨 위로"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-token-6 right-token-6 z-40 flex items-center gap-token-1 rounded-full border border-border bg-gray-100 px-token-4 py-token-2 text-body2 font-bold text-text-muted shadow-popup hover:border-primary-300 hover:text-primary-400"
    >
      ↑ 맨 위로
    </button>
  );
}
