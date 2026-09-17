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

/**
 * 옵션을 방송 화면용으로 짧게: 「베이지 / 사이즈 6」 → 「베이지/6」
 * [2026-09-17] 09-16에 이 축약을 없앴다가 되살린다. 그때 뺀 이유는 「6」이 수량과 헷갈려서였는데,
 *   지금은 수량을 «항상 1개·2개»로 쓰므로 «개»가 붙은 쪽이 수량이다 → 라벨 없이도 안 헷갈린다.
 *   라벨 3글자를 빼면 상품 하나가 약 110px 짧아져 한 줄에 더 들어간다(방송 화면을 덜 가린다).
 */
function compactOption(opt: string): string {
  return opt.replace(/사이즈\s*/g, "").split("/").map((x) => x.trim()).filter(Boolean).join("/");
}


// ── [2026-09-16] 「한 줄에 들어가면 한 줄」 판정 ───────────────────────────────
// 방송 화면을 덜 가리려면 한 줄이 맞다. 그런데 CSS 는 «들어가는지»를 미리 못 알려준다.
//   → 글자 폭을 추정해서 미리 정한다. (추정 근거: 한글·이모지는 글자크기만큼, 숫자·영문은 약 0.55배)
//   사장님 방송 캡쳐 실측 기준 — 위젯 알약 안쪽 가용 폭은 814px(=860 − 좌우 여백 46).
export const FEED_ROW_AVAIL_W = 814;

/**
 * 문자열의 대략적인 폭(px). em = 글자 크기.
 * [2026-09-16 실측 보정] 실제 브라우저(Pretendard, weight 900)에서 잰 값에 맞췄다.
 *   한글 1.0em (가×22 @34px = 748px 실측 = 22×34 정확히 일치)
 *   이모지 1.45em (👉💚🙏🛒 — 예전 1.15em 은 너무 작아 공지가 2줄로 넘어갔다)
 *   공백 0.25em · 숫자/영문 0.55em
 *   마지막에 2% 여유 — 폰트가 다르거나 글자 사이 간격이 더 벌어져도 안 넘치게.
 */
export function estimateTextWidth(text: string, em: number): number {
  let w = 0;
  for (const ch of String(text ?? "")) {
    const c = ch.codePointAt(0) || 0;
    if (ch === " ") w += em * 0.25;
    else if (c > 0x1f000 || (c >= 0x2190 && c <= 0x2bff)) w += em * 1.45;          // 이모지·기호
    else if ((c >= 0xac00 && c <= 0xd7a3) || (c >= 0x3130 && c <= 0x318f)) w += em; // 한글
    else if (c < 0x0250) w += em * 0.55;                                           // 숫자·영문
    else w += em * 0.9;
  }
  return w * 1.02;
}

export type FeedRowSizes = { nick: number; nim: number; verb: number; detail: number; opt: number };
/** 기본 글자 크기(디자인 px). 위젯과 이 파일이 «같은 숫자»를 봐야 판정이 맞는다. */
// [2026-09-16 사장님] 「닉네임하고 내용 글씨 크기도 똑같아야지. 방송화면 캡쳐 기준 폰트 크기를 동일하게」
//   실측: 유튜브 채팅 글자 = 이 위젯의 37px. 닉네임·인사말·주문내역 전부 37 로 맞춘다.
//   [09-17] 「님」까지 포함해 «전부 37» 로 통일 — 한 글자도 다른 크기를 쓰지 않는다.
//   상품명/옵션/수량 구분은 «크기»가 아니라 «색»으로 한다(흰색 / 연한색 / 흰색).
// [2026-09-17 최종] 닉네임·「님」·인사말 = 채팅과 같은 37. 상품·옵션·수량 = 28 (작게, 대신 한 알림에 많이).
//   사장님: 「닉네임·주문감사합니다는 제외하고, 상품명·옵션·수량은 글씨를 줄여서 1개 출력당 최대한 많이」
export const FEED_ROW_SIZES: FeedRowSizes = { nick: 37, nim: 37, verb: 37, detail: 28, opt: 28 };

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

