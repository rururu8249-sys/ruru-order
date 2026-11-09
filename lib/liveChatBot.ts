// [2026-11-10 사장님 05:07~05:12] 사이트 채팅 「루루동이AI」 — 순수 계산만(DB·돈·주문 무접촉).
//   ① 상품 안내: 손님 글에 상품번호(509·pd509·프라다509)가 있으면 무조건, 상품 이름만(나이키 후드티)이면
//      «묻거나 사려는 말»(얼마·사이즈·주문·? …)이 같이 있을 때만. 맞는 상품이 «딱 하나»일 때만 안내.
//   ② 자주 묻는 말: 사장님이 방송 관리 창에서 고치는 «낱말 → 답» 목록(방송마다 바꿀 수 있음).
//   돈·주문 상태를 확인해 주는 말(「입금 확인됐어요」 등)은 기본 답에 없다 — 카톡 채널로 안내.
import { productSearchMatches, normalizeProductSearchText } from "@/lib/productSearch";
import { cleanProductNameForFeed } from "@/lib/feedText";


export const LIVE_CHAT_BOT_KEY = "live_chat_bot_v1";
export const LIVE_CHAT_BOT_NICK = "루루동이";
/** 봇 글의 kakao_id 자리(진짜 손님 계정과 안 겹침) */
export const LIVE_CHAT_BOT_KAKAO = "bot:ruru";
/** 같은 상품·같은 답은 이 시간 안에 다시 안 올림(도배 방지) */
export const LIVE_CHAT_BOT_COOLDOWN_MS = 60 * 1000;
export const LIVE_CHAT_BOT_MAX_LEN = 300;

export type LiveChatFaq = { words: string[]; answer: string };
export type LiveChatBotSetting = {
  /** 루루동이AI 전체 켜기 */
  enabled: boolean;
  /** 상품 안내 켜기 */
  product: boolean;
  /** [07:39 사장님] 장바구니 담음 알림 — 누가(닉네임 일부 가림) 무엇을 담았는지 모두에게 */
  cart: boolean;
  /** 자주 묻는 말 */
  faqs: LiveChatFaq[];
};

export const LIVE_CHAT_BOT_DEFAULT_FAQS: LiveChatFaq[] = [
  { words: ["계좌", "계좌번호", "어디로입금", "입금어디"], answer: "주문서를 제출하면 입금 계좌가 바로 나와요. 입금자명은 주문서 닉네임과 똑같이, 금액은 정확히 넣어 주세요." },
  { words: ["입금했", "입금확인", "입금완료", "입금 했"], answer: "입금 후 보통 10~30분 안에 자동으로 확인돼요. 주문내역에서 「입금확인」으로 바뀌어요. 다른 이름으로 입금하셨으면 카톡 채널로 알려 주세요." },
  { words: ["배송", "언제와", "언제 와", "출고", "택배", "송장"], answer: "출고는 평일 기준 1~3일이에요(주말·공휴일 제외). 송장번호는 출고 날 루루동이 밴드에서 볼 수 있고, 택배사 문자도 가요." },
  { words: ["합배송", "같이 보내", "같이보내", "묶음배송"], answer: "같은 방송에서 여러 번 주문하셔도 자동으로 합배송돼요. 배송비는 한 번만 내요." },
  { words: ["교환", "반품", "환불"], answer: "받은 날부터 7일 안에 카톡 채널로 말씀해 주세요. 사이즈·단순변심은 국내 상품 10,000원(해외 상품 30,000원)이 들어요. 불량·오배송은 무료예요." },
  { words: ["카드", "카드결제"], answer: "카드결제는 배송비 포함 5만원 이상부터 돼요. 주문서에서 카드를 고르면 결제 링크를 보내 드려요." },
];

export const LIVE_CHAT_BOT_DEFAULT: LiveChatBotSetting = { enabled: true, product: true, cart: true, faqs: LIVE_CHAT_BOT_DEFAULT_FAQS };

function cleanWords(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(/[,\n]/);
  return Array.from(new Set(list.map((w) => String(w ?? "").trim().slice(0, 20)).filter(Boolean))).slice(0, 20);
}

