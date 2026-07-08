import React, { useEffect } from "react";

export default function Modal({ open, onClose, title, children, footer, width = "480px" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-list-bg-100/60 p-token-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[85vh] w-full overflow-auto rounded-lg bg-popup-bg-100 shadow-popup"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-popup-line-100 px-token-5 py-token-4">
          <h3 className="text-header font-bold text-text">{title}</h3>
          <button
            type="button"
            aria-label="닫기"
            className="text-icon-100 hover:text-text"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="px-token-5 py-token-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-token-2 border-t border-popup-line-100 px-token-5 py-token-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
