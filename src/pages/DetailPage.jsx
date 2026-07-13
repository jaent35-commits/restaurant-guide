import React, { useEffect, useState } from "react";
import { useStore } from "../store";
import NaverMap from "../components/NaverMap";
import { Button, Table, Badge, Modal, Input, Select, Textarea, Checkbox, FileInput, useToast, VoteButtons } from "../components";
import { formatKRW, menuIcon, restaurantIcon, depositStatus, ICON_CHOICES, commaInput, parseAmount } from "../utils";

/** 🗺️ 상세페이지 전용: 네이버 지도 기반 미니 지도 (이동·확대 가능) */
function CleanDetailMiniMap({ restaurant }) {
  // 좌표가 없으면 기본 대교타워 좌표 사용
  const point = {
    ...restaurant,
    lat: restaurant.lat ?? 37.4925,
    lng: restaurant.lng ?? 126.925,
  };

  return (
    <div className="h-full w-full rounded-lg border border-list-line-100 bg-surface overflow-hidden">
      <NaverMap restaurants={[point]} interactive zoom={17} showBalance={false} />
    </div>
  );
}

/** 가게 정보 편집 모달 — 주소(text)와 링크(url)는 별도 입력 */
function EditModal({ open, onClose, restaurant, onSave }) {
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open && restaurant) {
      setForm({
        name: restaurant.name,
        mainMenu: restaurant.mainMenu,
        address: restaurant.address ?? "",
        locationUrl: restaurant.locationUrl ?? "",
        guide: restaurant.guide ?? "",
        memo: restaurant.memo ?? "",
        coupon: !!restaurant.coupon,
        icon: restaurant.icon ?? "",
      });
      setErrors({});
    }
  }, [open, restaurant]);

  if (!form) return null;

  const set = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const submit = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "가게 상호를 입력하세요.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSave({
      ...form,
      name: form.name.trim(),
      mainMenu: form.mainMenu.trim(),
      address: form.address.trim(),
      locationUrl: form.locationUrl.trim(),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="가게 정보 편집"
      width="560px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button onClick={submit}>저장</Button>
        </>
      }
    >
      <div className="flex flex-col gap-token-4">
        <div className="grid gap-token-4 md:grid-cols-2">
          <Input label="가게 상호" required value={form.name} onChange={set("name")} error={errors.name} />
          <Input label="주요 메뉴" value={form.mainMenu} onChange={set("mainMenu")} />
        </div>

        {/* 아이콘 선택 — 미선택 시 주요 메뉴 기반 자동 */}
        <div>
          <span className="mb-token-1 block text-body2 font-bold text-text">아이콘</span>
          <div className="flex flex-wrap gap-token-2">
            {ICON_CHOICES.map((ic) => {
              const active = form.icon === ic;
              return (
                <button
                  key={ic}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setForm((f) => ({ ...f, icon: active ? "" : ic }))}
                  className={`flex h-10 w-10 items-center justify-center rounded-md border text-body1 transition-colors ${
                    active
                      ? "border-primary-300 bg-primary-100"
                      : "border-border bg-gray-100 hover:border-primary-200"
                  }`}
                >
                  {ic}
                </button>
              );
            })}
          </div>
          <p className="mt-token-1 text-caption text-text-muted">
            선택하지 않으면 주요 메뉴에 맞는 아이콘이 자동 적용됩니다. 현재 표시:{" "}
            {form.icon || menuIcon(form.mainMenu)}
          </p>
        </div>
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
        <Checkbox label="🎟️ 쿠폰" checked={form.coupon} onChange={set("coupon")} />
        <Textarea label="사용가이드" value={form.guide} onChange={set("guide")} />
        <Textarea label="메모" value={form.memo} onChange={set("memo")} />
      </div>
    </Modal>
  );
}

