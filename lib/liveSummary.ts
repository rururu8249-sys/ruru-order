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
export type RankBuyer = { name: string; sum: number; count: number };
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
};

type Group = {
  phone: string;
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
async function fetchScopeBroadcast(sb: SupabaseClient): Promise<ScopeBc> {
  try {
    // ⚠️ broadcasts 방송이름 컬럼은 public_title(= title 없음). title 넣으면 쿼리 전체 에러.
    const { data } = await sb
      .from("broadcasts")
      .select("id,public_title,started_at,ended_at,status,is_deleted")
      .order("started_at", { ascending: false })
      .limit(10);
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

async function fetchOrders(sb: SupabaseClient, start: string, end: string): Promise<Record<string, unknown>[]> {
  const cols =
    "id,order_group_id,order_lookup_code,customer_phone,youtube_nickname,customer_name,payment_method,qty,product_name,product_price,adjusted_product_price,total_price,adjusted_total_price,final_amount,admin_order_status_v2,order_manage_status,is_test_order,created_at";
  const all: Record<string, unknown>[] = [];
  const size = 1000;
  let from = 0;
  for (let p = 0; p < 30; p++) {
    const { data } = await sb
      .from("orders")
      .select(cols)
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: true })
      .range(from, from + size - 1);
    const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
    all.push(...rows);
    if (rows.length < size) break;
    from += size;
  }
  return all;
}

function groupOrders(rows: Record<string, unknown>[]): Group[] {
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
    let amount = sorted.reduce((s, r) => s + num(r.final_amount), 0);
    if (amount === 0) amount = sorted.reduce((s, r) => s + num(r.adjusted_total_price ?? r.total_price), 0);
    groups.push({
      phone: String(first.customer_phone ?? "").replace(/[^0-9]/g, ""),
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
export async function computeLiveSummary(mode: "broadcast" | "today"): Promise<LiveSummary> {
  const sb = svc();

  let start: string;
  let end: string;
  let scope: "broadcast" | "today";
  let title: string;
  let startedAt = "";
  let endedAt = "";
  let live = false;

  const bc = mode === "broadcast" ? await fetchScopeBroadcast(sb) : null;
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

  const allGroups = groupOrders(await fetchOrders(sb, start, end)).filter((g) => !g.isTest);
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
      const name = String(r.product_name || "").trim() || "상품명 없음";
      const qty = num(r.qty) || 1;
      const amt = rowProductAmount(r);
      const cur = prodMap.get(name) || { name, qty: 0, amount: 0 };
      cur.qty += qty;
      cur.amount += amt;
      prodMap.set(name, cur);
    }
  }
  const productRanking = [...prodMap.values()].sort((a, b) => b.qty - a.qty || b.amount - a.amount).slice(0, 10);

  // 구매자 랭킹(전화번호로 합산, 결제완료)
  const buyerMap = new Map<string, RankBuyer>();
  for (const g of paid) {
    if (!g.phone) continue;
    const cur = buyerMap.get(g.phone) || { name: g.name, sum: 0, count: 0 };
    cur.sum += g.amount;
    cur.count += 1;
    cur.name = g.name;
    buyerMap.set(g.phone, cur);
  }
  const buyerRanking = [...buyerMap.values()].sort((a, b) => b.sum - a.sum).slice(0, 10);

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
  };
}
