import React, { useEffect, useState } from "react";
import { useToast } from "./Toast";
import { getPushStatus, enablePush, disablePush, pushSupported } from "../push";

/**
 * 헤더의 푸시 알림 켜기/끄기 종 버튼.
 * 가게 등록·충전·사용 이력이 등록되면 구독된 모든 기기에 푸시가 온다.
 * 미지원 브라우저이거나 동기화(VITE_API_BASE)가 꺼져 있으면 렌더링하지 않는다.
 */
export default function PushToggle() {
  const toast = useToast();
  const [status, setStatus] = useState("unsupported"); // unsupported | denied | on | off
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return;
    getPushStatus().then(setStatus);
  }, []);

  if (status === "unsupported") return null;

  const on = status === "on";

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (on) {
        await disablePush();
        setStatus("off");
        toast("푸시 알림을 껐습니다.", "info");
      } else {
        await enablePush();
        setStatus("on");
        toast("푸시 알림이 켜졌습니다. 가게·충전·사용 등록 시 알려드릴게요.");
      }
    } catch (e) {
      setStatus(await getPushStatus());
      toast(e.message || "알림 설정에 실패했습니다.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy || status === "denied"}
      title={
        status === "denied"
          ? "브라우저 설정에서 알림 권한이 차단되어 있습니다."
          : on
            ? "푸시 알림 끄기"
            : "푸시 알림 켜기"
      }
      aria-label="푸시 알림 설정"
      className={`ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full text-body1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        on ? "bg-primary-100 text-primary" : "text-text-muted hover:bg-surface"
      }`}
    >
      {on ? "🔔" : "🔕"}
    </button>
  );
}
