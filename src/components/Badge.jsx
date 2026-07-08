import React from "react";

const TONES = {
  active: "bg-primary-100 text-primary-400",
  credit: "bg-red-100/20 text-danger",
  disabled: "bg-gray-300 text-text-muted",
  coupon: "bg-yellow-100/20 text-yellow-100",
  neutral: "bg-surface text-text-muted",
};

export default function Badge({ tone = "neutral", children, className = "" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-token-2 py-[2px] text-caption font-bold shadow-badge ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