/** 충전/사용 이력 수정 모달 — 이력 행을 2초간 꾹 누르면 열린다 */
function TransactionEditModal({ open, onClose, transaction, onSave, onDelete }) {
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open && transaction) {
      setForm({
        type: transaction.type,
        date: transaction.date ?? "",
        amount: commaInput(String(transaction.amount ?? "")),
        user: transaction.user ?? "",
        memo: transaction.memo ?? "",
        coupon: !!transaction.coupon,
        receipt: transaction.receipt ?? null,
      });
      setErrors({});
      setConfirmDelete(false);
    }
  }, [open, transaction]);

  if (!form) return null;

  const set = (key) => (e) => {
    const value = e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e;
    setForm((f) => ({ ...f, [key]: key === "amount" ? commaInput(value) : value }));
  };

  const submit = () => {
    const errs = {};
    if (!form.date) errs.date = "일자를 입력하세요.";
    const amount = parseAmount(form.amount);
    if (amount <= 0) errs.amount = "1원 이상의 금액을 입력하세요.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSave({
      type: form.type,
      date: form.date,
      amount,
      user: form.user.trim(),
      memo: form.memo,
      coupon: form.coupon,
      receipt: form.receipt,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="이력 수정"
      width="560px"
      footer={
        <>
          <Button
            variant="danger"
            className="mr-auto"
            onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
          >
            {confirmDelete ? "정말 삭제할까요?" : "삭제"}
          </Button>
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button onClick={submit}>저장</Button>
        </>
      }
    >
      <div className="flex flex-col gap-token-4">
        <div className="grid gap-token-4 md:grid-cols-2">
          <Select
            label="구분"
            required
            value={form.type}
            onChange={set("type")}
            options={[
              { value: "charge", label: "충전" },
              { value: "use", label: "사용" },
            ]}
          />
          <Input label="일자" required type="date" value={form.date} onChange={set("date")} error={errors.date} />
        </div>
        <div className="grid gap-token-4 md:grid-cols-2">
          <Input
            label="금액"
            required
            inputMode="numeric"
            suffix="원"
            value={form.amount}
            onChange={set("amount")}
            error={errors.amount}
          />
          <Input
            label="사용자/충전자"
            placeholder="예: 재광, 동국"
            value={form.user}
            onChange={set("user")}
          />
        </div>
        <Checkbox label="🎟️ 쿠폰" checked={form.coupon} onChange={set("coupon")} />
        <Textarea label="메모" value={form.memo} onChange={set("memo")} />
        <FileInput label="증빙서류 (영수증 이미지)" value={form.receipt} onChange={set("receipt")} />
        {confirmDelete && (
          <p className="rounded-md bg-surface px-token-3 py-token-2 text-caption text-danger">
            삭제하면 잔액이 다시 계산되고 노션에서도 이력이 보관함으로 이동합니다. 삭제 버튼을 한 번 더
            누르면 완전히 진행됩니다.
          </p>
        )}
      </div>
    </Modal>
  );
}

