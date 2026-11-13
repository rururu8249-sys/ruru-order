// lib/liveAudienceServer.ts
// [2026-11-12 사장님 22:34] 방송 화면 시청자 수 — «방송 화면을 지금 열어 둔 사람» / «사이트 전체 접속» 나눠 세기 + 관리자용 목록.
//   기존 접속 신호(visitor_presence, 30초마다)만 읽는다. 쓰기 0. 주문·입금·포인트 무접촉.
//   «지금» = 마지막 신호가 75초 안(30초 신호를 한 번 놓쳐도 유지, 두 번 놓치면 빠짐).
//   관리자 화면 줄·접속 기록 「제외 계정」(사장님 계정)은 숫자·목록에서 뺀다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isLiveWatchPath } from "@/lib/presenceActivity";
import { excludePresenceRows } from "@/lib/presenceLive";
import { loadExcludedCustomers } from "@/lib/visitStatsExclude";
import { AUTO_TEST_KAKAO_ID } from "@/lib/autoTestOrder";

export const LIVE_AUDIENCE_WINDOW_MS = 75_000;
const COUNT_CACHE_MS = 2_000;
const EXCLUDE_CACHE_MS = 60_000;

type Row = Record<string, unknown>;
export type AudienceRow = { visitorKey: string; nickname: string; kakaoId: string; lastSeenAt: string; staff: boolean; automation: boolean };
export type Audience = { total: number; watching: number; watchers: AudienceRow[]; others: AudienceRow[]; testSite: number; testWatching: number; testRows: AudienceRow[] };

const clean = (v: unknown) => String(v ?? "").trim();

/** 순수 계산(테스트 대상) — 전체 / 방송 화면 보는 중 / 사이트만.
 *  [2026-11-13 사장님 12:04] 사장님 계정(제외 계정)도 실제로 접속해 있으니 숫자에 넣음 — 대신 staff 표시(목록에서 사장님만 봄).
 *  관리자 화면(/admin-live) 줄은 쇼핑몰 접속이 아니라 그대로 뺌. */
export function computeAudience(rows: Row[], ex: { kakaoIds?: Iterable<string>; names?: Iterable<string> }, nowMs: number, validAutomation:ReadonlyMap<string,string>=new Map()): Audience {
  const since = nowMs - LIVE_AUDIENCE_WINDOW_MS;
  const fresh0 = rows.filter((r) => { const t = Date.parse(clean(r.last_seen_at)); return Number.isFinite(t) && t >= since && clean(r.page_type) !== "admin"; });
  const isTest = (r: Row) => clean(r.kakao_id) === AUTO_TEST_KAKAO_ID || Boolean(r.automation_session_id) || clean(r.visitor_key).startsWith('live-auto:');
  const fresh = fresh0.filter(r=>!isTest(r)||(Boolean(r.automation_session_id)&&validAutomation.get(clean(r.visitor_key))===clean(r.automation_session_id)));
  const testFresh = fresh.filter(isTest);
  const customers = new Set(excludePresenceRows(fresh, ex));
  const toRow = (r: Row): AudienceRow => ({ visitorKey: clean(r.visitor_key), nickname: clean(r.nickname), kakaoId: clean(r.kakao_id), lastSeenAt: clean(r.last_seen_at), staff: !isTest(r) && !customers.has(r), automation: isTest(r) });
  const byRecent = (a: AudienceRow, b: AudienceRow) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1);
  const watchers = fresh.filter((r) => isLiveWatchPath(r.path)).map(toRow).sort(byRecent);
  const others = fresh.filter((r) => !isLiveWatchPath(r.path)).map(toRow).sort(byRecent);
  const testRows = testFresh.map(toRow).sort(byRecent);
  return { total: fresh.length, watching: watchers.length, watchers, others, testSite: testFresh.length, testWatching: testFresh.filter((r) => isLiveWatchPath(r.path)).length, testRows };
}

let excludeCache: { at: number; kakaoIds: string[]; names: string[] } | null = null;
let audienceCache: { at: number; broadcast:string; value: Audience } | null = null;

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
export async function readLiveAudience(sb: SupabaseClient, nowMs = Date.now(), broadcast=''): Promise<Audience> {
  if (audienceCache && audienceCache.broadcast===broadcast && nowMs - audienceCache.at < COUNT_CACHE_MS) return audienceCache.value;
  const since = new Date(nowMs - LIVE_AUDIENCE_WINDOW_MS).toISOString();
  const selects = ["visitor_key, nickname, kakao_id, page_type, path, last_seen_at, automation_session_id"];
  let rows: Row[] = [];
  let lastError = "";
  for (const sel of selects) {
    const { data, error } = await sb.from("visitor_presence").select(sel).gte("last_seen_at", since).limit(2000);
    if (!error) { rows = (data ?? []) as unknown as Row[]; lastError = ""; break; }
    lastError = error.message;
  }
  if (lastError) throw new Error(lastError);
  const ex = await excludeList(sb, nowMs);
  const valid=new Map<string,string>();
  if(rows.some(r=>r.automation_session_id)){
    let query=sb.from('live_automation_campaigns').select('id,broadcasts!inner(status,is_deleted)').eq('viewers_enabled',true).eq('broadcasts.status','ON').neq('broadcasts.is_deleted',true);
    if(broadcast)query=query.eq('broadcast_id',broadcast);
    const campaigns=await query;
    if(campaigns.error)throw Error(campaigns.error.message);
    const ids=(campaigns.data||[]).map(c=>c.id);
    if(ids.length){
      const sessions=await sb.from('live_automation_sessions').select('id,visitor_key').in('campaign_id',ids).eq('watching',true).is('stopped_at',null).gt('leave_at',new Date(nowMs).toISOString()).gte('last_ack_at',since);
      if(sessions.error)throw Error(sessions.error.message);
      for(const s of sessions.data||[])valid.set(s.visitor_key,s.id);
    }
  }
  const value = computeAudience(rows, ex, nowMs,valid);
  audienceCache = { at: nowMs,broadcast, value };
  return value;
}

/** 관리자 목록 — 방송 보는 사람 / 사이트만 접속한 사람(닉네임·이름은 회원 표에서 카카오 계정으로).
 *  showStaff 가 아니면 사장님 계정 표시를 안 줌(채팅 관리자에게는 그냥 손님처럼 보임). */
export async function readLiveWatcherList(sb: SupabaseClient, nowMs = Date.now(), showStaff = false, showTest = false) {
  const aud = await readLiveAudience(sb, nowMs);
  const all = [...aud.watchers, ...aud.others];
  const ids = Array.from(new Set(all.map((w) => w.kakaoId).filter(Boolean))).slice(0, 500);
  const names = new Map<string, { nick: string; name: string }>();
  if (ids.length) {
    const { data } = await sb.from("customers").select("kakao_id, youtube_nickname, customer_name").in("kakao_id", ids);
    for (const c of (data ?? []) as Row[]) names.set(clean(c.kakao_id), { nick: clean(c.youtube_nickname), name: clean(c.customer_name) });
  }
  const view = (w: AudienceRow) => {
    const c = w.kakaoId===AUTO_TEST_KAKAO_ID?undefined:names.get(w.kakaoId);
    return { key: w.visitorKey.slice(-8), nickname: c?.nick || w.nickname, name: c?.name || "", member: Boolean(c), lastSeenAt: w.lastSeenAt, staff: showStaff && w.staff, test: showTest && w.automation };
  };
  const base = { total: aud.total, watching: aud.watching, rows: aud.watchers.map(view), others: aud.others.map(view) };
  // Same verified count/list; only authorized operators receive the test label.
  return base;
}
