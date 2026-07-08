import React from "react";

/** 라벨 + 에러 메시지를 감싸는 폼 필드 래퍼 (Input/Select/Textarea 공용) */
export default function Field({ label, required, error, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-token-1 block text-body2 font-bold text-text">
          {label}
          {required && <span className="ml-token-1 text-danger">*</span>}
        </span>
      )}
      {children}
      {error && <span className="mt-token-1 block text-caption text-danger">{error}</span>}
    </label>
  );
}
