// 미션 게이지(공동목표) — 설정/진행률 계산 공용 모듈.
//   - 설정값은 기존 settings 테이블(key/value)에 저장. 새 DB 테이블 없음.
//   - 진행률은 "현재 방송(broadcasts.status='ON')" 기간의 결제완료 주문을 세서 계산(읽기 전용).
//   - 돈/입금/정산/포인트 로직과 무관. 여기서는 주문을 "읽기만" 한다.
import { createClient } from "@supabase/supabase-js";

export const MISSION_OVERLAY_TOKEN = "mission_luludongi_live";
export const MISSION_SETTING_KEYS = [
  "mission_active",
  "mission_goal_type",
  "mission_goal_value",
  "mission_reward_amount",
  "mission_title",
] as const;

// 결제완료 판정(룰렛 참가자 paidOnly와 동일 기준)
const PAID_STATUSES = new Set(["자동입금확인", "수동입금확인", "카드결제완료"]);

export type MissionGoalType = "count" | "amount";
export type MissionConfig = {
  active: boolean;
  goalType: MissionGoalType;
  goal: number;
  reward: number;
  title: string;
};
export type MissionProgress = MissionConfig & {
  current: number;
  pct: number;
  broadcastId: string;
  broadcastTitle: string;
};

export function getMissionSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  if (!url || !key) throw new Error("Supabase 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
type Client = ReturnType<typeof getMissionSupabase>;

const num = (v: unknown, d = 0) => {
  const s = String(v ?? "").replace(/[^0-9.-]/g, "");
  if (s === "" || s === "-" || s === ".") return d; // 빈 값이면 기본값(Number("")=0 함정 회피)
  const n = Number(s);
  return Number.isFinite(n) ? n : d;
};

export async function readMissionConfig(supabase: Client): Promise<MissionConfig> {
  const { data } = await supabase
    .from("settings")
    .select("key,value")
    .in("key", MISSION_SETTING_KEYS as unknown as string[]);
  const map = new Map<string, string>();
  (Array.isArray(data) ? data : []).forEach((r: { key?: unknown; value?: unknown }) =>
    map.set(String(r.key), String(r.value ?? ""))
  );
  return {
    active: map.get("mission_active") === "true",
    goalType: map.get("mission_goal_type") === "amount" ? "amount" : "count",
    goal: num(map.get("mission_goal_value")),
    reward: num(map.get("mission_reward_amount")),
    title: (map.get("mission_title") || "").trim(),
  };
}

function isPaidRow(row: Record<string, unknown>) {
  const a = String(row.admin_order_status_v2 || "").trim();
  const b = String(row.order_manage_status || "").trim();
  return PAID_STATUSES.has(a) || PAID_STATUSES.has(b);
}
function rowAmount(row: Record<string, unknown>) {
  return num(row.final_amount ?? row.adjusted_total_price ?? row.total_price);
}

// Supabase는 요청당 최대 1000행만 반환 → .range로 전건 페이지네이션(방송 1000건 초과 누락 방지).
async function fetchAllOrders(supabase: Client, start: string, end: string, columns: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  const size = 1000;
  for (let page = 0; page < 30; page++) {
    const from = page * size;
    const { data, error } = await supabase
      .from("orders")
      .select(columns)
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: true })
      .range(from, from + size - 1);
    if (error) break;
    const rows = (Array.isArray(data) ? data : []) as unknown as Record<string, unknown>[];
    all.push(...rows);
    if (rows.length < size) break;
  }
  return all;
}

async function fetchActiveBroadcast(supabase: Client) {
  // 메인 대시보드(getActiveBroadcast)와 동일하게 status 대소문자 무시 + 삭제 제외로 현재 방송 탐지.
  //   - .eq("status","ON")(대문자 정확일치)는 DB값이 "on"/"On"이면 못 찾아 "방송 OFF"로 뜨던 버그 수정.
  const { data } = await supabase
    .from("broadcasts")
    .select("id,public_title,started_at,ended_at,status,is_deleted")
    .order("started_at", { ascending: false })
    .limit(20);
  const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  const active = rows.find(
    (b) => b.is_deleted !== true && String(b.status || "").toUpperCase() === "ON"
  );
  return active || null;
}

export async function computeMissionProgress(supabase: Client): Promise<MissionProgress> {
  const cfg = await readMissionConfig(supabase);
  const bc = await fetchActiveBroadcast(supabase);
  let current = 0;
  let broadcastId = "";
  let broadcastTitle = "";

  if (bc && bc.started_at) {
    broadcastId = String(bc.id ?? "");
    broadcastTitle = String(bc.public_title ?? bc.title ?? "");
    const start = String(bc.started_at);
    const end = bc.ended_at ? String(bc.ended_at) : new Date().toISOString();
    const rows = await fetchAllOrders(
      supabase,
      start,
      end,
      "qty,total_price,adjusted_total_price,final_amount,admin_order_status_v2,order_manage_status,is_test_order"
    );
    for (const r of rows) {
      if (r.is_test_order) continue;
      if (!isPaidRow(r)) continue;
      current += cfg.goalType === "amount" ? rowAmount(r) : num(r.qty, 1);
    }
  }

  const pct = cfg.goal > 0 ? Math.min(100, Math.round((current / cfg.goal) * 100)) : 0;
  return { ...cfg, current, pct, broadcastId, broadcastTitle };
}

