// [2026-11-10 06:26 사장님] 사이트 채팅 이모티콘(유튜브 멤버십 이모티콘처럼) — 순수 계산만(화면·서버 공용).
//   설정 settings.live_chat_emoji_v1 = 이모티콘 목록 + 쓸 수 있는 손님 규칙(전화번호는 여기 안 둠 — settings 는 손님도 읽음).
//   직접 넣은/막은 손님 명단은 비공개 저장소(lib/liveChatEmojiServer).
//   글 안 이모티콘 = 서버만 만드는 표식 «아이디:이름». 손님이 «:이름:» 을 쳐도 서버가 자격을 본 뒤에만 표식으로 바꾼다.
//   (손님이 보낸 글의 ~ 글자는 서버가 먼저 지움 → 표식을 흉내 낼 수 없음)
//   돈·주문 무관.

export const LIVE_CHAT_EMOJI_KEY = "live_chat_emoji_v1";
/** 한 글에 넣을 수 있는 이모티콘 수 */
export const EMOJI_MAX_PER_MSG = 5;
/** 이모티콘 개수 상한 */
export const EMOJI_MAX_ITEMS = 60;
/** 저장 그림 긴 쪽 크기 — 여백을 잘라 꽉 채운 그림. 이모티콘만 보낸 글은 크게(약 56px) 나오니 폰 3배 화면에서도 또렷하게 256 */
export const EMOJI_PIXELS = 256;
/** 올릴 때 파일 크기 상한(유튜브와 같은 1MB) — 브라우저가 줄여서 보내므로 보통 30KB 안팎 */
export const EMOJI_MAX_BYTES = 1024 * 1024;
/** 사장님 지정(11/10 06:29) — 이 번호는 규칙과 상관없이 늘 쓸 수 있음 */
export const EMOJI_ALWAYS_PHONES = ["01099992420", "01046822420", "01081912420"];

export type ChatEmoji = { id: string; name: string; url: string; on: boolean };
/** off = 아무도 못 씀(최고 관리자만) / all = 로그인 손님 모두 / amount = 누적 구매 금액 이상 / list = 직접 넣은 손님만 */
export type ChatEmojiAccess = "off" | "all" | "amount" | "list";
export type ChatEmojiPeriod = "all" | "1y";
export type ChatEmojiSetting = {
  items: ChatEmoji[];
  access: ChatEmojiAccess;
  minAmount: number;
  period: ChatEmojiPeriod;
};

export const CHAT_EMOJI_DEFAULT: ChatEmojiSetting = { items: [], access: "amount", minAmount: 1_000_000, period: "all" };

const OPEN = "";
const CLOSE = "";
/** 이름에 쓸 수 있는 글자 — 한글(자모 포함)·영어·숫자·밑줄, 1~10글자 */
const NAME_CHARS = "0-9A-Za-z_가-힣ㄱ-ㅎㅏ-ㅣ";
const NAME_RE = new RegExp(`^[${NAME_CHARS}]{1,10}$`);
const TOKEN_RE = new RegExp(`:([${NAME_CHARS}]{1,10}):`, "g");
const MARK_RE = /([a-z0-9]{4,16}):([^]{1,10})/g;
const ID_RE = /^[a-z0-9]{4,16}$/;

export function isEmojiName(v: string): boolean {
  return NAME_RE.test(v);
}

/** 파일 이름 등 아무 글자 → 이모티콘 이름 후보(못 쓰는 글자 빼고 10글자) */
export function emojiNameFrom(raw: string): string {
  return Array.from(String(raw || "").replace(/\.[^.]+$/, "").replace(new RegExp(`[^${NAME_CHARS}]`, "g"), "")).slice(0, 10).join("");
}

/** 겹치지 않는 이름 — 이미 있으면 뒤에 숫자 */
export function uniqueEmojiName(base: string, taken: string[]): string {
  const set = new Set(taken);
  const b = emojiNameFrom(base) || "이모티콘";
  if (!set.has(b)) return b;
  for (let i = 2; i < 1000; i++) {
    const s = String(i);
    const n = Array.from(b).slice(0, 10 - s.length).join("") + s;
    if (!set.has(n)) return n;
  }
  return b;
}

