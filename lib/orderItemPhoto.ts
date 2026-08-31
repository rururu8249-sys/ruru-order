// ── [2026-08-31 사장님 지시] 주문 항목 사진 연결 — 공용 규칙 (전수조사 기반 재설계) ──
//
// 문제(실측): 상품 이름을 나중에 수정하면(예: "MIU-201 가디건" → "MIU-201 초코바나나 가디건")
//   그 전에 들어온 주문은 옛 이름이라 세부상품을 못 찾고, 엉뚱한 "묶음 첫 사진"이 떴다.
//
// 새 규칙 — 사다리식 매칭. 위에서부터 시도하고, 각 단계는 "딱 1개"로 확정될 때만 채택:
//   1단: 기존 규칙 그대로 (이름/색상칸이 세부상품명으로 시작) — 기존 정상 매칭 404건 보호
//   2단: 반대 방향 접두 (세부상품명이 주문 표기로 시작) — "이솝 테싯" → "이솝 테싯50ml"
//   3단: 상품코드 매칭 ("MIU-201" 같은 코드가 어디에 있든 추출) — 이름 수정·"특가" 접두어에도 생존
//   4단: 괄호 제거 후 비교 — "90호(고윤정립)" ↔ "90호(고윤정)" 같은 괄호 차이 흡수
//   실패: 3단(세부상품) 상품인데 못 찾으면 → 사진을 아예 안 보여준다(엉뚱한 사진 금지).
//         일반(2단) 상품은 지금처럼 대표사진.
//
// ⚠️ 표시 전용 — 주문 데이터·재고·금액·입금·매칭 로직 어디에도 쓰지 않는다.

import { detailProducts, type DetailProduct } from "./productDetailModel";

const EMPTY_VALUES = new Set(["", "없음", "none", "-", "x"]);

// 코드 추출: 문자열 어디에 있든 "MIU-201", "BB(버버리)-84M" 꼴의 첫 코드를 뽑는다.
const CODE_ANYWHERE = /([A-Za-z]+)(?:\([^)]*\))?-(\d+[A-Za-z]*)/;
function extractCode(text: string): string {
  const m = String(text || "").match(CODE_ANYWHERE);
  return m ? `${m[1].toUpperCase()}-${m[2].toUpperCase()}` : "";
}

// 괄호 제거 정규화: "(...)" 조각을 지우고 공백을 한 칸으로.
function stripParens(text: string): string {
  return String(text || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

function cleanKey(value: unknown): string {
  const v = String(value ?? "").trim();
  return EMPTY_VALUES.has(v.toLowerCase()) ? "" : v;
}

export type OrderItemPhotoResult = {
  url: string;
  matchedDetailName: string;          // 세부상품 사진이면 그 이름, 아니면 ""
  source: "detail" | "direct" | "none"; // detail=세부상품 사진, direct=대표사진(2단), none=사진 없음
};

// 상품 행(products.*) + 주문 표기(상품명·색상칸) → 보여줄 사진.
export function resolveOrderItemPhoto(
  productRow: Record<string, unknown>,
  item: { productName?: unknown; color?: unknown },
): OrderItemPhotoResult {
  let details: DetailProduct[] = [];
  try {
    details = detailProducts(productRow as never, { includeHidden: true });
  } catch { details = []; }

  const itemName = cleanKey(item.productName);
  // 관리자 「등록상품 추가」 3단 상품은 색상 칸이 "세부상품명 / 색상" 형태 — 앞부분만 쓴다.
  const colorDetail = cleanKey(String(item.color ?? "").split(" / ")[0]);

  // ── 일반(2단) 상품: 대표사진이 정답 ──
  if (details.length === 0) {
    const url = directPhoto(productRow);
    return url ? { url, matchedDetailName: "", source: "direct" } : { url: "", matchedDetailName: "", source: "none" };
  }

  // ── 1단: 기존 규칙(정확/앞부분 일치, 긴 이름 우선) — 기존 정상 매칭 보호 ──
  const r1 = details
    .filter((d) => d.detailName && (
      itemName === d.detailName || (itemName !== "" && itemName.startsWith(d.detailName)) ||
      (colorDetail !== "" && (colorDetail === d.detailName || colorDetail.startsWith(d.detailName)))
    ))
    .sort((a, b) => b.detailName.length - a.detailName.length)[0];
  if (r1) return toResult(r1, productRow);

  const keys = [colorDetail, itemName].filter((k) => k.length >= 2);

  // ── 2단: 반대 방향 접두 — 주문 표기가 세부상품명의 앞부분일 때 (딱 1개일 때만) ──
  for (const key of keys) {
    const hits = details.filter((d) => d.detailName && d.detailName.startsWith(key));
    if (hits.length === 1) return toResult(hits[0], productRow);
  }

  // ── 3단: 상품코드 매칭 — 코드가 같으면 이름이 바뀌어도 같은 상품 (딱 1개일 때만) ──
  for (const key of keys) {
    const code = extractCode(key);
    if (!code) continue;
    const hits = details.filter((d) => extractCode(d.detailName) === code);
    if (hits.length === 1) return toResult(hits[0], productRow);
  }

  // ── 4단: 괄호 제거 후 비교 — 정확 일치 우선, 그다음 양방향 접두 (딱 1개일 때만) ──
  for (const key of keys) {
    const nk = stripParens(key);
    if (nk.length < 2) continue;
    const exact = details.filter((d) => stripParens(d.detailName) === nk);
    if (exact.length === 1) return toResult(exact[0], productRow);
    if (exact.length > 1) continue;
    const prefix = details.filter((d) => {
      const nd = stripParens(d.detailName);
      return nd.startsWith(nk) || (nd.length >= 2 && nk.startsWith(nd));
    });
    if (prefix.length === 1) return toResult(prefix[0], productRow);
  }

  // ── 실패: 3단 상품인데 어느 세부상품인지 모름 → 엉뚱한 사진 대신 "사진 없음" ──
  return { url: "", matchedDetailName: "", source: "none" };
}

function toResult(d: DetailProduct, productRow: Record<string, unknown>): OrderItemPhotoResult {
  const url = String(d.image || "").trim() || directPhoto(productRow);
  return url
    ? { url, matchedDetailName: d.detailName, source: "detail" }
    : { url: "", matchedDetailName: d.detailName, source: "none" };
}

// 대표사진(기존 폴백 체인 그대로) — 2단 상품 전용.
function directPhoto(row: Record<string, unknown>): string {
  const arr0 = (v: unknown) => (Array.isArray(v) && v.length > 0 ? String(v[0] ?? "") : "");
  return (
    String(row.image_url || row.cover_image_url || row.main_image_url || row.thumbnail_url || "").trim() ||
    arr0(row.detail_image_urls) || arr0(row.image_urls) || arr0(row.images)
  ).trim();
}
