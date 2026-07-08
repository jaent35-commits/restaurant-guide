import React from "react";

export default function Checkbox({ label, className = "", ...props }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-token-2 ${className}`}>
      <input
        type="checkbox"
        className="h-4 w-4 cursor-pointer accent-[var(--color-primary)]"
        {...props}
      />
      {label && <span className="text-body2 text-text">{label}</span>}
    </label>
  );
}