/** 터치 기기 여부 (태블릿/모바일=coarse). 데스크톱(마우스)=false */
function useIsTouch() {
  const [isTouch, setIsTouch] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(pointer: coarse)");
    if (!mq) return undefined;
    const onChange = () => setIsTouch(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return isTouch;
}

export default function DetailPage({ restaurantId, goBack, goCharge, goUse }) {
  const { state, dispatch, balanceOf, historyOf } = useStore();
  const toast = useToast();
  const isTouch = useIsTouch();
  const [receiptView, setReceiptView] = useState(null); // { src, title }
  const [editOpen, setEditOpen] = useState(false);
  const [txEdit, setTxEdit] = useState(null); // 수정할 이력 (행 2초 꾹 누르면 설정)
  const [visibleCount, setVisibleCount] = useState(10); // 이력 기본 10건, '더 보기'로 +5

  const restaurant = state.restaurants.find((r) => r.id === restaurantId);
  if (!restaurant) {
    return (
      <div className="flex flex-col items-start gap-token-3">
        <p className="text-body1 text-text-muted">식당을 찾을 수 없습니다.</p>
        <Button variant="secondary" onClick={goBack}>목록으로</Button>
      </div>
    );
  }

  const balance = balanceOf(restaurant.id);
  const status = depositStatus(balance);
  const history = historyOf(restaurant.id);

  const columns = [
    {
      key: "type",
      header: "구분",
      render: (t) =>
        t.type === "charge" ? (
          <Badge tone="active">충전</Badge>
        ) : (
          <Badge tone="neutral">사용</Badge>
        ),
    },
    { key: "date", header: "일자" },
    {
      key: "amount",
      header: "금액",
      align: "right",
      render: (t) => (
        <span className={`font-bold ${t.type === "charge" ? "text-primary-400" : "text-text"}`}>
          {t.type === "charge" ? "+" : "-"}
          {formatKRW(t.amount)}
        </span>
      ),
    },
    { key: "user", header: "사용자/충전자" },
    {
      key: "coupon",
      header: "쿠폰",
      align: "center",
      render: (t) => (t.coupon ? <Badge tone="coupon">쿠폰</Badge> : "-"),
    },
    { key: "memo", header: "메모", render: (t) => t.memo || "-" },
    {
      key: "receipt",
      header: "증빙",
      align: "center",
      render: (t) =>
        t.receipt ? (
          <button
            type="button"
            className="text-primary-400 underline"
            onClick={(e) => {
              e.stopPropagation();
              setReceiptView({ src: t.receipt, title: `${t.date} ${t.type === "charge" ? "충전" : "사용"} 증빙` });
            }}
          >
            보기
          </button>
        ) : (
          "-"
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-token-4">
      <div>
        <Button variant="ghost" size="sm" onClick={goBack}>← 목록으로</Button>
      </div>

      {/* 식당 요약 카드 — PC(lg~)는 정보(좌)+지도(우) 2열, 이하는 세로 배치 */}
      <section className="rounded-lg border border-list-line-100 bg-gray-100 p-token-5 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-x-token-6">
        <div>
        <div className="flex flex-wrap items-start justify-between gap-token-4">
          <div className="w-full md:w-auto">
            {/* 모바일: 상태/쿠폰 배지를 가게 상호 위에 표시 */}
            <div className="mb-token-2 flex gap-token-2 md:hidden">
              <Badge tone={status.key}>{status.label}</Badge>
              {restaurant.coupon && <Badge tone="coupon">🎟️ 쿠폰</Badge>}
            </div>
            <div className="flex items-center gap-token-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-header">
              {restaurantIcon(restaurant)}
            </span>
            <div>
              <div className="flex items-center gap-token-2">
                <h2 className="text-title font-bold text-text">{restaurant.name}</h2>
                {/* 데스크톱/태블릿: 배지를 상호 옆에 */}
                <span className="hidden items-center gap-token-2 md:flex">
                  <Badge tone={status.key}>{status.label}</Badge>
                  {restaurant.coupon && <Badge tone="coupon">🎟️ 쿠폰</Badge>}
                </span>
                {/* 모바일: 편집을 상호 옆 아이콘 버튼으로 */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-token-1 md:hidden"
                  aria-label="가게 정보 편집"
                  onClick={() => setEditOpen(true)}
                >
                  ✏️
                </Button>
              </div>
              <div className="flex items-center gap-token-3">
                <span className="text-body2 text-text-muted">{restaurant.mainMenu}</span>
                <VoteButtons
                  likes={restaurant.likes}
                  dislikes={restaurant.dislikes}
                  myVote={restaurant.myVote}
                  onVote={(kind) => dispatch({ type: "VOTE", id: restaurant.id, vote: kind })}
                />
              </div>
            </div>
            </div>
          </div>
          <div className="flex items-start gap-token-3">
            <div className="text-right">
              <p className="text-caption text-text-muted">잔여 예치금</p>
              <p className={`text-title font-bold ${balance < 0 ? "text-danger" : "text-primary-400"}`}>
                {formatKRW(balance)}
              </p>
            </div>
            {/* 데스크톱/태블릿 전용 — 모바일은 상호 옆 아이콘 버튼 사용 */}
            <Button
              variant="secondary"
              size="sm"
              className="hidden md:inline-flex"
              onClick={() => setEditOpen(true)}
            >
              ✏️ 편집
            </Button>
          </div>
        </div>

        <dl className="mt-token-4 grid gap-token-2 border-t border-list-line-100 pt-token-4 text-body2 md:grid-cols-2">
          <div className="md:col-span-2">
            <dt className="font-bold text-text-muted">위치</dt>
            <dd className="text-text">{restaurant.address || "-"}</dd>
          </div>
          {restaurant.guide && (
            <div className="md:col-span-2">
              <dt className="font-bold text-text-muted">사용 가이드</dt>
              <dd className="text-text">{restaurant.guide}</dd>
            </div>
          )}
          {restaurant.memo && (
            <div className="md:col-span-2">
              <dt className="font-bold text-text-muted">메모</dt>
              <dd className="text-text">{restaurant.memo}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* 🗺️ 청정 미니 지도 컴포넌트 호출 */}
      <div className="mt-4 h-[240px] lg:row-span-2 lg:mt-0 lg:h-full lg:min-h-[260px]">
        <CleanDetailMiniMap restaurant={restaurant} />
      </div>

      <div className="mt-4 flex justify-end gap-token-2 lg:self-end">
        <Button variant="secondary" onClick={() => goCharge(restaurant.id)}>예치금 충전</Button>
        <Button onClick={() => goUse(restaurant.id)} disabled={balance === 0}>
          사용 등록
        </Button>
      </div>
    </section>

      <section className="flex flex-col gap-token-3">
        <h3 className="text-header font-bold text-text">
          충전/사용 이력 <span className="text-text-muted">({history.length})</span>
        </h3>
        <p className="text-caption text-text-muted">
          {isTouch ? (
            <>✏️ 이력을 <span className="font-bold">2초간 꾹 누르면</span> 수정할 수 있어요.</>
          ) : (
            <>✏️ 이력을 <span className="font-bold">클릭하면</span> 수정할 수 있어요.</>
          )}
        </p>
        <Table
          columns={columns}
          rows={history.slice(0, visibleCount)}
          minWidth="700px"
          emptyText="이력이 없습니다."
          onRowClick={isTouch ? undefined : (t) => setTxEdit(t)}
          onRowLongPress={isTouch ? (t) => setTxEdit(t) : undefined}
        />
        {history.length > visibleCount && (
          <div className="flex justify-center">
            {/* 💡 [태그 오타 수정 완료] </br>를 원래 짝인 </Button>으로 바꿨습니다! */}
            <Button variant="secondary" size="sm" onClick={() => setVisibleCount((n) => n + 5)}>
              더 보기 ({Math.min(5, history.length - visibleCount)}건)
            </Button>
          </div>
        )}
      </section>

      {/* 가게 정보 편집 모달 */}
      <EditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        restaurant={restaurant}
        onSave={(patch) => {
          dispatch({ type: "UPDATE_RESTAURANT", id: restaurant.id, patch });
          setEditOpen(false);
          toast("가게 정보가 저장되었습니다.");
        }}
      />

      {/* 이력 수정/삭제 모달 — 이력 행 2초 길게 누르기 */}
      <TransactionEditModal
        open={!!txEdit}
        onClose={() => setTxEdit(null)}
        transaction={txEdit}
        onSave={(patch) => {
          dispatch({ type: "UPDATE_TRANSACTION", id: txEdit.id, patch });
          setTxEdit(null);
          toast("이력이 수정되었습니다. 잔액이 다시 계산됩니다.");
        }}
        onDelete={() => {
          dispatch({ type: "DELETE_TRANSACTION", id: txEdit.id });
          setTxEdit(null);
          toast("이력이 삭제되었습니다.", "info");
        }}
      />

      {/* 증빙 이미지 확대 모달 */}
      <Modal
        open={!!receiptView}
        onClose={() => setReceiptView(null)}
        title={receiptView?.title ?? ""}
        footer={<Button variant="secondary" onClick={() => setReceiptView(null)}>닫기</Button>}
      >
        {receiptView && (
          <img src={receiptView.src} alt="증빙서류" className="mx-auto max-h-[60vh] rounded-md border border-border" />
        )}
      </Modal>
    </div>
  );
}