export function parseLiveChatBotSetting(raw: unknown): LiveChatBotSetting {
  let v: unknown = raw;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return { ...LIVE_CHAT_BOT_DEFAULT, faqs: LIVE_CHAT_BOT_DEFAULT_FAQS.map((f) => ({ ...f, words: [...f.words] })) };
    try { v = JSON.parse(t); } catch { return { ...LIVE_CHAT_BOT_DEFAULT, faqs: LIVE_CHAT_BOT_DEFAULT_FAQS.map((f) => ({ ...f, words: [...f.words] })) }; }
  }
  if (!v || typeof v !== "object") return { ...LIVE_CHAT_BOT_DEFAULT, faqs: LIVE_CHAT_BOT_DEFAULT_FAQS.map((f) => ({ ...f, words: [...f.words] })) };
  const o = v as Record<string, unknown>;
  const faqs: LiveChatFaq[] = Array.isArray(o.faqs)
    ? o.faqs.map((x) => {
        const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
        return { words: cleanWords(r.words), answer: String(r.answer ?? "").replace(/\s+/g, " ").trim().slice(0, 200) };
      }).filter((f) => f.words.length > 0 && f.answer).slice(0, 30)
    : LIVE_CHAT_BOT_DEFAULT_FAQS.map((f) => ({ ...f, words: [...f.words] }));
  return { enabled: o.enabled !== false, product: o.product !== false, cart: o.cart !== false, faqs };
}

export function serializeLiveChatBotSetting(s: LiveChatBotSetting): string {
  return JSON.stringify(parseLiveChatBotSetting(s));
}

/** 묻거나 사려는 말 — 상품 «이름»만 쓴 글은 이게 있어야 안내 */
const INTENT = /얼마|가격|사이즈|싸이즈|색상|컬러|칼라|재고|있어요|있나요|있을까|있어\?|보여|주문|구매|살게|살께|할게|할께|담을|담아|품절|남았|몇개|몇 개|\?/;
export function hasBuyIntent(body: string): boolean {
  return INTENT.test(String(body || ""));
}

export type BotCandidate = {
  productId: string;
  /** 세부상품이면 그 이름(누르면 그 세부상품이 골라진 채 옵션 창) */
  detailName: string;
  /** 찾기에 쓰는 말 — 상품명(세부상품명)·상품번호 */
  texts: string[];
  /** 안내 글(상품명 / 금액 / 색상 / 사이즈) */
  line: string;
  soldOut: boolean;
  /** 이 상품 사이즈들 — 「240 있어요?」를 상품번호로 오해하지 않게 */
  sizes: string[];
  /** 세부상품이면 묶음(브랜드) 이름 — 「다이슨」처럼 묶음 이름만 쓴 짧은 글을 알아보려고 */
  groupName?: string;
  /** [07:39] 장바구니 알림용 — 화면에 보일 이름·서버가 아는 판매가 범위(손님이 보낸 값은 이 안일 때만 믿음) */
  name?: string;
  priceMin?: number;
  priceMax?: number;
};

const NUM_UNIT_AFTER = /^(원|개|만|천|번째|번|시|분|초|일|살|키로|kg|cm|mm|호|프로|%|명|벌|장|켤레)/i;

/** 글에서 상품번호처럼 생긴 말 — 「509」「pd509」「pd-509」「프라다509」「막102」. 「2개」「5만원」「010…」 등은 뺌. */
export function codeTokens(body: string, sizes: Set<string>): string[] {
  const s = String(body || "");
  const out: string[] = [];
  const re = /([A-Za-z가-힣]{0,6})\s?-?\s?(\d{2,6})([A-Za-z]?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const prefix = m[1] || "";
    const digits = m[2];
    const tail = s.slice(m.index + m[0].length);
    if (NUM_UNIT_AFTER.test(tail.trimStart()) && !/^[A-Za-z]/.test(m[3] || "")) continue;
    if (/^0\d{1,2}/.test(digits) && digits.length >= 3 && !prefix) continue; // 010… 전화번호
    if (!prefix) {
      if (digits.length < 3) continue; // 「38」 같은 두 자리 숫자만은 너무 흔함
      if (sizes.has(digits)) continue; // 「240 있어요?」 = 사이즈
    }
    out.push(`${prefix}${digits}${m[3] || ""}`);
  }
  return Array.from(new Set(out));
}

