// [2026-09-20 사장님 요청] 옵션(색상·사이즈) 정렬 공용 규칙 — 물건챙기기 상품별 묶음 · 엑셀 줄 순서에 쓴다.
//   「베이지 55 · 베이지 66 · 베이지 55」처럼 흩어지지 않게: 색상 가나다 → 사이즈는 사람이 읽는 순서.
//   사이즈 순서: 숫자(44 < 55 < 66 < 245) → 글자 사이즈(XS < S < M < L < XL < 2XL < 3XL …, 한글 스몰/미듐/라지 포함)
//              → FREE/프리 → 그 밖의 글자(가나다). 「없음」 계열은 빈 값으로 본다.
//   ⚠️ 표시·정렬 전용 — 주문·재고·금액·매칭 로직 어디에도 쓰지 않는다.

const NONE = new Set(["없음", "없슴", "색상없음", "사이즈없음", "옵션없음", "x", "X", "-", "none", "None", "NONE"]);

const LETTER_SIZE_RANK: Record<string, number> = {
  XXXS: 0, "3XS": 0, XXS: 1, "2XS": 1, XS: 2, S: 3, 스몰: 3, M: 4, 미듐: 4, 미디움: 4, 미디엄: 4, L: 5, 라지: 5,
  XL: 6, 엑스라지: 6, XXL: 7, "2XL": 7, XXXL: 8, "3XL": 8, "4XL": 9, "5XL": 10, "6XL": 11,
};

export function cleanOptionValue(value: unknown): string {
  const t = String(value ?? "").trim();
  return NONE.has(t) ? "" : t;
}

// 정렬 열쇠: [묶음 번호, 묶음 안 순서값, 원문] — 묶음 번호가 작을수록 앞.
export function sizeSortKey(size: unknown): [number, number, string] {
  const raw = cleanOptionValue(size);
  if (!raw) return [-1, 0, ""];
  const up = raw.toUpperCase().replace(/\s+/g, "");
  const num = Number(up.replace(/[^0-9.]/g, ""));
  if (/^[0-9]+(\.[0-9]+)?$/.test(up) && Number.isFinite(num)) return [0, num, raw];
  if (Object.prototype.hasOwnProperty.call(LETTER_SIZE_RANK, up)) return [1, LETTER_SIZE_RANK[up], raw];
  if (up === "FREE" || up === "프리" || up === "프리사이즈" || up === "F") return [2, 0, raw];
  // 「95(M)」「XL(110)」처럼 섞인 표기 — 앞쪽 숫자가 있으면 숫자로, 아니면 글자 순위로
  const leadNum = up.match(/^([0-9]+(?:\.[0-9]+)?)/);
  if (leadNum) return [0, Number(leadNum[1]), raw];
  const leadLetter = up.match(/^([0-9]?X{0,3}[SML])/);
  if (leadLetter && Object.prototype.hasOwnProperty.call(LETTER_SIZE_RANK, leadLetter[1])) return [1, LETTER_SIZE_RANK[leadLetter[1]], raw];
  return [3, 0, raw];
}

export function compareSizes(a: unknown, b: unknown): number {
  const ka = sizeSortKey(a), kb = sizeSortKey(b);
  if (ka[0] !== kb[0]) return ka[0] - kb[0];
  if (ka[1] !== kb[1]) return ka[1] - kb[1];
  return ka[2].localeCompare(kb[2], "ko");
}

export function compareColors(a: unknown, b: unknown): number {
  return cleanOptionValue(a).localeCompare(cleanOptionValue(b), "ko");
}

// 색상 가나다 → 사이즈 순서
export function compareOrderOptions(a: { color?: unknown; size?: unknown }, b: { color?: unknown; size?: unknown }): number {
  return compareColors(a.color, b.color) || compareSizes(a.size, b.size);
}
