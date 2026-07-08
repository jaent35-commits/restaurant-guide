import React, { useEffect, useState } from "react";

/** 스크롤 시 나타나는 "맨 위로" 플로팅 레이어 버튼 */
export default function ScrollTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 240);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="맨 위로"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-token-6 right-token-6 z-40 flex items-center gap-token-1 rounded-full border border-border bg-gray-100 px-token-4 py-token-2 text-body2 font-bold text-text-muted shadow-popup hover:border-primary-300 hover:text-primary-400"
    >
      ↑ 맨 위로
    </button>
  );
}
