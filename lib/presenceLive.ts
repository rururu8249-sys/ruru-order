// lib/presenceLive.ts
// [2026-11-09 사장님 「지금 접속 — 누가 뭐 하는지 실시간으로 제대로」] 관리자 「지금 접속」 창 데이터 합치기(순수 계산 · 읽기 전용).
//   접속 줄(visitor_presence) + 회원(customers) + 지금 장바구니(cart_reservations) + 오늘(이번 방송) 주문(orders) 을
//   «카카오 계정(kakao_id)» 으로 먼저 붙이고, 없으면 닉네임 글자로 붙인다(옛 신호·로그인 전).
//   돈·주문 상태를 바꾸는 코드 없음. 결제 판정은 PAID_STATUS_VALUES(관리자 화면과 같은 값) 읽기만.

import { PAID_STATUS_VALUES } from "@/lib/admin-v2/statusDisplay";
import { presenceStatusText, presenceActivityText, normalizePresenceEvents, PRESENCE_ACTIVITY_MAX_AGE_MS } from "@/lib/presenceActivity";

const PAID = new Set(PAID_STATUS_VALUES);
const clean = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export type PresenceRow = Record<string, unknown>;
export type CustomerRow = { kakao_id?: unknown; youtube_nickname?: unknown; customer_name?: unknown; customer_phone?: unknown; is_blocked?: unknown };
export type CartRow = { automation_actor_id?: unknown; kakao_id?: unknown; nickname?: unknown; qty?: unknown; unit_price?: unknown; product_name?: unknown; detail_name?: unknown; expires_at?: unknown };
export type OrderRow = { automation_actor_id?: unknown; order_group_id?: unknown; id?: unknown; kakao_id?: unknown; youtube_nickname?: unknown; admin_order_status_v2?: unknown; order_manage_status?: unknown; final_amount?: unknown; total_price?: unknown; created_at?: unknown; is_deleted?: unknown; is_test_order?: unknown; product_name?: unknown };

export type LiveVisitor = {
  id: string;
  nickname: string;
  name: string;
  kakaoId: string;
  isMember: boolean;
  pageType: string;
  pageLabel: string;
  /** 사람말 한 줄 — 「옵션 고르는 중 · PD-202」 「주문서 확인 중」 「상품 보는 중」 … */
  status: string;
  activity: { kind: string; label: string; at: number } | null;
  /** [2026-11-09] 최근 동작 타임라인(최신이 앞·최대 30개) — 「18:02 옵션 고르는 중 · PD-202」 … */
  timeline: Array<{ kind: string; label: string; at: number; text: string }>;
  lastSeenAt: string;
  cart: { count: number; qty: number; amount: number; unknownPrice: boolean; items: Array<{ name: string; qty: number }> };
  orders: { count: number; paid: number; unpaid: number; amount: number; items: Array<{ name: string; status: "paid" | "unpaid" | "canceled"; amount: number; at: string }> };
};

export function pageLabel(pageType: string) {
  if (pageType === "order_form") return "주문서 작성중";
  if (pageType === "order_lookup") return "주문조회";
  if (pageType === "group_buy") return "공구상품";
  if (pageType === "admin") return "관리자";
  return "사이트 접속";
}

function isPaid(o: OrderRow) { return PAID.has(clean(o.admin_order_status_v2)) || PAID.has(clean(o.order_manage_status)); }
function isCanceled(o: OrderRow) { return clean(o.admin_order_status_v2).includes("취소") || clean(o.order_manage_status).includes("취소"); }
const nickKey = (v: unknown) => clean(v).toLowerCase();

/** [2026-11-09 ③ 사장님 「관리자 개인계정이 굳이 노출될 필요가」] 관리자 화면 줄 + 접속 기록 「제외 계정」(카카오 계정·닉네임)의 줄을 뺀다(목록·숫자 둘 다). 순수. */
export function excludePresenceRows(rows: PresenceRow[], ex: { kakaoIds?: Iterable<string>; names?: Iterable<string> }): PresenceRow[] {
  const kakao = new Set(Array.from(ex.kakaoIds || []).map(clean).filter(Boolean));
  const names = new Set(Array.from(ex.names || []).map(clean).filter(Boolean));
  return rows.filter((r) => {
    if (clean(r.page_type) === "admin") return false;
    // actor ID is joined from the server-verified active session projection, never client input.
    if (clean(r.automation_actor_id) && clean(r.visitor_key).startsWith("live-auto:")) return true;
    if (kakao.size && kakao.has(clean(r.kakao_id))) return false;
    if (names.size && names.has(clean(r.nickname))) return false;
    return true;
  });
}

