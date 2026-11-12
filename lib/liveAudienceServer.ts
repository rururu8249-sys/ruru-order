// lib/liveAudienceServer.ts
// [2026-11-12 사장님 22:34] 방송 화면 시청자 수 — «방송 화면을 지금 열어 둔 사람» / «사이트 전체 접속» 나눠 세기 + 관리자용 목록.
//   기존 접속 신호(visitor_presence, 30초마다)만 읽는다. 쓰기 0. 주문·입금·포인트 무접촉.
//   «지금» = 마지막 신호가 75초 안(30초 신호를 한 번 놓쳐도 유지, 두 번 놓치면 빠짐).
//   관리자 화면 줄·접속 기록 「제외 계정」(사장님 계정)은 숫자·목록에서 뺀다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isLiveWatchPath } from "@/lib/presenceActivity";
import { excludePresenceRows } from "@/lib/presenceLive";
import { loadExcludedCustomers } from "@/lib/visitStatsExclude";

export const LIVE_AUDIENCE_WINDOW_MS = 75_000;
const COUNT_CACHE_MS = 8_000;
const EXCLUDE_CACHE_MS = 60_000;

type Row = Record<string, unknown>;
export type AudienceRow = { visitorKey: string; nickname: string; kakaoId: string; lastSeenAt: string };
export type Audience = { total: number; watching: number; watchers: AudienceRow[] };

const clean = (v: unknown) => String(v ?? "").trim();

/** 순수 계산(테스트 대상) — 제외 계정 빼고, 전체 / 방송 화면 보는 중 */
export function computeAudience(rows: Row[], ex: { kakaoIds?: Iterable<string>; names?: Iterable<string> }, nowMs: number): Audience {
  const since = nowMs - LIVE_AUDIENCE_WINDOW_MS;
  const fresh = rows.filter((r) => { const t = Date.parse(clean(r.last_seen_at)); return Number.isFinite(t) && t >= since; });
  const kept = excludePresenceRows(fresh, ex);
  const watchers = kept
    .filter((r) => isLiveWatchPath(r.path))
    .map((r) => ({ visitorKey: clean(r.visitor_key), nickname: clean(r.nickname), kakaoId: clean(r.kakao_id), lastSeenAt: clean(r.last_seen_at) }))
    .sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
  return { total: kept.length, watching: watchers.length, watchers };
}

let excludeCache: { at: number; kakaoIds: string[]; names: string[] } | null = null;
let audienceCache: { at: number; value: Audience } | null = null;

async function excludeList(sb: SupabaseClient, nowMs: number) {
  if (excludeCache && nowMs - excludeCache.at < EXCLUDE_CACHE_MS) return excludeCache;
  try {
    const ex = await loadExcludedCustomers(sb);
    excludeCache = { at: nowMs, kakaoIds: ex.kakaoIds, names: Array.from(ex.allNames) };
  } catch {
    excludeCache = { at: nowMs, kakaoIds: [], names: [] }; // 못 읽으면 관리자 화면 줄만 뺌
  }
  return excludeCache;
}

/** 지금 접속·방송 보는 중 — 8초 동안 같은 답(손님이 많아도 DB 읽기는 8초에 한 번) */
export async function readLiveAudience(sb: SupabaseClient, nowMs = Date.now()): Promise<Audience> {
  if (audienceCache && nowMs - audienceCache.at < COUNT_CACHE_MS) return audienceCache.value;
  const since = new Date(nowMs - LIVE_AUDIENCE_WINDOW_MS).toISOString();
  const selects = ["visitor_key, nickname, kakao_id, page_type, path, last_seen_at", "visitor_key, nickname, page_type, path, last_seen_at"];
  let rows: Row[] = [];
  let lastError = "";
  for (const sel of selects) {
    const { data, error } = await sb.from("visitor_presence").select(sel).gte("last_seen_at", since).limit(2000);
    if (!error) { rows = (data ?? []) as unknown as Row[]; lastError = ""; break; }
    lastError = error.message;
  }
  if (lastError) throw new Error(lastError);
  const ex = await excludeList(sb, nowMs);
  const value = computeAudience(rows, ex, nowMs);
  audienceCache = { at: nowMs, value };
  return value;
}

/** 관리자 목록 — 방송 보는 사람 닉네임·이름(회원 표에서 카카오 계정으로) */
export async function readLiveWatcherList(sb: SupabaseClient, nowMs = Date.now()) {
  const aud = await readLiveAudience(sb, nowMs);
  const ids = Array.from(new Set(aud.watchers.map((w) => w.kakaoId).filter(Boolean))).slice(0, 500);
  const names = new Map<string, { nick: string; name: string }>();
  if (ids.length) {
    const { data } = await sb.from("customers").select("kakao_id, youtube_nickname, customer_name").in("kakao_id", ids);
    for (const c of (data ?? []) as Row[]) names.set(clean(c.kakao_id), { nick: clean(c.youtube_nickname), name: clean(c.customer_name) });
  }
  return {
    total: aud.total,
    watching: aud.watching,
    rows: aud.watchers.map((w) => {
      const c = names.get(w.kakaoId);
      return { key: w.visitorKey.slice(-8), nickname: c?.nick || w.nickname, name: c?.name || "", member: Boolean(c), lastSeenAt: w.lastSeenAt };
    }),
  };
}
