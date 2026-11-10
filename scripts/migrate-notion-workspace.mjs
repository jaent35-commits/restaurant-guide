#!/usr/bin/env node
/**
 * 노션 워크스페이스(계정) 이관 스크립트
 *
 * 기존 노션 계정의 [식당 목록] / [입출금 이력] / [앱 접근 비밀번호] DB를
 * 새 노션 계정의 지정 페이지 아래에 같은 스키마로 만들고 데이터를 그대로 복사한다.
 *   - 식당 ↔ 이력 relation 은 새 페이지 id 로 다시 연결
 *   - 앱ID 가 비어 있던 행은 기존 페이지 id 를 앱ID 로 채워, 앱(브라우저)의 id 가 바뀌지 않게 함
 *     → 기기별 영수증 이미지/내 투표(localStorage) 연결이 그대로 유지된다
 *   - 기존 워크스페이스는 읽기만 하고 절대 수정하지 않는다 (백업으로 남음)
 *   - 완료 후 worker/wrangler.toml 의 DB ID 를 새 값으로 교체
 *
 * 사용법 (프로젝트 루트에서, PowerShell):
 *   $env:OLD_NOTION_TOKEN = Read-Host "기존 계정 토큰"
 *   $env:NEW_NOTION_TOKEN = Read-Host "새 계정 토큰"
 *   $env:NEW_PARENT_PAGE  = "새 계정의 상위 페이지 URL 또는 ID"
 *   node scripts/migrate-notion-workspace.mjs --dry-run   # 읽기 전용 점검
 *   node scripts/migrate-notion-workspace.mjs             # 실제 이관
 *
 * 옵션:
 *   --dry-run     어떤 것도 생성/수정하지 않고 점검 결과만 출력
 *   --force       새 상위 페이지에 같은 제목의 DB가 이미 있어도 진행 (중복 생성 주의)
 *   --no-toml     worker/wrangler.toml 을 수정하지 않음
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const NOTION = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28"; // worker/index.js 와 동일 버전
const GATE_DB_TITLE = "앱 접근 비밀번호";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOML_PATH = join(ROOT, "worker", "wrangler.toml");

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const FORCE = args.has("--force");
const WRITE_TOML = !args.has("--no-toml");

/* ---------------------------------- 유틸 ---------------------------------- */

const warnings = [];
const warn = (msg) => {
  warnings.push(msg);
  console.warn(`  ⚠ ${msg}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (id) =>
  String(id || "")
    .replace(/-/g, "")
    .toLowerCase();

/** 노션 URL 또는 ID 문자열에서 32자리 페이지 id 추출 */
function parsePageId(input) {
  const hex = String(input || "")
    .split(/[?#]/)[0]
    .replace(/-/g, "")
    .match(/[0-9a-f]{32}$/i);
  return hex ? hex[0].toLowerCase() : null;
}

function makeClient(token, label) {
  return async function notion(method, path, body) {
    for (let attempt = 0; ; attempt++) {
      await sleep(350); // 노션 평균 3req/s 제한 대응
      let res;
      try {
        res = await fetch(`${NOTION}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        // 네트워크 단 오류(연결 끊김/보안 프로그램/인증서 등) — 잠시 후 재시도
        const cause = e.cause?.code || e.cause?.message || e.message;
        if (attempt < 5) {
          console.warn(`  … [${label}] 네트워크 오류(${cause}) — ${attempt + 1}번째 재시도`);
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw new Error(`[${label}] 노션 서버 연결 실패(네트워크): ${cause}`);
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 5) {
        const wait = Number(res.headers.get("Retry-After")) * 1000 || 1000 * 2 ** attempt;
        await sleep(wait);
        continue;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(`[${label}] ${method} ${path} ${res.status}: ${data.message || ""}`);
      }
      return data;
    }
  };
}

