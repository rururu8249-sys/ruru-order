// [2026-11-10 21:54 사장님 「왜 구매 감사 멘트는 안 나와」] 주문 감사·카드 결제 링크·결제 완료 글을 서버가 채팅 표에 «저장»해서 올린다.
//   예전엔 각 손님 화면이 주문 소식을 받은 순간에만 자기 화면에 끼워 넣어(DB 안 씀) — 늦게 들어오거나 새로고침한 손님,
//   태블릿 채팅 보기·관리자 PC 채팅에는 안 보였음. 이제 장바구니 담음 알림처럼 모두에게 같은 글이 남는다.
//   읽기: broadcasts · settings · orders(그 주문서 줄 / 최근 입금확인 줄) · live_chat_messages(이미 올렸는지)
//   쓰기: live_chat_messages 봇 글만. 주문·입금·돈 무접촉. 실패해도 주문·입금과 무관(조용히 넘어감).
import type { SupabaseClient } from "@supabase/supabase-js";
import { LIVE_CHAT_KEY, parseLiveChatSetting } from "@/lib/liveChat";
import { isAutoTestRow } from "@/lib/autoTestOrder";
import {
  LIVE_CHAT_BOT_KAKAO,
  LIVE_CHAT_BOT_KEY,
  LIVE_CHAT_BOT_NICK,
  cardLinkText,
  isCardOrderRow,
  orderThanksText,
  paidThanksText,
  parseLiveChatBotSetting,
  type OrderEventRow,
} from "@/lib/liveChatBot";

const ORDER_COLS = "id, order_group_id, broadcast_id, youtube_nickname, product_name, color, size, payment_method, is_test_order, test_order_reason, operator_test_phone, is_deleted, created_at, deposit_confirmed_at, admin_order_status_v2, order_manage_status";

type OnBroadcast = { id: string; startedAt: string };

async function liveChatReady(sb: SupabaseClient): Promise<OnBroadcast | null> {
  const [bcRes, chatRes, botRes] = await Promise.all([
    sb.from("broadcasts").select("id, started_at").eq("status", "ON").neq("is_deleted", true).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("settings").select("value").eq("key", LIVE_CHAT_KEY).maybeSingle(),
    sb.from("settings").select("value").eq("key", LIVE_CHAT_BOT_KEY).maybeSingle(),
  ]);
  const bc = bcRes.data as { id?: unknown; started_at?: unknown } | null;
  const id = String(bc?.id ?? "").trim();
  if (!id) return null;
  if (!parseLiveChatSetting((chatRes.data as { value?: unknown } | null)?.value).enabled) return null;
  if (!parseLiveChatBotSetting((botRes.data as { value?: unknown } | null)?.value).enabled) return null;
  return { id, startedAt: String(bc?.started_at ?? "") };
}

/** 이 방송 주문인지 — 방송 번호가 같거나, 번호 없이 방송 시작 뒤에 들어온 주문 */
export function isThisBroadcastOrder(row: OrderEventRow, bc: OnBroadcast): boolean {
  const b = row.broadcast_id;
  if (b != null && String(b).trim() !== "") return String(b) === bc.id;
  const at = Date.parse(String(row.created_at ?? ""));
  const st = Date.parse(bc.startedAt);
  return Number.isFinite(at) && Number.isFinite(st) && at >= st;
}

export function isPaidRow(row: OrderEventRow): boolean {
  const st = String(row.admin_order_status_v2 || row.order_manage_status || row.deposit_status || "").trim();
  return /입금확인/.test(st) || st === "카드결제완료";
}

function liveRows(rows: OrderEventRow[]): OrderEventRow[] {
  // [2026-11-13] 자동 테스트 주문은 실제처럼 채팅에도 올림(사장님 「확인용이니 올려야지」) — 사람이 낸 테스트 주문은 예전처럼 뺌
  return rows.filter((r) => (r.is_test_order !== true || isAutoTestRow(r as Record<string, unknown>)) && r.is_deleted !== true);
}

