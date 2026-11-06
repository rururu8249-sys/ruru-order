// lib/orderChatBatch.ts
// [2026-11-06 사장님 「두 채널 다 줄일 수 있는 최적」·「사람마다 하트」]
//   유튜브 채팅 글 한 줄 = 하루 한도 10,000 중 50. 주문마다 2~3줄씩 올리던 것을
//   «20초 동안 들어온 주문을 한 줄로 묶어» 올려 사용량을 크게 줄인다.
//   - 한 명:  🛒 몽상가8277님 주문 감사합니다! BB-78 트렌치코트 외 2개
//   - 여러 명: 🛒 주문 감사합니다! 💗몽상가8277님 BB-78 외 2 💗행복나무님 PD-202
//   금액·옵션은 안 올린다(누가 얼마 썼는지 방송에 안 나가게 — 상품 위젯 스티커와 같은 원칙).
//   표시 전용 — 주문·입금·재고·돈 무관. 대기열은 settings 한 칸(글자)이고, 실패해도 주문은 정상.

export const ORDER_CHAT_QUEUE_KEY = "youtube_order_chat_queue_v1";
export const ORDER_CHAT_BATCH_MS = 20_000;
export const ORDER_CHAT_MAX_CHARS = 190;
const QUEUE_MAX = 60;

export type OrderChatEntry = {
  /** 닉네임 */
  n: string;
  /** 첫 상품 이름 */
  p: string;
  /** 나머지 상품 줄 수 */
  m: number;
  /** 넣은 시각(ms) */
  t: number;
};

type AnyRow = Record<string, unknown>;

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

/** 주문서 줄들 → 대기열 한 칸 */
export function orderChatEntry(nickname: string, rows: AnyRow[], now: number): OrderChatEntry {
  const names = (Array.isArray(rows) ? rows : []).map((r) => clean(r?.product_name)).filter(Boolean);
  return { n: clean(nickname).slice(0, 30) || "고객", p: (names[0] || "").slice(0, 40), m: Math.max(0, names.length - 1), t: now };
}

/** 묶음용 짧은 상품 이름 — 「BB-78 트렌치코트」→「BB-78」, 코드 없으면 앞 12글자 */
export function shortProductName(name: string): string {
  const s = clean(name);
  const m = s.match(/^([A-Za-z]+)(?:\([^)]*\))?-(\d+[A-Za-z]*)/);
  if (m) return `${m[1].toUpperCase()}-${m[2].toUpperCase()}`;
  return s.length > 12 ? `${s.slice(0, 12)}…` : s;
}

function onePerson(e: OrderChatEntry): string {
  const more = e.m > 0 ? ` 외 ${e.m}개` : "";
  const item = e.p ? ` ${e.p}${more}` : "";
  return `🛒 ${e.n}님 주문 감사합니다!${item}`;
}

function personChunk(e: OrderChatEntry): string {
  const p = e.p ? ` ${shortProductName(e.p)}${e.m > 0 ? ` 외 ${e.m}` : ""}` : "";
  return `💗${e.n}님${p}`;
}

/** 대기열 → 채팅 글들(한 줄 190자 이하, 넘치면 다음 줄) */
export function buildOrderChatBatchMessages(entries: OrderChatEntry[], maxChars = ORDER_CHAT_MAX_CHARS): string[] {
  const list = entries.filter((e) => e && e.n);
  if (list.length === 0) return [];
  if (list.length === 1) return [onePerson(list[0]).slice(0, maxChars)];
  const head = "🛒 주문 감사합니다!";
  const out: string[] = [];
  let cur = head;
  let count = 0;
  for (const e of list) {
    const chunk = personChunk(e);
    if (count > 0 && cur.length + 1 + chunk.length > maxChars) {
      out.push(cur);
      cur = head;
      count = 0;
    }
    cur = `${cur} ${chunk}`.slice(0, maxChars);
    count += 1;
  }
  if (count > 0) out.push(cur);
  return out;
}

export function parseOrderChatQueue(raw: unknown): OrderChatEntry[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter((e) => e && typeof e === "object" && typeof e.n === "string")
      .map((e) => ({ n: String(e.n), p: String(e.p ?? ""), m: Math.max(0, Number(e.m) || 0), t: Number(e.t) || 0 }));
  } catch {
    return [];
  }
}

// ───────── 대기열(settings 한 칸) — 글자 값 비교로 «내가 바꾼 사람이 맞을 때만» 저장(동시 주문 안전) ─────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function readQueueRaw(db: Db): Promise<{ exists: boolean; raw: string }> {
  const { data } = await db.from("settings").select("value").eq("key", ORDER_CHAT_QUEUE_KEY).limit(1).maybeSingle();
  if (!data) return { exists: false, raw: "" };
  return { exists: true, raw: String(data.value ?? "") };
}

/** 값이 old 그대로일 때만 new 로 바꿈. 바뀌었으면 true */
async function swapQueue(db: Db, exists: boolean, oldRaw: string, newRaw: string): Promise<boolean> {
  if (!exists) {
    const { error } = await db.from("settings").insert({ key: ORDER_CHAT_QUEUE_KEY, value: newRaw });
    return !error;
  }
  const { data, error } = await db.from("settings").update({ value: newRaw }).eq("key", ORDER_CHAT_QUEUE_KEY).eq("value", oldRaw).select("key");
  return !error && Array.isArray(data) && data.length > 0;
}

/** 주문 하나를 대기열에 넣음(최대 5번 다시 시도). 실패해도 throw 안 함. */
export async function enqueueOrderChat(db: Db, entry: OrderChatEntry): Promise<boolean> {
  for (let i = 0; i < 5; i += 1) {
    try {
      const { exists, raw } = await readQueueRaw(db);
      const list = parseOrderChatQueue(raw);
      list.push(entry);
      const next = JSON.stringify(list.slice(-QUEUE_MAX));
      if (await swapQueue(db, exists, raw, next)) return true;
    } catch {
      /* 다시 시도 */
    }
  }
  return false;
}

/** 가장 오래된 주문이 batchMs 지났으면 대기열을 통째로 가져오고 비움. 아니면 [] */
export async function takeDueOrderChats(db: Db, now: number, batchMs = ORDER_CHAT_BATCH_MS): Promise<OrderChatEntry[]> {
  for (let i = 0; i < 5; i += 1) {
    try {
      const { exists, raw } = await readQueueRaw(db);
      const list = parseOrderChatQueue(raw);
      if (!exists || list.length === 0) return [];
      const oldest = Math.min(...list.map((e) => (Number.isFinite(e.t) ? e.t : 0))); // 시각 없는 칸은 오래된 것으로
      if (now - oldest < batchMs - 1500) return [];
      if (await swapQueue(db, true, raw, "[]")) return list;
    } catch {
      /* 다시 시도 */
    }
  }
  return [];
}
