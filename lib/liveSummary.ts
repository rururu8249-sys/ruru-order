import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PAID_STATUS_VALUES } from "@/lib/admin-v2/statusDisplay";

// 결산 요약 공용 계산(읽기 전용). 텔레그램 결산 + 어드민 결산요약 패널이 같은 기준을 쓰도록 단일 출처로 둠.
//   - 주문은 order_group_id 로 묶어 1건(어드민 liveOrderAdapter 와 동일). 입금/취소 판정은 그룹 첫 행 기준.
//   - 매출/결제완료 = PAID_STATUS_VALUES + 그룹 final_amount 합. 돈/입금 로직은 읽기만, 변경 없음.

const PAID = new Set(PAID_STATUS_VALUES);

function svc(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function present(v: unknown): boolean {
  return v !== null && v !== undefined && String(v).trim() !== "";
}
function isPaidRow(r: Record<string, unknown>): boolean {
  const a = String(r.admin_order_status_v2 || "").trim();
  const b = String(r.order_manage_status || "").trim();
  return PAID.has(a) || PAID.has(b);
}
function isCanceledRow(r: Record<string, unknown>): boolean {
  const a = String(r.admin_order_status_v2 || "");
  const b = String(r.order_manage_status || "");
  return a.includes("취소") || b.includes("취소");
}
function rowProductAmount(r: Record<string, unknown>): number {
  const qty = num(r.qty) || 1;
  if (present(r.adjusted_product_price)) return num(r.adjusted_product_price);
  if (present(r.product_price)) return num(r.product_price) * qty;
  return 0;
}

export type DayRow = { label: string; sum: number; cnt: number };
export type RankProduct = { name: string; qty: number; amount: number };
export type RankBuyer = { name: string; sum: number; count: number; qty?: number };
export type IssueRow = { type: string; nick: string };

export type LiveSummary = {
  scope: "broadcast" | "today";
  title: string; // 방송 제목 또는 날짜 라벨
  startedAt: string; // 방송 시작(범위가 방송일 때)
  endedAt: string;
  live: boolean;
  orderCount: number;
  paidCount: number;
  paidSum: number;
  bankPaidSum: number;
  cardPaidSum: number;
  unpaidBankCount: number;
  unpaidBankSum: number;
  unpaidCardCount: number;
  unpaidCardSum: number;
  dayRows: DayRow[];
  monthLabel: string;
  monthSum: number;
  monthCount: number;
  productRanking: RankProduct[];
  buyerRanking: RankBuyer[];
  issues: IssueRow[];
  topBuyer: RankBuyer | null;
  // [2026-10-22 텔레그램 결산] 결제완료 기준 상품값 합·포인트 사용 합·상품별 수량 전체(많이 팔린 순, 10개 제한 없음)
  goodsSum: number;
  pointUsedSum: number;
  productAll: RankProduct[];
  // [2026-11-02 텔레그램 결산 재설계] 결제완료 건수(무통장/카드)·카드 수수료·입금가·구매 TOP3 — 읽기 계산만
  bankPaidCount: number;
  cardPaidCount: number;
  cardFeeRate: number;
  cardFeeSum: number;
  productCostSum: number;
  costedQty: number;
  costMissingQty: number;
  buyerTop: RankBuyer[];
};

type Group = {
  phone: string;
  /** 손님 식별(카카오 계정 우선 — 없으면 전화) */
  who: string;
  name: string;
  method: string;
  amount: number;
  paid: boolean;
  canceled: boolean;
  isTest: boolean;
  createdAt: string;
  rows: Record<string, unknown>[];
};

function kstKey(iso: string): { key: string; label: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][kst.getUTCDay()];
  const key = `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, "0")}.${String(kst.getUTCDate()).padStart(2, "0")}`;
  const label = `${String(kst.getUTCMonth() + 1).padStart(2, "0")}.${String(kst.getUTCDate()).padStart(2, "0")}(${wd})`;
  return { key, label };
}
export function kstDateTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][kst.getUTCDay()];
  return `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, "0")}.${String(kst.getUTCDate()).padStart(2, "0")}(${wd}) ${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
}

function todayKstRange(): { start: string; end: string; label: string } {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  const startUtc = new Date(Date.UTC(y, m, d, 0, 0, 0) - 9 * 3600 * 1000);
  const endUtc = new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - 9 * 3600 * 1000);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][kst.getUTCDay()];
  return { start: startUtc.toISOString(), end: endUtc.toISOString(), label: `${y}.${String(m + 1).padStart(2, "0")}.${String(d).padStart(2, "0")}(${wd})` };
}

function monthKstRange(): { start: string; end: string; label: string } {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const startUtc = new Date(Date.UTC(y, m, 1, 0, 0, 0) - 9 * 3600 * 1000);
  return { start: startUtc.toISOString(), end: now.toISOString(), label: `${m + 1}월` };
}

type ScopeBc = { title: string; startedAt: string; endedAt: string; live: boolean } | null;
async function fetchScopeBroadcast(sb: SupabaseClient, broadcastId?: string): Promise<ScopeBc> {
  try {
    // ⚠️ broadcasts 방송이름 컬럼은 public_title(= title 없음). title 넣으면 쿼리 전체 에러.
    let q = sb
      .from("broadcasts")
      .select("id,public_title,started_at,ended_at,status,is_deleted")
      .order("started_at", { ascending: false })
      .limit(10);
    if (broadcastId) q = q.eq("id", broadcastId);
    const { data } = await q;
    const list = ((Array.isArray(data) ? data : []) as Record<string, unknown>[]).filter((b) => b.is_deleted !== true && b.started_at);
    if (list.length === 0) return null;
    const on = list.find((b) => String(b.status || "").toUpperCase() === "ON");
    const bc = on || list[0];
    return {
      title: String(bc.public_title ?? "").trim(),
      startedAt: String(bc.started_at ?? ""),
      endedAt: String(bc.ended_at ?? ""),
      live: String(bc.status || "").toUpperCase() === "ON",
    };
  } catch {
    return null;
  }
}

export const MONTH_COLS =
  "id,order_group_id,order_lookup_code,customer_phone,youtube_nickname,customer_name,payment_method,qty,product_name,product_price,adjusted_product_price,total_price,adjusted_total_price,final_amount,admin_order_status_v2,order_manage_status,is_test_order,created_at,event_gift_winner_id";

// [2026-11-02] 방송 범위는 «*» — 포인트 사용(point_used_amount)·입금가(cost_price_snapshot)·카드 수수료 칸까지(전엔 point_used_amount 를 안 읽어 포인트 사용이 늘 0원).
//   읽기 실패는 숨기지 않고 throw(빈 결산을 보내지 않게).
export async function fetchOrders(sb: SupabaseClient, start: string, end: string, cols: string = MONTH_COLS): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  const size = 1000;
  let from = 0;
  for (let p = 0; p < 30; p++) {
    const { data, error } = await sb
      .from("orders")
      .select(cols)
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: true })
      .range(from, from + size - 1);
    if (error) throw new Error(`주문을 못 읽었어요: ${error.message}`);
    const rows = (Array.isArray(data) ? data : []) as unknown as Record<string, unknown>[];
    all.push(...rows);
    if (rows.length < size) break;
    from += size;
  }
  return all;
}

export function groupOrders(rows: Record<string, unknown>[]): Group[] {
  const map = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const gid = String(r.order_group_id || r.order_lookup_code || r.id || "");
    if (!gid) continue;
    if (!map.has(gid)) map.set(gid, []);
    map.get(gid)!.push(r);
  }
  const groups: Group[] = [];
  for (const list of map.values()) {
    const sorted = [...list].sort((a, b) => num(a.id) - num(b.id));
    const first = sorted[0];
    const kakao = String(sorted.find((r) => present(r.kakao_id))?.kakao_id ?? "").trim();
    let amount = sorted.reduce((s, r) => s + num(r.final_amount), 0);
    if (amount === 0) amount = sorted.reduce((s, r) => s + num(r.adjusted_total_price ?? r.total_price), 0);
    groups.push({
      phone: String(first.customer_phone ?? "").replace(/[^0-9]/g, ""),
      who: kakao ? `k:${kakao}` : "",
      name: String(first.youtube_nickname || first.customer_name || "고객").trim(),
      method: String(first.payment_method || ""),
      amount,
      paid: isPaidRow(first),
      canceled: isCanceledRow(first),
      isTest: sorted.some((r) => r.is_test_order),
      createdAt: String(first.created_at ?? ""),
      rows: sorted,
    });
  }
  return groups;
}

async function fetchOpenIssues(sb: SupabaseClient): Promise<IssueRow[]> {
  const ISSUE_LABEL: Record<string, string> = { exchange: "교환", return: "반품", refund: "환불", product: "구매", complaint: "진상", general: "기타", payment: "입금", shipping: "배송", address: "주소" };
  const RESOLVED = ["resolved", "done", "complete", "completed", "closed", "해결", "완료"];
  try {
    const { data } = await sb
      .from("admin_tasks")
      .select("task_type,status,resolved_at,customer_nickname,title,body,customer_id,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    return ((Array.isArray(data) ? data : []) as Record<string, unknown>[])
      .filter((r) => {
        const st = String(r.status || "").toLowerCase();
        if (st === "deleted") return false;
        if (r.resolved_at) return false;
        if (RESOLVED.some((k) => st.includes(k))) return false;
        const hay = [r.title, r.body, r.task_type].map((x) => String(x || "")).join(" ");
        return hay.includes("고객이슈") || hay.includes("issue") || Boolean(r.customer_id);
      })
      .map((r) => ({
        type: ISSUE_LABEL[String(r.task_type || "")] || "이슈",
        nick: String(r.customer_nickname || r.title || "").replace("[고객이슈]", "").split("-")[0].trim().slice(0, 14),
      }));
  } catch {
    return [];
  }
}

// mode: "broadcast"(현재 방송 시간창, 없으면 오늘) / "today"(오늘 0~24시)
async function readCardFeeRate(sb: SupabaseClient): Promise<number> {
  try {
    const { data } = await sb.from("settings").select("value").eq("key", "actual_card_fee_rate").maybeSingle();
    const n = Number((data as Record<string, unknown> | null)?.value);
    return Number.isFinite(n) && n >= 0 && n <= 20 ? n : 7;
  } catch {
    return 7;
  }
}

/** 정산 화면과 같은 규칙 — 카드 줄의 저장된 수수료가 있으면 그 값, 없으면 (그 줄 적용률 || 설정 실제 카드 수수료율) × 줄 금액 */
export function rowCardFee(r: Record<string, unknown>, fallbackRate: number): number {
  const stored = num(r.actual_card_fee_amount) || num(r.card_fee_amount) || num(r.actual_card_fee);
  if (stored > 0) return stored;
  const rate = num(r.actual_card_fee_rate_applied) || fallbackRate;
  const amount = num(r.final_amount) > 0 ? num(r.final_amount) : Math.max(0, num(r.adjusted_total_price ?? r.total_price) - num(r.refund_amount));
  return Math.round(amount * (rate / 100));
}

/** 입금가(주문 시점 1개 값) — 없음·0 이하·숫자 아님은 null */
export function rowCostPrice(r: Record<string, unknown>): number | null {
  const v = r.cost_price_snapshot;
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export async function computeLiveSummary(mode: "broadcast" | "today", opts?: { broadcastId?: string }): Promise<LiveSummary> {
  const sb = svc();

  let start: string;
  let end: string;
  let scope: "broadcast" | "today";
  let title: string;
  let startedAt = "";
  let endedAt = "";
  let live = false;

  const bc = mode === "broadcast" ? await fetchScopeBroadcast(sb, opts?.broadcastId) : null;
  if (mode === "broadcast" && bc) {
    scope = "broadcast";
    startedAt = bc.startedAt;
    live = bc.live;
    endedAt = bc.endedAt;
    start = bc.startedAt;
    end = live || !bc.endedAt ? new Date().toISOString() : bc.endedAt;
    title = bc.title || "방송";
  } else {
    scope = "today";
    const t = todayKstRange();
    start = t.start;
    end = t.end;
    title = t.label;
  }

  const allGroups = groupOrders(await fetchOrders(sb, start, end, "*")).filter((g) => !g.isTest);
  const active = allGroups.filter((g) => !g.canceled);
  const paid = active.filter((g) => g.paid);

  const paidSum = paid.reduce((s, g) => s + g.amount, 0);
  const bankPaidSum = paid.filter((g) => g.method === "무통장입금").reduce((s, g) => s + g.amount, 0);
  const cardPaidSum = paid.filter((g) => g.method === "카드결제").reduce((s, g) => s + g.amount, 0);
  const unpaidBank = active.filter((g) => !g.paid && g.method === "무통장입금");
  const unpaidCard = active.filter((g) => !g.paid && g.method === "카드결제");

  // 날짜별 매출(결제완료)
  const dayMap = new Map<string, DayRow>();
  for (const g of paid) {
    const k = kstKey(g.createdAt);
    if (!k) continue;
    const cur = dayMap.get(k.key) || { label: k.label, sum: 0, cnt: 0 };
    cur.sum += g.amount;
    cur.cnt += 1;
    dayMap.set(k.key, cur);
  }
  const dayRows = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);

  // 상품 랭킹(결제완료 주문의 상품 행 기준) — 수량/매출
  const prodMap = new Map<string, RankProduct>();
  for (const g of paid) {
    for (const r of g.rows) {
      if (r.event_gift_winner_id) continue;
      const name = String(r.product_name || "").trim() || "상품명 없음";
      const qty = num(r.qty) || 1;
      const amt = rowProductAmount(r);
      const cur = prodMap.get(name) || { name, qty: 0, amount: 0 };
      cur.qty += qty;
      cur.amount += amt;
      prodMap.set(name, cur);
    }
  }
  const productAll = [...prodMap.values()].sort((a, b) => b.qty - a.qty || b.amount - a.amount);
  const productRanking = productAll.slice(0, 10);
  // 상품값 합(이벤트 선물 줄 제외·productAll 과 같은 기준) · 포인트 사용 합(결제완료 줄의 point_used_amount)
  const goodsSum = productAll.reduce((s, p) => s + p.amount, 0);
  const pointUsedSum = paid.reduce((s, g) => s + g.rows.reduce((t, r) => t + Math.max(0, num(r.point_used_amount)), 0), 0);

  // 구매자 랭킹(결제완료) — 같은 손님 = 카카오 계정, 없으면 전화번호(고객 식별 원칙)
  const buyerMap = new Map<string, RankBuyer>();
  for (const g of paid) {
    const key = g.who || (g.phone ? `p:${g.phone}` : "");
    if (!key) continue;
    const cur = buyerMap.get(key) || { name: g.name, sum: 0, count: 0, qty: 0 };
    cur.sum += g.amount;
    cur.count += 1;
    cur.qty = (cur.qty || 0) + g.rows.reduce((t, r) => t + (r.event_gift_winner_id ? 0 : num(r.qty) || 1), 0);
    cur.name = g.name;
    buyerMap.set(key, cur);
  }
  const buyerRanking = [...buyerMap.values()].sort((a, b) => b.sum - a.sum).slice(0, 10);

  // [2026-11-02] 카드 수수료·입금가(결제완료 줄만, 이벤트 선물 줄은 입금가 셈에서 뺌) — 읽기 계산만
  const cardFeeRate = await readCardFeeRate(sb);
  let cardFeeSum = 0;
  let productCostSum = 0;
  let costedQty = 0;
  let costMissingQty = 0;
  for (const g of paid) {
    for (const r of g.rows) {
      if (g.method === "카드결제") cardFeeSum += rowCardFee(r, cardFeeRate);
      if (r.event_gift_winner_id) continue;
      const qty = Math.max(1, num(r.qty) || 1);
      const cost = rowCostPrice(r);
      if (cost === null) costMissingQty += qty;
      else {
        productCostSum += cost * qty;
        costedQty += qty;
      }
    }
  }
  const bankPaidCount = paid.filter((g) => g.method === "무통장입금").length;
  const cardPaidCount = paid.filter((g) => g.method === "카드결제").length;

  // 이번 달 총매출(범위 무관)
  const mr = monthKstRange();
  const monthGroups = groupOrders(await fetchOrders(sb, mr.start, mr.end)).filter((g) => !g.isTest);
  const monthPaid = monthGroups.filter((g) => !g.canceled && g.paid);
  const monthSum = monthPaid.reduce((s, g) => s + g.amount, 0);

  const issues = await fetchOpenIssues(sb);

  return {
    scope,
    title,
    startedAt,
    endedAt,
    live,
    orderCount: allGroups.length,
    paidCount: paid.length,
    paidSum,
    bankPaidSum,
    cardPaidSum,
    unpaidBankCount: unpaidBank.length,
    unpaidBankSum: unpaidBank.reduce((s, g) => s + g.amount, 0),
    unpaidCardCount: unpaidCard.length,
    unpaidCardSum: unpaidCard.reduce((s, g) => s + g.amount, 0),
    dayRows,
    monthLabel: mr.label,
    monthSum,
    monthCount: monthPaid.length,
    productRanking,
    buyerRanking,
    issues,
    topBuyer: buyerRanking[0] || null,
    goodsSum,
    pointUsedSum,
    productAll,
    bankPaidCount,
    cardPaidCount,
    cardFeeRate,
    cardFeeSum,
    productCostSum,
    costedQty,
    costMissingQty,
    buyerTop: buyerRanking.slice(0, 3),
  };
}
