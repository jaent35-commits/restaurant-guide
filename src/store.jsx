// 앱 데이터 스토어 — Context + localStorage 영속화 + 노션 동기화(옵션)
// restaurants: 식당 마스터, transactions: 충전/사용 이력 (잔액은 이력 합산으로 계산)
// VITE_API_BASE 가 설정되면 노션이 원본 DB가 된다:
//   시작 시 노션에서 로드 → 변경 시 낙관적 로컬 반영 후 백그라운드로 노션에 기록.
//   영수증 이미지와 내 투표(myVote)는 기기별 localStorage 에만 보관한다.
import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { uid } from "./utils";
import { SEED_GEO, svgToGeo, resolveRestaurantCoords, inServiceArea } from "./geo";
import {
  apiEnabled,
  fetchData,
  setupSchema,
  apiCreateRestaurant,
  apiUpdateRestaurant,
  apiCreateTransaction,
  apiUpdateTransaction,
  apiDeleteTransaction,
} from "./api";

// v5: 2026-07-08 지도는 네이버 지도(JS API v3), 지오코딩은 OpenStreetMap Nominatim 사용
//     (STORAGE_KEY 는 기존 사용자 데이터 보존을 위해 v5 유지)
const STORAGE_KEY = "rnd-restaurant-guide-v5";