function words(body: string): string[] {
  return String(body || "")
    .split(/[\s,.!?~·/]+/)
    .map((w) => w.replace(/(은|는|이|가|을|를|도|요|좀|으로|로|에|이요|있어요|있나요)$/u, "").trim())
    .filter((w) => w.length >= 2 && !INTENT.test(w));
}

export type BotProductPick = { cand: BotCandidate; by: "code" | "name" };

/** [2026-11-10 07:06·07:20 사장님] 짧은 글(낱말 1~2개, 15글자 이하)에 상품 이름만 — 「에어랩」.
 *  약속한 규칙 그대로: 맞는 상품이 «딱 하나»일 때만 안내(세부상품 하나까지 정확히). 둘 이상 맞으면(「다이슨」「프라다」) 안 함.
 *  색 이름·「예뻐요」 같은 흔한 말은 상품 이름으로 안 봄. */
const SHORT_COMMON = new Set(["블랙", "화이트", "베이지", "네이비", "그레이", "회색", "검정", "흰색", "핑크", "레드", "블루", "브라운", "아이보리", "카키", "차콜", "크림", "오트밀", "연베이지", "카멜", "그린", "옐로우", "퍼플", "와인", "프리", "free", "사이즈", "예뻐요", "예쁘다", "이뻐요", "대박", "좋아요", "감사", "감사합니다", "안녕", "안녕하세요", "하이", "ㅋㅋ", "ㅎㅎ", "언니", "루루", "루루동이", "명품", "가방", "신발", "옷", "니트", "코트", "패딩", "자켓", "셔츠", "바지", "치마"]);
export type BotShortPick = { productId: string; detailName: string; text: string };
export function pickProductsForShortChat(body: string, cands: BotCandidate[]): BotShortPick[] {
  const raw = normalizeProductSearchText(String(body || ""));
  if (!raw || raw.length > 15) return [];
  const ws = words(body).map((w) => normalizeProductSearchText(w)).filter((w) => w.length >= 2);
  if (ws.length < 1 || ws.length > 2) return [];
  if (ws.some((w) => SHORT_COMMON.has(w))) return []; // 「블랙」「예뻐요」 같은 흔한 말은 상품 이름으로 안 봄
  const hits = cands.filter((c) => {
    const hay = c.texts.map((t) => normalizeProductSearchText(t)).join("|");
    return ws.every((w) => hay.includes(w));
  });
  if (hits.length !== 1) return [];
  return [{ productId: hits[0].productId, detailName: hits[0].detailName, text: productBotText(hits[0]) }];
}

/** 손님 글 → 안내할 상품 하나(없거나 둘 이상이면 null) */
export function pickProductForChat(body: string, cands: BotCandidate[]): BotProductPick | null {
  if (!cands.length) return null;
  const sizes = new Set<string>();
  for (const c of cands) for (const z of c.sizes) { const d = String(z).replace(/\D/g, ""); if (d) sizes.add(d); }
  // ① 상품번호 — 무조건(번호까지 치는 손님은 거의 사려는 사람)
  const codes = codeTokens(body, sizes);
  if (codes.length) {
    const hit = new Map<string, BotCandidate>();
    for (const code of codes) {
      for (const c of cands) if (c.texts.some((t) => productSearchMatches(t, code))) hit.set(`${c.productId}|${c.detailName}`, c);
    }
    if (hit.size === 1) return { cand: Array.from(hit.values())[0], by: "code" };
    if (hit.size > 1) return null; // 여러 개 = 안 올림(잘못 안내 방지)
  }
  // ② 상품 이름 — 묻거나 사려는 말이 있을 때만, 낱말 두 개 이상 맞고, 가장 많이 맞는 상품이 하나일 때만
  if (!hasBuyIntent(body)) return null;
  const ws = words(body);
  if (ws.length < 2) return null;
  let best = 0;
  let bestList: BotCandidate[] = [];
  for (const c of cands) {
    const hay = c.texts.map((t) => normalizeProductSearchText(t)).join("|");
    const n = ws.filter((w) => { const q = normalizeProductSearchText(w); return q.length >= 2 && hay.includes(q); }).length;
    if (n > best) { best = n; bestList = [c]; } else if (n === best && n > 0) bestList.push(c);
  }
  if (best >= 2 && bestList.length === 1) return { cand: bestList[0], by: "name" };
  return null;
}

