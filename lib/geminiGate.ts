// lib/geminiGate.ts
// [2026-11-13 14:36 사장님 「Gemini 무료 한도 중앙 관리」] 모든 Gemini 호출이 지나가는 문 하나.
//   - 무료 한도(AI Studio 실측 11/13): 3.5 Flash Lite·3.1 Flash Lite 분당 15·하루 500, 3.8 Flash 분당 5·하루 20.
//     표에 없는 모델은 부르지 않는다(한도를 모르니까).
//   - 여유 10% 남기고(분당 13·하루 450 / 3.8 은 분당 4·하루 18) 넘으면 그 모델은 안 부름.
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
export const GEMINI_MARGIN = 0.9;
export const GEMINI_DEFAULT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash"];

type ModelState = { day: string; count: number; minute: number; minuteCount: number; blockedUntil: number };
export type GeminiQuotaState = { models: Record<string, ModelState> };

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

export function parseQuota(raw: unknown): GeminiQuotaState {
  try {
    const o = typeof raw === "string" ? JSON.parse(raw) : raw;
    const models = o && typeof o === "object" && (o as GeminiQuotaState).models && typeof (o as GeminiQuotaState).models === "object" ? (o as GeminiQuotaState).models : {};
    const out: Record<string, ModelState> = {};
    for (const [k, v] of Object.entries(models)) {
      if (!v || typeof v !== "object") continue;
      const n = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
      out[k] = { day: String((v as ModelState).day ?? ""), count: n((v as ModelState).count), minute: n((v as ModelState).minute), minuteCount: n((v as ModelState).minuteCount), blockedUntil: n((v as ModelState).blockedUntil) };
    }
    return { models: out };
  } catch { return { models: {} }; }
}

export function capsOf(model: string): { rpm: number; rpd: number } | null {
  const l = GEMINI_FREE_LIMITS[model];
  if (!l) return null;
  return { rpm: Math.max(1, Math.floor(l.rpm * GEMINI_MARGIN)), rpd: Math.max(1, Math.floor(l.rpd * GEMINI_MARGIN)) };
}

/** 순수 판정 — 이 모델을 지금 한 번 부를 수 있으면 다음 상태, 아니면 null */
export function takeSlot(state: GeminiQuotaState, model: string, now: number): GeminiQuotaState | null {
  const caps = capsOf(model);
  if (!caps) return null;
  const day = geminiQuotaDay(now);
  const minute = Math.floor(now / 60_000);
  const cur = state.models[model] ?? { day, count: 0, minute, minuteCount: 0, blockedUntil: 0 };
  if (cur.blockedUntil > now) return null;
  const count = cur.day === day ? cur.count : 0;
  const minuteCount = cur.minute === minute ? cur.minuteCount : 0;
  if (count >= caps.rpd || minuteCount >= caps.rpm) return null;
  return { models: { ...state.models, [model]: { day, count: count + 1, minute, minuteCount: minuteCount + 1, blockedUntil: cur.blockedUntil > now ? cur.blockedUntil : 0 } } };
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
export async function acquireGemini(model: string, now = Date.now()): Promise<boolean> {
  if (!capsOf(model)) return false;
  // 세기는 운영(Vercel, NODE_ENV=production)에서만 — 자동 테스트 스크립트(가짜 DB)는 통과
  if (process.env.NODE_ENV !== "production") return true;
  const sb = db();
  if (!sb) return false;
  try {
    for (let i = 0; i < 5; i += 1) {
      const cur = await readRaw(sb);
      if (!cur) return false;
      const next = takeSlot(parseQuota(cur.raw), model, now);
      if (!next) return false;
      if (await writeCas(sb, cur, next)) return true;
    }
  } catch { /* 불확실 → 안 부름 */ }
  return false;
}

/** 429 를 받으면 그 모델을 막음(실패해도 무시) */
export async function blockGemini(model: string, bodyText: string, now = Date.now()): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  const sb = db();
  if (!sb) return;
  try {
    for (let i = 0; i < 5; i += 1) {
      const cur = await readRaw(sb);
      if (!cur) return;
      const st = parseQuota(cur.raw);
      const m = st.models[model] ?? { day: geminiQuotaDay(now), count: 0, minute: 0, minuteCount: 0, blockedUntil: 0 };
      const until = blockUntilFor429(bodyText, now);
      if (m.blockedUntil >= until) return;
      if (await writeCas(sb, cur, { models: { ...st.models, [model]: { ...m, blockedUntil: until } } })) return;
    }
  } catch { /* 무시 */ }
}

/** 관리자 화면용 — 모델별 오늘 사용량 */
export async function readGeminiUsage(sb: SupabaseClient, now = Date.now()) {
  const cur = await readRaw(sb).catch(() => null);
  const st = parseQuota(cur?.raw ?? null);
  const day = geminiQuotaDay(now);
  return GEMINI_DEFAULT_MODELS.map((model) => {
    const m = st.models[model];
    const caps = capsOf(model)!;
    const used = m && m.day === day ? m.count : 0;
    const blocked = Boolean(m && m.blockedUntil > now);
    return { model, used, cap: caps.rpd, limit: GEMINI_FREE_LIMITS[model].rpd, blockedUntil: blocked ? m!.blockedUntil : 0, ok: !blocked && used < caps.rpd };
  });
}