export type FeedProduct = { name: string; opt: string; qty: number };

/** 주문 한 건 → 상품 조각들. 화면에서 상품명·옵션·수량을 «다른 모양»으로 그리려고 구조로 돌려준다. */
export function feedOrderParts(items: FeedOrderItem[], optionText: (color: unknown, size: unknown) => string): FeedProduct[] {
  return items
    .map((it) => ({
      name: cleanProductNameForFeed(it.name),
      opt: compactOption(optionText(it.color, it.size).trim()),
      qty: Math.max(1, Math.floor(Number(it.qty) || 1)),
    }))
    .filter((r) => r.name);
}

/**
 * 조각 하나의 표시 문구 — 「아미반팔 블랙/L 2개」
 * [2026-09-16 사장님 「수량이 몇 개냐고? 색상 있는 옵션이면 어떻게 표현할 거고?」]
 *   · 옵션은 「블랙/L」로 짧게. 수량을 «항상 N개»로 쓰니 «개»가 붙은 쪽이 수량이라 안 헷갈린다.
 *   · 수량은 «1개여도 항상» 쓴다. 안 쓰면 몇 개인지 알 수 없다.
 *   · 화면에서는 «옆으로 이어» 쓰고, 상품 사이는 강조색 막대(|)로 끊는다(줄 낭비를 안 하려고).
 */
export function feedProductLabel(p: FeedProduct): string {
  return `${p.name}${p.opt ? ` ${p.opt}` : ""} ${p.qty}개`;
}

/** 주문내역이 쓸 수 있는 최대 줄 수. [09-17] 3 → 2 — 화면을 실제로 덜 가리는 유일한 방법은 «양»을 줄이는 것. */
export const FEED_DETAIL_MAX_LINES = 2;

/**
 * 주문 한 건의 상품들 → 방송에 띄울 문구(금액 없음).
 * [2026-09-16 사장님] 「개수가 많으면 자리를 더 쓰고, 대신 화면에 뜨는 알림을 줄여라. 주문내용은 다 보이게」
 *   → 개수로 자르지 않고 «줄 수»로 자른다. maxLines 줄에 들어가는 만큼 다 넣고, 남으면 「외 N종」.
 */
export function feedOrderProducts(
  items: FeedOrderItem[],
  optionText: (color: unknown, size: unknown) => string,
  maxLines: number = FEED_DETAIL_MAX_LINES,
): string {
  const parts = feedOrderParts(items, optionText);
  if (parts.length === 0) return "";
  const { shown, rest } = feedShownProducts(parts, maxLines);
  return shown.map(feedProductLabel).join(" / ") + (rest > 0 ? ` / 외 ${rest}종` : "");
}

/**
 * 화면에 실제로 그릴 상품들과, 넘쳐서 못 그린 개수.
 * 「외 N종 더」도 «한 줄»을 먹으므로, 넘칠 때는 상품을 한 줄 덜 보여준다.
 *   상품 3개 → 3줄 전부 상품 / 상품 4개 → 상품 2줄 + 「외 2종 더」 1줄 = 3줄
 */
export function feedShownProducts(parts: FeedProduct[], maxLines: number = FEED_DETAIL_MAX_LINES) {
  const cap = Math.max(1, maxLines);
  if (parts.length <= cap) return { shown: parts, rest: 0 };
  const shown = parts.slice(0, Math.max(1, cap - 1));
  return { shown, rest: parts.length - shown.length };
}

/** 주문내역이 몇 줄을 차지하나 — 상품 하나가 한 줄(최대 3줄) */
export function feedDetailLineCount(productCount: number): number {
  if (productCount <= 0) return 0;
  return Math.min(FEED_DETAIL_MAX_LINES, productCount);
}