/* 증빙서류 시드용 플레이스홀더 이미지 (영수증 모양 SVG) */
const seedReceipt = (label) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="260">
      <rect width="200" height="260" fill="#f7f7fa" stroke="#d8dbe3"/>
      <text x="100" y="40" text-anchor="middle" font-size="16" fill="#3f4855" font-weight="bold">영 수 증</text>
      <line x1="20" y1="60" x2="180" y2="60" stroke="#d8dbe3"/>
      <text x="100" y="130" text-anchor="middle" font-size="13" fill="#8390a3">${label}</text>
      <line x1="20" y1="220" x2="180" y2="220" stroke="#d8dbe3"/>
      <text x="100" y="245" text-anchor="middle" font-size="11" fill="#b3bac5">R&amp;D센터 야근식당</text>
    </svg>`
  );

/* -----------------------------------------------------------------------------
   시드 데이터 — 실제 운영 데이터 (2026-07-08 기준, 가게 5곳 / 이력 15건)
   position: 홈 지도(뷰박스 1000x640)에서 대교타워(500,320) 기준 상대 좌표
----------------------------------------------------------------------------- */
function seedData() {
  const restaurants = [
    {
      id: "r_jopro",
      name: "조프로 감자탕",
      mainMenu: "감자탕",
      address: "서울 관악구 당곡길 66 1층",
      locationUrl: "https://share.google/AN3zYupdWc0sUIaYV",
      guide: "청년축산 길로 쭉 나가서 BBQ 길건너 주유소 지나가면 나옴",
      memo: "5/4일기준 은지 충전",
      coupon: true,
      likes: 0,
      dislikes: 0,
      myVote: null,
      position: { x: 700, y: 170 },
    },
    {
      id: "r_hakju",
      name: "학주스시",
      mainMenu: "스시",
      address: "서울 관악구 신림로73길 5 1층",
      locationUrl: "",
      guide: "",
      memo: "",
      coupon: false,
      likes: 0,
      dislikes: 0,
      myVote: null,
      position: { x: 320, y: 200 },
    },
    {
      id: "r_katsu",
      name: "KATSU97",
      mainMenu: "돈까스",
      address: "서울 관악구 봉천로7길 3 현교빌딩 1층",
      locationUrl: "",
      guide: "",
      memo: "",
      coupon: false,
      likes: 0,
      dislikes: 0,
      myVote: null,
      position: { x: 560, y: 470 },
    },
    {
      id: "r_jimmy",
      name: "지미존스",
      mainMenu: "샌드위치",
      address: "서울 동작구 보라매로5가길 16 1층",
      locationUrl: "",
      guide: "",
      memo: "",
      coupon: false,
      likes: 0,
      dislikes: 0,
      myVote: null,
      position: { x: 640, y: 300 },
    },
    {
      id: "r_gureum",
      name: "구름산추어탕",
      mainMenu: "추어탕",
      address: "서울 관악구 봉천로7길 31 1층",
      locationUrl: "",
      guide: "",
      memo: "",
      coupon: false,
      likes: 0,
      dislikes: 0,
      myVote: null,
      position: { x: 380, y: 520 },
    },
  ];

  // 회의록 원본 순번 1~15 (충전 증빙은 플레이스홀더, 사용 증빙은 null 허용)
  const transactions = [
    // 1. 조프로 감자탕 충전 210,000 (2026-02-27, 5/4일 기준)
    {
      id: uid("t"), restaurantId: "r_jopro", type: "charge", date: "2026-02-27",
      amount: 210000, user: "", coupon: true,
      memo: "5/4일 기준", receipt: seedReceipt("조프로 감자탕 210,000원"),
    },
    // 2. 학주스시 충전 96,000 (2026-03-05, 5/4일 기준)
    {
      id: uid("t"), restaurantId: "r_hakju", type: "charge", date: "2026-03-05",
      amount: 96000, user: "", coupon: false,
      memo: "5/4일 기준", receipt: seedReceipt("학주스시 96,000원"),
    },
    // 3. KATSU97 충전 53,000 (2026-04-17, 5/4일 기준)
    {
      id: uid("t"), restaurantId: "r_katsu", type: "charge", date: "2026-04-17",
      amount: 53000, user: "", coupon: false,
      memo: "5/4일 기준", receipt: seedReceipt("KATSU97 53,000원"),
    },
    // 4. 지미존스 충전 200,000 (2026-04-30, 5/4일 기준)
    {
      id: uid("t"), restaurantId: "r_jimmy", type: "charge", date: "2026-04-30",
      amount: 200000, user: "", coupon: false,
      memo: "5/4일 기준", receipt: seedReceipt("지미존스 200,000원"),
    },
    // 5. 지미존스 사용 38,000 (2026-05-07)
    {
      id: uid("t"), restaurantId: "r_jimmy", type: "use", date: "2026-05-07",
      amount: 38000, user: "안재광, 김동국, 이종훈", coupon: false, memo: "", receipt: null,
    },
    // 6. 지미존스 사용 26,640 (2026-05-08)
    {
      id: uid("t"), restaurantId: "r_jimmy", type: "use", date: "2026-05-08",
      amount: 26640, user: "이세욱, 이종훈", coupon: false, memo: "", receipt: null,
    },
    // 7. 학주스시 사용 75,000 (2026-05-08)
    {
      id: uid("t"), restaurantId: "r_hakju", type: "use", date: "2026-05-08",
      amount: 75000, user: "안재광, 김동국, 이종훈, 이세욱, 문동규, 허은지", coupon: false, memo: "", receipt: null,
    },
    // 8. 지미존스 사용 47,900 (2026-05-19)
    {
      id: uid("t"), restaurantId: "r_jimmy", type: "use", date: "2026-05-19",
      amount: 47900, user: "희동, 봉석, 세욱, 은지", coupon: false, memo: "", receipt: null,
    },
    // 9. 지미존스 사용 16,110 (2026-05-20)
    {
      id: uid("t"), restaurantId: "r_jimmy", type: "use", date: "2026-05-20",
      amount: 16110, user: "재광", coupon: false, memo: "", receipt: null,
    },
    // 10. KATSU97 사용 35,000 (2026-05-21)
    {
      id: uid("t"), restaurantId: "r_katsu", type: "use", date: "2026-05-21",
      amount: 35000, user: "재광, 동국", coupon: false, memo: "", receipt: null,
    },
    // 11. 지미존스 사용 25,000 (2026-05-26)
    {
      id: uid("t"), restaurantId: "r_jimmy", type: "use", date: "2026-05-26",
      amount: 25000, user: "재광, 동국", coupon: false, memo: "", receipt: null,
    },
    // 12. 학주스시 충전 175,000 (2026-06-04)
    {
      id: uid("t"), restaurantId: "r_hakju", type: "charge", date: "2026-06-04",
      amount: 175000, user: "", coupon: false,
      memo: "", receipt: seedReceipt("학주스시 175,000원"),
    },
    // 13. 구름산추어탕 충전 193,000 (2026-06-11)
    {
      id: uid("t"), restaurantId: "r_gureum", type: "charge", date: "2026-06-11",
      amount: 193000, user: "", coupon: false,
      memo: "", receipt: seedReceipt("구름산추어탕 193,000원"),
    },
    // 14. 구름산추어탕 사용 24,000 (2026-06-29)
    {
      id: uid("t"), restaurantId: "r_gureum", type: "use", date: "2026-06-29",
      amount: 24000, user: "박봉석, 김우현", coupon: false, memo: "", receipt: null,
    },
    // 15. 구름산추어탕 사용 58,000 (2026-07-06)
    {
      id: uid("t"), restaurantId: "r_gureum", type: "use", date: "2026-07-06",
      amount: 58000, user: "박봉석", coupon: false, memo: "", receipt: null,
    },
  ];

  return { restaurants, transactions };
}

/* ----------------------------------------------------------------------------- */

/** 위경도가 없는 식당(구버전 저장본/신규)에 실좌표 채우기 */
function ensureCoords(r) {
  const fallback = SEED_GEO[r.id] ?? svgToGeo(r.position);
  // 좌표가 없으면 폴백으로 채운다
  if (typeof r.lat !== "number" || typeof r.lng !== "number") {
    return { ...r, ...fallback };
  }
  // 서비스 지역(관악구 인근)을 벗어난 좌표 = 잘못 지오코딩된 값 →
  // 폴백으로 교정하고 geocodedFrom 을 지워 다음 렌더에서 다시 지오코딩하도록 유도
  if (!inServiceArea(r.lat, r.lng)) {
    const { geocodedFrom, ...rest } = r;
    return { ...rest, ...fallback };
  }
  return r;
}

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.restaurants) && Array.isArray(parsed.transactions)) {
        return { ...parsed, restaurants: parsed.restaurants.map(ensureCoords) };
      }
    }
  } catch (e) {
    // 손상된 저장본은 무시하고 시드로 초기화
  }
  const seed = seedData();
  return { ...seed, restaurants: seed.restaurants.map(ensureCoords) };
}

/** 좋아요/싫어요 토글 결과 계산 — reducer 와 노션 동기화에서 공용 */
function applyVote(r, vote) {
  let { likes, dislikes, myVote } = r;
  if (myVote === vote) {
    if (vote === "like") likes -= 1;
    else dislikes -= 1;
    myVote = null;
  } else {
    if (myVote === "like") likes -= 1;
    if (myVote === "dislike") dislikes -= 1;
    if (vote === "like") likes += 1;
    else dislikes += 1;
    myVote = vote;
  }
  return { likes, dislikes, myVote };
}

function reducer(state, action) {
  switch (action.type) {
    case "LOAD":
      // 노션에서 받은 전체 데이터로 교체
      return {
        restaurants: action.restaurants.map(ensureCoords),
        transactions: action.transactions,
      };
    case "ADD_RESTAURANT":
      return { ...state, restaurants: [...state.restaurants, action.restaurant] };
    case "UPDATE_RESTAURANT":
      return {
        ...state,
        restaurants: state.restaurants.map((r) =>
          r.id === action.id ? { ...r, ...action.patch } : r
        ),
      };
    case "ADD_TRANSACTION":
      return { ...state, transactions: [...state.transactions, action.transaction] };
    case "UPDATE_TRANSACTION":
      return {
        ...state,
        transactions: state.transactions.map((t) =>
          t.id === action.id ? { ...t, ...action.patch } : t
        ),
      };
    case "DELETE_TRANSACTION":
      return {
        ...state,
        transactions: state.transactions.filter((t) => t.id !== action.id),
      };
    case "VOTE": {
      // 좋아요/싫어요 토글 — 같은 버튼 재클릭 시 취소, 반대 버튼 클릭 시 전환
      return {
        ...state,
        restaurants: state.restaurants.map((r) =>
          r.id === action.id ? { ...r, ...applyVote(r, action.vote) } : r
        ),
      };
    }
    case "RESET":
      return seedData();
    default:
      return state;
  }
}

const StoreContext = createContext(null);

/* ------------------------- 기기 로컬 전용 데이터 -------------------------
   노션에 올리지 않는 데이터: 영수증 이미지(용량), 내 투표(개인별).
   { receipts: { [txId]: dataUrl }, votes: { [restaurantId]: "like"|"dislike" } } */
const LOCAL_EXTRAS_KEY = STORAGE_KEY + "-local-extras";
const NOTION_IDMAP_KEY = STORAGE_KEY + "-notion-ids";

function loadJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch (e) {
    return fallback;
  }
}
function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // 용량 초과 등은 치명적이지 않으므로 무시
  }
}

export function StoreProvider({ children }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, loadInitial);

  // 최신 state 참조 (동기화 처리에서 사용)
  const stateRef = useRef(state);
  stateRef.current = state;

  // 앱 id → 노션 페이지 id 매핑, 기기 로컬 전용 데이터
  const idMapRef = useRef(loadJSON(NOTION_IDMAP_KEY, {}));
  const extrasRef = useRef(loadJSON(LOCAL_EXTRAS_KEY, { receipts: {}, votes: {} }));

  // 노션 기록은 순서 보장을 위해 프라미스 체인으로 직렬 처리
  // (식당 신규 등록 직후 충전 등록처럼 앞 작업의 노션 id가 필요한 경우 대비)
  const queueRef = useRef(Promise.resolve());
  const enqueue = (job) => {
    queueRef.current = queueRef.current
      .then(job)
      .catch((e) => console.warn("[노션 동기화 실패]", e));
  };

  const notionIdOf = (appId) => idMapRef.current[appId] || appId;

  /** 페이지에서 쓰는 dispatch — 로컬 즉시 반영 후 노션에 백그라운드 기록 */
  const dispatch = (action) => {
    const prev = stateRef.current;
    rawDispatch(action);
    if (!apiEnabled) return;

    switch (action.type) {
      case "ADD_RESTAURANT": {
        const r = action.restaurant;
        enqueue(async () => {
          const { notionId } = await apiCreateRestaurant(r);
          idMapRef.current[r.id] = notionId;
          saveJSON(NOTION_IDMAP_KEY, idMapRef.current);
        });
        break;
      }
      case "UPDATE_RESTAURANT": {
        const base = prev.restaurants.find((r) => r.id === action.id);
        if (!base) break;
        const merged = { ...base, ...action.patch };
        enqueue(() => apiUpdateRestaurant(notionIdOf(action.id), merged));
        break;
      }
      case "VOTE": {
        const base = prev.restaurants.find((r) => r.id === action.id);
        if (!base) break;
        const merged = { ...base, ...applyVote(base, action.vote) };
        extrasRef.current.votes[action.id] = merged.myVote;
        saveJSON(LOCAL_EXTRAS_KEY, extrasRef.current);
        enqueue(() => apiUpdateRestaurant(notionIdOf(action.id), merged));
        break;
      }
      case "ADD_TRANSACTION": {
        const t = action.transaction;
        // 영수증 이미지는 기기 로컬에만 보관 (노션 미전송)
        if (t.receipt) {
          extrasRef.current.receipts[t.id] = t.receipt;
          saveJSON(LOCAL_EXTRAS_KEY, extrasRef.current);
        }
        const restaurant = prev.restaurants.find((r) => r.id === t.restaurantId);
        const prevBalance = prev.transactions
          .filter((x) => x.restaurantId === t.restaurantId)
          .reduce((sum, x) => sum + (x.type === "charge" ? x.amount : -x.amount), 0);
        const balanceAfter = prevBalance + (t.type === "charge" ? t.amount : -t.amount);
        const mmdd = (t.date || "").slice(5);
        const title = `${restaurant?.name ?? ""} ${t.type === "charge" ? "충전" : "사용"} (${mmdd})`;
        enqueue(async () => {
          const { notionId } = await apiCreateTransaction({
            transaction: { ...t, receipt: undefined },
            balanceAfter,
            title,
            restaurantPageId: notionIdOf(t.restaurantId),
          });
          // ⭐ 생성된 노션 페이지 id 를 매핑에 저장해야
          //    이후 이 거래를 수정/삭제할 때 올바른 노션 페이지를 대상으로 반영된다.
          if (notionId) {
            idMapRef.current[t.id] = notionId;
            saveJSON(NOTION_IDMAP_KEY, idMapRef.current);
          }
        });
        break;
      }
      case "UPDATE_TRANSACTION": {
        const base = prev.transactions.find((x) => x.id === action.id);
        if (!base) break;
        const merged = { ...base, ...action.patch };
        // 영수증 이미지는 기기 로컬에만 보관 (노션 미전송)
        if (action.patch.receipt !== undefined) {
          if (action.patch.receipt) extrasRef.current.receipts[action.id] = action.patch.receipt;
          else delete extrasRef.current.receipts[action.id];
          saveJSON(LOCAL_EXTRAS_KEY, extrasRef.current);
        }
        // 수정 반영 후 해당 식당의 잔액 재계산
        const balanceAfter = prev.transactions
          .map((x) => (x.id === action.id ? merged : x))
          .filter((x) => x.restaurantId === merged.restaurantId)
          .reduce((sum, x) => sum + (x.type === "charge" ? x.amount : -x.amount), 0);
        const restaurant = prev.restaurants.find((r) => r.id === merged.restaurantId);
        const mmdd = (merged.date || "").slice(5);
        const title = `${restaurant?.name ?? ""} ${merged.type === "charge" ? "충전" : "사용"} (${mmdd})`;
        enqueue(() =>
          apiUpdateTransaction(notionIdOf(action.id), {
            transaction: { ...merged, receipt: undefined },
            balanceAfter,
            title,
            restaurantPageId: notionIdOf(merged.restaurantId),
          })
        );
        break;
      }
      case "DELETE_TRANSACTION": {
        const base = prev.transactions.find((x) => x.id === action.id);
        if (!base) break;
        if (extrasRef.current.receipts[action.id]) {
          delete extrasRef.current.receipts[action.id];
          saveJSON(LOCAL_EXTRAS_KEY, extrasRef.current);
        }
        // 삭제 반영 후 해당 식당의 잔액 재계산
        const balanceAfter = prev.transactions
          .filter((x) => x.id !== action.id && x.restaurantId === base.restaurantId)
          .reduce((sum, x) => sum + (x.type === "charge" ? x.amount : -x.amount), 0);
        enqueue(() =>
          apiDeleteTransaction(notionIdOf(action.id), {
            balanceAfter,
            restaurantPageId: notionIdOf(base.restaurantId),
          })
        );
        break;
      }
      default:
        break; // RESET 등은 로컬 전용
    }
  };

  /* 시작 시 노션에서 전체 데이터 로드 (실패하면 로컬 캐시로 계속 동작) */
  useEffect(() => {
    if (!apiEnabled) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await setupSchema().catch(() => {}); // 누락 속성 자동 보정 (실패해도 진행)
        const { restaurants, transactions } = await fetchData();
        if (cancelled) return;
        // 노션 페이지 id 매핑 갱신 + 로컬 전용 데이터(영수증/내 투표) 결합
        for (const r of restaurants) {
          if (r.notionId) idMapRef.current[r.id] = r.notionId;
        }
        for (const t of transactions) {
          if (t.notionId) idMapRef.current[t.id] = t.notionId;
        }
        saveJSON(NOTION_IDMAP_KEY, idMapRef.current);
        rawDispatch({
          type: "LOAD",
          restaurants: restaurants.map((r) => ({
            ...r,
            myVote: extrasRef.current.votes[r.id] ?? null,
          })),
          transactions: transactions.map((t) => ({
            ...t,
            receipt: extrasRef.current.receipts[t.id] ?? null,
          })),
        });
      } catch (e) {
        console.warn("[노션 로드 실패 — 로컬 데이터로 동작]", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // 저장 실패(용량 초과 등)는 치명적이지 않으므로 무시
    }
  }, [state]);

  /**
   * 주소/링크 기반 자동 지오코딩 — 식당에 입력된 주소 또는 위치 링크가 새로 입력/수정되면
   * 지도 좌표(lat/lng)를 자동으로 계산해 채운다.
   *   1순위: 주소(address) → Nominatim 지오코딩
   *   2순위: 위치 링크(locationUrl) 안에 박힌 좌표 추출 (구글/네이버/카카오 등)
   * geocodedFrom 에 마지막 사용 소스(주소 또는 링크)를 기록해, 값이 안 바뀌면 재요청하지 않는다.
   * 실패해도 기존 좌표는 그대로 유지된다. 한 번에 하나씩 처리하고 요청 간격(1.1s)을 둔다.
   */
  useEffect(() => {
    // v2: 네이버 지오코더 도입 — geocodedFrom 에 버전 접두사를 붙여, 기존에 부정확하게
    //     지오코딩된 좌표도 한 번은 다시 계산하도록 강제한다.
    const GEO_VER = "v2";
    const sourceOf = (r) => (r.address && r.address.trim()) || (r.locationUrl && r.locationUrl.trim()) || "";
    const keyOf = (r) => {
      const src = sourceOf(r);
      return src ? `${GEO_VER}:${src}` : "";
    };
    const target = state.restaurants.find((r) => {
      const key = keyOf(r);
      return key && r.geocodedFrom !== key;
    });
    if (!target) return undefined;

    const src = keyOf(target);
    let cancelled = false;
    const timer = setTimeout(async () => {
      const geo = await resolveRestaurantCoords({
        address: target.address,
        locationUrl: target.locationUrl,
      });
      if (cancelled) return;
      dispatch({
        type: "UPDATE_RESTAURANT",
        id: target.id,
        // 좌표 해석 성공 시에만 갱신, 실패해도 재시도 방지를 위해 geocodedFrom 은 기록
        patch: { ...(geo || {}), geocodedFrom: src },
      });
    }, 1100);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state.restaurants]);

  const api = useMemo(() => {
    const balanceOf = (restaurantId) =>
      state.transactions
        .filter((t) => t.restaurantId === restaurantId)
        .reduce((sum, t) => sum + (t.type === "charge" ? t.amount : -t.amount), 0);

    const historyOf = (restaurantId) =>
      state.transactions
        .filter((t) => t.restaurantId === restaurantId)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    return {
      state,
      dispatch,
      balanceOf,
      historyOf,
      /** 노션 동기화 활성 여부 (UI 안내용) */
      syncEnabled: apiEnabled,
      /** 잔액 포함 식당 목록 */
      restaurantsWithBalance: () =>
        state.restaurants.map((r) => ({ ...r, balance: balanceOf(r.id) })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
