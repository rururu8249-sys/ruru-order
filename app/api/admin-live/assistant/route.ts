// [2026-10-22 AI 비서 1단계] 손님·주문·상품 찾기 — 읽기 전용(SELECT 만). 돈·주문상태·포인트·Bankda 무접촉.
//   흐름: 사장님 입력 → (Gemini 무료) 무엇을 찾는지 JSON 으로만 해석 → 서버가 DB 를 직접 찾음 → 화면에 표로.
//   ⚠ Gemini 에는 «사장님이 입력한 글자»만 보낸다. 손님 이름·전화·주소·주문 내용은 AI 로 절대 보내지 않는다.
//   키가 없거나 AI 가 실패하면 lib/assistantSearch.parseIntentByRule 로 해석(검색은 그대로 됨).
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { callGeminiJson } from "@/lib/geminiJson";
import {
  bestMatch,
  maskPhone,
  matchText,
  MATCH_KIND_LABEL,
  MATCH_KIND_RANK,
  parseIntentByRule,
  parseIntentJson,
  trimNameParticle,
  type AssistantIntent,
  type MatchKind,
} from "@/lib/assistantSearch";
import { buildAdminLiveOrderGroups, toAdminLiveOrder } from "@/components/admin-live/liveOrderAdapter";
import { paymentStatusLabel } from "@/lib/orderLabels";
import type { OrderRow } from "@/lib/admin-v2/types";
import { loadSalesAnalysisSnapshot } from "@/lib/salesAnalysisLoader";
import { computeSalesAnswer, resolvePeriod } from "@/lib/salesQuestion";
import { PERIOD_KEYS, type PeriodKey } from "@/lib/statQuestionParse";
import { buildSalesDataPack, chatPrompt, looksLikeChatQuestion, parseChatJson, type ChatTurn } from "@/lib/assistantChat";
import { salesProductPhotos } from "@/lib/salesHistory";

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    "";
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase 관리자 환경변수가 설정되지 않았습니다.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

const digitsOnly = (v: unknown) => String(v ?? "").replace(/\D/g, "");
// customers.is_blocked 는 글자 칸(「N」「true」「false」) — 「N」·「false」는 차단 아님
const isBlockedValue = (v: unknown) => ["true", "t", "y", "1"].includes(String(v ?? "").trim().toLowerCase());

// ───────────────────────── AI 해석 ─────────────────────────
const INTENT_PROMPT = `너는 쇼핑몰 관리자의 검색 요청을 해석한다. 사장님 문장에서 무엇을 찾는지만 JSON 으로 답한다.
- 손님/주문자/닉네임/이름을 찾는 말이면 {"intent":"customer","name":"<손님 이름이나 닉네임 그대로>","product":""}
- 상품/물건/챙기기/옵션/누가 무슨 상품을 샀는지 묻는 말이면 {"intent":"product","name":"","product":"<상품 이름 그대로>"}
- 숫자(매출·순위)를 묻는 말이면 {"intent":"stats","name":"","product":"","stat":"<top_products|top_buyers|top_days|bottom_days|summary>","period":"<기간>","date":"<YYYY-MM-DD 또는 빈칸>"}
  · top_products = 뭐가 잘 나갔는지/많이 팔린 상품, top_buyers = 누가 많이 샀는지, top_days = 어느 날(날짜·방송)에 제일 많이 팔렸는지/매출 많이 나온 날, bottom_days = 매출 제일 적었던 날/안 팔린 날, summary = 매출·주문 수·미입금(순위 아님)
  · 기간: today(오늘) yesterday(어제) last_7_days(최근 일주일) this_week(이번 주) last_week(지난주) this_month(이번 달) last_month(지난달) last_3_months(최근 3개월) last_broadcast(지난·최근·어제 방송) date(특정 날짜, date 칸에 날짜) all(전체·지금까지). 기간 말이 없거나 「이 기간」처럼 가리키기만 하면 period 는 빈칸 "".
  · 오늘 날짜(한국): {{TODAY}}
- 그 외 판매·매출·방송·손님 흐름을 «비교·분석·이유·추천·요약»해 달라는 말(예: 주말이 평일보다 잘 팔려?, 왜 줄었어?, 다음 방송 뭐 팔까?, 이번 달 정리해 줘)이면 {"intent":"chat","name":"","product":""} — 손님 한 명을 찾는 게 아니면 customer 로 보내지 말 것
- 모르겠으면 {"intent":"unknown","name":"","product":""}
이름·상품명은 사장님이 쓴 글자를 고치지 말고 그대로 옮긴다(오타도 그대로). 단 이름 뒤 조사·호칭(이라는, 님, 씨, 이/가/은/는)과 날짜·「챙길」 같은 말은 뺀다. 설명 없이 JSON 하나만.
사장님 문장: `;