export function buildLiveVisitors(args: {
  rows: PresenceRow[];
  customers: CustomerRow[];
  carts: CartRow[];
  orders: OrderRow[];
  now?: number;
}): LiveVisitor[] {
  const now = args.now ?? Date.now();

  const custByKakao = new Map<string, CustomerRow>();
  const custByNick = new Map<string, CustomerRow>();
  for (const c of args.customers) {
    const k = clean(c.kakao_id); if (k && !custByKakao.has(k)) custByKakao.set(k, c);
    const n = nickKey(c.youtube_nickname); if (n && !custByNick.has(n)) custByNick.set(n, c);
  }

  const cartByKakao = new Map<string, CartRow[]>();
  const cartByNick = new Map<string, CartRow[]>();
  for (const r of args.carts) {
    if (r.expires_at && Date.parse(clean(r.expires_at)) <= now) continue;
    const k = clean(r.kakao_id); if (k) cartByKakao.set(k, [...(cartByKakao.get(k) || []), r]);
    const n = nickKey(r.nickname); if (n) cartByNick.set(n, [...(cartByNick.get(n) || []), r]);
  }

  // 주문은 주문서(order_group_id) 단위로 묶어 1건 — 첫 줄 상태 기준(liveSummary 와 같은 규칙)
  type Group = { key: string; kakao: string; nick: string; actor: string; rows: OrderRow[] };
  const groups = new Map<string, Group>();
  for (const o of args.orders) {
    if (o.is_deleted === true || (o.is_test_order === true && !o.automation_actor_id)) continue;
    const key = clean(o.order_group_id) || `row:${clean(o.id)}`;
    const g = groups.get(key) || { key, kakao: clean(o.kakao_id), nick: nickKey(o.youtube_nickname), actor: clean(o.automation_actor_id), rows: [] };
    g.rows.push(o);
    if (!g.kakao) g.kakao = clean(o.kakao_id);
    if (!g.nick) g.nick = nickKey(o.youtube_nickname);
    groups.set(key, g);
  }
  const ordByKakao = new Map<string, Group[]>();
  const ordByNick = new Map<string, Group[]>();
  for (const g of groups.values()) {
    if (!g.actor && g.kakao) ordByKakao.set(g.kakao, [...(ordByKakao.get(g.kakao) || []), g]);
    if (!g.actor && g.nick) ordByNick.set(g.nick, [...(ordByNick.get(g.nick) || []), g]);
  }

  return args.rows.map((row) => {
    const pageType = clean(row.page_type) || "page";
    const kakaoId = clean(row.kakao_id);
    const actorId = clean(row.automation_actor_id);
    const nick0 = clean(row.nickname);
    const cust = actorId ? null : (kakaoId && custByKakao.get(kakaoId)) || (nick0 && custByNick.get(nickKey(nick0))) || null;
    const nickname = nick0 || clean(cust?.youtube_nickname);
    const activityKind = clean(row.activity);
    const activityAt = row.activity_at ? Date.parse(clean(row.activity_at)) : 0;
    const activity = activityKind ? { kind: activityKind, label: clean(row.activity_label), at: Number.isFinite(activityAt) ? activityAt : 0 } : null;
    const liveActivity = activity && activity.at && now - activity.at <= PRESENCE_ACTIVITY_MAX_AGE_MS ? activity : null;
    const timeline = normalizePresenceEvents(row.activity_log, now).reverse().map((e) => ({ kind: e.k, label: e.l, at: e.at, text: presenceActivityText(e.k, e.l) }));

    const cartRows = actorId ? args.carts.filter(r=>clean(r.automation_actor_id)===actorId&&(!r.expires_at||Date.parse(clean(r.expires_at))>now)) : ((kakaoId && cartByKakao.get(kakaoId)) || (nickname && cartByNick.get(nickKey(nickname))) || []).filter(r=>!r.automation_actor_id);
    let cartQty = 0, cartAmount = 0, unknownPrice = false;
    const cartItems: Array<{ name: string; qty: number }> = [];
    for (const r of cartRows) {
      const q = num(r.qty);
      cartQty += q;
      const p = r.unit_price === null || r.unit_price === undefined || clean(r.unit_price) === "" ? null : num(r.unit_price);
      if (p === null) unknownPrice = true; else cartAmount += p * q;
      if (cartItems.length < 6) cartItems.push({ name: clean(r.detail_name) || clean(r.product_name) || "상품", qty: q });
    }

    const ordGroups = actorId ? Array.from(groups.values()).filter(g=>g.actor===actorId) : (kakaoId && ordByKakao.get(kakaoId)) || (nickname && ordByNick.get(nickKey(nickname))) || [];
    let paid = 0, unpaid = 0, amount = 0;
    const orderItems: LiveVisitor["orders"]["items"] = [];
    for (const g of ordGroups) {
      const first = g.rows[0];
      const canceled = isCanceled(first);
      const p = !canceled && isPaid(first);
      const sum = g.rows.reduce((acc, r) => acc + num(r.final_amount ?? r.total_price), 0);
      if (!canceled) { if (p) paid += 1; else unpaid += 1; amount += sum; }
      if (orderItems.length < 6) {
        const names = g.rows.map((r) => clean(r.product_name)).filter(Boolean);
        orderItems.push({ name: names.length ? (names.length > 1 ? `${names[0]} 외 ${names.length - 1}개` : names[0]) : "주문", status: canceled ? "canceled" : p ? "paid" : "unpaid", amount: sum, at: clean(first.created_at) });
      }
    }

    return {
      id: String(row.id ?? row.visitor_key ?? ""),
      nickname: nickname || "",
      name: clean(cust?.customer_name),
      kakaoId,
      isMember: Boolean(kakaoId || cust),
      pageType,
      pageLabel: pageLabel(pageType),
      status: presenceStatusText({ pageType, pageLabel: pageLabel(pageType), activity: liveActivity, now }),
      activity: liveActivity,
      timeline,
      lastSeenAt: clean(row.last_seen_at),
      cart: { count: cartRows.length, qty: cartQty, amount: cartAmount, unknownPrice, items: cartItems },
      orders: { count: ordGroups.filter((g) => !isCanceled(g.rows[0])).length, paid, unpaid, amount, items: orderItems },
    };
  });
}