/** 자주 묻는 말 — 첫 번째로 맞는 답(띄어쓰기 무시로 비교) */
export function pickFaq(body: string, faqs: LiveChatFaq[]): { index: number; faq: LiveChatFaq } | null {
  const hay = String(body || "").replace(/\s+/g, "").toLowerCase();
  if (!hay) return null;
  for (let i = 0; i < faqs.length; i += 1) {
    const f = faqs[i];
    if (f.words.some((w) => { const k = w.replace(/\s+/g, "").toLowerCase(); return k.length > 0 && hay.includes(k); })) return { index: i, faq: f };
  }
  return null;
}

/** 봇 글에 붙이는 표시 — p:상품id|세부상품 / f:답 번호(쉬는 시간 계산·누르면 옵션 창) */
export function botRefOfProduct(c: Pick<BotCandidate, "productId" | "detailName">): string {
  return `p:${c.productId}|${c.detailName}`.slice(0, 300);
}
export function botRefOfFaq(faq: LiveChatFaq): string {
  return `f:${faq.words.join(",")}`.slice(0, 300);
}
/** [07:39] 장바구니 담음 알림 — c:상품id|세부상품(누르면 다른 손님도 그 상품 옵션 창). 상품 안내(p:)와 쉬는 시간을 따로 센다 */
export function botRefOfCart(c: Pick<BotCandidate, "productId" | "detailName">): string {
  return `c:${c.productId}|${c.detailName}`.slice(0, 300);
}
export function parseBotRef(ref: unknown): { productId: string; detailName: string } | null {
  const s = String(ref ?? "");
  if (!s.startsWith("p:") && !s.startsWith("c:")) return null;
  const body = s.slice(2);
  const bar = body.indexOf("|");
  const productId = (bar >= 0 ? body.slice(0, bar) : body).trim();
  const detailName = bar >= 0 ? body.slice(bar + 1).trim() : "";
  return productId ? { productId, detailName } : null;
}

export function productBotText(c: BotCandidate): string {
  const line = c.line.replace(/^🛍\s*/, "").replace(/[\r\n]+/g, " ").trim();
  return `${line}${c.soldOut ? " · 품절" : ""}`.slice(0, LIVE_CHAT_BOT_MAX_LEN);
}

// ── [2026-11-10 사장님 05:14·05:15] 루루동이AI «알림 글» — 주문서 제출·결제 완료·카드 결제 링크·(내 화면만) 장바구니 ──
//   주문 소식(Broadcast 'order')을 받은 각 화면이 채팅에 한 줄 끼워 넣는다(DB 에 안 씀). 금액은 안 띄움(누가 얼마 썼는지 방송에 안 나가게).
//   장바구니는 다른 손님에게 안 보임(담았다고 공개되면 부담) — 담은 본인 화면에만 «다음 할 일» 안내 한 번.
const EMPTY_OPT = new Set(["", "없음", "없슴", "무", "-", "none", "n/a", "na"]);
export type OrderEventRow = Record<string, unknown>;
export function orderItemLine(rows: OrderEventRow[]): string {
  if (!rows.length) return "";
  const first = rows[0];
  const opt = [first.color, first.size].map((v) => String(v ?? "").replace(/사이즈\s*/g, "").trim()).filter((v) => !EMPTY_OPT.has(v.toLowerCase())).join("/");
  const label = `${cleanProductNameForFeed(first.product_name)}${opt ? ` ${opt}` : ""}`.trim();
  return rows.length > 1 ? `${label} 외 ${rows.length - 1}종` : label;
}
export function clipChatNick(nick: unknown): string {
  const s = String(nick ?? "").trim();
  return Array.from(s).length > 10 ? `${Array.from(s).slice(0, 9).join("")}…` : s;
}
export function isCardOrderRow(row: OrderEventRow): boolean {
  return /카드/.test(String(row.payment_method ?? ""));
}
export function orderThanksText(rows: OrderEventRow[]): string {
  const nick = clipChatNick(rows[0]?.youtube_nickname);
  const item = orderItemLine(rows);
  return `🛒 ${nick}님 ${item ? `${item} ` : ""}주문 감사합니다!`;
}
export function cardLinkText(rows: OrderEventRow[]): string {
  return `💳 ${clipChatNick(rows[0]?.youtube_nickname)}님, 카드 결제 링크를 카톡으로 보내 드려요. 카톡이 오면 눌러서 편하게 결제해 주세요 😊`;
}
export function paidThanksText(rows: OrderEventRow[]): string {
  return `💗 ${clipChatNick(rows[0]?.youtube_nickname)}님 결제 완료! 감사합니다`;
}
export const CART_NEXT_STEP_TEXT = "장바구니 담김! 다 고르시면 「주문서」에서 제출하고 입금하시면 주문이 끝나요 😊";

