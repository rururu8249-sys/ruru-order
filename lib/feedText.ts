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

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

/** 옵션을 피드용으로 짧게: 「블랙 / 사이즈 L」 → 「블랙/L」, 「사이즈 240」 → 「240」 (한 줄에 이름·옵션·금액이 다 들어가야 해서) */
function compactOption(opt: string): string {
  return opt.replace(/사이즈\s*/g, "").split("/").map((p) => p.trim()).filter(Boolean).join("/");
}

/**
 * 주문 한 건 → 방송에 띄울 «주문내역 한 줄». [2026-09-16 사장님]
 *   「손님들도 「와 저런 거 사는구나」 보게 하는 바람잡이 역할이다. 실제 주문내용이 보여야 한다.
 *    금액은 굳이 안 나와도 될 것 같다. 근데 방송화면을 너무 가리면 안 된다」
 *   → 금액을 빼면 그만큼 «상품 이름»이 들어간다. 그래서 대부분 한 줄로 끝난다(화면을 덜 가린다).
 *
 *   상품 1개 : 「아미반팔 · L」
 *   상품 2~3개: 「나이키 바람막이 · M, 꽃티 · L」   ← 쉼표로 이어 붙인다
 *   상품 4개↑ : 「나이키 바람막이 · M, 꽃티 · L, 알로가방 외 2종」
 *   수량이 2개 이상이면 이름 뒤에 「2개」. 금액은 넣지 않는다.
 *   optionText: 색상·사이즈 → 옵션 문구(없음 숨김)는 부른 쪽이 넘긴다.
 */
export function feedOrderLines(items: FeedOrderItem[], optionText: (color: unknown, size: unknown) => string): FeedLine[] {
  const text = feedOrderProducts(items, optionText);
  return text ? [{ left: text, right: "" }] : [];
}

const MAX_NAMES = 3;

/** 주문 한 건의 상품들 → 방송에 띄울 한 줄 문구(금액 없음) */
export function feedOrderProducts(items: FeedOrderItem[], optionText: (color: unknown, size: unknown) => string): string {
  const parts = items
    .map((it) => {
      const name = cleanProductNameForFeed(it.name);
      if (!name) return "";
      const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
      const opt = compactOption(optionText(it.color, it.size).trim());
      return [name, opt, qty > 1 ? `${qty}개` : ""].filter(Boolean).join(" · ");
    })
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length <= MAX_NAMES) return parts.join(", ");
  return `${parts.slice(0, MAX_NAMES).join(", ")} 외 ${parts.length - MAX_NAMES}종`;
}


// ── [2026-09-16] 「한 줄에 들어가면 한 줄」 판정 ───────────────────────────────
// 방송 화면을 덜 가리려면 한 줄이 맞다. 그런데 CSS 는 «들어가는지»를 미리 못 알려준다.
//   → 글자 폭을 추정해서 미리 정한다. (추정 근거: 한글·이모지는 글자크기만큼, 숫자·영문은 약 0.55배)
//   사장님 방송 캡쳐 실측 기준 — 위젯 알약 안쪽 가용 폭은 814px(=860 − 좌우 여백 46).
export const FEED_ROW_AVAIL_W = 814;

/** 문자열의 대략적인 폭(px). em = 글자 크기 */
export function estimateTextWidth(text: string, em: number): number {
  let w = 0;
  for (const ch of String(text ?? "")) {
    const c = ch.codePointAt(0) || 0;
    if (ch === " ") w += em * 0.3;
    else if (c > 0x1f000 || (c >= 0x2190 && c <= 0x2bff)) w += em * 1.15;          // 이모지·기호
    else if ((c >= 0xac00 && c <= 0xd7a3) || (c >= 0x3130 && c <= 0x318f)) w += em; // 한글
    else if (c < 0x0250) w += em * 0.55;                                           // 숫자·영문
    else w += em * 0.9;
  }
  return w;
}

export type FeedRowSizes = { nick: number; nim: number; verb: number; detail: number };
/** 기본 글자 크기(디자인 px). 위젯과 이 파일이 «같은 숫자»를 봐야 판정이 맞는다. */
export const FEED_ROW_SIZES: FeedRowSizes = { nick: 40, nim: 28, verb: 30, detail: 37 };

/**
 * 이 줄이 «한 줄»에 들어가나? (닉네임 + 인사말 + 주문내역 + 금액 + 칸 사이 여백)
 *   들어가면 한 줄, 안 들어가면 2줄(1층 = 누가·인사말 / 2층 = 주문내역).
 *   주문내역이 없는 입금·카드 줄은 언제나 한 줄이다.
 */
export function feedRowFitsOneLine(
  nick: string, verb: string, detail: string,
  sizes: FeedRowSizes = FEED_ROW_SIZES, avail: number = FEED_ROW_AVAIL_W,
): boolean {
  if (!detail) return true;
  const GAP = 11;
  const w =
    estimateTextWidth(nick, sizes.nick) + estimateTextWidth("님", sizes.nim) + GAP +
    estimateTextWidth(verb, sizes.verb) + GAP +
    estimateTextWidth(detail, sizes.detail);
  return w <= avail;
}
