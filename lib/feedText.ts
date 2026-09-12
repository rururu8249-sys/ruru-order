// lib/feedText.ts
// 방송 «주문·입금 피드» 위젯에 올리는 상품명 — 10초 안에 스치듯 읽히는 한 줄이라 «누가 · 무엇을»만 남긴다.
//
// [2026-09-12 사장님과 정리] 옵션·수량·금액은 방송 화면에 안 띄운다 → **[2026-09-13 사장님 변경] 띄운다.**
//   「주문상품이 엄청 많지 않으면 알림 가로를 공지와 같게 최대로 쓰고 옵션·상품금액도 같이. 너무 많으면 줄이는 건 어쩔 수 없음」
//   규칙(feedOrderLines): 상품 2개까지는 한 줄씩 «상품명 · 옵션 · (N개) ······ 금액», 3개부터는 첫 상품 한 줄 + «외 N종 ······ 합계 금액».
//   금액은 줄 오른쪽 끝에 따로 두어(왼쪽이 길어 …로 잘려도) 금액은 항상 보인다.
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

/** 주문 한 건의 상품명 목록 → 피드 한 줄. ["A","B","C"] → "A 외 2종"  (옵션·금액 없이 이름만 쓸 때) */
export function feedOrderDetail(names: unknown[]): string {
  const cleaned = names.map(cleanProductNameForFeed).filter(Boolean);
  if (cleaned.length === 0) return "";
  const rest = cleaned.length - 1;
  return rest > 0 ? `${cleaned[0]} 외 ${rest}종` : cleaned[0];
}

export type FeedOrderItem = { name: unknown; color?: unknown; size?: unknown; qty?: unknown; price?: unknown };
/** 피드 한 줄 = 왼쪽(상품명 · 옵션 · N개) + 오른쪽(금액). 오른쪽은 잘리지 않게 따로 그린다. */
export type FeedLine = { left: string; right: string };

const MAX_LINES_PER_ORDER = 2;
const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

/** 옵션을 피드용으로 짧게: 「블랙 / 사이즈 L」 → 「블랙/L」, 「사이즈 240」 → 「240」 (한 줄에 이름·옵션·금액이 다 들어가야 해서) */
function compactOption(opt: string): string {
  return opt.replace(/사이즈\s*/g, "").split("/").map((p) => p.trim()).filter(Boolean).join("/");
}

/**
 * 주문 한 건(상품 여러 줄) → 피드에 그릴 줄들(최대 2줄).
 *   1~2개: 상품마다 한 줄  왼쪽 「나이키 쭈리후드티_센터자수 · 블랙/L」 ······ 오른쪽 「2개 · 118,000원」
 *   3개↑ : 첫 상품 한 줄 + 왼쪽 「외 2종」 ······ 오른쪽 「합계 187,000원」
 *   금액 = 단가 × 수량(줄 금액). 단가가 없으면(0) 금액 칸 비움. 수량 1이면 «N개» 생략.
 *   오른쪽(수량·금액)은 잘리지 않고, 왼쪽(이름·옵션)이 길면 …  — 실측: 폭 640·20px 글자면 왼쪽 약 21자.
 *   optionText: 색상·사이즈 → 옵션 문구(없음 숨김)는 부른 쪽이 넘긴다(lib/orderOptionText 의존 안 함 — 테스트 단순화).
 */
export function feedOrderLines(items: FeedOrderItem[], optionText: (color: unknown, size: unknown) => string): FeedLine[] {
  const rows = items
    .map((it) => {
      const name = cleanProductNameForFeed(it.name);
      const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
      const price = Math.max(0, Number(it.price) || 0);
      const opt = compactOption(optionText(it.color, it.size).trim());
      return { name, qty, amount: price * qty, opt };
    })
    .filter((r) => r.name);
  if (rows.length === 0) return [];
  const lineOf = (r: (typeof rows)[number]): FeedLine => ({
    left: [r.name, r.opt].filter(Boolean).join(" · "),
    right: [r.qty > 1 ? `${r.qty}개` : "", r.amount > 0 ? won(r.amount) : ""].filter(Boolean).join(" · "),
  });
  if (rows.length <= MAX_LINES_PER_ORDER) return rows.map(lineOf);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return [lineOf(rows[0]), { left: `외 ${rows.length - 1}종`, right: total > 0 ? `합계 ${won(total)}` : "" }];
}