// ── [2026-09-16 사장님 «공지글 몇 자 넘으면 2줄?»] ────────────────────────────
// 📌 공지 알약 실측: 글자 34px · 안쪽 가용 폭 770px(=860 − 좌우여백 48 − 📌아이콘 32 − 간격 10).
//   한글은 글자크기만큼 넓으므로 «한글 약 22자»가 한 줄. 이모지는 한글 1.15자로 친다.
export const FEED_PIN_SIZE = 34;
export const FEED_PIN_AVAIL_W = 778;   // 860 − 좌우여백 36 − 📌아이콘 38 − 간격 8

/** 공지 글자를 이보다 작게는 안 줄인다(너무 작으면 방송에서 안 읽힌다) */
export const FEED_PIN_MIN_SIZE = 26;

/**
 * [2026-09-16 사장님] 「이 정도는 한 줄로 다 뜨게 설계해달라니까?」
 *   → 문구가 길면 «글자 크기를 줄여서» 한 줄에 맞춘다. 최소 27px 까지.
 *   그보다 더 길면 그때만 2줄(27px 유지).
 */
export function feedPinFontSize(text: string): number {
  const w = estimateTextWidth(text, FEED_PIN_SIZE);
  if (w <= FEED_PIN_AVAIL_W) return FEED_PIN_SIZE;
  const fit = Math.floor((FEED_PIN_AVAIL_W / w) * FEED_PIN_SIZE);
  return Math.max(FEED_PIN_MIN_SIZE, fit);
}

/** 이 공지 문구가 (글자 크기를 줄여서라도) 한 줄에 들어가나? */
export function feedPinFitsOneLine(text: string): boolean {
  return estimateTextWidth(text, feedPinFontSize(text)) <= FEED_PIN_AVAIL_W;
}

/** 한 줄을 100 으로 봤을 때 지금 몇 %인지 (관리자 입력칸 안내용) */
export function feedPinFillPercent(text: string): number {
  return Math.round((estimateTextWidth(text, FEED_PIN_SIZE) / FEED_PIN_AVAIL_W) * 100);
}

// ── [2026-09-17 사장님] 「너무 길고 복잡하면 출력하고 빠르게 또 이어서 보여주고?」 ──
// 주문한 상품이 많을 때 세로로 늘리면 방송화면을 가리고, 잘라 버리면 주문내역이 안 보인다.
//   → «한 줄에 들어가는 만큼»을 한 장으로 묶어 «넘겨가며» 보여준다. 화면 높이는 항상 그대로다.
//   장이 하나면 안 넘어간다(대부분의 주문은 상품 1~2개라 한 장으로 끝난다).
export const FEED_PAGE_MS = 3500;   // 한 장이 떠 있는 시간

/** 상품들을 «한 줄에 들어가는 만큼»씩 나눈다. 각 장은 최소 1개는 담는다(이름이 아주 길어도). */
/** 한 장이 쓰는 줄 수 — 상품 줄은 작은 글씨로 «두 줄»까지 (그래야 한 알림에 많이 들어간다) */
export const FEED_DETAIL_LINES_PER_PAGE = 2;

export function feedProductPages(
  parts: FeedProduct[],
  avail: number = FEED_ROW_AVAIL_W,
  em: number = FEED_ROW_SIZES.detail,
  lines: number = FEED_DETAIL_LINES_PER_PAGE,
): FeedProduct[][] {
  const pages: FeedProduct[][] = [];
  let cur: FeedProduct[] = [];
  // 두 줄로 접힐 때 줄 끝에 남는 자투리를 감안해 8% 여유
  const budget = avail * Math.max(1, lines) * 0.92;
  const widthOf = (list: FeedProduct[]) => estimateTextWidth(list.map(feedProductLabel).join("  |  "), em);
  for (const p of parts) {
    if (cur.length > 0 && widthOf([...cur, p]) > budget) {
      pages.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length > 0) pages.push(cur);
  return pages.length > 0 ? pages : [];
}
