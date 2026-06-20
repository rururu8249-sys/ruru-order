import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PAID_STATUS_VALUES } from "@/lib/admin-v2/statusDisplay";

// 텔레그램 "오늘 결산" 리포트 생성(읽기 전용).
//   매출/결제완료 판정은 앱 정식 기준(PAID_STATUS_VALUES) + final_amount 로, lib/mission.ts 와 동일하게 맞춤.
//   돈을 옮기거나 상태를 바꾸지 않음. 숫자만 읽어 문장으로 정리.

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
function rowAmount(r: Record<string, unknown>): number {
  return num(r.final_amount ?? r.adjusted_total_price ?? r.total_price);
}
const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

// KST 오늘 0시~24시 범위(UTC ISO)
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

async function fetchOrders(sb: SupabaseClient, start: string, end: string): Promise<Record<string, unknown>[]> {
  const cols =
    "customer_phone,youtube_nickname,customer_name,payment_method,total_price,adjusted_total_price,final_amount,admin_order_status_v2,order_manage_status,is_test_order,created_at";
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
  const { start, end, label } = todayKstRange();
  const rows = (await fetchOrders(sb, start, end)).filter((r) => !r.is_test_order);

  const paid = rows.filter(isPaidRow);
  const paidSum = paid.reduce((s, r) => s + rowAmount(r), 0);
  const unpaidBank = rows.filter((r) => !isPaidRow(r) && String(r.payment_method || "") === "무통장입금");

  // 오늘의 큰손(결제완료 기준, 전화번호로 합산)
  const byCust = new Map<string, { name: string; sum: number }>();
  for (const r of paid) {
    const phone = String(r.customer_phone ?? "").replace(/[^0-9]/g, "");
    if (!phone) continue;
    const name = String(r.youtube_nickname || r.customer_name || "고객").trim();
    const cur = byCust.get(phone) || { name, sum: 0 };
    cur.sum += rowAmount(r);
    cur.name = name;
    byCust.set(phone, cur);
  }
  let top: { name: string; sum: number } | null = null;
  for (const v of byCust.values()) if (!top || v.sum > top.sum) top = v;

  const lines = [
    `📊 <b>루루동이 오늘 결산</b> · ${label}`,
    ``,
    `🛒 오늘 주문: ${rows.length}건`,
    `✅ 결제완료 매출: <b>${won(paidSum)}</b> (${paid.length}건)`,
    `💸 무통장 미입금: ${unpaidBank.length}건`,
  ];
  if (top && top.sum > 0) lines.push(`👑 오늘의 큰손: ${top.name} (${won(top.sum)})`);
  lines.push(``, `자세한 건 관리자 화면에서 확인하세요.`);
  return lines.join("\n");
}
