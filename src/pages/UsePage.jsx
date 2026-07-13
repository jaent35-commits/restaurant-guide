import React, { useState } from "react";
import { useStore } from "../store";
import { Button, Input, Select, FileInput, useToast } from "../components";
import { commaInput, parseAmount, todayStr, uid, formatKRW, depositStatus } from "../utils";

export default function UsePage({ initialRestaurantId, goDetail }) {
  const { state, dispatch, balanceOf } = useStore();
  const toast = useToast();

  const [restaurantId, setRestaurantId] = useState(initialRestaurantId ?? "");
  const [date, setDate] = useState(todayStr());
  const [mode, setMode] = useState("amount"); // 'amount' = 사용금액 입력, 'remain' = 잔액 입력
  const [amountStr, setAmountStr] = useState("");
  const [user, setUser] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [errors, setErrors] = useState({});

  const balance = restaurantId ? balanceOf(restaurantId) : null;

  // 사용금액 계산: 잔액 입력 모드면 (현재 잔액 - 입력한 잔액)
  const input = parseAmount(amountStr);
  const usedAmount = mode === "amount" ? input : balance !== null ? balance - input : 0;
  const afterBalance = balance !== null ? balance - usedAmount : null;

  const submit = () => {
    const errs = {};
    if (!restaurantId) errs.restaurantId = "식당을 선택하세요.";
    if (!date) errs.date = "사용일자를 입력하세요.";
    if (usedAmount <= 0) {
      errs.amount =
        mode === "amount"
          ? "1원 이상의 사용금액을 입력하세요."
          : "현재 잔액보다 작은 잔액을 입력하세요.";
    }
    if (!user.trim()) errs.user = "사용자를 입력하세요.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    dispatch({
      type: "ADD_TRANSACTION",
      transaction: {
        id: uid("t"),
        restaurantId,
        type: "use",
        date,
        amount: usedAmount,
        user: user.trim(),
        coupon: false,
        memo: mode === "remain" ? `잔액 ${formatKRW(input)} 기준 입력` : "",
        receipt, // null 허용
      },
    });

    const name = state.restaurants.find((r) => r.id === restaurantId)?.name ?? "";
    toast(`${name} 사용 ${formatKRW(usedAmount)} 등록 완료`);
    goDetail(restaurantId);
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-token-4">
      <h2 className="text-header font-bold text-text">예치금 사용 등록</h2>

      <div className="flex flex-col gap-token-4 rounded-lg border border-list-line-100 bg-gray-100 p-token-5">
        <Select
          label="식당 선택"
          required
          error={errors.restaurantId}
          value={restaurantId}
          onChange={(e) => setRestaurantId(e.target.value)}
          placeholder="식당을 선택하세요"
          options={state.restaurants.map((r) => {
            const b = balanceOf(r.id);
            const s = depositStatus(b);
            return {
              value: r.id,
              label: `${r.name} (잔액 ${formatKRW(b)}${s.key === "credit" ? " · 외상" : ""})`,
              disabled: !s.active, // 예치금 0원 식당은 선택 불가
            };
          })}
        />

        {balance !== null && (
          <div className="flex items-center justify-between rounded-md bg-primary-100 px-token-4 py-token-3 text-body2">
            <span className="text-text-muted">현재 잔액</span>
            <span className={`font-bold ${balance < 0 ? "text-danger" : "text-primary-400"}`}>
              {formatKRW(balance)}
            </span>
          </div>
        )}

        <Input
          label="사용일자"
          required
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={errors.date}
        />

        {/* 사용금액 / 잔액 입력 모드 전환 */}
        <div>
          <span className="mb-token-1 block text-body2 font-bold text-text">
            금액 입력 방식<span className="ml-token-1 text-danger">*</span>
          </span>
          <div className="flex gap-token-2">
            {[
              { key: "amount", label: "사용금액 입력" },
              { key: "remain", label: "남은 잔액으로 입력" },
            ].map((m) => (
              <Button
                key={m.key}
                variant={mode === m.key ? "primary" : "secondary"}
                size="sm"
                onClick={() => {
                  setMode(m.key);
                  setAmountStr("");
                }}
              >
                {m.label}
              </Button>
            ))}
          </div>
        </div>

        <Input
          label={mode === "amount" ? "사용금액" : "사용 후 남은 잔액"}
          required
          inputMode="numeric"
          placeholder={mode === "amount" ? "예: 56,000" : "예: 154,000"}
          suffix="원"
          value={amountStr}
          onChange={(e) => setAmountStr(commaInput(e.target.value))}
          error={errors.amount}
        />

        {restaurantId && amountStr && (
          <div className="rounded-md border border-list-line-100 bg-surface px-token-4 py-token-3 text-body2">
            <div className="flex justify-between">
              <span className="text-text-muted">사용금액</span>
              <span className="font-bold text-text">{formatKRW(usedAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">사용 후 잔액</span>
              <span
                className={`font-bold ${afterBalance < 0 ? "text-danger" : "text-primary-400"}`}
              >
                {formatKRW(afterBalance)}
                {afterBalance < 0 && " (외상)"}
              </span>
            </div>
          </div>
        )}

        <Input
          label="사용자"
          required
          placeholder="예: 김대리 외 2명"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          error={errors.user}
        />

        <FileInput label="증빙서류 (선택)" value={receipt} onChange={setReceipt} />

        <div className="flex justify-end gap-token-2 border-t border-list-line-100 pt-token-4">
          <Button onClick={submit}>사용 등록</Button>
        </div>
      </div>
    </div>
  );
}
