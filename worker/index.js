/**
 * RD센터 야근식당 가이드 — Notion 동기화 프록시 (Cloudflare Worker)
 *
 * 브라우저에서는 노션 API를 직접 호출할 수 없으므로(CORS + 토큰 보안),
 * 이 워커가 중간에서 노션 API를 중계한다.
 *
 * 환경 변수 (wrangler.toml / 대시보드):
 *   NOTION_TOKEN        (secret) 노션 Integration 토큰
 *   RESTAURANTS_DB_ID   식당 목록 DB ID
 *   TRANSACTIONS_DB_ID  입출금 이력 DB ID
 *   ALLOWED_ORIGIN      허용 오리진 (기본 *)
 *   API_KEY             (선택, secret) 설정 시 X-Api-Key 헤더 요구
 *   VAPID_PUBLIC_KEY    (푸시) VAPID 공개키 — base64url raw 65바이트
 *   VAPID_PRIVATE_KEY   (푸시, secret) VAPID 개인키 d — base64url 32바이트
 *   VAPID_SUBJECT       (푸시, 선택) mailto: 연락처
 * KV 바인딩:
 *   PUSH_SUBS           푸시 구독 저장소 (키: 엔드포인트 SHA-256, 값: 구독 JSON)
 *
 * 엔드포인트:
 *   GET  /api/data                 식당+이력 전체 (앱 데이터 형태로 매핑)
 *   POST /api/setup                노션 DB에 누락 속성 자동 추가 (최초 1회)
 *   POST /api/restaurants          식당 생성  { restaurant }        → 푸시 발송
 *   PUT  /api/restaurants/:pageId  식당 전체 갱신 { restaurant }
 *   POST /api/transactions         거래 생성  { ... }               → 푸시 발송
 *   PUT  /api/transactions/:pageId 거래 수정  { transaction, balanceAfter, title, restaurantPageId }
 *   DELETE /api/transactions/:pageId 거래 삭제(아카이브) { balanceAfter, restaurantPageId }
 *   GET  /api/push/public-key      VAPID 공개키 (푸시 미설정 시 { key: null })
 *   POST /api/push/subscribe       구독 등록  { subscription }
 *   POST /api/push/unsubscribe     구독 해제  { endpoint }
 */

import { sendWebPush, bytesToB64u } from "./webpush.js";

const NOTION = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

/* ---------------------------------- 유틸 ---------------------------------- */

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Api-Key,X-Push-Sender",
    "Access-Control-Max-Age": "86400",
  };
}

function json(env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

async function notion(env, method, path, body) {
  const res = await fetch(`${NOTION}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Notion ${method} ${path} ${res.status}: ${data.message || ""}`);
  }
  return data;
}

