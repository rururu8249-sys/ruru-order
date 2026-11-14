// lib/autoTestOrphanPayment.ts
// [2026-11-15 08:42 사장님] 테스트 주문서를 지워도, 그 주문의 «주문 감사» 알림이 이미 채팅에 떴으면
//   예정돼 있던 결제 알림(💗 OO님 카드결제완료/입금완료 감사합니다)은 원래 시각에 채팅에 나가야 함.
//   원래 경로(DB live_automation_drain_payments)는 «주문서가 남아 있고 자동 실행이 켜져 있을 때»만 보내서,
//   삭제(= 먼저 자동 실행 중지)하면 알림이 취소(cancelled)됐음.
//   → 지우기 «직전»에 그 주문들의 대기·취소된 결제 알림을 settings 한 칸 대기열에 옮겨 두고,
//     예정 시각이 지났으면 바로, 아니면 1분 기록기(cron live-metrics)가 시각 맞춰 보냄.
//   채팅 글만 씀 — 주문·입금·정산·포인트 무접촉. 방송이 켜져 있을 때만, 6시간 넘은 건 버림, 같은 알림 두 번 안 감(bot_ref ap:).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type Row = Record<string, unknown>;

export const ORPHAN_PAYMENT_KEY = "autotest_orphan_payments_v1";
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export type OrphanPayment = { bc: string; ref: string; body: string; due: number; kind: "card" | "bank"; at: number };

export function orphanPaymentBody(nickname: string, kind: string): string {
  return `💗 ${nickname}${kind === "card" ? "님 카드결제완료 감사합니다" : "님 입금완료 감사합니다"}`;
}

/** 농협 점검(매일 23:55~00:15, 셋째 주 월요일 00~04시)엔 입금 알림 안 보냄 — DB 쪽과 같은 규칙 */
export function bankClosedAt(ms: number): boolean {
  const k = new Date(ms + 9 * 3600 * 1000);
  const hm = k.getUTCHours() * 60 + k.getUTCMinutes();
  const dow = k.getUTCDay(), day = k.getUTCDate();
  return hm >= 23 * 60 + 55 || hm < 15 || (dow === 1 && day >= 15 && day <= 21 && hm < 240);
}

export function parseOrphanQueue(raw: string): OrphanPayment[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.bc === "string" && typeof x.ref === "string" && typeof x.body === "string" && Number.isFinite(x.due)) : [];
  } catch {
    return [];
  }
}

async function readRaw(db: Db): Promise<{ exists: boolean; raw: string }> {
  const { data } = await db.from("settings").select("value").eq("key", ORPHAN_PAYMENT_KEY).limit(1).maybeSingle();
  return data ? { exists: true, raw: String(data.value ?? "") } : { exists: false, raw: "" };
}
async function swap(db: Db, exists: boolean, oldRaw: string, newRaw: string): Promise<boolean> {
  if (!exists) return !(await db.from("settings").insert({ key: ORPHAN_PAYMENT_KEY, value: newRaw })).error;
  const { data, error } = await db.from("settings").update({ value: newRaw }).eq("key", ORPHAN_PAYMENT_KEY).eq("value", oldRaw).select("key");
  return !error && Array.isArray(data) && data.length > 0;
}

/**
 * 지우려는 테스트 주문 줄(orders: id, order_group_id, broadcast_id, automation_action_id)을 받아
 * 결제 알림 대기열에 옮김. 반드시 orders 를 지우기 «전»에 부를 것. 실패해도 throw 안 함(삭제는 그대로).
 */
export async function keepPaymentNoticesForDeleted(db: Db, rows: Row[], now = Date.now()): Promise<number> {
  try {
    const byAction = new Map<string, Row>();
    for (const r of rows) if (r.automation_action_id) byAction.set(String(r.automation_action_id), r);
    if (!byAction.size) return 0;
    const { data: evs, error } = await db.from("live_automation_payment_events")
      .select("order_action_id, nickname, kind, due_at, status, created_at")
      .in("order_action_id", [...byAction.keys()]).in("status", ["pending", "cancelled"]);
    if (error || !evs?.length) return 0;
    const add: OrphanPayment[] = [];
    for (const e of evs as Row[]) {
      const row = byAction.get(String(e.order_action_id));
      const bc = String(row?.broadcast_id ?? "");
      const group = String(row?.order_group_id ?? "");
      const created = Date.parse(String(e.created_at ?? ""));
      if (!bc || !group || !(now - created < MAX_AGE_MS)) continue;
      // 그 주문서의 «주문 감사» 알림이 채팅에 떠 있었던 것만
      const { data: notice } = await db.from("live_chat_messages").select("id").eq("broadcast_id", bc).eq("bot_ref", `o:${group}`).is("hidden_at", null).limit(1);
      if (!notice?.length) continue;
      const kind = String(e.kind) === "card" ? "card" : "bank";
      add.push({ bc, ref: `ap:${e.order_action_id}`, body: orphanPaymentBody(String(e.nickname ?? ""), kind), due: Date.parse(String(e.due_at ?? "")) || now, kind, at: now });
    }
    if (!add.length) return 0;
    for (let i = 0; i < 5; i += 1) {
      const { exists, raw } = await readRaw(db);
      const list = parseOrphanQueue(raw);
      const refs = new Set(list.map((x) => x.ref));
      const next = JSON.stringify([...list, ...add.filter((x) => !refs.has(x.ref))].slice(-200));
      if (await swap(db, exists, raw, next)) break;
    }
    await drainOrphanPayments(db, now);
    return add.length;
  } catch {
    return 0;
  }
}

/** 예정 시각이 된 알림을 채팅에 올림(1분 기록기·삭제 직후). 올린 수 */
export async function drainOrphanPayments(db: Db, now = Date.now()): Promise<number> {
  let posted = 0;
  try {
    for (let i = 0; i < 5; i += 1) {
      const { exists, raw } = await readRaw(db);
      if (!exists) return posted;
      const list = parseOrphanQueue(raw);
      if (!list.length) return posted;
      const keep: OrphanPayment[] = [];
      const send: OrphanPayment[] = [];
      for (const x of list) {
        if (now - x.at > MAX_AGE_MS) continue; // 너무 오래된 건 버림
        if (x.due > now || (x.kind === "bank" && bankClosedAt(now))) keep.push(x);
        else send.push(x);
      }
      if (!send.length && keep.length === list.length) return posted;
      // 먼저 대기열에서 빼고(두 사람이 같이 돌려도 한 번만) 그다음 올림
      if (!(await swap(db, true, raw, JSON.stringify(keep)))) continue;
      for (const x of send) {
        const { data: bc } = await db.from("broadcasts").select("status, is_deleted").eq("id", x.bc).maybeSingle();
        if (!bc || bc.status !== "ON" || bc.is_deleted === true) continue;
        const { data: dup } = await db.from("live_chat_messages").select("id").eq("broadcast_id", x.bc).eq("bot_ref", x.ref).limit(1);
        if (dup?.length) continue;
        const { error } = await db.from("live_chat_messages").insert({ broadcast_id: x.bc, kakao_id: "bot:ruru", nickname: "루루동이", body: x.body, badge: "bot", bot_ref: x.ref });
        if (!error) posted += 1;
      }
      return posted;
    }
  } catch {
    /* 채팅 알림만 — 실패해도 다른 일 안 막음 */
  }
  return posted;
}
