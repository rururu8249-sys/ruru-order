// lib/assistantSearchServer.ts
// [2026-10-22 AI 비서 8단계] 손님·상품 찾기 서버 함수 — app/api/admin-live/assistant/route.ts 에서 «그대로 옮김»(로직 무변경).
//   물어보기 라우트와 새 대화창 라우트가 같이 쓴다. 읽기 전용(SELECT 만). 돈·주문상태·포인트·Bankda 무접촉.
import type { SupabaseClient } from "@supabase/supabase-js";
import { bestMatch, maskPhone, matchText, MATCH_KIND_LABEL, MATCH_KIND_RANK, type MatchKind } from "@/lib/assistantSearch";
import { buildAdminLiveOrderGroups, toAdminLiveOrder } from "@/components/admin-live/liveOrderAdapter";
import { paymentStatusLabel } from "@/lib/orderLabels";
import type { OrderRow } from "@/lib/admin-v2/types";

const digitsOnly = (v: unknown) => String(v ?? "").replace(/\D/g, "");
// customers.is_blocked 는 글자 칸(「N」「true」「false」) — 「N」·「false」는 차단 아님
export const isBlockedValue = (v: unknown) => ["true", "t", "y", "1"].includes(String(v ?? "").trim().toLowerCase());

// ───────────────────────── AI 해석 ─────────────────────────
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, max = 20000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "조회 실패");
    const rows = data || [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

type LightOrder = {
  id: number;
  created_at: string | null;
  youtube_nickname: string | null;
  customer_name: string | null;
  recipient_name: string | null;
  customer_phone: string | null;
  kakao_id: string | null;
  order_group_id: string | null;
  order_lookup_code: string | null;
  product_name: string | null;
  color: string | null;
  size: string | null;
  qty: number | null;
};
const LIGHT_ORDER_COLUMNS =
  "id, created_at, youtube_nickname, customer_name, recipient_name, customer_phone, kakao_id, order_group_id, order_lookup_code, product_name, color, size, qty";

// [10/22] 화면 기간(드롭다운·달력) → 손님·상품 찾기 시작 시각(resolvePeriod 와 같은 한국 날짜 계산). 옛 값 "3m" 도 받음
async function fetchLightOrders(supabase: SupabaseClient, sinceIso: string | null): Promise<LightOrder[]> {
  return fetchAll<LightOrder>((from, to) => {
    let q = supabase.from("orders").select(LIGHT_ORDER_COLUMNS).neq("is_deleted", true).order("id", { ascending: false }).range(from, to);
    if (sinceIso) q = q.gte("created_at", sinceIso);
    return q as unknown as PromiseLike<{ data: LightOrder[] | null; error: unknown }>;
  });
}

const groupKeyOf = (o: { order_group_id?: string | null; order_lookup_code?: string | null; id?: number | string | null }) =>
  String(o.order_group_id || o.order_lookup_code || o.id || "");

/** 주문 그룹 id 들 → 관리자 주문표와 같은 판정(liveOrderAdapter)으로 상태·금액·요약 */
async function loadOrderCards(supabase: SupabaseClient, rowIds: number[]) {
  if (rowIds.length === 0) return new Map<string, OrderCard>();
  const rows: OrderRow[] = [];
  for (let i = 0; i < rowIds.length; i += 200) {
    const { data, error } = await supabase.from("orders").select("*").in("id", rowIds.slice(i, i + 200));
    if (error) throw new Error(error.message);
    rows.push(...((data as OrderRow[]) || []));
  }
  const map = new Map<string, OrderCard>();
  for (const g of buildAdminLiveOrderGroups(rows)) {
    const o = toAdminLiveOrder(g);
    map.set(g.groupId, {
      orderNo: o.orderNo,
      createdAt: o.createdAt || null,
      summary: o.orderSummary,
      amount: Number(o.finalAmount ?? o.totalAmount ?? 0) || 0,
      paymentLabel: paymentStatusLabel(o.paymentStatus),
      paymentCode: o.paymentStatus,
      shippingLabel: o.shippingStatus === "출고완료" ? "택배출고" : o.shippingStatus || "",
      paymentMethod: String(o.paymentMethod || "").includes("카드") ? "카드" : "무통장",
      nickname: o.nickname,
    });
  }
  return map;
}

type OrderCard = {
  orderNo: string;
  createdAt: string | null;
  summary: string;
  amount: number;
  paymentLabel: string;
  paymentCode: string;
  shippingLabel: string;
  paymentMethod: string;
  nickname: string;
};

// ───────────────────────── 손님 찾기 ─────────────────────────
type CustomerRow = {
  id: string;
  youtube_nickname: string | null;
  customer_name: string | null;
  kakao_nickname: string | null;
  customer_phone: string | null;
  kakao_id: string | null;
  last_order_at: string | null;
  previous_nicknames: unknown;
  is_blocked: boolean | string | null;
};

type Person = {
  key: string;
  nickname: string;
  name: string;
  phone: string;
  blocked: boolean;
  kind: MatchKind;
  matchedLabel: string;
  matchedValue: string;
  lastOrderAt: string | null;
  groupIds: string[]; // 최근 순
  rowIdsByGroup: Map<string, number[]>;
};

function personKey(kakaoId: unknown, phone: unknown): string {
  const k = String(kakaoId ?? "").trim();
  if (k) return `k:${k}`;
  const p = digitsOnly(phone);
  return p ? `p:${p}` : "";
}

function asTextList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x ?? "")).filter(Boolean);
  if (typeof v === "string" && v.trim()) {
    try { const parsed = JSON.parse(v); if (Array.isArray(parsed)) return parsed.map(String); } catch { /* 글자 그대로 */ }
    return v.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export async function searchCustomers(supabase: SupabaseClient, query: string, sinceIso: string | null) {
  const [customers, orders] = await Promise.all([
    fetchAll<CustomerRow>((from, to) =>
      supabase
        .from("customers")
        .select("id, youtube_nickname, customer_name, kakao_nickname, customer_phone, kakao_id, last_order_at, previous_nicknames, is_blocked")
        .order("created_at", { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: CustomerRow[] | null; error: unknown }>,
    ),
    fetchLightOrders(supabase, sinceIso),
  ]);

  const people = new Map<string, Person>();
  const better = (a: MatchKind, b: MatchKind) => MATCH_KIND_RANK[a] < MATCH_KIND_RANK[b];

  // 회원 기준
  const customerByKey = new Map<string, CustomerRow>();
  // 한 사람을 카카오 id 로도, 전화번호로도 찾을 수 있게(카카오 id 없는 옛 주문은 전화번호만 있음)
  const aliasToKey = new Map<string, string>();
  for (const c of customers) {
    const key = personKey(c.kakao_id, c.customer_phone);
    if (!key) continue;
    const phoneKey = digitsOnly(c.customer_phone) ? `p:${digitsOnly(c.customer_phone)}` : "";
    if (!aliasToKey.has(key)) aliasToKey.set(key, key);
    if (phoneKey && !aliasToKey.has(phoneKey)) aliasToKey.set(phoneKey, key);
  }
  const canonicalKey = (kakaoId: unknown, phone: unknown) => {
    const k = String(kakaoId ?? "").trim();
    const p = digitsOnly(phone);
    return (k && aliasToKey.get(`k:${k}`)) || (p && aliasToKey.get(`p:${p}`)) || personKey(kakaoId, phone);
  };
  for (const c of customers) {
    const key = personKey(c.kakao_id, c.customer_phone);
    if (!key) continue;
    customerByKey.set(key, c);
    const m = bestMatch(query, [
      { label: "닉네임", value: c.youtube_nickname },
      { label: "이름", value: c.customer_name },
      { label: "카카오 이름", value: c.kakao_nickname },
      ...asTextList(c.previous_nicknames).map((v) => ({ label: "예전 닉네임", value: v })),
    ]);
    if (!m) continue;
    const prev = people.get(key);
    if (prev && !better(m.kind, prev.kind)) continue;
    people.set(key, {
      key,
      nickname: c.youtube_nickname || c.kakao_nickname || "-",
      name: c.customer_name || "",
      phone: maskPhone(c.customer_phone),
      blocked: isBlockedValue(c.is_blocked),
      kind: m.kind,
      matchedLabel: m.label,
      matchedValue: m.value,
      lastOrderAt: null, // customers.last_order_at 은 주문이 없어도 찍혀 있는 손님이 있어(10/22 실측) 쓰지 않고 실제 주문으로만
      groupIds: prev?.groupIds || [],
      rowIdsByGroup: prev?.rowIdsByGroup || new Map(),
    });
  }

  // 주문 기준(주문서에 적은 닉네임·이름·받는 분은 회원 정보와 다를 수 있다)
  const ordersByPerson = new Map<string, LightOrder[]>();
  for (const o of orders) {
    const key = canonicalKey(o.kakao_id, o.customer_phone);
    if (!key) continue;
    if (!ordersByPerson.has(key)) ordersByPerson.set(key, []);
    ordersByPerson.get(key)!.push(o);
    const m = bestMatch(query, [
      { label: "주문 닉네임", value: o.youtube_nickname },
      { label: "주문자 이름", value: o.customer_name },
      { label: "받는 분", value: o.recipient_name },
    ]);
    if (!m) continue;
    const prev = people.get(key);
    if (prev && !better(m.kind, prev.kind)) continue;
    const c = customerByKey.get(key);
    people.set(key, {
      key,
      nickname: c?.youtube_nickname || o.youtube_nickname || "-",
      name: c?.customer_name || o.customer_name || "",
      phone: maskPhone(c?.customer_phone || o.customer_phone),
      blocked: isBlockedValue(c?.is_blocked),
      kind: m.kind,
      matchedLabel: m.label,
      matchedValue: m.value,
      lastOrderAt: null,
      groupIds: [],
      rowIdsByGroup: new Map(),
    });
  }

  // 각 손님의 기간 안 주문 묶기(주문 시각 최근 순)
  for (const p of people.values()) {
    const list = [...(ordersByPerson.get(p.key) || [])].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    const ids: string[] = [];
    const rows = new Map<string, number[]>();
    for (const o of list) {
      const g = groupKeyOf(o);
      if (!g) continue;
      if (!rows.has(g)) { rows.set(g, []); ids.push(g); }
      rows.get(g)!.push(Number(o.id));
    }
    p.groupIds = ids;
    p.rowIdsByGroup = rows;
    const latest = list[0]?.created_at || null;
    p.lastOrderAt = latest;
  }

  const sorted = [...people.values()].sort((a, b) => {
    const r = MATCH_KIND_RANK[a.kind] - MATCH_KIND_RANK[b.kind];
    if (r !== 0) return r;
    return String(b.lastOrderAt || "").localeCompare(String(a.lastOrderAt || ""));
  });
  const total = sorted.length;
  const top = sorted.slice(0, 20);

  // 위 10명만 최근 주문 5건씩 상세(상태·금액) — 관리자 주문표와 같은 판정
  const wantRowIds: number[] = [];
  top.slice(0, 10).forEach((p) => p.groupIds.slice(0, 5).forEach((g) => wantRowIds.push(...(p.rowIdsByGroup.get(g) || []))));
  const cards = await loadOrderCards(supabase, wantRowIds);

  return {
    total,
    people: top.map((p, i) => ({
      key: p.key,
      nickname: p.nickname,
      name: p.name,
      phone: p.phone,
      blocked: p.blocked,
      match: MATCH_KIND_LABEL[p.kind],
      matchKind: p.kind,
      matchedLabel: p.matchedLabel,
      matchedValue: p.matchedValue,
      lastOrderAt: p.lastOrderAt,
      orderCount: p.groupIds.length,
      orders: i < 10 ? p.groupIds.slice(0, 5).map((g) => cards.get(g)).filter(Boolean) : [],
    })),
  };
}

// ───────────────────────── 상품 찾기 ─────────────────────────
type ProductRow = {
  id: number;
  product_name: string | null;
  color_options: unknown;
  price: number | null;
  created_at: string | null;
  status: string | null;
  main_image_url: string | null;
  image_url: string | null;
  external_image_url: string | null;
};

export async function searchProducts(supabase: SupabaseClient, query: string, sinceIso: string | null) {
  const [products, orders] = await Promise.all([
    fetchAll<ProductRow>((from, to) =>
      supabase
        .from("products")
        .select("id, product_name, color_options, price, created_at, status, main_image_url, image_url, external_image_url")
        .order("created_at", { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: ProductRow[] | null; error: unknown }>,
    ),
    fetchLightOrders(supabase, sinceIso),
  ]);

  const found: { id: number; name: string; detail: string; price: number; photo: string; createdAt: string | null; hidden: boolean; kind: MatchKind }[] = [];
  for (const p of products) {
    const name = String(p.product_name || "");
    const nameKind = matchText(query, name);
    // products 는 «브랜드 단위» 행이라 개별 상품 이름(color_options)도 본다
    let detail = "";
    let detailKind: MatchKind | null = null;
    for (const label of asTextList(p.color_options)) {
      const k = matchText(query, label);
      if (k && (!detailKind || MATCH_KIND_RANK[k] < MATCH_KIND_RANK[detailKind])) { detailKind = k; detail = label; }
    }
    const kind = nameKind && (!detailKind || MATCH_KIND_RANK[nameKind] <= MATCH_KIND_RANK[detailKind]) ? nameKind : detailKind;
    if (!kind) continue;
    found.push({
      id: p.id,
      name,
      detail: kind === nameKind ? "" : detail,
      price: Number(p.price) || 0,
      photo: p.main_image_url || p.image_url || p.external_image_url || "",
      createdAt: p.created_at,
      hidden: String(p.status || "") === "숨김",
      kind,
    });
  }
  found.sort((a, b) => MATCH_KIND_RANK[a.kind] - MATCH_KIND_RANK[b.kind] || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  // 이 상품을 산 손님(주문 줄의 상품명 기준 — 오타 판정은 빼고 일치·일부 일치만, 엉뚱한 상품 섞임 방지)
  const byTime = [...orders].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  let buyerRows = byTime.filter((o) => {
    const k = matchText(query, o.product_name);
    return k === "exact" || k === "partial";
  });
  // 「프라다 가방」처럼 단어가 다 맞는 주문이 없으면 단어 일부(「프라다」)로
  if (buyerRows.length === 0) buyerRows = byTime.filter((o) => matchText(query, o.product_name) === "word");
  const buyerGroups: string[] = [];
  const rowsByGroup = new Map<string, LightOrder[]>();
  for (const o of buyerRows) {
    const g = groupKeyOf(o);
    if (!g) continue;
    if (!rowsByGroup.has(g)) { rowsByGroup.set(g, []); buyerGroups.push(g); }
    rowsByGroup.get(g)!.push(o);
  }
  const topGroups = buyerGroups.slice(0, 60);
  const cards = await loadOrderCards(supabase, topGroups.flatMap((g) => (rowsByGroup.get(g) || []).map((o) => Number(o.id))));
  const buyers = topGroups.flatMap((g) => {
    const card = cards.get(g);
    return (rowsByGroup.get(g) || []).map((o) => ({
      orderNo: card?.orderNo || String(o.order_lookup_code || o.id),
      createdAt: o.created_at,
      nickname: o.youtube_nickname || o.customer_name || "-",
      name: o.customer_name || "",
      productName: o.product_name || "",
      option: [o.color, o.size].map((v) => String(v || "").trim()).filter((v) => v && v !== "없음").join(" / "),
      qty: Number(o.qty) || 0,
      paymentLabel: card?.paymentLabel || "",
      paymentCode: card?.paymentCode || "",
      shippingLabel: card?.shippingLabel || "",
    }));
  });
  const buyerQty = buyerRows.reduce((s, o) => s + (Number(o.qty) || 0), 0);

  return {
    total: found.length,
    products: found.slice(0, 15).map(({ kind, ...rest }) => ({ ...rest, match: MATCH_KIND_LABEL[kind], matchKind: kind })),
    buyerOrderCount: buyerGroups.length,
    buyerQty,
    buyers: buyers.slice(0, 80),
    buyersTruncated: buyerGroups.length > topGroups.length,
  };
}

// ───────────────────────── 요청 처리 ─────────────────────────