/** DB 전체 페이지 조회 (페이지네이션 처리) */
async function queryAll(env, dbId) {
  const results = [];
  let cursor = undefined;
  do {
    const data = await notion(env, "POST", `/databases/${dbId}/query`, {
      page_size: 100,
      start_cursor: cursor,
    });
    results.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

/* ------------------------- 노션 속성 <-> 값 변환 헬퍼 ------------------------- */

const rt = (s) => ({ rich_text: s ? [{ text: { content: String(s).slice(0, 1900) } }] : [] });
const title = (s) => ({ title: [{ text: { content: String(s || "").slice(0, 1900) } }] });
const num = (n) => ({ number: typeof n === "number" && Number.isFinite(n) ? n : null });
const sel = (s) => ({ select: s ? { name: s } : null });
const url = (s) => ({ url: s ? String(s) : null });
const chk = (b) => ({ checkbox: !!b });
const dat = (s) => ({ date: s ? { start: s } : null });

const getText = (p) => (p?.rich_text || []).map((t) => t.plain_text).join("");
const getTitle = (p) => (p?.title || []).map((t) => t.plain_text).join("");
const getNum = (p) => (typeof p?.number === "number" ? p.number : 0);
const getSel = (p) => p?.select?.name || "";
const getUrl = (p) => p?.url || "";
const getChk = (p) => !!p?.checkbox;
const getDate = (p) => p?.date?.start || "";

/* ----------------------------- 식당 매핑 ----------------------------- */

/** 앱 restaurant 객체 → 노션 속성 (앱 전용 필드는 앱데이터 JSON으로) */
function restaurantProps(r) {
  const appdata = {};
  for (const k of ["position", "lat", "lng", "geocodedFrom", "icon", "myVote"]) {
    if (r[k] !== undefined) appdata[k] = r[k];
  }
  return {
    상호: title(r.name),
    "주요 메뉴": rt(r.mainMenu),
    "위치(주소)": rt(r.address),
    "위치 링크": url(r.locationUrl),
    "가는 길": rt(r.guide),
    메모: rt(r.memo),
    쿠폰: chk(r.coupon),
    좋아요: num(r.likes ?? 0),
    싫어요: num(r.dislikes ?? 0),
    앱ID: rt(r.id),
    앱데이터: rt(JSON.stringify(appdata)),
  };
}

function pageToRestaurant(page) {
  const p = page.properties;
  let appdata = {};
  try {
    appdata = JSON.parse(getText(p["앱데이터"]) || "{}");
  } catch (e) {
    appdata = {};
  }
  return {
    id: getText(p["앱ID"]) || page.id,
    notionId: page.id,
    name: getTitle(p["상호"]),
    mainMenu: getText(p["주요 메뉴"]),
    address: getText(p["위치(주소)"]),
    locationUrl: getUrl(p["위치 링크"]),
    guide: getText(p["가는 길"]),
    memo: getText(p["메모"]),
    coupon: getChk(p["쿠폰"]),
    likes: getNum(p["좋아요"]),
    dislikes: getNum(p["싫어요"]),
    myVote: null, // 투표는 기기별 로컬 보관
    ...appdata,
  };
}

/* ----------------------------- 거래 매핑 ----------------------------- */

function transactionProps(t, extra) {
  return {
    내역명: title(extra.title),
    구분: sel(t.type === "charge" ? "충전" : "사용"),
    일자: dat(t.date),
    금액: num(t.amount),
    사용자: rt(t.user),
    "사용 후 잔액": num(extra.balanceAfter),
    메모: rt(t.memo),
    쿠폰: chk(t.coupon),
    앱ID: rt(t.id),
    식당: { relation: [{ id: extra.restaurantPageId }] },
  };
}

function pageToTransaction(page) {
  const p = page.properties;
  return {
    id: getText(p["앱ID"]) || page.id,
    notionId: page.id,
    restaurantNotionId: p["식당"]?.relation?.[0]?.id || null,
    type: getSel(p["구분"]) === "충전" ? "charge" : "use",
    date: getDate(p["일자"]),
    amount: getNum(p["금액"]),
    user: getText(p["사용자"]),
    memo: getText(p["메모"]),
    coupon: getChk(p["쿠폰"]),
    receipt: null, // 증빙 이미지는 기기별 로컬 보관 (v1)
  };
}

/* ----------------------------- 웹푸시 ----------------------------- */

const pushEnabled = (env) => !!(env.PUSH_SUBS && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

/** 구독 저장 키 — 엔드포인트의 SHA-256 (KV 키 길이 제한/특수문자 회피) */
async function subKey(endpoint) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return bytesToB64u(digest);
}

/**
 * 저장된 모든 구독에 푸시 발송.
 * excludeEndpoint: 작업을 일으킨 기기(X-Push-Sender)는 제외.
 * 만료된 구독(404/410)은 KV에서 자동 삭제.
 */
async function broadcastPush(env, payload, excludeEndpoint) {
  if (!pushEnabled(env)) return;
  const body = JSON.stringify(payload);
  let cursor = undefined;
  do {
    const page = await env.PUSH_SUBS.list({ cursor, limit: 100 });
    await Promise.all(
      page.keys.map(async ({ name }) => {
        try {
          const sub = await env.PUSH_SUBS.get(name, "json");
          if (!sub || sub.endpoint === excludeEndpoint) return;
          const status = await sendWebPush(env, sub, body);
          if (status === 404 || status === 410) await env.PUSH_SUBS.delete(name);
        } catch (e) {
          console.warn("[push 발송 실패]", e);
        }
      })
    );
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

const fmtWon = (n) => `${Number(n || 0).toLocaleString("ko-KR")}원`;

/* ----------------------------- 비밀번호 게이트 ----------------------------- */
/*
 * 홈(앱 전체) 접근 비밀번호를 노션 전용 DB에 보관하고, 대조는 오직 서버에서만 한다.
 * 비밀번호 원문은 어떤 API 응답에도 포함되지 않는다. 값 변경은 노션에서 직접 수정.
 *   - DB 확보 순서: 환경변수 PASSWORD_DB_ID > 제목 검색 > (없으면) 자동 생성 + 초기값 시드
 *   - 초기 비밀번호: 53075
 */
const GATE_DB_TITLE = "앱 접근 비밀번호"; // 노션 전용 테이블 제목
const GATE_PW_PROP = "비밀번호"; // 비밀번호를 담는 속성(rich_text)
const GATE_INITIAL_PASSWORD = "53075"; // 최초 시드 값

/** 문자열 상수시간 비교 — 타이밍 공격 완화 */
function safeEqual(a, b) {
  a = String(a ?? "");
  b = String(b ?? "");
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** DB 의 부모 페이지 id (없으면 null) — 자동 생성 위치 결정용 */
async function parentPageIdOf(env, dbId) {
  try {
    const db = await notion(env, "GET", `/databases/${dbId}`);
    return db?.parent?.type === "page_id" ? db.parent.page_id : null;
  } catch {
    return null;
  }
}

/** 비밀번호 DB 한 행에 초기값 시드 */
async function seedGatePassword(env, dbId) {
  await notion(env, "POST", "/pages", {
    parent: { database_id: dbId },
    properties: {
      이름: { title: [{ text: { content: "홈 화면 비밀번호" } }] },
      [GATE_PW_PROP]: { rich_text: [{ text: { content: GATE_INITIAL_PASSWORD } }] },
    },
  });
}

/** 비밀번호 DB id 확보 (설정값 > 제목 검색 > 자동 생성) */
async function ensureGateDbId(env) {
  if (env.PASSWORD_DB_ID) return env.PASSWORD_DB_ID;

  // 노션 검색으로 기존 DB 탐색
  const found = await notion(env, "POST", "/search", {
    query: GATE_DB_TITLE,
    filter: { property: "object", value: "database" },
  });
  const hit = (found.results || []).find(
    (d) => (d.title || []).map((t) => t.plain_text).join("") === GATE_DB_TITLE
  );
  if (hit) return hit.id;

  // 없으면 식당 DB 의 부모 페이지 아래에 새 테이블 생성 + 초기값 시드
  const parentPage = await parentPageIdOf(env, env.RESTAURANTS_DB_ID);
  if (!parentPage) {
    throw new Error("gate db parent not found; set PASSWORD_DB_ID");
  }
  const created = await notion(env, "POST", "/databases", {
    parent: { type: "page_id", page_id: parentPage },
    title: [{ type: "text", text: { content: GATE_DB_TITLE } }],
    properties: { 이름: { title: {} }, [GATE_PW_PROP]: { rich_text: {} } },
  });
  await seedGatePassword(env, created.id);
  // 이후 콜드스타트 지연을 줄이려면 이 id 를 PASSWORD_DB_ID 로 등록 권장
  console.log("[gate] 비밀번호 DB 생성됨. PASSWORD_DB_ID 로 등록 권장:", created.id);
  return created.id;
}

/** 저장된 비밀번호 읽기 (첫 행) — 행이 없으면 초기값 시드 후 반환 */
async function readGatePassword(env) {
  const dbId = await ensureGateDbId(env);
  const data = await notion(env, "POST", `/databases/${dbId}/query`, { page_size: 1 });
  const page = (data.results || [])[0];
  if (!page) {
    await seedGatePassword(env, dbId);
    return GATE_INITIAL_PASSWORD;
  }
  const prop = page.properties?.[GATE_PW_PROP];
  const fromRich = (prop?.rich_text || [])
    .map((t) => t.plain_text)
    .join("")
    .trim();
  const fromTitle = (prop?.title || [])
    .map((t) => t.plain_text)
    .join("")
    .trim();
  return fromRich || fromTitle;
}

/** 제출 비밀번호 검증 — 일치 여부(boolean)만 반환, 원문은 절대 반환하지 않음 */
async function verifyGatePassword(env, submitted) {
  const stored = await readGatePassword(env);
  if (!stored) return false;
  return safeEqual(String(submitted ?? "").trim(), stored);
}

/* ----------------------------- 라우팅 ----------------------------- */

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    // 선택적 API 키 검사
    if (env.API_KEY && request.headers.get("X-Api-Key") !== env.API_KEY) {
      return json(env, { error: "unauthorized" }, 401);
    }

    const { pathname } = new URL(request.url);
    const pushSender = request.headers.get("X-Push-Sender") || null;

    try {
      /* ---------- 비밀번호 게이트 검증 ---------- */
      if (request.method === "POST" && pathname === "/api/gate/verify") {
        const { password } = await request.json().catch(() => ({}));
        const ok = await verifyGatePassword(env, password);
        return json(env, { ok }, ok ? 200 : 401);
      }

      /* ---------- 웹푸시 구독 관리 ---------- */
      if (request.method === "GET" && pathname === "/api/push/public-key") {
        return json(env, { key: pushEnabled(env) ? env.VAPID_PUBLIC_KEY : null });
      }
      if (request.method === "POST" && pathname === "/api/push/subscribe") {
        if (!pushEnabled(env)) return json(env, { error: "push not configured" }, 503);
        const { subscription } = await request.json();
        if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
          return json(env, { error: "invalid subscription" }, 400);
        }
        await env.PUSH_SUBS.put(await subKey(subscription.endpoint), JSON.stringify(subscription));
        return json(env, { ok: true });
      }
      if (request.method === "POST" && pathname === "/api/push/unsubscribe") {
        if (!pushEnabled(env)) return json(env, { error: "push not configured" }, 503);
        const { endpoint } = await request.json();
        if (endpoint) await env.PUSH_SUBS.delete(await subKey(endpoint));
        return json(env, { ok: true });
      }

      /* 전체 데이터 */
      if (request.method === "GET" && pathname === "/api/data") {
        const [rPages, tPages] = await Promise.all([
          queryAll(env, env.RESTAURANTS_DB_ID),
          queryAll(env, env.TRANSACTIONS_DB_ID),
        ]);
        const restaurants = rPages.map(pageToRestaurant);
        const byNotionId = Object.fromEntries(restaurants.map((r) => [r.notionId, r.id]));
        const transactions = tPages
          .map(pageToTransaction)
          .map((t) => ({ ...t, restaurantId: byNotionId[t.restaurantNotionId] || null }))
          .filter((t) => t.restaurantId);
        return json(env, { restaurants, transactions });
      }

      /* 노션 DB 스키마 보정 — 누락 속성 자동 추가 (여러 번 호출해도 안전) */
      if (request.method === "POST" && pathname === "/api/setup") {
        const ensure = async (dbId, wanted) => {
          const db = await notion(env, "GET", `/databases/${dbId}`);
          const missing = {};
          for (const [name, def] of Object.entries(wanted)) {
            if (!db.properties[name]) missing[name] = def;
          }
          if (Object.keys(missing).length > 0) {
            await notion(env, "PATCH", `/databases/${dbId}`, { properties: missing });
          }
          return Object.keys(missing);
        };
        const addedR = await ensure(env.RESTAURANTS_DB_ID, {
          "가는 길": { rich_text: {} },
          메모: { rich_text: {} },
          쿠폰: { checkbox: {} },
          좋아요: { number: {} },
          싫어요: { number: {} },
          앱ID: { rich_text: {} },
          앱데이터: { rich_text: {} },
        });
        const addedT = await ensure(env.TRANSACTIONS_DB_ID, {
          메모: { rich_text: {} },
          쿠폰: { checkbox: {} },
          앱ID: { rich_text: {} },
        });
        return json(env, { ok: true, added: { restaurants: addedR, transactions: addedT } });
      }

      /* 식당 생성 */
      if (request.method === "POST" && pathname === "/api/restaurants") {
        const { restaurant } = await request.json();
        const page = await notion(env, "POST", "/pages", {
          parent: { database_id: env.RESTAURANTS_DB_ID },
          properties: {
            ...restaurantProps(restaurant),
            "현재 잔액": num(0),
            상태: sel("비활성"),
          },
        });
        // 새 식당 등록 푸시 (응답 지연 없이 백그라운드 발송)
        ctx.waitUntil(
          broadcastPush(
            env,
            {
              title: "🏠 새 식당 등록",
              body: `${restaurant.name}${restaurant.mainMenu ? ` (${restaurant.mainMenu})` : ""} 식당이 등록되었습니다.`,
              tag: "restaurant-added",
            },
            pushSender
          )
        );
        return json(env, { ok: true, notionId: page.id });
      }

      /* 식당 전체 갱신 (좋아요/정보수정/지오코딩 좌표 포함) */
      if (request.method === "PUT" && pathname.startsWith("/api/restaurants/")) {
        const pageId = pathname.split("/").pop();
        const { restaurant } = await request.json();
        await notion(env, "PATCH", `/pages/${pageId}`, {
          properties: restaurantProps(restaurant),
        });
        return json(env, { ok: true });
      }

      /* 거래 생성 (+ 식당 잔액/상태 갱신) */
      if (request.method === "POST" && pathname === "/api/transactions") {
        const { transaction, balanceAfter, title: t, restaurantPageId } = await request.json();
        const page = await notion(env, "POST", "/pages", {
          parent: { database_id: env.TRANSACTIONS_DB_ID },
          properties: transactionProps(transaction, {
            title: t,
            balanceAfter,
            restaurantPageId,
          }),
        });
        // 식당 카드의 현재 잔액/상태도 함께 갱신 (노션에서 볼 때 편하도록)
        const status = balanceAfter < 0 ? "활성(외상)" : balanceAfter === 0 ? "비활성" : "활성";
        await notion(env, "PATCH", `/pages/${restaurantPageId}`, {
          properties: { "현재 잔액": num(balanceAfter), 상태: sel(status) },
        });
        // 충전/사용 등록 푸시 (응답 지연 없이 백그라운드 발송)
        const isCharge = transaction.type === "charge";
        ctx.waitUntil(
          broadcastPush(
            env,
            {
              title: isCharge ? "💰 예치금 충전" : "🍽️ 예치금 사용",
              body: `${t} ${fmtWon(transaction.amount)} · 잔액 ${fmtWon(balanceAfter)}${
                transaction.user ? ` · ${transaction.user}` : ""
              }`,
              tag: "transaction-added",
            },
            pushSender
          )
        );
        return json(env, { ok: true, notionId: page.id });
      }

      /* 거래 수정 (+ 식당 잔액/상태 재갱신) */
      if (request.method === "PUT" && pathname.startsWith("/api/transactions/")) {
        const pageId = pathname.split("/").pop();
        const { transaction, balanceAfter, title: t, restaurantPageId } = await request.json();
        await notion(env, "PATCH", `/pages/${pageId}`, {
          properties: transactionProps(transaction, {
            title: t,
            balanceAfter,
            restaurantPageId,
          }),
        });
        const status = balanceAfter < 0 ? "활성(외상)" : balanceAfter === 0 ? "비활성" : "활성";
        await notion(env, "PATCH", `/pages/${restaurantPageId}`, {
          properties: { "현재 잔액": num(balanceAfter), 상태: sel(status) },
        });
        return json(env, { ok: true });
      }

      /* 거래 삭제 — 노션 페이지는 아카이브 처리 (+ 식당 잔액/상태 재갱신) */
      if (request.method === "DELETE" && pathname.startsWith("/api/transactions/")) {
        const pageId = pathname.split("/").pop();
        const { balanceAfter, restaurantPageId } = await request.json();
        await notion(env, "PATCH", `/pages/${pageId}`, { archived: true });
        if (restaurantPageId) {
          const status = balanceAfter < 0 ? "활성(외상)" : balanceAfter === 0 ? "비활성" : "활성";
          await notion(env, "PATCH", `/pages/${restaurantPageId}`, {
            properties: { "현재 잔액": num(balanceAfter), 상태: sel(status) },
          });
        }
        return json(env, { ok: true });
      }

      return json(env, { error: "not found" }, 404);
    } catch (e) {
      return json(env, { error: String(e.message || e) }, 500);
    }
  },
};
