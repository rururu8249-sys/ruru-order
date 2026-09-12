// lib/feedText.ts
// 방송 «주문·입금 피드» 위젯에 올리는 상품명 — 10초 안에 스치듯 읽히는 한 줄이라 «누가 · 무엇을»만 남긴다.
//
// [2026-09-12 사장님과 정리] 옵션·수량·금액은 방송 화면(남들이 보는 화면)에 안 띄운다.
//   사이즈는 몸 정보, 금액은 돈 정보. 관리자 화면엔 다 있으니 방송엔 상품명 + «외 N종» + 감사 인사만.
//
// 상품명 정리 규칙
//   · 앞의 꼬리표 [👽주말마지막] 【특가】 (재입고) 는 뗀다 — 판촉 문구지 상품이 아니다
//   · 뒤의 상품코드 FB7789 · FZ4765 · DX1234-100 처럼 «영문 0~4자 + 숫자 3자리 이상»으로 끝나는 토큰은 뗀다
//   · 20자 넘으면 19자 + …
//   · 여러 상품이면 첫 상품명 + 「외 N종」

const MAX = 20;

export function cleanProductNameForFeed(raw: unknown): string {
  let s = String(raw ?? "").trim();
  // 앞 꼬리표 (여러 개 붙어 있어도 전부)
  for (let i = 0; i < 3; i += 1) {
    const next = s.replace(/^\s*[\[【(][^\]】)]*[\]】)]\s*/u, "");
    if (next === s) break;
    s = next;
  }
  // 뒤 상품코드 토큰
  const parts = s.split(/\s+/).filter(Boolean);
  while (parts.length > 1 && /^[A-Za-z]{0,4}\d{3,}[A-Za-z0-9-]*$/.test(parts[parts.length - 1])) parts.pop();
  s = parts.join(" ").replace(/[_·]+$/u, "").trim();
  const chars = Array.from(s);
  return chars.length > MAX ? chars.slice(0, MAX - 1).join("").trimEnd() + "…" : s;   // 잘린 끝의 공백은 떼고 …
}

/** 주문 한 건의 상품명 목록 → 피드 한 줄. ["A","B","C"] → "A 외 2종" */
export function feedOrderDetail(names: unknown[]): string {
  const cleaned = names.map(cleanProductNameForFeed).filter(Boolean);
  if (cleaned.length === 0) return "";
  const rest = cleaned.length - 1;
  return rest > 0 ? `${cleaned[0]} 외 ${rest}종` : cleaned[0];
}
