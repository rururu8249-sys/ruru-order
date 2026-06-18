// 미션 게이지(공동목표) — 설정/진행률 계산 공용 모듈.
//   - 설정값은 기존 settings 테이블(key/value)에 저장. 새 DB 테이블 없음.
//   - 진행률은 "현재 방송(broadcasts.status='ON')" 기간의 결제완료 주문을 세서 계산(읽기 전용).
//   - 돈/입금/정산/포인트 로직과 무관. 여기서는 주문을 "읽기만" 한다.
import { createClient } from "@supabase/supabase-js";
import { PAID_STATUS_VALUES } from "@/lib/admin-v2/statusDisplay";

export const MISSION_OVERLAY_TOKEN = "mission_luludongi_live";
export const MISSION_SETTING_KEYS = [
  "mission_active",
  "mission_goal_type",
  "mission_goal_value",
  "mission_reward_amount",
  "mission_title",
] as const;

// 결제완료 판정 — 앱 정식 기준(PAID_STATUS_VALUES)과 동일하게 통일.
//   기존엔 자동/수동입금확인·카드결제완료 3개만 봐서, 입금확인·결제완료·출고대기·출고완료·킵·픽업 상태인
//   결제완료 구매자가 미션 카운트/지급 대상에서 빠지던 불일치를 해소(주문서 결제완료와 동일 집합).
const PAID_STATUSES = new Set(PAID_STATUS_VALUES);

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

// 이벤트(미션) 시작/종료 시각 — 카운트·지급 대상 기준 구간.
//   - mission_started_at: 미션을 켜는 순간 기록(= 새 이벤트 시작점). 없으면 방송 시작으로 fallback.
//   - mission_ended_at: 이벤트 종료 시 기록(구간 끝 고정). 진행 중이면 지금까지.
async function readMissionTimes(supabase: Client): Promise<{ startedAt: string; endedAt: string }> {
  const { data } = await supabase
    .from("settings")
    .select("key,value")
    .in("key", ["mission_started_at", "mission_ended_at"]);
  const map = new Map<string, string>();
  (Array.isArray(data) ? data : []).forEach((r: { key?: unknown; value?: unknown }) =>
    map.set(String(r.key), String(r.value ?? ""))
  );
  return { startedAt: (map.get("mission_started_at") || "").trim(), endedAt: (map.get("mission_ended_at") || "").trim() };
}

// 카운트/지급/명단 구간 = [이벤트 시작, 종료(진행 중이면 지금)]. 기록 없으면 방송 시작~지금 fallback.
async function resolveMissionWindow(
  supabase: Client,
  bc: Record<string, unknown>,
  active: boolean
): Promise<{ start: string; end: string }> {
  const times = await readMissionTimes(supabase);
  const bcStart = String(bc.started_at ?? "");
  const nowIso = new Date().toISOString();
  const start = times.startedAt || bcStart;
  const end = active
    ? bc.ended_at
      ? String(bc.ended_at)
      : nowIso
    : times.endedAt || (bc.ended_at ? String(bc.ended_at) : nowIso);
  return { start, end };
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
    const { start, end } = await resolveMissionWindow(supabase, bc, cfg.active);
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

// 이 방송 미션 지급 "기록"(목록 표시용). ledger의 미션 grant 행을 그대로 읽음(금액·시각).
//   - 닉네임은 ledger에 없을 수 있어(일괄지급이 nickname 미저장) phone만 반환 → 표시 닉네임은 호출부에서 주문 매핑.
export type MissionPaidEntry = { phone: string; amount: number; when: string; nickname: string };
// 미션 일괄지급 기록 조회. fromIso 이후(선택적으로 toIso 이전)의 미션 grant 행.
//   - 닉네임: ledger의 youtube_nickname/customer_name(있으면). 없으면 호출부에서 주문 매핑/번호로 보완.
export async function fetchMissionPayoutHistory(supabase: Client, fromIso: string, toIso?: string): Promise<MissionPaidEntry[]> {
  const out: MissionPaidEntry[] = [];
  if (!fromIso) return out;
  const size = 1000;
  for (let page = 0; page < 30; page++) {
    const from = page * size;
    let q = supabase
      .from("customer_point_ledger")
      .select("customer_phone,amount,created_at,youtube_nickname,customer_name")
      .eq("change_type", "grant")
      .eq("admin_memo", MISSION_PAYOUT_MEMO)
      .gte("created_at", fromIso);
    if (toIso) q = q.lte("created_at", toIso);
    const { data, error } = await q.order("created_at", { ascending: false }).range(from, from + size - 1);
    if (error) break;
    const rows = (Array.isArray(data) ? data : []) as { customer_phone?: unknown; amount?: unknown; created_at?: unknown; youtube_nickname?: unknown; customer_name?: unknown }[];
    for (const r of rows) {
      const phone = String(r.customer_phone ?? "").replace(/[^0-9]/g, "");
      if (!phone) continue;
      out.push({
        phone,
        amount: Math.abs(Number(r.amount) || 0),
        when: String(r.created_at ?? ""),
        nickname: String(r.youtube_nickname || r.customer_name || "").trim(),
      });
    }
    if (rows.length < size) break;
  }
  return out;
}

export async function fetchMissionBuyers(
  supabase: Client
): Promise<{ broadcastId: string; broadcastTitle: string; startedAt: string; broadcastStartedAt: string; buyers: MissionBuyer[] }> {
  const bc = await fetchActiveBroadcast(supabase);
  if (!bc || !bc.started_at) return { broadcastId: "", broadcastTitle: "", startedAt: "", broadcastStartedAt: "", buyers: [] };
  const cfg = await readMissionConfig(supabase);
  // 카운트/지급 구간 = 이벤트 시작~종료(진행 중이면 지금). 방송 시작 아님.
  const { start, end } = await resolveMissionWindow(supabase, bc, cfg.active);
  const broadcastStartedAt = String(bc.started_at ?? "");
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
  return { broadcastId: String(bc.id ?? ""), broadcastTitle: String(bc.public_title ?? bc.title ?? ""), startedAt: start, broadcastStartedAt, buyers: [...map.values()] };
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