function cleanItem(v: unknown): ChatEmoji | null {
  const o = (v && typeof v === "object" ? v : null) as Record<string, unknown> | null;
  if (!o) return null;
  const id = String(o.id ?? "").trim();
  const name = String(o.name ?? "").trim();
  const url = String(o.url ?? "").trim();
  if (!ID_RE.test(id) || !isEmojiName(name) || !/^https:\/\//i.test(url)) return null;
  return { id, name, url: url.slice(0, 500), on: o.on !== false };
}

export function parseChatEmojiSetting(raw: unknown): ChatEmojiSetting {
  let v: unknown = raw;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return { ...CHAT_EMOJI_DEFAULT, items: [] };
    try { v = JSON.parse(t); } catch { return { ...CHAT_EMOJI_DEFAULT, items: [] }; }
  }
  if (!v || typeof v !== "object") return { ...CHAT_EMOJI_DEFAULT, items: [] };
  const o = v as Record<string, unknown>;
  const items: ChatEmoji[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const it of Array.isArray(o.items) ? o.items : []) {
    const e = cleanItem(it);
    if (!e || ids.has(e.id) || names.has(e.name)) continue;
    ids.add(e.id);
    names.add(e.name);
    items.push(e);
    if (items.length >= EMOJI_MAX_ITEMS) break;
  }
  const access: ChatEmojiAccess = o.access === "off" || o.access === "all" || o.access === "list" ? o.access : "amount";
  const n = Math.round(Number(o.minAmount));
  const minAmount = Number.isFinite(n) && n >= 0 ? Math.min(n, 1_000_000_000) : CHAT_EMOJI_DEFAULT.minAmount;
  return { items, access, minAmount, period: o.period === "1y" ? "1y" : "all" };
}

export function serializeChatEmojiSetting(s: ChatEmojiSetting): string {
  return JSON.stringify(parseChatEmojiSetting(s));
}

/** 손님이 보낸 글에서 표식 글자(사용자 영역 ~)를 지움 — 표식은 서버만 만든다 */
export function stripPrivateUse(text: string): string {
  return String(text ?? "").replace(/[-]/g, "");
}

/** «:이름:» → 표식. 켜진 이모티콘만, 앞에서부터 max 개까지(나머지는 글자 그대로). */
export function encodeEmojiTokens(text: string, items: ChatEmoji[], max = EMOJI_MAX_PER_MSG): { text: string; count: number } {
  const byName = new Map(items.filter((e) => e.on).map((e) => [e.name, e]));
  if (byName.size === 0) return { text, count: 0 };
  let count = 0;
  const out = text.replace(TOKEN_RE, (whole, name: string) => {
    const e = byName.get(name);
    if (!e || count >= max) return whole;
    count += 1;
    return `${OPEN}${e.id}:${e.name}${CLOSE}`;
  });
  return { text: out, count };
}

/** 글 안 «:이름:» 중 켜진 이모티콘 개수(보내기 전 화면에서 5개 넘는지 볼 때) */
export function countEmojiTokens(text: string, items: ChatEmoji[]): number {
  const names = new Set(items.filter((e) => e.on).map((e) => e.name));
  let n = 0;
  for (const m of String(text || "").matchAll(TOKEN_RE)) if (names.has(m[1])) n += 1;
  return n;
}

export type ChatBodyPart = { type: "text"; text: string } | { type: "emoji"; id: string; name: string };

/** 저장된 글 → 글자·이모티콘 조각 */
export function splitChatBody(body: string): ChatBodyPart[] {
  const s = String(body ?? "");
  const parts: ChatBodyPart[] = [];
  let last = 0;
  for (const m of s.matchAll(MARK_RE)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ type: "text", text: s.slice(last, at) });
    parts.push({ type: "emoji", id: m[1], name: m[2] });
    last = at + m[0].length;
  }
  if (last < s.length) parts.push({ type: "text", text: s.slice(last) });
  return parts.map((p) => (p.type === "text" ? { ...p, text: stripPrivateUse(p.text) } : p)).filter((p) => p.type === "emoji" || p.text);
}

/** 그림 대신 글자로(알림·관리 창·봇 판단용) — 표식 → «:이름:» */
export function chatBodyAsText(body: string): string {
  return splitChatBody(body).map((p) => (p.type === "emoji" ? `:${p.name}:` : p.text)).join("");
}

/** 이모티콘을 뺀 글자만(자동 안내가 상품번호를 잘못 읽지 않게) */
export function chatBodyWithoutEmoji(body: string): string {
  return splitChatBody(body).filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join(" ").replace(/\s+/g, " ").trim();
}

/** 쓸 수 있는지 — 규칙만(서버가 누적 금액·명단을 넣어 부른다) */
export function emojiAllowed(input: {
  setting: ChatEmojiSetting;
  always: boolean;
  allowed: boolean;
  denied: boolean;
  paidTotal: number | null;
}): boolean {
  if (input.always) return true;
  if (input.denied) return false;
  if (input.allowed) return input.setting.access !== "off";
  if (input.setting.access === "all") return true;
  if (input.setting.access === "amount") return (input.paidTotal ?? 0) >= input.setting.minAmount;
  return false;
}

/** 규칙 한 줄 설명(관리 창) */
export function emojiAccessText(s: ChatEmojiSetting): string {
  if (s.access === "off") return "최고 관리자만";
  if (s.access === "all") return "로그인한 손님 모두";
  if (s.access === "list") return "직접 넣은 손님만";
  return `${s.period === "1y" ? "최근 1년 " : ""}누적 구매 ${s.minAmount.toLocaleString("ko-KR")}원 이상`;
}

export function newEmojiId(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(8, "0");
}
