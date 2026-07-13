import React, { useEffect, useState } from "react";
import { useStore } from "../store";
import { Button, Input, Select, Textarea, Checkbox, FileInput, useToast } from "../components";
import { commaInput, parseAmount, todayStr, uid, formatKRW, menuIcon, restaurantIcon } from "../utils";
import { svgToGeo } from "../geo";

const NEW = "__new__";

/** 주요 메뉴 프리셋 — 버튼으로 아이콘과 함께 기본 제공 */
const MENU_PRESETS = [
  "감자탕", "국밥", "삼겹살", "곱창",
  "치킨", "찜닭", "칼국수", "김밥·분식",
  "떡볶이", "초밥·회", "피자", "햄버거",
  "중식", "백반·한식", "파스타", "커피·디저트",
];

/** 신규 식당의 지도 위치 — 기존 마커와 겹치지 않게 빈 슬롯에서 선택 */
const POSITION_SLOTS = [
  { x: 860, y: 430 }, { x: 130, y: 180 }, { x: 640, y: 560 },
  { x: 880, y: 200 }, { x: 350, y: 90 }, { x: 120, y: 560 },
];

export default function ChargePage({ initialRestaurantId, goDetail }) {
  const { state, dispatch, balanceOf } = useStore();
  const toast = useToast();

  const [restaurantId, setRestaurantId] = useState(initialRestaurantId ?? "");
  const [form, setForm] = useState({
    date: todayStr(),
    name: "",
    amount: "",
    coupon: false,
    mainMenu: "",
    guide: "",
    memo: "",
    receipt: null,
    address: "",
    locationUrl: "",
  });
  const [errors, setErrors] = useState({});

  const isNew = restaurantId === NEW;
  const selected = state.restaurants.find((r) => r.id === restaurantId);

  // 기존 식당 선택 시 마스터 정보 프리필
  useEffect(() => {
    if (selected) {
      setForm((f) => ({
        ...f,
        name: selected.name,
        coupon: selected.coupon,
        mainMenu: selected.mainMenu,
        guide: selected.guide,
        memo: selected.memo,
        address: selected.address ?? "",
        locationUrl: selected.locationUrl,
      }));
    } else if (isNew) {
      setForm((f) => ({ ...f, name: "", coupon: false, mainMenu: "", guide: "", memo: "", address: "", locationUrl: "" }));
    }
  }, [restaurantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (e) => {
    const value = e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e;
    setForm((f) => ({ ...f, [key]: key === "amount" ? commaInput(value) : value }));
  };

  const submit = () => {
    const errs = {};
    if (!restaurantId) errs.restaurantId = "식당을 선택하거나 신규 등록을 선택하세요.";
    if (!form.date) errs.date = "충전일자를 입력하세요.";
    if (isNew && !form.name.trim()) errs.name = "가게 상호를 입력하세요.";
    const amount = parseAmount(form.amount);
    if (amount <= 0) errs.amount = "1원 이상의 예치금을 입력하세요.";
    if (!form.receipt) errs.receipt = "증빙서류(영수증 이미지)는 필수입니다.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    let targetId = restaurantId;
    if (isNew) {
      targetId = uid("r");
      const slot = POSITION_SLOTS[state.restaurants.length % POSITION_SLOTS.length];
      dispatch({
        type: "ADD_RESTAURANT",
        restaurant: {
          id: targetId,
          name: form.name.trim(),
          mainMenu: form.mainMenu.trim(),
          address: form.address.trim(),
          locationUrl: form.locationUrl.trim(),
          guide: form.guide,
          memo: form.memo,
          coupon: form.coupon,
          likes: 0,
          dislikes: 0,
          myVote: null,
          position: slot,
          ...svgToGeo(slot), // 실좌표 지도 표시용 (타워 주변 근사 위치)
        },
      });
    } else {
      // 충전 시 부가 정보만 갱신 — 상호/주요 메뉴 수정은 '식당 정보' 메뉴에서
      dispatch({
        type: "UPDATE_RESTAURANT",
        id: targetId,
        patch: {
          coupon: form.coupon,
          guide: form.guide,
          memo: form.memo,
          address: form.address.trim(),
          locationUrl: form.locationUrl.trim(),
        },
      });
    }

    dispatch({
      type: "ADD_TRANSACTION",
      transaction: {
        id: uid("t"),
        restaurantId: targetId,
        type: "charge",
        date: form.date,
        amount,
        user: "",
        coupon: form.coupon,
        memo: form.memo,
        receipt: form.receipt,
      },
    });

    toast(`${isNew ? form.name.trim() : selected?.name} 예치금 ${formatKRW(amount)} 충전 완료`);
    goDetail(targetId);
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-token-4">
      <h2 className="text-header font-bold text-text">예치금 충전</h2>

      <div className="flex flex-col gap-token-4 rounded-lg border border-list-line-100 bg-gray-100 p-token-5">
        <Select
          label="식당 선택"
          required
          error={errors.restaurantId}
          value={restaurantId}
          onChange={(e) => setRestaurantId(e.target.value)}
          placeholder="식당을 선택하세요"
          options={[
            ...state.restaurants.map((r) => ({
              value: r.id,
              label: `${r.name} (잔액 ${formatKRW(balanceOf(r.id))})`,
            })),
            { value: NEW, label: "➕ 신규 식당 등록" },
          ]}
        />

        <div className="grid gap-token-4 md:grid-cols-2">
          <Input label="충전일자" required type="date" value={form.date} onChange={set("date")} error={errors.date} />
          <Input
            label="예치금"
            required
            inputMode="numeric"
            placeholder="예: 210,000"
            suffix="원"
            value={form.amount}
            onChange={set("amount")}
            error={errors.amount}
          />
        </div>

        {/* 가게 상호/주요 메뉴는 신규 등록일 때만 입력 — 기존 식당 수정은 '식당 정보' 메뉴에서 */}
        {isNew && (
          <>
            <div className="grid gap-token-4 md:grid-cols-2">
              <Input
                label="가게 상호"
                required
                placeholder="예: 조프로 감자탕"
                value={form.name}
                onChange={set("name")}
                error={errors.name}
              />
              <Input label="주요 메뉴" placeholder="예: 감자탕 (직접 입력 또는 아래에서 선택)" value={form.mainMenu} onChange={set("mainMenu")} />
            </div>

            {/* 주요 메뉴 프리셋 — 클릭 시 메뉴와 아이콘이 함께 선택됨 */}
            <div>
              <span className="mb-token-1 block text-body2 font-bold text-text">주요 메뉴 아이콘 선택</span>
              <div className="grid grid-cols-4 gap-token-2">
                {MENU_PRESETS.map((menu) => {
                  const active = form.mainMenu === menu;
                  return (
                    <button
                      key={menu}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, mainMenu: active ? "" : menu }))}
                      className={`flex flex-col items-center gap-token-1 rounded-md border p-token-2 text-caption transition-colors ${
                        active
                          ? "border-primary-300 bg-primary-100 font-bold text-primary-400"
                          : "border-border bg-gray-100 text-text-muted hover:border-primary-200"
                      }`}
                      aria-pressed={active}
                    >
                      <span className="text-header">{menuIcon(menu)}</span>
                      <span>{menu}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {selected && (
          <div className="flex items-center gap-token-3 rounded-md bg-surface px-token-4 py-token-3">
            <span className="text-header">{restaurantIcon(selected)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body2 font-bold text-text">{selected.name}</p>
              <p className="truncate text-caption text-text-muted">주요 메뉴: {selected.mainMenu || "-"}</p>
            </div>
            <span className="shrink-0 text-caption text-text-muted">
              상호·메뉴 수정은 '식당 정보'에서
            </span>
          </div>
        )}

        <Checkbox label="🎟️ 쿠폰" checked={form.coupon} onChange={set("coupon")} />

        <Textarea
          label="사용가이드"
          placeholder="예: 청년축산 길로 쭉 나가서 BBQ 길건너 주유소 지나가면 나옴"
          value={form.guide}
          onChange={set("guide")}
        />
        <Textarea label="메모" placeholder="예: 5/4일기준 은지 충전" value={form.memo} onChange={set("memo")} />

        <Input
          label="위치 — 주소"
          placeholder="정확한 주소를 입력해 주세요 (예: 서울 관악구 당곡길 66 1층)"
          value={form.address}
          onChange={set("address")}
        />
        <Input
          label="위치 — 링크(URL)"
          type="url"
          placeholder="네이버 지도 URL을 입력해 주세요 (예: https://naver.me/xxxxxxx)"
          value={form.locationUrl}
          onChange={set("locationUrl")}
        />

        <FileInput
          label="증빙서류 (영수증 이미지)"
          required
          value={form.receipt}
          onChange={set("receipt")}
          error={errors.receipt}
        />

        <div className="flex justify-end gap-token-2 border-t border-list-line-100 pt-token-4">
          <Button onClick={submit}>충전 등록</Button>
        </div>
      </div>
    </div>
  );
}
