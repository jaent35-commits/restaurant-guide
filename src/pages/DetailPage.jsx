import React, { useEffect, useState, useRef } from "react";
import { useStore } from "../store";
import { Button, Table, Badge, Modal, Input, Textarea, Checkbox, useToast, VoteButtons } from "../components";
import { formatKRW, menuIcon, restaurantIcon, depositStatus, ICON_CHOICES } from "../utils";

/** 🗺️ 상세페이지 전용: 인증키 에러 없는 독립형 청정 미니 지도 컴포넌트 */
function CleanDetailMiniMap({ restaurant }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);

  useEffect(() => {
    if (mapInstance.current || !mapRef.current) return;

    // 식당의 위경도 좌표가 없으면 기본 대교타워 좌표 사용
    const lat = restaurant.lat ?? 37.4925;
    const lng = restaurant.lng ?? 126.9250;

    // 동적으로 Leaflet 로드
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      if (!window.L) return;

      const L = window.L;
      const coords = [lat, lng];

      // 1. 지도 객체 생성 및 포커싱
      const map = L.map(mapRef.current).setView(coords, 17);
      mapInstance.current = map;

      // 2. 고화질 지도 타일 깔기
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      // 3. [오타 수정 완료!] 해당 식당 위치에 정확하게 핀 꽂기
      const marker = L.marker(coords).addTo(map);
      marker.bindPopup(`<b>${restaurant.name}</b><br>${restaurant.mainMenu || "야근 식당"}`).openPopup();
    };

    document.head.appendChild(script);

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [restaurant]);

  return (
    <div className="h-full w-full rounded-lg border border-list-line-100 bg-surface overflow-hidden">
      <div ref={mapRef} className="h-full w-full" style={{ minHeight: "260px" }} />
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
          placeholder="예: 서울 관악구 보라매로 인근"
          value={form.address}
          onChange={set("address")}
        />
        <Input
          label="위치 — 링크(URL)"
          type="url"
          placeholder="https://share.google/..."
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

export default function DetailPage({ restaurantId, goBack, goCharge, goUse }) {
  const { state, dispatch, balanceOf, historyOf } = useStore();
  const toast = useToast();
  const [receiptView, setReceiptView] = useState(null); // { src, title }
  const [editOpen, setEditOpen] = useState(false);
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
        <Table
          columns={columns}
          rows={history.slice(0, visibleCount)}
          minWidth="700px"
          emptyText="이력이 없습니다."
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