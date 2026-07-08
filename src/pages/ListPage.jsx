import React, { useState } from "react";
import { useStore } from "../store";
import { Input, Table, Badge, VoteButtons } from "../components";
import { formatKRW, restaurantIcon, depositStatus } from "../utils";

/** 새창 열림 아이콘 */
function ExternalIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block shrink-0"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export default function ListPage({ goDetail }) {
  const { restaurantsWithBalance, dispatch } = useStore();
  const [query, setQuery] = useState("");
  // 헤더 클릭 정렬 (기본: 예치금 많은 순)
  const [sort, setSort] = useState({ key: "balance", dir: "desc" });

  // 가게 상호 / 주요 메뉴 검색
  const q = query.trim();
  const filtered = restaurantsWithBalance().filter(
    (r) => !q || r.name.includes(q) || r.mainMenu.includes(q)
  );

  const rows = [...filtered].sort((a, b) => {
    let cmp;
    switch (sort.key) {
      case "balance":
        cmp = a.balance - b.balance;
        break;
      case "status":
        cmp = depositStatus(a.balance).label.localeCompare(depositStatus(b.balance).label, "ko");
        break;
      default:
        // 가게 상호/주요 메뉴/주소 — 한글 ㄱㄴㄷ 순 정렬
        cmp = String(a[sort.key] ?? "").localeCompare(String(b[sort.key] ?? ""), "ko");
    }
    return sort.dir === "asc" ? cmp : -cmp;
  });

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const arrow = (key) => (sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "");

  const columns = [
    {
      key: "name",
      header: `가게 상호${arrow("name")}`,
      sortable: true,
      render: (r) => (
        <span className="flex items-center gap-token-2">
          <span className="text-body1">{restaurantIcon(r)}</span>
          {r.locationUrl ? (
            // 상호 클릭 → 위치 링크 새창 열림 (모바일에서 주소란 숨김 대응)
            <a
              href={r.locationUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-token-1 font-bold text-text underline decoration-gray-500 underline-offset-2 hover:text-primary-400"
              title="위치 링크 새창으로 열기"
            >
              {r.name}
              <ExternalIcon />
            </a>
          ) : (
            <span className="font-bold">{r.name}</span>
          )}
        </span>
      ),
    },
    {
      key: "balance",
      header: `예치금${arrow("balance")}`,
      sortable: true,
      align: "right",
      render: (r) => (
        <span className={`font-bold ${r.balance < 0 ? "text-danger" : ""}`}>
          {formatKRW(r.balance)}
        </span>
      ),
    },
    {
      key: "mainMenu",
      header: `주요 메뉴${arrow("mainMenu")}`,
      sortable: true,
      className: "hidden md:table-cell", // 모바일 숨김
    },
    {
      key: "address",
      header: `위치(주소)${arrow("address")}`,
      sortable: true,
      className: "hidden lg:table-cell", // 태블릿/모바일 숨김 (링크는 상호 클릭으로 대체)
      render: (r) => r.address || "-",
    },
    {
      key: "status",
      header: `상태${arrow("status")}`,
      sortable: true,
      className: "hidden md:table-cell", // 모바일 숨김
      render: (r) => {
        const s = depositStatus(r.balance);
        return <Badge tone={s.key}>{s.label}</Badge>;
      },
    },
    {
      key: "vote",
      header: "좋아요/싫어요",
      align: "center",
      render: (r) => (
        <VoteButtons
          likes={r.likes}
          dislikes={r.dislikes}
          myVote={r.myVote}
          onVote={(kind) => dispatch({ type: "VOTE", id: r.id, vote: kind })}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-token-4">
      <div className="flex flex-wrap items-end justify-between gap-token-3">
        <h2 className="text-header font-bold text-text">식당 정보</h2>
        <Input
          placeholder="가게 상호 또는 주요 메뉴 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-72"
        />
      </div>

      <Table
        columns={columns}
        rows={rows}
        onRowClick={(r) => goDetail(r.id)}
        onHeaderClick={toggleSort}
        rowClassName={(r) => (r.balance === 0 ? "opacity-50" : "")}
        emptyText="검색 결과가 없습니다."
      />
      <p className="text-caption text-text-muted">
        * 예치금 0원 식당은 비활성 처리되어 홈 화면에서 표시되지 않습니다. 잔액이 마이너스인 식당은
        외상 상태로 계속 이용 가능합니다.
      </p>
    </div>
  );
}
