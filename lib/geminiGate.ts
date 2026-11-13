// lib/geminiGate.ts
// [2026-11-13 14:36 사장님 「Gemini 무료 한도 중앙 관리」] 모든 Gemini 호출이 지나가는 문 하나.
//   - 무료 한도(AI Studio 실측 11/13): 3.5 Flash Lite·3.1 Flash Lite 분당 15·하루 500, 3.8 Flash 분당 5·하루 20.
//     표에 없는 모델은 부르지 않는다(한도를 모르니까).
//   - 설정된 무료 한도 전체를 사용한다. 별도의 10% 차감이나 자동 채팅 일일 상한은 없다.
//   - 다시 시도·다른 모델로 넘어가는 것까지 «부를 때마다» 1번으로 센다.
//   - 세는 곳 = settings 한 줄(gemini_quota_v1), 값 비교(CAS)로 서버 여러 대여도 한 번씩만 셈.
//   - 못 읽거나 못 적으면(불확실) 부르지 않는다 — 보수적으로 멈춤.
//   - 429(한도 넘음): 하루 한도면 Google 이 다시 채우는 미국 서부 자정까지, 분당 한도면 1분 멈춤.
//   - 유료 전환·새 키·새 프로젝트 없음. 돈 무접촉.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const GEMINI_QUOTA_KEY = "gemini_quota_v1";
export const GEMINI_FREE_LIMITS: Record<string, { rpm: number; rpd: number }> = {
  "gemini-3.5-flash-lite": { rpm: 15, rpd: 500 },
  "gemini-3.1-flash-lite": { rpm: 15, rpd: 500 },
  "gemini-3.8-flash": { rpm: 5, rpd: 20 },
};
export const GEMINI_DEFAULT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash"];

type ModelState = { day: string; count: number; minute: number; minuteCount: number; blockedUntil: number; requests?: number[] };
export type GeminiPriority = 'interactive' | 'background';
export type GeminiQuotaState = { models: Record<string, ModelState>; lastInteractiveAt?: number };

/** Google 무료 한도가 다시 채워지는 날(미국 서부 날짜) */
export function geminiQuotaDay(now: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
}

/** 다음 미국 서부 자정(ms) — 1분 단위로 앞으로 가며 날짜가 바뀌는 첫 시각 */
export function nextQuotaReset(now: number): number {
  const today = geminiQuotaDay(now);
  let t = Math.ceil(now / 60_000) * 60_000;
  // 최대 25시간 — 60분씩 건너뛴 뒤 1분씩
  while (geminiQuotaDay(t + 3_600_000) === today && t < now + 25 * 3_600_000) t += 3_600_000;
  while (geminiQuotaDay(t) === today && t < now + 25 * 3_600_000) t += 60_000;
  return t;
}

export function parseQuota(raw: unknown): GeminiQuotaState | null {
  if (raw == null) return { models: {} };
  try {
    const o = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!o || typeof o !== 'object' || !o.models || typeof o.models !== 'object' || Array.isArray(o.models)) return null;
    const models = o.models;
    const out: Record<string, ModelState> = {};
    for (const [k, v] of Object.entries(models)) {
      if (!v || typeof v !== "object") return null;
      const m = v as ModelState;
      if (typeof m.day !== 'string' || ![m.count,m.minute,m.minuteCount,m.blockedUntil].every(x=>Number.isSafeInteger(x)&&x>=0)) return null;
      if (m.requests !== undefined && (!Array.isArray(m.requests) || !m.requests.every(x=>Number.isSafeInteger(x)&&x>=0))) return null;
      out[k] = {...m};
    }
    if(o.lastInteractiveAt!==undefined && (!Number.isSafeInteger(o.lastInteractiveAt)||o.lastInteractiveAt<0))return null;
    return { models: out, ...(o.lastInteractiveAt===undefined?{}:{lastInteractiveAt:o.lastInteractiveAt}) };
  } catch { return null; }
}

export function capsOf(model: string): { rpm: number; rpd: number } | null {
  const l = GEMINI_FREE_LIMITS[model];
  if (!l) return null;
  return { ...l };
}

