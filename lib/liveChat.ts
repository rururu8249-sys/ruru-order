// [2026-11-10] 「방송 보며 주문」 ③단계 — 사이트 채팅(유튜브 채팅과 따로). 순수 계산만.
//   설정 읽기, 글 다듬기·금지어 가리기, 금지 시간, 소식(Broadcast) 모양 읽기.
//   돈·주문·장바구니와 무관.

export const LIVE_CHAT_KEY = "live_chat_v1";
export const LIVE_CHAT_MAX_LEN = 100;
/** 한 사람이 다음 글을 쓰기까지 기다리는 시간 */
export const LIVE_CHAT_MIN_GAP_MS = 1000;
/** 처음 열 때 불러오는 글 수 */
export const LIVE_CHAT_RECENT = 50;

export type LiveChatSetting = {
  /** 채팅 켜기(방송 보며 주문 화면 안에서만 보인다) */
  enabled: boolean;
  /** 채팅 맨 위 고정 공지(비우면 안 보임) */
  notice: string;
  /** 사장님이 더 넣은 금지어 */
  words: string[];
};

export const LIVE_CHAT_DEFAULT: LiveChatSetting = { enabled: true, notice: "", words: [] };

/** 기본 금지어 — 욕·비하 흔한 말(글자 사이 띄어쓰기·기호는 무시하고 찾는다). */
export const LIVE_CHAT_DEFAULT_WORDS: string[] = [
  "시발", "씨발", "씨빨", "시빨", "ㅅㅂ", "ㅆㅂ", "씨바", "시바", "쓰벌", "십새", "씹",
  "병신", "븅신", "ㅂㅅ", "ㅄ", "개새", "개색", "개세끼", "개쉐", "새끼", "색끼", "쌔끼",
  "좆", "존나", "졸라", "ㅈㄴ", "미친놈", "미친년", "미친x", "ㅁㅊ", "닥쳐", "꺼져",
  "지랄", "ㅈㄹ", "염병", "엠병", "니애미", "니미", "느금", "애미", "애비", "패드립",
  "등신", "또라이", "돌아이", "멍청이", "찐따", "한남", "김치녀", "된장녀", "틀딱", "급식충",
  "fuck", "shit", "bitch",
];

function cleanWord(w: unknown): string {
  return String(w ?? "").trim().slice(0, 30);
}

export function parseLiveChatSetting(raw: unknown): LiveChatSetting {
  let v: unknown = raw;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return { ...LIVE_CHAT_DEFAULT, words: [] };
    try { v = JSON.parse(t); } catch { return { ...LIVE_CHAT_DEFAULT, words: [] }; }
  }
  if (!v || typeof v !== "object") return { ...LIVE_CHAT_DEFAULT, words: [] };
  const o = v as Record<string, unknown>;
  const words = Array.isArray(o.words)
    ? Array.from(new Set(o.words.map(cleanWord).filter(Boolean))).slice(0, 200)
    : [];
  return {
    enabled: o.enabled !== false,
    notice: String(o.notice ?? "").trim().slice(0, 120),
    words,
  };
}

export function serializeLiveChatSetting(s: LiveChatSetting): string {
  return JSON.stringify(parseLiveChatSetting(s));
}

/** 줄바꿈·연속 공백을 한 칸으로, 앞뒤 공백 제거, 길이 제한 */
export function cleanChatBody(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u2028\u2029\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LIVE_CHAT_MAX_LEN);
}

