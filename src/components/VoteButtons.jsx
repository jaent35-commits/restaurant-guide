import React from "react";

/** 좋아요/싫어요 토글 버튼 쌍 — onVote('like' | 'dislike') */
export default function VoteButtons({ likes, dislikes, myVote, onVote, className = "" }) {
  const handle = (e, kind) => {
    e.stopPropagation(); // 행/카드 클릭과 분리
    onVote(kind);
  };
  return (
    <span className={`inline-flex items-center gap-token-2 ${className}`}>
      <button
        type="button"
        aria-label="좋아요"
        onClick={(e) => handle(e, "like")}
        className={`inline-flex items-center gap-token-1 rounded-full border px-token-2 py-[2px] text-caption ${
          myVote === "like"
            ? "border-primary-300 bg-primary-100 font-bold text-primary-400"
            : "border-border text-text-muted hover:border-primary-300"
        }`}
      >
        👍 {likes}
      </button>
      <button
        type="button"
        aria-label="싫어요"
        onClick={(e) => handle(e, "dislike")}
        className={`inline-flex items-center gap-token-1 rounded-full border px-token-2 py-[2px] text-caption ${
          myVote === "dislike"
            ? "border-danger bg-red-100/20 font-bold text-danger"
            : "border-border text-text-muted hover:border-danger"
        }`}
      >
        👎 {dislikes}
      </button>
    </span>
  );
}
