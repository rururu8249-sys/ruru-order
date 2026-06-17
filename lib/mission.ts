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
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
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

async function fetchActiveBroadcast(supabase: Client) {
  const { data } = await supabase
    .from("broadcasts")
    .select("id,title,started_at,ended_at,status")
    .eq("status", "ON")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Record<string, unknown> | null) || null;
}

export async function computeMissionProgress(supabase: Client): Promise<MissionProgress> {
  const cfg = await readMissionConfig(supabase);
  const bc = await fetchActiveBroadcast(supabase);
  let current = 0;
  let broadcastId = "";
  let broadcastTitle = "";

  if (bc && bc.started_at) {
    broadcastId = String(bc.id ?? "");
    broadcastTitle = String(bc.title ?? "");
    const start = String(bc.started_at);
    const end = bc.ended_at ? String(bc.ended_at) : new Date().toISOString();
    const { data } = await supabase
      .from("orders")
      .select(
        "qty,total_price,adjusted_total_price,final_amount,admin_order_status_v2,order_manage_status,is_test_order"
      )
      .gte("created_at", start)
      .lte("created_at", end)
      .limit(2000);
    const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
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
//   - 중복지급 방지 가드는 settings의 mission_paid_<broadcastId> 키(값 있으면 지급완료).
export const missionPaidKey = (broadcastId: string) => `mission_paid_${broadcastId}`;
export type MissionBuyer = { phone: string; nickname: string; amount: number; when: string };

export async function fetchMissionBuyers(
  supabase: Client
): Promise<{ broadcastId: string; broadcastTitle: string; buyers: MissionBuyer[] }> {
  const bc = await fetchActiveBroadcast(supabase);
  if (!bc || !bc.started_at) return { broadcastId: "", broadcastTitle: "", buyers: [] };
  const start = String(bc.started_at);
  const end = bc.ended_at ? String(bc.ended_at) : new Date().toISOString();
  const { data } = await supabase
    .from("orders")
    .select("customer_phone,youtube_nickname,customer_name,total_price,adjusted_total_price,final_amount,created_at,admin_order_status_v2,order_manage_status,is_test_order")
    .gte("created_at", start)
    .lte("created_at", end)
    .limit(2000);
  const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
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
  return { broadcastId: String(bc.id ?? ""), broadcastTitle: String(bc.title ?? ""), buyers: [...map.values()] };
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