// ── [2026-11-10 07:39 사장님] 장바구니 담음 알림 — 모두에게(구매욕 자극), 닉네임 일부만 가림 ──
//   닉네임: 첫 글자는 늘 보임. 2글자=1개, 3글자=가운데 1개, 4글자 이상=1~2개(개수·자리 랜덤) 가림. 띄어쓰기는 안 가림.
//   글: 「🛍️ 루*동이님 장바구니 담음 · PD-202 블랙/M · 259,000원」(여러 개면 「… 외 N종」). 사장님 말 «누구 장바구니 뭐 담음 옵션 금액» 그대로.
export function maskChatNick(nick: unknown, rand: () => number = Math.random): string {
  const chars = Array.from(clipChatNick(nick).replace(/…$/, ""));
  const n = chars.length;
  if (n <= 1) return chars.join("");
  const slots = chars.map((c, i) => (i > 0 && c.trim() ? i : -1)).filter((i) => i >= 0);
  if (!slots.length) return chars.join("");
  const want = n <= 3 ? 1 : Math.min(slots.length, n - 2, 1 + Math.floor(rand() * 2));
  const pick = new Set<number>();
  if (n === 3 && slots.includes(1)) pick.add(1);
  while (pick.size < Math.max(1, want)) pick.add(slots[Math.floor(rand() * slots.length)]);
  return chars.map((c, i) => (pick.has(i) ? "*" : c)).join("");
}
export type CartAnnounceItem = { name: string; color: string; size: string; price: number | null };
export function cartAnnounceText(maskedNick: string, items: CartAnnounceItem[]): string {
  const first = items[0];
  if (!first) return "";
  const opt = [first.color, first.size].map((v) => String(v ?? "").replace(/사이즈\s*/g, "").trim()).filter((v) => !EMPTY_OPT.has(v.toLowerCase())).join("/");
  const parts = [`${cleanProductNameForFeed(first.name)}${opt ? ` ${opt}` : ""}`.trim()];
  if (first.price != null && first.price > 0) parts.push(`${Math.round(first.price).toLocaleString("ko-KR")}원`);
  const more = items.length > 1 ? ` 외 ${items.length - 1}종` : "";
  return `🛍️ ${maskedNick}님 장바구니 담음 · ${parts.join(" · ")}${more}`.slice(0, LIVE_CHAT_BOT_MAX_LEN);
}
/** 손님이 보낸 단가는 서버가 아는 범위 안일 때만 그대로, 아니면 서버 값(최소) */
export function trustedCartPrice(sent: number | null, c: Pick<BotCandidate, "priceMin" | "priceMax">): number | null {
  const lo = c.priceMin, hi = c.priceMax ?? c.priceMin;
  if (lo == null || !Number.isFinite(lo)) return null;
  if (sent != null && Number.isFinite(sent) && hi != null && sent >= lo && sent <= hi) return sent;
  return lo;
}
/** 입금확인·카드결제완료로 «바뀐» 순간인지 */
export function becamePaid(newRow: OrderEventRow, oldRow: OrderEventRow): boolean {
  const st = (r: OrderEventRow) => String(r.admin_order_status_v2 || r.order_manage_status || r.deposit_status || "").trim();
  const n = st(newRow), o = st(oldRow);
  if (/입금확인/.test(n) && !/입금확인/.test(o)) return true;
  return n === "카드결제완료" && o !== "카드결제완료";
}
