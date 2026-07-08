import React, { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext(null);

const TONES = {
  success: "border-primary-300 bg-primary-100 text-text",
  error: "border-danger bg-gray-100 text-danger",
  info: "border-border bg-gray-100 text-text",
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const show = useCallback((message, tone = "success") => {
    seq.current += 1;
    const id = seq.current;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed bottom-token-6 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col gap-token-2 px-token-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-md border px-token-4 py-token-3 text-body2 font-bold shadow-popup ${TONES[t.tone]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