function todayKstText(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// AI 가 안 될 때 이유(화면 디버그용·비밀값 없음): no_key / http_400 / empty / bad_json / timeout …
let lastAiNote = "";

async function askGemini(text: string): Promise<AssistantIntent | null> {
  // 모델 고르기·생각 토큰·붐빔 처리는 lib/geminiJson 한 곳(메모함과 같이 씀)
  const { text: out, note } = await callGeminiJson(INTENT_PROMPT.replace("{{TODAY}}", todayKstText()) + text);
  lastAiNote = note;
  if (!out) return null;
  const parsed = parseIntentJson(out);
  if (!parsed) { lastAiNote = `${note}:bad_json`; return null; }
  return parsed;
}

// ───────────────────────── DB 읽기 ─────────────────────────
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, max = 20000): Promise<T[]> {
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
function pickRangeKey(raw: unknown): PeriodKey {
  if (raw === "3m") return "last_3_months";
  return PERIOD_KEYS.includes(raw as PeriodKey) && raw !== "date" && raw !== "last_broadcast" ? (raw as PeriodKey) : "last_3_months";
}

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

async function searchCustomers(supabase: SupabaseClient, query: string, sinceIso: string | null) {
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

async function searchProducts(supabase: SupabaseClient, query: string, sinceIso: string | null) {
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
export async function POST(request: NextRequest) {
  const adminSession = await verifyAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const text = String(body?.text ?? "").trim().slice(0, 200);
  const range = pickRangeKey(body?.range);
  const rangeFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.from ?? "")) ? String(body.from) : undefined;
  const rangeTo = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.to ?? "")) ? String(body.to) : undefined;
  const rangePeriod = resolvePeriod(range, Date.now(), { from: rangeFrom, to: rangeTo });
  const forced = body?.mode === "customer" || body?.mode === "product" ? body.mode : null;
  if (!text) return NextResponse.json({ ok: false, message: "찾을 내용을 입력해 주세요." }, { status: 400 });

  // 1) 무엇을 찾는지 — 화면 칩으로 고른 경우엔 AI 안 부름(무료 한도 아낌)
  let intent: AssistantIntent;
  let via: "ai" | "rule" | "chip" = "rule";
  if (forced) {
    intent = { intent: forced, name: forced === "customer" ? text : "", product: forced === "product" ? text : "" };
    via = "chip";
  } else {
    const ai = await askGemini(text);
    if (ai && ai.intent !== "unknown") { intent = ai; via = "ai"; }
    else if (ai && ai.intent === "unknown" && looksLikeChatQuestion(text)) intent = ai; // [AI-7] AI 가 「찾기 아님」이라 했고 질문 같으면 → 자유 질문(아래)
    else if (ai && ai.intent === "chat") { intent = ai; via = "ai"; }
    else intent = parseIntentByRule(text);
  }
  const history: ChatTurn[] = Array.isArray(body?.history)
    ? (body.history as unknown[]).slice(-6).map((h) => {
        const o = (h ?? {}) as { role?: unknown; text?: unknown };
        return { role: o.role === "assistant" ? "assistant" : "user", text: String(o.text ?? "").slice(0, 1500) } as ChatTurn;
      })
    : [];

  // [AI-7] 자유 질문 — 집계표(손님 이름·전화 없음, 닉네임만)를 AI 에 주고 말로 답한다. 숫자 질문엔 카드와 함께, 모르는 질문엔 이것만.
  async function chatAnswer(supabaseClient: SupabaseClient, periodKeyOverride?: PeriodKey, date?: string): Promise<{ answer: string | null; periodLabel: string; snapshot: Awaited<ReturnType<typeof loadSalesAnalysisSnapshot>>; period: ReturnType<typeof resolvePeriod>; sales: ReturnType<typeof computeSalesAnswer> }> {
    const snapshot = await loadSalesAnalysisSnapshot(supabaseClient, () => true);
    const period = periodKeyOverride
      ? resolvePeriod(periodKeyOverride, Date.now(), { date, broadcasts: snapshot.broadcasts })
      : resolvePeriod(range, Date.now(), { from: rangeFrom, to: rangeTo, broadcasts: snapshot.broadcasts });
    const sales = computeSalesAnswer(snapshot.orders, period, 80, snapshot.broadcasts);
    const pack = buildSalesDataPack(sales, period.label);
    const { text: out, note } = await callGeminiJson(chatPrompt(pack, history, text, Date.now()), { timeoutMs: 15000, maxTokens: 1024 });
    lastAiNote = note;
    return { answer: parseChatJson(out), periodLabel: period.label, snapshot, period, sales };
  }

  if (intent.intent === "unknown" || intent.intent === "chat") {
    if (intent.intent === "chat" || looksLikeChatQuestion(text)) {
      try {
        const r = await chatAnswer(getSupabaseAdminClient());
        if (r.answer) return NextResponse.json({ ok: true, via: "ai", ai: lastAiNote, intent, kind: "chat", answer: r.answer, periodLabel: r.periodLabel });
      } catch (error) {
        console.error("[assistant] chat", error);
      }
    }
    // 자유 질문도 안 되면 옛날처럼 규칙으로 손님·상품 찾기
    const ruled = parseIntentByRule(text);
    if (ruled.intent === "unknown") return NextResponse.json({ ok: true, via, ai: lastAiNote, intent, kind: "unknown" });
    intent = ruled;
    via = "rule";
  }

  try {
    const supabase = getSupabaseAdminClient();
    const sinceIso = rangePeriod.fromIso;
    if (intent.intent === "customer") {
      let result = await searchCustomers(supabase, intent.name, sinceIso);
      const trimmed = trimNameParticle(intent.name);
      if (result.total === 0 && trimmed !== intent.name) {
        // 「홍길이」처럼 조사가 붙어 못 찾았으면 떼고 한 번 더
        result = await searchCustomers(supabase, trimmed, sinceIso);
        intent = { ...intent, name: trimmed };
      }
      return NextResponse.json({ ok: true, via, ai: lastAiNote, intent, range, kind: "customer", ...result });
    }
    if (intent.intent === "stats") {
      // [AI-2] 숫자 질문 — 판매분석과 같은 스냅샷·같은 계산(lib/salesQuestion). 읽기만.
      // [10/22 실측] 기간 말이 없으면 화면 기간(드롭다운·달력)을 기간으로(예전엔 오늘·AI 가 all 로 답하면 전체 기간이 나왔음)
      // [AI-7] 카드(판매분석과 같은 계산) + AI 가 집계표를 보고 쓴 말 답(answer)
      const r = await chatAnswer(supabase, intent.period, intent.date);
      const snapshot = r.snapshot;
      const period = r.period;
      const answer = { ...r.sales, topProducts: r.sales.topProducts.slice(0, 10), topBuyers: r.sales.topBuyers.slice(0, 10), topDays: r.sales.topDays.slice(0, 10), bottomDays: r.sales.bottomDays.slice(0, 10) };
      const productById = new Map(snapshot.products.map((p) => [String(p.id), p]));
      const topProducts = answer.topProducts.map((p) => {
        const product = productById.get(p.productId);
        return { ...p, photo: product ? salesProductPhotos(p.name, product, p.productId || undefined).detail : "" };
      });
      return NextResponse.json({ ok: true, via, ai: lastAiNote, intent, kind: "stats", stat: intent.stat || "summary", periodLabel: period.label, ...answer, topProducts, byBroadcast: undefined, answer: r.answer });
    }
    const result = await searchProducts(supabase, intent.product, sinceIso);
    return NextResponse.json({ ok: true, via, ai: lastAiNote, intent, range, kind: "product", ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "찾기 실패" }, { status: 500 });
  }
}
