// lib/autoTestViewers.ts
// [2026-11-13 사장님 「테스트 시청자 수가 늘었다 빠졌다 — 체류 3분~1시간 랜덤」] 가상 테스트 시청자.
//   방송(ON) 중 자동 테스트(주문 또는 채팅)가 켜져 있으면 1분마다: 머문 시간이 끝난 사람은 나가고, 가끔 새 사람이 들어옴.
//   손님에게 보이는 시청자 수에는 넣지 않는다(실제 사람만) — 관리자·채팅뷰어에서만 「테스트 N명」으로 따로.
//   저장 = settings 한 줄(auto_test_viewers_v1). 실제 접속 기록(visitor_presence)·주문·돈 무접촉.
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTO_TEST_NICKNAME_POOL } from "@/lib/autoTestNicknames";

export const AUTO_TEST_VIEWERS_KEY = "auto_test_viewers_v1";
export type TestViewer = { id: string; nick: string; join: number; leave: number; live: boolean };
type Saved = { bc: string; list: TestViewer[] };

const DWELL_MIN = [5, 10, 30, 60, 120]; // [2026-11-13 14:36] 5·10·30·60·120분 중 랜덤
const MAX_CONCURRENT = 6;

export function parseTestViewers(raw: unknown): Saved {
  try {
    const o = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!o || typeof o !== "object") return { bc: "", list: [] };
    const list = Array.isArray((o as Saved).list) ? (o as Saved).list.filter((v) => v && typeof v.id === "string" && Number.isFinite(v.join) && Number.isFinite(v.leave)) : [];
    return { bc: String((o as Saved).bc ?? ""), list };
  } catch { return { bc: "", list: [] }; }
}

/** 순수 계산(테스트 대상) — 나갈 사람 빼고, 들어올 사람 넣기 */
export function stepTestViewers(prev: Saved, bc: string, on: boolean, now: number, rand = Math.random): Saved {
  if (!on || !bc) return { bc, list: [] };
  let list = prev.bc === bc ? prev.list.filter((v) => v.leave > now) : [];
  // 1분마다 들어올 확률 — 사람이 적을수록 잘 들어옴
  const chance = list.length === 0 ? 0.9 : list.length < 3 ? 0.5 : list.length < MAX_CONCURRENT ? 0.25 : 0;
  if (rand() < chance) {
    const base = DWELL_MIN[Math.floor(rand() * DWELL_MIN.length)];
    const dwell = Math.round(base * (0.8 + rand() * 0.4) * 60_000);
    const used = new Set(list.map((v) => v.nick));
    const free = AUTO_TEST_NICKNAME_POOL.filter((n) => !used.has(n));
    const nick = free[Math.floor(rand() * free.length)] || `손님${Math.floor(rand() * 900) + 100}`;
    list = [...list, { id: `${now.toString(36)}${Math.floor(rand() * 1e6).toString(36)}`, nick, join: now, leave: now + dwell, live: rand() < 0.75 }];
  }
  return { bc, list };
}

export function currentTestViewers(saved: Saved, bc: string, now = Date.now()): TestViewer[] {
  return saved.bc === bc ? saved.list.filter((v) => v.join <= now && v.leave > now) : [];
}

export async function readTestViewers(sb: SupabaseClient, bc: string, now = Date.now()): Promise<TestViewer[]> {
  try {
    const { data } = await sb.from("settings").select("value").eq("key", AUTO_TEST_VIEWERS_KEY).maybeSingle();
    return currentTestViewers(parseTestViewers((data as { value?: unknown } | null)?.value), bc, now);
  } catch { return []; }
}

/** 1분 cron 이 부름 — 켜짐이 아니거나 방송이 바뀌면 비움 */
export async function tickTestViewers(sb: SupabaseClient, bc: string, on: boolean, now = Date.now()): Promise<number> {
  const { data } = await sb.from("settings").select("value").eq("key", AUTO_TEST_VIEWERS_KEY).maybeSingle();
  const prev = parseTestViewers((data as { value?: unknown } | null)?.value);
  const next = stepTestViewers(prev, bc, on, now);
  const value = JSON.stringify(next);
  if (value !== JSON.stringify(prev)) {
    if (data) await sb.from("settings").update({ value }).eq("key", AUTO_TEST_VIEWERS_KEY);
    else await sb.from("settings").insert({ key: AUTO_TEST_VIEWERS_KEY, value });
  }
  return currentTestViewers(next, bc, now).length;
}