// ── 2단계: 구매자 전원 지급용 ──
//   - 같은 방송의 결제완료·비테스트 주문 구매자를 전화번호 기준으로 1명 1회씩 추출(중복 제거).
//   - 중복지급 방지(멱등): "진실원천"은 settings 플래그가 아니라 실제 지급기록(customer_point_ledger).
//     한 방송에서 여러 번 지급해도 같은 사람(전화번호)은 1회만 → 이미 받은 사람은 ledger 기준으로 자동 제외.
//   - 미션 지급 식별키 = admin_memo(아래 상수, 클라이언트 일괄지급이 동일 값을 ledger에 기록).
//     ※ reason은 미션 제목(title)에 따라 바뀌므로 식별에 부적합 → admin_memo(상수)로 매칭.
export const missionPaidKey = (broadcastId: string) => `mission_paid_${broadcastId}`;
export const MISSION_PAYOUT_MEMO = "미션 게이지 공동목표 달성 일괄지급";
export type MissionBuyer = { phone: string; nickname: string; amount: number; when: string };

// 이 방송에서 이미 미션 지급을 받은 전화번호 집합(숫자만). 진실원천 = customer_point_ledger.
//   - change_type='grant' + admin_memo=미션상수 + created_at >= 방송 시작.
//   - 실패한 지급은 ledger에 안 남으므로 자동으로 다음 회차 대상에 다시 포함된다(재시도 안전).
export async function fetchMissionPaidPhones(supabase: Client, startedAt: string): Promise<Set<string>> {
  const paid = new Set<string>();
  if (!startedAt) return paid;
  const size = 1000;
  for (let page = 0; page < 30; page++) {
    const from = page * size;
    const { data, error } = await supabase
      .from("customer_point_ledger")
      .select("customer_phone")
      .eq("change_type", "grant")
      .eq("admin_memo", MISSION_PAYOUT_MEMO)
      .gte("created_at", startedAt)
      .range(from, from + size - 1);
    if (error) break;
    const rows = (Array.isArray(data) ? data : []) as { customer_phone?: unknown }[];
    for (const r of rows) {
      const p = String(r.customer_phone ?? "").replace(/[^0-9]/g, "");
      if (p) paid.add(p);
    }
    if (rows.length < size) break;
  }
  return paid;
}

export async function fetchMissionBuyers(
  supabase: Client
): Promise<{ broadcastId: string; broadcastTitle: string; startedAt: string; buyers: MissionBuyer[] }> {
  const bc = await fetchActiveBroadcast(supabase);
  if (!bc || !bc.started_at) return { broadcastId: "", broadcastTitle: "", startedAt: "", buyers: [] };
  const start = String(bc.started_at);
  const end = bc.ended_at ? String(bc.ended_at) : new Date().toISOString();
  const rows = await fetchAllOrders(
    supabase,
    start,
    end,
    "customer_phone,youtube_nickname,customer_name,total_price,adjusted_total_price,final_amount,created_at,admin_order_status_v2,order_manage_status,is_test_order"
  );
  const map = new Map<string, MissionBuyer>();
  for (const r of rows) {
    if (r.is_test_order) continue;
    if (!isPaidRow(r)) continue;
    const phone = String(r.customer_phone ?? "").replace(/[^0-9]/g, "");
    if (!phone) continue;
    const amt = rowAmount(r);
    const when = String(r.created_at ?? "");
    const ex = map.get(phone);
    if (ex) {
      ex.amount += amt;
      if (when > ex.when) ex.when = when;
    } else {
      map.set(phone, { phone, nickname: String(r.youtube_nickname || r.customer_name || "고객").trim(), amount: amt, when });
    }
  }
  return { broadcastId: String(bc.id ?? ""), broadcastTitle: String(bc.public_title ?? bc.title ?? ""), startedAt: start, buyers: [...map.values()] };
}

export async function readMissionPaid(supabase: Client, broadcastId: string): Promise<boolean> {
  if (!broadcastId) return false;
  const { data } = await supabase.from("settings").select("value").eq("key", missionPaidKey(broadcastId)).maybeSingle();
  return Boolean(data && String((data as { value?: unknown }).value ?? ""));
}
export async function setMissionPaid(supabase: Client, broadcastId: string, paid: boolean) {
  if (!broadcastId) return;
  await supabase
    .from("settings")
    .upsert([{ key: missionPaidKey(broadcastId), value: paid ? new Date().toISOString() : "" }], { onConflict: "key" });
}
