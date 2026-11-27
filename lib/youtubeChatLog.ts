// lib/youtubeChatLog.ts
// [2026-11-27] 유튜브 채팅 기록 — «채팅으로 주문했다»고 하는 손님 확인용(사장님 15:02).
//   1분 기록기(lib/liveMetricsServer)가 읽은 유튜브 채팅을 youtube_chat_log 표에 그대로 저장하고,
//   관리자 「채팅 기록」 화면이 닉네임으로 찾아 본다. 여기는 «순수 함수»만(저장·조회 없음).
//   - 주문 같은 말 판정: 강조 표시용. 돈·주문·재고 판단에는 절대 쓰지 않는다.
//   - 의심 목록: «주문 같은 말을 했는데 그 방송 주문서에 같은 닉네임이 없음».
import { extractCodes } from "@/lib/liveMetrics";

export const YOUTUBE_CHAT_LOG_TABLE = "youtube_chat_log";

export type ChatLogRow = {
  message_id: string;
  broadcast_id: string | null;
  live_chat_id: string | null;
  channel_id: string | null;
  author_name: string;
  is_owner: boolean;
  is_bot: boolean;
  message: string;
  order_like: boolean;
  published_at: string;
};

/** 닉네임 비교용 — @·공백·하이픈 꼬리표(-f2h) 떼고 소문자 */
export function chatNickKey(name: string): string {
  let s = String(name || "").normalize("NFC").trim();
  s = s.replace(/^@+/, "");
  // 유튜브 핸들 뒤에 저절로 붙는 꼬리표(예: 루루맘-f2h, 홍길동-x9k2) — 영문·숫자 2~5자
  s = s.replace(/-[a-z0-9]{2,5}$/i, "");
  return s.replace(/[\s._\-·]/g, "").toLowerCase();
}

// 주문할 때 손님들이 실제로 쓰는 말(유튜브 채팅 실측 말투 + 사장님 방송 관례)
const ORDER_WORDS = [
  "저요", "저여", "저용", "저두요", "저도요", "주세요", "주문", "구매", "살게", "살래", "살께", "할게요", "할께요",
  "담아", "담을게", "찜", "예약", "입금", "결제", "카결", "계좌", "접수", "콜", "ㅈㅇ", "줘요", "주셔요", "가져갈게",
  "구입", "사고싶", "살수", "살 수",
];
const SIZE_OR_COLOR = /(?:^|[^A-Za-z])(?:XXL|XL|XS|S|M|L|FREE|F)(?![A-Za-z])|블랙|화이트|베이지|그레이|네이비|브라운|아이보리|카키|핑크|레드|블루|그린|차콜|크림|와인|오트밀|\d{3}\s*(?:mm|사이즈|호)?/i;

export type OrderLikeResult = { orderLike: boolean; reasons: string[] };

/** 주문 같은 말인지(강조용). reasons = 화면에 보여 줄 근거 낱말 */
export function orderLikeReasons(text: string): OrderLikeResult {
  const s = String(text || "");
  const reasons: string[] = [];
  for (const c of extractCodes(s)) reasons.push(c);
  const compact = s.replace(/\s+/g, "");
  for (const w of ORDER_WORDS) {
    const wc = w.replace(/\s+/g, "");
    if (compact.includes(wc) && !reasons.includes(w)) reasons.push(w);
  }
  // 「509 블랙 M」처럼 번호 + 색·사이즈
  if (!reasons.length && /(?:^|\D)\d{2,4}(?:번)?(?:\D|$)/.test(s) && SIZE_OR_COLOR.test(s.replace(/\d{2,4}(?:번)?/, " "))) {
    reasons.push("번호+옵션");
  }
  return { orderLike: reasons.length > 0, reasons };
}