async function postedRefs(sb: SupabaseClient, bc: string, refs: string[]): Promise<Set<string>> {
  if (!refs.length) return new Set();
  const { data } = await sb.from("live_chat_messages").select("bot_ref").eq("broadcast_id", bc).eq("kakao_id", LIVE_CHAT_BOT_KAKAO).in("bot_ref", refs);
  return new Set(((data ?? []) as Array<{ bot_ref?: unknown }>).map((r) => String(r.bot_ref ?? "")));
}

async function insertBot(sb: SupabaseClient, bc: string, body: string, ref: string) {
  if (!body.trim()) return false;
  const { error } = await sb.from("live_chat_messages").insert({ broadcast_id: bc, kakao_id: LIVE_CHAT_BOT_KAKAO, customer_id: null, nickname: LIVE_CHAT_BOT_NICK, body, badge: "bot", bot_ref: ref });
  return !error;
}

/** 주문서 제출 직후 — 「🛒 OO님 상품 외 N종 주문 감사합니다!」(+카드면 결제 링크 안내). 주문서마다 한 번. */
export async function announceOrderThanks(sb: SupabaseClient, groupId: string): Promise<void> {
  try {
    const g = String(groupId ?? "").trim();
    if (!g) return;
    const bc = await liveChatReady(sb);
    if (!bc) return;
    const { data } = await sb.from("orders").select(ORDER_COLS).eq("order_group_id", g).order("id", { ascending: true });
    const rows = liveRows((data ?? []) as OrderEventRow[]);
    if (!rows.length || !isThisBroadcastOrder(rows[0], bc)) return;
    if (!String(rows[0].youtube_nickname ?? "").trim()) return;
    const ref = `o:${g}`, cardRef = `card:${g}`;
    const done = await postedRefs(sb, bc.id, [ref, cardRef]);
    if (!done.has(ref)) await insertBot(sb, bc.id, orderThanksText(rows), ref);
    if (rows.some(isCardOrderRow) && !done.has(cardRef)) await insertBot(sb, bc.id, cardLinkText(rows), cardRef);
  } catch {
    /* 채팅 글 실패는 주문과 무관 */
  }
}

/** 1분마다(방송 중) — 최근 입금확인·카드결제완료된 주문서에 「💗 OO님 결제 완료! 감사합니다」. 주문서마다 한 번. */
export async function announceRecentPaid(sb: SupabaseClient, nowMs = Date.now(), windowMs = 15 * 60 * 1000): Promise<number> {
  try {
    const bc = await liveChatReady(sb);
    if (!bc) return 0;
    const since = new Date(nowMs - windowMs).toISOString();
    const { data } = await sb.from("orders").select(ORDER_COLS).gte("deposit_confirmed_at", since).order("deposit_confirmed_at", { ascending: true }).limit(300);
    const byGroup = new Map<string, OrderEventRow[]>();
    for (const r of liveRows((data ?? []) as OrderEventRow[])) {
      if (!isPaidRow(r) || !isThisBroadcastOrder(r, bc)) continue;
      if (!String(r.youtube_nickname ?? "").trim()) continue;
      const g = String(r.order_group_id ?? r.id ?? "").trim();
      if (!g) continue;
      const list = byGroup.get(g) ?? [];
      list.push(r);
      byGroup.set(g, list);
    }
    if (!byGroup.size) return 0;
    const done = await postedRefs(sb, bc.id, [...byGroup.keys()].map((g) => `paid:${g}`));
    let n = 0;
    for (const [g, rows] of byGroup) {
      const ref = `paid:${g}`;
      if (done.has(ref)) continue;
      if (await insertBot(sb, bc.id, paidThanksText(rows), ref)) n += 1;
    }
    return n;
  } catch {
    return 0;
  }
}