/** 순수 판정 — 이 모델을 지금 한 번 부를 수 있으면 다음 상태, 아니면 null */
export function takeSlot(state: GeminiQuotaState, model: string, now: number, priority: GeminiPriority = 'interactive'): GeminiQuotaState | null {
  const caps = capsOf(model);
  if (!caps) return null;
  if(priority==='background' && state.lastInteractiveAt!==undefined && now-state.lastInteractiveAt<30000)return null;
  const day = geminiQuotaDay(now);
  const minute = Math.floor(now / 60_000);
  const cur = state.models[model] ?? { day, count: 0, minute, minuteCount: 0, blockedUntil: 0 };
  if (cur.blockedUntil > now) return null;
  const count = cur.day === day ? cur.count : 0;
  // Legacy counters conservatively expire one minute after their old bucket ends.
  const requests = cur.requests?.filter(t=>t>now-60000) ?? (cur.minute*60000+120000>now?Array(Math.min(cur.minuteCount,caps.rpm)).fill(cur.minute*60000+59999):[]);
  const minuteCount = requests.length;
  if (count >= caps.rpd || minuteCount >= caps.rpm) return null;
  return { ...state, ...(priority==='interactive'?{lastInteractiveAt:now}:{}), models: { ...state.models, [model]: { day, count: count + 1, minute, minuteCount: minuteCount + 1, requests:[...requests,now], blockedUntil: 0 } } };
}

/** 순수 — 429 받았을 때 막을 시각 */
export function blockUntilFor429(bodyText: string, now: number): number {
  return /PerDay|per day|daily/i.test(bodyText) ? nextQuotaReset(now) : now + 60_000;
}

let client: SupabaseClient | null = null;
function db(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

async function readRaw(sb: SupabaseClient): Promise<{ raw: string | null; exists: boolean } | null> {
  const { data, error } = await sb.from("settings").select("value").eq("key", GEMINI_QUOTA_KEY).maybeSingle();
  if (error) return null;
  return { raw: data ? String((data as { value?: unknown }).value ?? "") : null, exists: Boolean(data) };
}

async function writeCas(sb: SupabaseClient, prev: { raw: string | null; exists: boolean }, next: GeminiQuotaState): Promise<boolean> {
  const value = JSON.stringify(next);
  if (!prev.exists) {
    const { error } = await sb.from("settings").insert({ key: GEMINI_QUOTA_KEY, value });
    return !error;
  }
  const { data, error } = await sb.from("settings").update({ value }).eq("key", GEMINI_QUOTA_KEY).eq("value", prev.raw ?? "").select("key");
  return !error && Array.isArray(data) && data.length === 1;
}

/** 부르기 직전 — 자리 하나 받음. false 면 부르지 말 것(한도 또는 불확실) */
export async function acquireGemini(model: string, now = Date.now(), priority: GeminiPriority = 'interactive'): Promise<boolean> {
  if (!capsOf(model)) return false;
  const sb = db();
  if (!sb) return false;
  try {
    for (let i = 0; i < 5; i += 1) {
      const cur = await readRaw(sb);
      if (!cur) return false;
      const state = parseQuota(cur.raw);
      if(!state)return false;
      const next = takeSlot(state, model, now, priority);
      if (!next) return false;
      if (await writeCas(sb, cur, next)) return true;
    }
  } catch { /* 불확실 → 안 부름 */ }
  return false;
}

/** 429 를 받으면 그 모델을 막음(실패해도 무시) */
export async function blockGemini(model: string, bodyText: string, now = Date.now()): Promise<void> {
  const sb = db();
  if (!sb) return;
  try {
    for (let i = 0; i < 5; i += 1) {
      const cur = await readRaw(sb);
      if (!cur) return;
      const st = parseQuota(cur.raw);
      if(!st)return;
      const m = st.models[model] ?? { day: geminiQuotaDay(now), count: 0, minute: 0, minuteCount: 0, blockedUntil: 0 };
      const until = blockUntilFor429(bodyText, now);
      if (m.blockedUntil >= until) return;
      if (await writeCas(sb, cur, { ...st, models: { ...st.models, [model]: { ...m, blockedUntil: until } } })) return;
    }
  } catch { /* 무시 */ }
}

/** 관리자 화면용 — 모델별 오늘 사용량 */
export async function readGeminiUsage(sb: SupabaseClient, now = Date.now()) {
  const cur = await readRaw(sb).catch(() => null);
  const st = cur ? parseQuota(cur.raw) : null;
  const day = geminiQuotaDay(now);
  return GEMINI_DEFAULT_MODELS.map((model) => {
    const m = st?.models[model];
    const caps = capsOf(model)!;
    const used = st ? (m && m.day === day ? m.count : 0) : null;
    const blocked = Boolean(m && m.blockedUntil > now);
    return { model, used, cap: caps.rpd, limit: GEMINI_FREE_LIMITS[model].rpd, blockedUntil: blocked ? m!.blockedUntil : 0, ok: used!==null && !blocked && used < caps.rpd };
  });
}
