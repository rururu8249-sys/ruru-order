// lib/productAnnounce.ts
// [2026-08-29 사장님 요청] 방송 중 "지금 이 상품" 채팅 안내 문구
//
// 예전
//   ✅ 현재상품 ✅ BB(버버리)-62 아우터 / 179,000원 / 사이즈: S,M,L,XL,XXL
//   · ✅ 가 두 번이라 시끄럽고, "현재상품" 은 위젯에 이미 보이는 정보라 자리만 차지했다
//   · 무엇보다 사장님이 복사 → 유튜브로 이동 → 붙여넣기 를 매번 해야 했다
//
// 지금
//   🛍 지금 소개중 · BB(버버리)-62 아우터 · 179,000원 · 사이즈 S,M,L,XL,XXL
//   · 주문완료 문구와 같은 규칙(가운뎃점, 딱지 없음, 줄바꿈 없음)
//   · 버튼 한 번이면 봇이 직접 채팅에 올린다 (복사·붙여넣기 없음)
//
// ⚠️ 문구만 만든다. 주문·금액·재고 로직과 무관하다.

const EMPTY = new Set(["", "없음", "없슴", "무", "-", "none", "n/a", "na"]);

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

function values(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : clean(raw) ? clean(raw).split(/[,|]+/g) : [];
  return [...new Set(list.map((v) => clean(v)).filter((v) => v && !EMPTY.has(v.toLowerCase())))];
}

export const ANNOUNCE_PREFIX = "🛍 지금 소개중";

export function buildProductAnnounceLine(input: {
  name: unknown;
  price: unknown;
  colors?: unknown;
  sizes?: unknown;
  maxChars?: number;
}): string {
  const max = Math.max(80, Math.min(200, Math.floor(Number(input.maxChars ?? 180) || 180)));
  const name = clean(input.name) || "상품";
  const price = Math.max(0, Math.floor(Number(input.price ?? 0) || 0));
  const colors = values(input.colors);
  const sizes = values(input.sizes);

  const parts = [
    ANNOUNCE_PREFIX,
    name,
    price > 0 ? `${price.toLocaleString("ko-KR")}원` : "가격 문의",
    colors.length ? `색상 ${colors.join(",")}` : "",
    sizes.length ? `사이즈 ${sizes.join(",")}` : "",
  ].filter(Boolean);

  // 줄바꿈은 유튜브 채팅이 지워버려 글자가 붙는다 — 절대 넣지 않는다.
  return parts.join(" · ").replace(/\s+/g, " ").trim().slice(0, max);
}