async function queryAll(notion, dbId) {
  const results = [];
  let cursor;
  do {
    const data = await notion("POST", `/databases/${dbId}/query`, {
      page_size: 100,
      start_cursor: cursor,
    });
    results.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

async function listChildren(notion, blockId) {
  const results = [];
  let cursor;
  do {
    const q = cursor ? `?page_size=100&start_cursor=${cursor}` : "?page_size=100";
    const data = await notion("GET", `/blocks/${blockId}/children${q}`);
    results.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

const plain = (rich = []) => rich.map((t) => t.plain_text).join("");

/** rich_text 배열 복제 — 멘션/수식은 일반 텍스트로 변환 */
const cloneRichText = (rich = []) =>
  rich.map((t) => ({
    type: "text",
    text: {
      content: t.type === "text" ? t.text.content : t.plain_text,
      link: t.type === "text" ? t.text.link : t.href ? { url: t.href } : null,
    },
    annotations: t.annotations,
  }));

/* ------------------------------ 스키마 복제 ------------------------------ */

const SIMPLE_SCHEMA_TYPES = new Set([
  "rich_text",
  "checkbox",
  "url",
  "email",
  "phone_number",
  "date",
  "files",
  "people",
  "created_time",
  "created_by",
  "last_edited_time",
  "last_edited_by",
]);

/** DB 생성 시 바로 만들 수 있는 속성 정의 — 불가하면 null (relation/rollup/formula 등은 별도 처리) */
function baseSchemaOf(def) {
  const opts = (list = []) => list.map((o) => ({ name: o.name, color: o.color }));
  if (def.type === "title") return { title: {} };
  if (SIMPLE_SCHEMA_TYPES.has(def.type)) return { [def.type]: {} };
  if (def.type === "number") return { number: { format: def.number?.format || "number" } };
  if (def.type === "select") return { select: { options: opts(def.select?.options) } };
  if (def.type === "multi_select") {
    return { multi_select: { options: opts(def.multi_select?.options) } };
  }
  // status 속성은 API 로 생성할 수 없어 select 로 변환 (앱은 select 로 기록하므로 영향 없음)
  if (def.type === "status") return { select: { options: opts(def.status?.options) } };
  return null;
}

/** DB 생성 이후 개별 추가할 속성 정의 (실패해도 경고만) */
function deferredSchemaOf(def) {
  if (def.type === "rollup") {
    const { relation_property_name, rollup_property_name, function: fn } = def.rollup || {};
    return { rollup: { relation_property_name, rollup_property_name, function: fn } };
  }
  if (def.type === "formula") return { formula: { expression: def.formula?.expression } };
  if (def.type === "unique_id") return { unique_id: { prefix: def.unique_id?.prefix ?? null } };
  return null;
}

/* ------------------------------ 값 복제 ------------------------------ */

/** 페이지 속성 값 → 생성 요청용 값. 쓸 수 없는 타입(계산값 등)은 undefined */
function cloneValue(prop, pageMap) {
  switch (prop.type) {
    case "title":
      return { title: cloneRichText(prop.title) };
    case "rich_text":
      return { rich_text: cloneRichText(prop.rich_text) };
    case "number":
      return { number: prop.number };
    case "checkbox":
      return { checkbox: prop.checkbox };
    case "url":
      return { url: prop.url };
    case "email":
      return { email: prop.email };
    case "phone_number":
      return { phone_number: prop.phone_number };
    case "select":
      return { select: prop.select ? { name: prop.select.name } : null };
    case "status":
      return { select: prop.status ? { name: prop.status.name } : null };
    case "multi_select":
      return { multi_select: (prop.multi_select || []).map((o) => ({ name: o.name })) };
    case "date":
      return {
        date: prop.date
          ? { start: prop.date.start, end: prop.date.end, time_zone: prop.date.time_zone }
          : null,
      };
    case "relation":
      return {
        relation: (prop.relation || [])
          .map((r) => pageMap.get(norm(r.id)))
          .filter(Boolean)
          .map((id) => ({ id })),
      };
    default:
      return undefined;
  }
}

/* ------------------------------ 이관 본체 ------------------------------ */

function readToml() {
  const toml = readFileSync(TOML_PATH, "utf8");
  const get = (key) => toml.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m"))?.[1] || "";
  return {
    toml,
    restaurantsDbId: get("RESTAURANTS_DB_ID"),
    transactionsDbId: get("TRANSACTIONS_DB_ID"),
    passwordDbId: get("PASSWORD_DB_ID"),
  };
}

function writeToml(toml, ids) {
  let next = toml
    .replace(/^(\s*RESTAURANTS_DB_ID\s*=\s*)"[^"]*"/m, `$1"${ids.restaurants}"`)
    .replace(/^(\s*TRANSACTIONS_DB_ID\s*=\s*)"[^"]*"/m, `$1"${ids.transactions}"`);
  if (ids.password) {
    next = /^\s*PASSWORD_DB_ID\s*=/m.test(next)
      ? next.replace(/^(\s*PASSWORD_DB_ID\s*=\s*)"[^"]*"/m, `$1"${ids.password}"`)
      : next.replace(/^#\s*PASSWORD_DB_ID\s*=\s*"[^"]*"/m, `PASSWORD_DB_ID = "${ids.password}"`);
  }
  writeFileSync(TOML_PATH, next, "utf8");
}

async function findGateDbId(oldNotion, configured) {
  if (configured) return configured;
  const found = await oldNotion("POST", "/search", {
    query: GATE_DB_TITLE,
    filter: { property: "object", value: "database" },
  });
  const hit = (found.results || []).find((d) => plain(d.title) === GATE_DB_TITLE);
  return hit ? hit.id : null;
}

/**
 * 기존 DB 하나를 읽어 이관 계획을 만든다.
 * relationTargets: { [기존 대상 DB id(norm)]: 새 대상 DB id } — 생성 시점에 채워짐
 */
async function loadSource(oldNotion, dbId, label) {
  const db = await oldNotion("GET", `/databases/${dbId}`);
  const pages = await queryAll(oldNotion, dbId);
  // 페이지 본문(블록)은 앱이 쓰지 않으므로 복사하지 않고, 내용이 있으면 알려만 준다
  const withBody = [];
  for (const p of pages) {
    const kids = await oldNotion("GET", `/blocks/${p.id}/children?page_size=1`);
    if (kids.results.length) withBody.push(p);
  }
  return { label, db, pages, withBody };
}

function titlePropName(db) {
  return Object.entries(db.properties).find(([, d]) => d.type === "title")[0];
}

function reportSource(src) {
  const { label, db, pages, withBody } = src;
  console.log(`\n■ ${label}: "${plain(db.title)}" — ${pages.length}행`);
  for (const [name, def] of Object.entries(db.properties)) {
    if (def.type === "status") warn(`${label}.${name}: status 속성 → select 로 변환됩니다`);
    if (def.type === "people") {
      if (pages.some((p) => (p.properties[name]?.people || []).length)) {
        warn(`${label}.${name}: 사람(people) 값은 계정이 달라 복사되지 않습니다`);
      }
    }
    if (def.type === "files") {
      if (pages.some((p) => (p.properties[name]?.files || []).length)) {
        warn(`${label}.${name}: 파일 첨부는 복사되지 않습니다 (노션에서 수동 재첨부 필요)`);
      }
    }
  }
  const titleProp = titlePropName(db);
  for (const p of withBody) {
    warn(
      `${label} "${plain(p.properties[titleProp].title)}": 페이지 본문 내용은 복사되지 않습니다`
    );
  }
}

/** 새 DB 생성 (기본 속성 + 지정 relation 포함) */
async function createDb(newNotion, parentPageId, src, extraProps = {}, skipProps = new Set()) {
  const properties = {};
  for (const [name, def] of Object.entries(src.db.properties)) {
    if (skipProps.has(name)) continue;
    const schema = baseSchemaOf(def);
    if (schema) properties[name] = schema;
  }
  Object.assign(properties, extraProps);
  const body = {
    parent: { type: "page_id", page_id: parentPageId },
    title: cloneRichText(src.db.title),
    is_inline: !!src.db.is_inline,
    properties,
  };
  if (src.db.icon?.type === "emoji") body.icon = src.db.icon;
  const created = await newNotion("POST", "/databases", body);
  console.log(`  ✔ "${plain(src.db.title)}" 생성: ${norm(created.id)}`);
  return created;
}

/** 생성 후 rollup/formula 등 개별 추가 */
async function addDeferredProps(newNotion, newDbId, src) {
  for (const [name, def] of Object.entries(src.db.properties)) {
    const schema = deferredSchemaOf(def);
    if (!schema) {
      if (!baseSchemaOf(def) && def.type !== "relation") {
        warn(`${src.label}.${name}: 지원하지 않는 속성 타입(${def.type}) — 건너뜀`);
      }
      continue;
    }
    try {
      await newNotion("PATCH", `/databases/${newDbId}`, { properties: { [name]: schema } });
      console.log(`  ✔ ${src.label}.${name} (${def.type}) 추가`);
    } catch (e) {
      warn(
        `${src.label}.${name} (${def.type}) 자동 생성 실패 — 노션에서 직접 추가 필요 (${e.message})`
      );
    }
  }
}

/** 앱ID 속성이 없으면 추가 (앱 id 유지를 위해 필요) */
async function ensureAppIdProp(newNotion, newDbId, src) {
  if (src.db.properties["앱ID"]) return;
  await newNotion("PATCH", `/databases/${newDbId}`, { properties: { 앱ID: { rich_text: {} } } });
}

/** 행 복사 — 기존 페이지 id → 새 페이지 id 를 pageMap 에 기록 */
async function copyRows(newNotion, newDbId, src, pageMap, skipProps = new Set()) {
  let i = 0;
  for (const page of src.pages) {
    const properties = {};
    for (const [name, prop] of Object.entries(page.properties)) {
      if (skipProps.has(name)) continue;
      const v = cloneValue(prop, pageMap);
      if (v !== undefined) properties[name] = v;
    }
    // 앱ID 가 비어 있으면 기존 페이지 id 를 넣어 앱에서 보는 id 를 그대로 유지
    if (src.withAppId && !plain(page.properties["앱ID"]?.rich_text)) {
      properties["앱ID"] = { rich_text: [{ type: "text", text: { content: page.id } }] };
    }
    const body = { parent: { database_id: newDbId }, properties };
    if (page.icon?.type === "emoji") body.icon = page.icon;
    const created = await newNotion("POST", "/pages", body);
    pageMap.set(norm(page.id), created.id);
    i++;
    process.stdout.write(`\r  … ${src.label} ${i}/${src.pages.length}`);
  }
  if (src.pages.length) process.stdout.write("\n");
}

async function main() {
  const OLD = process.env.OLD_NOTION_TOKEN;
  const NEW = process.env.NEW_NOTION_TOKEN;
  const parentPageId = parsePageId(process.env.NEW_PARENT_PAGE);
  if (!OLD || !NEW || !parentPageId) {
    console.error(
      "환경 변수 OLD_NOTION_TOKEN, NEW_NOTION_TOKEN, NEW_PARENT_PAGE(새 상위 페이지 URL/ID)가 필요합니다."
    );
    process.exit(1);
  }
  if (OLD === NEW) {
    console.error("OLD_NOTION_TOKEN 과 NEW_NOTION_TOKEN 이 같습니다. 새 계정의 토큰을 넣어주세요.");
    process.exit(1);
  }

  const oldNotion = makeClient(OLD, "기존");
  const newNotion = makeClient(NEW, "새 계정");
  const cfg = readToml();

  console.log(
    DRY_RUN ? "=== 점검 모드 (--dry-run, 변경 없음) ===" : "=== 노션 워크스페이스 이관 ==="
  );

  /* 1. 기존 데이터 읽기 */
  console.log("\n[1/4] 기존 계정 데이터 읽는 중…");
  await oldNotion("GET", `/databases/${cfg.restaurantsDbId}`).catch((e) => {
    if (e.message.includes("연결 실패")) throw e; // 네트워크 문제는 토큰 안내 없이 그대로
    throw new Error(
      "기존 토큰으로 wrangler.toml 의 식당 DB를 읽을 수 없습니다.\n" +
        "  - 이미 이관을 실행해 wrangler.toml 이 새 ID로 바뀐 경우: git checkout worker/wrangler.toml 후 재실행\n" +
        "  - 아니라면 OLD_NOTION_TOKEN 이 기존 계정 토큰인지, 페이지에 연결돼 있는지 확인\n" +
        e.message
    );
  });
  const gateDbId = await findGateDbId(oldNotion, cfg.passwordDbId);
  const R = await loadSource(oldNotion, cfg.restaurantsDbId, "식당");
  const T = await loadSource(oldNotion, cfg.transactionsDbId, "이력");
  const G = gateDbId ? await loadSource(oldNotion, gateDbId, "비밀번호") : null;
  R.withAppId = true;
  T.withAppId = true;
  reportSource(R);
  reportSource(T);
  if (G) reportSource(G);
  else
    warn(
      `"${GATE_DB_TITLE}" DB를 찾지 못했습니다 — 새 계정에서 Worker가 초기값(53075)으로 자동 생성합니다`
    );

  // 이력 → 식당 relation 확인
  const rId = norm(cfg.restaurantsDbId);
  const tId = norm(cfg.transactionsDbId);
  const tRelations = Object.entries(T.db.properties).filter(([, d]) => d.type === "relation");
  const tToR = tRelations.filter(([, d]) => norm(d.relation.database_id) === rId);
  if (!tToR.length) throw new Error("이력 DB에서 식당 DB로 가는 relation 속성을 찾지 못했습니다.");
  const tOtherRelations = new Set(
    tRelations.filter(([, d]) => norm(d.relation.database_id) !== rId).map(([n]) => n)
  );
  for (const name of tOtherRelations) {
    warn(`이력.${name}: 식당 DB 외의 DB를 가리키는 relation — 건너뜀`);
  }
  // 식당 DB 쪽 relation: 이력 DB와의 양방향(dual) 짝은 이력 쪽 생성 시 자동으로 생기므로 건너뜀
  const rRelations = Object.entries(R.db.properties).filter(([, d]) => d.type === "relation");
  const rBackRefs = new Set(
    rRelations.filter(([, d]) => norm(d.relation.database_id) === tId).map(([n]) => n)
  );
  for (const [name] of rRelations.filter(([n]) => !rBackRefs.has(n))) {
    warn(`식당.${name}: 이력 DB 외의 DB를 가리키는 relation — 건너뜀`);
  }

  /* 2. 새 계정 접근/중복 확인 */
  console.log("\n[2/4] 새 계정 상위 페이지 확인 중…");
  const parent = await newNotion("GET", `/pages/${parentPageId}`).catch((e) => {
    throw new Error(
      `새 상위 페이지에 접근할 수 없습니다. 새 Integration을 그 페이지에 연결했는지 확인하세요.\n${e.message}`
    );
  });
  const parentTitle = plain(
    Object.values(parent.properties || {}).find((p) => p.type === "title")?.title
  );
  console.log(`  ✔ 상위 페이지: "${parentTitle || parentPageId}"`);
  const existing = (await listChildren(newNotion, parentPageId))
    .filter((b) => b.type === "child_database")
    .map((b) => b.child_database.title);
  const wanted = [R, T, G].filter(Boolean).map((s) => plain(s.db.title));
  const dup = wanted.filter((t) => existing.includes(t));
  if (dup.length && !FORCE) {
    throw new Error(
      `새 상위 페이지에 같은 제목의 DB가 이미 있습니다: ${dup.join(", ")}\n` +
        "이전 실행 결과라면 노션에서 지운 뒤 다시 실행하거나, 의도한 경우 --force 로 실행하세요."
    );
  }

  if (DRY_RUN) {
    console.log("\n점검 완료 — 실제 이관하려면 --dry-run 없이 다시 실행하세요.");
    printWarnings();
    return;
  }

  /* 3. 새 DB 생성 */
  console.log("\n[3/4] 새 계정에 DB 생성 중…");
  const newR = await createDb(newNotion, parentPageId, R, {}, rBackRefs);
  const relProps = {};
  for (const [name, def] of tToR) {
    const kind = def.relation.type === "dual_property" ? "dual_property" : "single_property";
    relProps[name] = { relation: { database_id: newR.id, type: kind, [kind]: {} } };
  }
  const skipT = new Set(tRelations.map(([n]) => n));
  const newT = await createDb(newNotion, parentPageId, T, relProps, skipT);

  // 양방향 relation 의 식당 쪽 속성 이름을 기존과 같게 맞춤 (rollup 이 이름으로 참조하므로 먼저)
  const createdT = await newNotion("GET", `/databases/${newT.id}`);
  for (const [name, def] of tToR) {
    if (def.relation.type !== "dual_property") continue;
    const wantName = def.relation.dual_property?.synced_property_name;
    const gotName = createdT.properties[name]?.relation?.dual_property?.synced_property_name;
    if (wantName && gotName && wantName !== gotName) {
      await newNotion("PATCH", `/databases/${newR.id}`, {
        properties: { [gotName]: { name: wantName } },
      });
    }
  }

  await ensureAppIdProp(newNotion, newR.id, R);
  await ensureAppIdProp(newNotion, newT.id, T);
  await addDeferredProps(newNotion, newR.id, R);
  await addDeferredProps(newNotion, newT.id, T);
  const newG = G ? await createDb(newNotion, parentPageId, G) : null;
  if (G) await addDeferredProps(newNotion, newG.id, G);

  /* 4. 데이터 복사 */
  console.log("\n[4/4] 데이터 복사 중…");
  const pageMap = new Map();
  await copyRows(newNotion, newR.id, R, pageMap, rBackRefs);
  await copyRows(newNotion, newT.id, T, pageMap, tOtherRelations);
  if (G) await copyRows(newNotion, newG.id, G, pageMap);

  // 건수 검증
  const counts = await Promise.all(
    [newR, newT, newG].filter(Boolean).map((d) => queryAll(newNotion, d.id).then((r) => r.length))
  );
  const expected = [R, T, G].filter(Boolean).map((s) => s.pages.length);
  const okCount = counts.every((c, i) => c === expected[i]);
  console.log(
    `\n건수 검증: ${[R, T, G]
      .filter(Boolean)
      .map((s, i) => `${s.label} ${counts[i]}/${expected[i]}`)
      .join(", ")} ${okCount ? "✔" : "✘ 불일치"}`
  );
  if (!okCount) warn("복사 건수가 기존과 다릅니다. 노션에서 확인하세요.");

  const ids = {
    restaurants: norm(newR.id),
    transactions: norm(newT.id),
    password: newG ? norm(newG.id) : "",
  };
  if (WRITE_TOML) {
    writeToml(cfg.toml, ids);
    console.log("\n✔ worker/wrangler.toml 의 DB ID를 새 값으로 교체했습니다.");
  }
  console.log("\n새 DB ID:");
  console.log(`  RESTAURANTS_DB_ID  = "${ids.restaurants}"`);
  console.log(`  TRANSACTIONS_DB_ID = "${ids.transactions}"`);
  if (ids.password) console.log(`  PASSWORD_DB_ID     = "${ids.password}"`);

  printWarnings();
  console.log(
    "\n다음 단계: worker 폴더에서\n" +
      "  npx wrangler secret put NOTION_TOKEN   # 새 계정 토큰\n" +
      "  npx wrangler deploy"
  );
}

function printWarnings() {
  if (!warnings.length) return;
  console.log(`\n확인이 필요한 항목 ${warnings.length}건:`);
  for (const w of warnings) console.log(`  - ${w}`);
}

main().catch((e) => {
  console.error(`\n✘ 이관 실패: ${e.message}`);
  printWarnings();
  process.exit(1);
});
