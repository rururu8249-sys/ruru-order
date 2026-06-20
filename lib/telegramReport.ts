import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PAID_STATUS_VALUES } from "@/lib/admin-v2/statusDisplay";

// 텔레그램 "방송 결산" 리포트 생성(읽기 전용).
//   범위 = "현재(가장 최근) 방송" 의 주문 시간창[방송 시작 ~ 종료(진행중이면 지금)] — 어드민 상단 매출 통계와 동일 기준.
//     ※ 예전엔 "KST 오늘 0~24시"만 읽어서, 방송이 날을 넘기면(예: 06.18 시작·주문은 06.19) 오늘 주문 0건 → 전부 0원으로 보이던 버그가 있었음.
//   방송이 하나도 없으면(쇼핑몰 모드 등) "오늘" 으로 fallback.
//   매출/결제완료 판정은 앱 정식 기준(PAID_STATUS_VALUES) + final_amount. 돈을 옮기거나 상태를 바꾸지 않음. 숫자만 읽어 문장으로 정리.

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
const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

// ── 주문 그룹화 ──
//   orders 테이블은 "상품 1줄 = 1행"이라, 한 주문(룰…외 N개)이 여러 행. 어드민(liveOrderAdapter)은 order_group_id 로 묶어 1건으로 셈.
//   리포트도 동일하게 그룹 단위로 세야 건수/큰손이 맞음(금액은 그룹 내 final_amount 합).
//   입금/취소 판정은 그룹의 "첫 행"(id 오름차순) 기준 — 어드민 getPaymentStatus 와 동일.
type OrderGroup = {
  phone: string;
  name: string;
  method: string;
  amount: number;
  paid: boolean;
  canceled: boolean;
  isTest: boolean;
  createdAt: string;
};

function groupOrders(rows: Record<string, unknown>[]): OrderGroup[] {
  const map = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const gid = String(r.order_group_id || r.order_lookup_code || r.id || "");
    if (!gid) continue;
    if (!map.has(gid)) map.set(gid, []);
    map.get(gid)!.push(r);
  }
  const groups: OrderGroup[] = [];
  for (const list of map.values()) {
    const sorted = [...list].sort((a, b) => num(a.id) - num(b.id));
    const first = sorted[0];
    // 그룹 금액 = 행별 final_amount 합(0이면 adjusted_total_price/total_price 합으로 fallback)
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
    });
  }
  return groups;
}

function kstDateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const day = kst.getUTCDate();
  const wd = ["일", "월", "화", "수", "목", "금", "토"][kst.getUTCDay()];
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${y}.${String(m + 1).padStart(2, "0")}.${String(day).padStart(2, "0")}(${wd}) ${hh}:${mm}`;
}

// KST 오늘 0시~24시 범위(UTC ISO) — 방송이 전혀 없을 때 fallback
function todayKstRange(): { start: string; end: string; label: string } {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  const startUtc = new Date(Date.UTC(y, m, d, 0, 0, 0) - 9 * 3600 * 1000);
  const endUtc = new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - 9 * 3600 * 1000);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][kst.getUTCDay()];
  return {
    start: startUtc.toISOString(),
    end: endUtc.toISOString(),
    label: `${y}.${String(m + 1).padStart(2, "0")}.${String(d).padStart(2, "0")}(${wd})`,
  };
}

// KST 이번 달 1일 0시 ~ 지금 범위(UTC ISO) — 월 총매출용
function monthKstRange(): { start: string; end: string; label: string } {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const startUtc = new Date(Date.UTC(y, m, 1, 0, 0, 0) - 9 * 3600 * 1000);
  return { start: startUtc.toISOString(), end: now.toISOString(), label: `${m + 1}월` };
}

type ScopeBc = { id: string; title: string; startedAt: string; endedAt: string; live: boolean } | null;

// 가장 최근 방송(진행중이면 그 방송, 아니면 마지막으로 끝난 방송). 방송 종료 자동발송은 status가 OFF로 바뀐 뒤 호출되므로 "ON만"으로 찾으면 안 됨.
async function fetchScopeBroadcast(sb: SupabaseClient): Promise<ScopeBc> {
  try {
    // ⚠️ broadcasts 테이블 방송이름 컬럼은 public_title(= title 컬럼은 없음). title 을 select 하면 쿼리 전체가 에러나 방송을 못 찾으니 절대 넣지 말 것(mission.ts 와 동일).
    const { data } = await sb
      .from("broadcasts")
      .select("id,public_title,started_at,ended_at,status,is_deleted")
      .order("started_at", { ascending: false })
      .limit(10);
    const list = ((Array.isArray(data) ? data : []) as Record<string, unknown>[]).filter(
      (b) => b.is_deleted !== true && b.started_at,
    );
    if (list.length === 0) return null;
    const on = list.find((b) => String(b.status || "").toUpperCase() === "ON");
    const bc = on || list[0];
    const live = String(bc.status || "").toUpperCase() === "ON";
    return {
      id: String(bc.id ?? ""),
      title: String(bc.public_title ?? "").trim(),
      startedAt: String(bc.started_at ?? ""),
      endedAt: String(bc.ended_at ?? ""),
      live,
    };
  } catch {
    return null;
  }
}

async function fetchOrders(sb: SupabaseClient, start: string, end: string): Promise<Record<string, unknown>[]> {
  const cols =
    "id,order_group_id,order_lookup_code,customer_phone,youtube_nickname,customer_name,payment_method,total_price,adjusted_total_price,final_amount,admin_order_status_v2,order_manage_status,is_test_order,created_at";
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

export async function buildTodayReport(): Promise<string> {
  const sb = svc();

  // 1) 범위 결정: 현재(가장 최근) 방송 시간창. 없으면 오늘.
  const bc = await fetchScopeBroadcast(sb);
  let start: string;
  let end: string;
  let headline: string;
  let scopeLine: string;
  if (bc) {
    start = bc.startedAt;
    end = bc.live || !bc.endedAt ? new Date().toISOString() : bc.endedAt;
    const title = bc.title || "방송";
    headline = `📊 <b>루루동이 ${bc.live ? "중간 결산" : "방송 결산"}</b> · ${title}`;
    scopeLine = bc.live
      ? `🔴 방송중 · 시작 ${kstDateLabel(start)} ~ 현재`
      : `⏹ 방송종료 · ${kstDateLabel(start)} ~ ${kstDateLabel(end)}`;
  } else {
    const t = todayKstRange();
    start = t.start;
    end = t.end;
    headline = `📊 <b>루루동이 오늘 결산</b> · ${t.label}`;
    scopeLine = `🛒 오늘(00:00~24:00) 기준`;
  }

  // raw 행 → 주문 그룹(어드민과 동일하게 order_group_id 로 묶어 1건). 테스트주문 그룹은 제외.
  const allGroups = groupOrders(await fetchOrders(sb, start, end)).filter((g) => !g.isTest);
  const orderCount = allGroups.length;

  const active = allGroups.filter((g) => !g.canceled); // 취소 제외
  const paid = active.filter((g) => g.paid);
  const paidSum = paid.reduce((s, g) => s + g.amount, 0);
  const bankPaid = paid.filter((g) => g.method === "무통장입금");
  const cardPaid = paid.filter((g) => g.method === "카드결제");
  const bankPaidSum = bankPaid.reduce((s, g) => s + g.amount, 0);
  const cardPaidSum = cardPaid.reduce((s, g) => s + g.amount, 0);
  const unpaidBank = active.filter((g) => !g.paid && g.method === "무통장입금");
  const unpaidCard = active.filter((g) => !g.paid && g.method === "카드결제");
  const unpaidBankSum = unpaidBank.reduce((s, g) => s + g.amount, 0);
  const unpaidCardSum = unpaidCard.reduce((s, g) => s + g.amount, 0);

  // 날짜별 결제완료 매출(방송이 날을 넘긴 경우 18·19·20 따로 보기). KST 날짜로 묶음.
  const dayMap = new Map<string, { label: string; sum: number; cnt: number }>();
  for (const g of paid) {
    const d = new Date(g.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const kst = new Date(d.getTime() + 9 * 3600 * 1000);
    const key = `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, "0")}.${String(kst.getUTCDate()).padStart(2, "0")}`;
    const wd = ["일", "월", "화", "수", "목", "금", "토"][kst.getUTCDay()];
    const label = `${String(kst.getUTCMonth() + 1).padStart(2, "0")}.${String(kst.getUTCDate()).padStart(2, "0")}(${wd})`;
    const cur = dayMap.get(key) || { label, sum: 0, cnt: 0 };
    cur.sum += g.amount;
    cur.cnt += 1;
    dayMap.set(key, cur);
  }
  const dayRows = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);

  // 이번 달(KST) 전체 결제완료 매출 — 방송 범위와 무관한 별도 집계(월 총매출). 동일하게 그룹 단위.
  const mr = monthKstRange();
  const monthGroups = groupOrders(await fetchOrders(sb, mr.start, mr.end)).filter((g) => !g.isTest);
  const monthPaid = monthGroups.filter((g) => !g.canceled && g.paid);
  const monthSum = monthPaid.reduce((s, g) => s + g.amount, 0);

  // 오늘의 큰손(결제완료 기준, 전화번호로 합산)
  const byCust = new Map<string, { name: string; sum: number }>();
  for (const g of paid) {
    if (!g.phone) continue;
    const cur = byCust.get(g.phone) || { name: g.name, sum: 0 };
    cur.sum += g.amount;
    cur.name = g.name;
    byCust.set(g.phone, cur);
  }
  let top: { name: string; sum: number } | null = null;
  for (const v of byCust.values()) if (!top || v.sum > top.sum) top = v;

  // 미해결 고객이슈(교환·반품 등) — 날짜 제한 없이 "미해결"이면 전부. 어드민 고객이슈 패널과 동일 기준.
  //   ※ admin_tasks 실제 컬럼만 select(예전 is_done/completed_at 은 없는 컬럼 → 쿼리 에러로 0건 나오던 버그 수정).
  const ISSUE_LABEL: Record<string, string> = { exchange: "교환", return: "반품", refund: "환불", product: "구매", complaint: "진상", general: "기타", payment: "입금", shipping: "배송", address: "주소" };
  const RESOLVED = ["resolved", "done", "complete", "completed", "closed", "해결", "완료"];
  let openIssues: { type: string; nick: string }[] = [];
  try {
    const { data: tasks } = await sb
      .from("admin_tasks")
      .select("task_type,status,resolved_at,customer_nickname,title,body,customer_id,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    openIssues = ((Array.isArray(tasks) ? tasks : []) as Record<string, unknown>[])
      .filter((r) => {
        const st = String(r.status || "").toLowerCase();
        if (st === "deleted") return false;
        if (r.resolved_at) return false;
        if (RESOLVED.some((k) => st.includes(k))) return false;
        // 어드민 고객이슈 패널과 동일: 제목/내용/유형에 "고객이슈"·"issue" 포함 또는 customer_id 있는 것
        const hay = [r.title, r.body, r.task_type].map((x) => String(x || "")).join(" ");
        if (!(hay.includes("고객이슈") || hay.includes("issue") || Boolean(r.customer_id))) return false;
        return true;
      })
      .map((r) => ({
        type: ISSUE_LABEL[String(r.task_type || "")] || "이슈",
        nick: String(r.customer_nickname || r.title || "").replace("[고객이슈]", "").split("-")[0].trim().slice(0, 12),
      }));
  } catch {
    /* ignore */
  }

  const lines = [
    headline,
    scopeLine,
    ``,
    `🛒 주문: ${orderCount}건`,
    `✅ 결제완료 매출: <b>${won(paidSum)}</b> (${paid.length}건)`,
    `   ┗ 무통장 ${won(bankPaidSum)} · 카드 ${won(cardPaidSum)}`,
    ...(dayRows.length >= 2
      ? [`📅 날짜별 매출`, ...dayRows.map((v) => `   · ${v.label} ${won(v.sum)} (${v.cnt}건)`)]
      : []),
    `💸 무통장 미입금: ${unpaidBank.length}건 (${won(unpaidBankSum)})`,
    `💳 카드 미결제: ${unpaidCard.length}건 (${won(unpaidCardSum)})`,
    `📌 미해결 고객이슈: ${openIssues.length}건${
      openIssues.length > 0 ? ` (${openIssues.slice(0, 3).map((i) => `${i.type}${i.nick ? `·${i.nick}` : ""}`).join(", ")}${openIssues.length > 3 ? " 외" : ""})` : ""
    }`,
  ];
  if (top && top.sum > 0) lines.push(`👑 오늘의 큰손: ${top.name} (${won(top.sum)})`);
  lines.push(``, `🗓 ${mr.label} 총매출(이번 달 전체): <b>${won(monthSum)}</b> (${monthPaid.length}건)`);
  lines.push(``, `자세한 건 관리자 화면에서 확인하세요.`);
  return lines.join("\n");
}