/** 유튜브 liveChatMessages 응답 한 줄 → 저장할 줄(못 쓰면 null) */
export function chatLogRowFromApi(
  it: any,
  ctx: { broadcastId: string; liveChatId: string; botChannelId: string },
): ChatLogRow | null {
  const id = String(it?.id || "").trim();
  const at = String(it?.snippet?.publishedAt || "");
  if (!id || !Number.isFinite(Date.parse(at))) return null;
  const a = it?.authorDetails || {};
  const message = String(it?.snippet?.displayMessage || it?.snippet?.textMessageDetails?.messageText || "").slice(0, 1000);
  const channel = String(a.channelId || "");
  const isOwner = Boolean(a.isChatOwner);
  const isBot = Boolean(ctx.botChannelId && channel === ctx.botChannelId) || /^\s*🛒/.test(message);
  return {
    message_id: id,
    broadcast_id: ctx.broadcastId || null,
    live_chat_id: ctx.liveChatId || null,
    channel_id: channel || null,
    author_name: String(a.displayName || "").slice(0, 100),
    is_owner: isOwner,
    is_bot: isBot,
    message,
    order_like: !isOwner && !isBot && orderLikeReasons(message).orderLike,
    published_at: new Date(Date.parse(at)).toISOString(),
  };
}

/** 채팅 닉네임과 주문 닉네임이 같은 사람인지(완전 같음 또는 한쪽이 다른 쪽을 품음, 2글자 이상) */
export function nickMatches(chatKey: string, orderKey: string): boolean {
  if (!chatKey || !orderKey) return false;
  if (chatKey === orderKey) return true;
  const short = chatKey.length <= orderKey.length ? chatKey : orderKey;
  const long = short === chatKey ? orderKey : chatKey;
  return short.length >= 2 && long.includes(short);
}

export type SuspectInput = {
  messages: Array<Pick<ChatLogRow, "author_name" | "channel_id" | "message" | "published_at" | "is_owner" | "is_bot" | "order_like">>;
  orderNicks: string[]; // 그 방송 주문서 닉네임(취소 포함 — 주문서를 낸 적이 있는지만 봄)
  orderChannelIds?: string[]; // 채널로 이어진 회원의 주문(있으면 확실한 같은 사람)
};

export type Suspect = {
  author: string;
  channelId: string | null;
  orderLikeCount: number;
  firstAt: string;
  lastAt: string;
  samples: string[];
  similar: string[]; // 비슷한 주문 닉네임(같은 사람일 수 있음)
};

/** 주문 같은 말을 했는데 그 방송 주문서에 같은 닉네임이 없는 사람 */
export function findSuspects(input: SuspectInput): Suspect[] {
  const orderKeys = input.orderNicks.map((n) => ({ raw: n, key: chatNickKey(n) })).filter((o) => o.key);
  const chSet = new Set((input.orderChannelIds || []).filter(Boolean));
  const byAuthor = new Map<string, Suspect & { key: string }>();
  for (const m of input.messages) {
    if (m.is_owner || m.is_bot || !m.order_like) continue;
    const key = m.channel_id ? `c:${m.channel_id}` : `n:${chatNickKey(m.author_name)}`;
    const cur = byAuthor.get(key);
    if (cur) {
      cur.orderLikeCount += 1;
      if (m.published_at < cur.firstAt) cur.firstAt = m.published_at;
      if (m.published_at > cur.lastAt) cur.lastAt = m.published_at;
      if (cur.samples.length < 3) cur.samples.push(m.message);
    } else {
      byAuthor.set(key, {
        key, author: m.author_name, channelId: m.channel_id ?? null, orderLikeCount: 1,
        firstAt: m.published_at, lastAt: m.published_at, samples: [m.message], similar: [],
      });
    }
  }
  const out: Suspect[] = [];
  for (const s of byAuthor.values()) {
    if (s.channelId && chSet.has(s.channelId)) continue;
    const ck = chatNickKey(s.author);
    if (orderKeys.some((o) => o.key === ck)) continue;
    const similar = orderKeys.filter((o) => nickMatches(ck, o.key)).map((o) => o.raw);
    const { key: _k, ...rest } = s;
    void _k;
    out.push({ ...rest, similar: [...new Set(similar)].slice(0, 3) });
  }
  return out.sort((a, b) => (a.firstAt < b.firstAt ? -1 : 1));
}
