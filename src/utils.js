// 공용 유틸 — 금액 포맷, 메뉴 아이콘 매핑, 식당 상태 판정

/** 12345 → "12,345" */
export function formatComma(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return "0";
  return n.toLocaleString("ko-KR");
}

/** 12345 → "12,345원" (음수는 -12,345원) */
export function formatKRW(value) {
  return `${formatComma(value)}원`;
}

/** 입력 문자열에서 숫자만 추출 (앞의 - 부호 허용) */
export function parseAmount(str) {
  const cleaned = String(str).replace(/[^\d-]/g, "");
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) ? 0 : n;
}

/** 금액 입력 필드용: 타이핑 중 콤마 자동 삽입 */
export function commaInput(str) {
  const n = parseAmount(str);
  if (str === "" || str === "-") return str;
  return n.toLocaleString("ko-KR");
}

/**
 * 예치금 잔액 → 식당 상태
 * - 0원: 비활성 (홈에서 숨김, 리스트에서 흐리게)
 * - 1원 이상: 활성
 * - -1원 이하: 활성(외상)
 */
export function depositStatus(balance) {
  if (balance === 0) return { key: "disabled", label: "비활성", active: false };
  if (balance < 0) return { key: "credit", label: "활성(외상)", active: true };
  return { key: "active", label: "활성", active: true };
}

/** 편집 팝업에서 선택 가능한 아이콘 목록 */
// prettier-ignore
export const ICON_CHOICES = [
  "🍲", "🍗", "🥩", "🍜", "🍙", "🍣", "🍤",
  "🥪", "🍕", "🍔", "☕", "🥡", "🍱", "🍴",
];

/** 식당 표시 아이콘 — 직접 선택(icon)이 있으면 우선, 없으면 주요 메뉴 기반 자동 */
export function restaurantIcon(r) {
  return r?.icon || menuIcon(r?.mainMenu ?? "");
}

/** 주요 메뉴 텍스트 → 형상화 아이콘(이모지) */
export function menuIcon(mainMenu = "") {
  const m = mainMenu;
  const rules = [
    [/(감자탕|탕|국밥|찌개|전골)/, "🍲"],
    [/(치킨|닭|찜닭)/, "🍗"],
    [/(고기|축산|삼겹|갈비|곱창|정육)/, "🥩"],
    [/(국수|칼국수|면|라멘|우동|파스타)/, "🍜"],
    [/(김밥|분식|떡볶이)/, "🍙"],
    [/(초밥|회|스시|물회)/, "🍣"],
    [/(돈까스|돈가스|카츠|katsu|튀김)/i, "🍤"],
    [/(샌드위치|샌드|서브|토스트)/, "🥪"],
    [/(피자)/, "🍕"],
    [/(버거|햄버거)/, "🍔"],
    [/(카페|커피|디저트)/, "☕"],
    [/(중식|짜장|짬뽕)/, "🥡"],
    [/(도시락|백반|한식)/, "🍱"],
  ];
  for (const [re, icon] of rules) if (re.test(m)) return icon;
  return "🍴";
}

/** 오늘 날짜 → "YYYY-MM-DD" */
export function todayStr() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

let seq = 0;
export function uid(prefix = "id") {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}