const SKIP = /[\s.,·\-_~!?*'"`^+=|/\\()[\]{}<>@#$%&:;0-9]/;

/** 금지어를 «글자 사이 띄어쓰기·기호 무시»로 찾아 그 글자를 *로 바꾼다. 바뀐 게 있으면 hit=true. */
export function maskBannedWords(body: string, words: string[]): { text: string; hit: boolean } {
  const chars = Array.from(body);
  // 비교용: 건너뛸 글자를 뺀 글자들과 원래 위치
  const keep: { ch: string; idx: number }[] = [];
  chars.forEach((ch, idx) => { if (!SKIP.test(ch)) keep.push({ ch: ch.toLowerCase(), idx }); });
  const flat = keep.map((k) => k.ch).join("");
  const masked = new Set<number>();
  for (const raw of words) {
    const w = Array.from(String(raw || "").toLowerCase()).filter((ch) => !SKIP.test(ch)).join("");
    if (!w) continue;
    let from = 0;
    for (;;) {
      const at = flat.indexOf(w, from);
      if (at < 0) break;
      const len = Array.from(w).length;
      // flat 은 글자 배열을 이어 붙인 것 — 글자 단위 위치로 바꾼다
      const before = Array.from(flat.slice(0, at)).length;
      for (let i = before; i < before + len; i++) masked.add(keep[i].idx);
      from = at + w.length;
    }
  }
  if (masked.size === 0) return { text: body, hit: false };
  return { text: chars.map((ch, i) => (masked.has(i) ? "*" : ch)).join(""), hit: true };
}

/** 금지 시간 고르기 — 관리자가 길게 눌러 고르는 것 */
export type LiveChatPenalty = "hide" | "mute30s" | "mute5m" | "ban";
export function penaltyUntil(p: LiveChatPenalty, now = Date.now()): string | null | undefined {
  if (p === "mute30s") return new Date(now + 30 * 1000).toISOString();
  if (p === "mute5m") return new Date(now + 5 * 60 * 1000).toISOString();
  if (p === "ban") return null;
  return undefined; // hide = 금지 없음
}

/** 금지 기록 줄 하나가 지금 유효한지 */
export function banActive(row: { until_at?: string | null; lifted_at?: string | null }, now = Date.now()): boolean {
  if (row.lifted_at) return false;
  if (row.until_at == null) return true;
  const t = Date.parse(String(row.until_at));
  return Number.isFinite(t) && t > now;
}

/** 남은 금지 시간 안내 */
export function banMessage(row: { until_at?: string | null }, now = Date.now()): string {
  if (row.until_at == null) return "채팅을 쓸 수 없어요.";
  const sec = Math.max(1, Math.ceil((Date.parse(String(row.until_at)) - now) / 1000));
  if (sec < 60) return `${sec}초 뒤에 다시 쓸 수 있어요.`;
  return `${Math.ceil(sec / 60)}분 뒤에 다시 쓸 수 있어요.`;
}

export type LiveChatMessage = {
  id: number;
  broadcastId: string;
  nickname: string;
  body: string;
  createdAt: string;
  hidden: boolean;
};

/** 서버 줄 또는 소식(Broadcast) → 화면용 글. 모양이 이상하면 null. */
export function parseChatMessage(raw: unknown): LiveChatMessage | null {
  const p = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!p) return null;
  const id = Number(p.id);
  const broadcastId = String(p.broadcast_id ?? p.broadcastId ?? "");
  if (!Number.isFinite(id) || id <= 0 || !broadcastId) return null;
  const hidden = p.hidden === true || Boolean(p.hidden_at);
  return {
    id,
    broadcastId,
    nickname: String(p.nickname ?? "").slice(0, 40) || "손님",
    body: hidden ? "" : String(p.body ?? "").slice(0, LIVE_CHAT_MAX_LEN),
    createdAt: String(p.created_at ?? p.createdAt ?? ""),
    hidden,
  };
}

/** 목록에 새 글 합치기 — 같은 번호는 바꾸고, 지운 글은 빼고, 번호 순, 최근 N개만 */
export function mergeChat(list: LiveChatMessage[], incoming: LiveChatMessage[], keep = 80): LiveChatMessage[] {
  const map = new Map<number, LiveChatMessage>();
  for (const m of list) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return Array.from(map.values())
    .filter((m) => !m.hidden)
    .sort((a, b) => a.id - b.id)
    .slice(-keep);
}