export type LiveSummary = { total: number; orderForm: number; withCart: number; ordered: number; guests: number };
export function summarizeLiveVisitors(list: LiveVisitor[], total: number): LiveSummary {
  const nonAdmin = list.filter((v) => v.pageType !== "admin");
  return {
    total,
    orderForm: nonAdmin.filter((v) => v.pageType === "order_form").length,
    withCart: nonAdmin.filter((v) => v.cart.count > 0).length,
    ordered: nonAdmin.filter((v) => v.orders.count > 0).length,
    guests: nonAdmin.filter((v) => !v.isMember && !v.nickname).length,
  };
}

export type LiveChip = "all" | "form" | "cart" | "ordered" | "guest";

/** 드로어 칩 필터(순수) */
export function filterLiveVisitors(list: LiveVisitor[], chip: LiveChip, q: string): LiveVisitor[] {
  const needle = q.trim().toLowerCase();
  return list.filter((v) => {
    if (chip === "form" && v.pageType !== "order_form") return false;
    if (chip === "cart" && v.cart.count === 0) return false;
    if (chip === "ordered" && v.orders.count === 0) return false;
    if (chip === "guest" && (v.isMember || v.nickname)) return false;
    if (needle && !`${v.nickname} ${v.name}`.toLowerCase().includes(needle)) return false;
    return true;
  });
}

/** 줄 정렬: 관리자 맨 아래, 그 외는 마지막 신호 최신순(서버 순서) */
export function sortLiveVisitors(list: LiveVisitor[]): LiveVisitor[] {
  return [...list].sort((a, b) => Number(a.pageType === "admin") - Number(b.pageType === "admin"));
}

