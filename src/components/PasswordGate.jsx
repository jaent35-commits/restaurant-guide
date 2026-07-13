import React, { useEffect, useState } from "react";
import { apiVerifyGate } from "../api";

/*
 * 앱 전체 접근 비밀번호 게이트.
 * - 비밀번호 검증은 서버(Worker)에서만 수행하고, 원문은 클라이언트로 내려오지 않는다.
 * - 통과하면 해제 만료 시각(현재+2시간)을 localStorage 에 저장해, 재실행해도 2시간 내에는
 *   다시 입력하지 않아도 된다. 2시간이 지나면 자동으로 잠기고 재입력을 요구한다.
 * - fail-closed: 백엔드 미연결/오류로 검증이 불가능하면 통과시키지 않는다.
 */

const GATE_KEY = "rnd-restaurant-guide-gate-until"; // 해제 만료 시각(epoch ms)
const SESSION_MS = 2 * 60 * 60 * 1000; // 2시간

function readUnlockUntil() {
  try {
    return Number(localStorage.getItem(GATE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function isUnlocked() {
  return Date.now() < readUnlockUntil();
}

/** 뜬눈(비밀번호 보이기 유도) 아이콘 */
function EyeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** 감은눈(비밀번호 숨기기 유도) 아이콘 */
function EyeOffIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.9 5.1A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 4.2-.9" />
      <path d="M9.5 9.5a3 3 0 0 0 4.2 4.2" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  );
}

export default function PasswordGate({ children }) {
  const [unlocked, setUnlocked] = useState(isUnlocked);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false); // 마스킹 해제 여부
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // 해제 상태에서 2시간 만료 시 자동 잠금 (타이머 + 복귀/포커스 시 재확인)
  useEffect(() => {
    if (!unlocked) return undefined;
    const relockIfExpired = () => {
      if (!isUnlocked()) {
        setUnlocked(false);
        setPassword("");
        setShow(false);
      }
    };
    const remain = Math.max(0, readUnlockUntil() - Date.now());
    const timer = setTimeout(relockIfExpired, remain + 500);
    window.addEventListener("focus", relockIfExpired);
    document.addEventListener("visibilitychange", relockIfExpired);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", relockIfExpired);
      document.removeEventListener("visibilitychange", relockIfExpired);
    };
  }, [unlocked]);

  if (unlocked) return children;

  const submit = async (e) => {
    e?.preventDefault?.();
    if (busy || !password) return;
    setBusy(true);
    setError("");
    const { ok, reason } = await apiVerifyGate(password);
    if (ok) {
      try {
        localStorage.setItem(GATE_KEY, String(Date.now() + SESSION_MS));
      } catch {
        // 저장 실패해도 이번 세션은 통과 처리
      }
      setPassword("");
      setUnlocked(true); // children 렌더로 전환 (busy 유지한 채 언마운트)
    } else {
      setError(
        reason === "wrong"
          ? "비밀번호가 올바르지 않습니다."
          : "서버에 연결할 수 없어 접근할 수 없습니다. 잠시 후 다시 시도해 주세요."
      );
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-gray-100 px-token-4 py-token-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg border border-list-line-100 bg-gray-100 p-token-6 shadow-popup"
      >
        <div className="mb-token-5 text-center">
          <div className="text-title">🌙</div>
          <h1 className="mt-token-2 text-header font-bold text-text">
            R&amp;D센터 야근 식당 가이드
          </h1>
          <p className="mt-token-1 text-caption text-text-muted">
            접근하려면 비밀번호를 입력해 주세요.
          </p>
        </div>

        <label htmlFor="gate-password" className="mb-token-1 block text-body2 font-bold text-text">
          비밀번호
        </label>
        <div
          className={`flex items-center gap-token-2 rounded-md border bg-surface px-token-3 ${
            error ? "border-danger" : "border-list-line-200"
          }`}
        >
          <input
            id="gate-password"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            autoFocus
            disabled={busy}
            placeholder="비밀번호"
            className="w-full bg-transparent py-token-3 text-body1 text-text outline-none placeholder:text-text-muted"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}
            aria-pressed={show}
            title={show ? "비밀번호 숨기기" : "비밀번호 보기"}
            className="shrink-0 rounded p-token-1 text-text-muted transition-colors hover:text-primary-400"
          >
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>

        {error && <p className="mt-token-2 text-caption text-danger">{error}</p>}

        <button
          type="submit"
          disabled={busy || !password}
          className="mt-token-4 w-full rounded-md bg-primary py-token-3 text-body1 font-bold text-gray-100 transition-colors hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "확인 중…" : "입력"}
        </button>

        <p className="mt-token-4 text-center text-caption text-text-muted">
          한 번 입력하면 2시간 동안 유지되며, 이후에는 다시 입력해야 합니다.
        </p>
      </form>
    </div>
  );
}
