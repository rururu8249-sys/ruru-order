// [2026-11-25 사장님 「한나무드 방송 종료 카운트다운 따라 하기」] 방송 종료 예정 시각 — 손님 화면 방송 상자에
//   「방송 종료까지 1시간 20분 5초 · 입금은 방송 종료 전에 부탁드려요」. settings 한 키(live_end_plan_v1).
//   방송 id 와 같이 저장해서, 방송이 바뀌면 저절로 안 보인다. 표시만(돈·주문·방송 상태 무관).
export const LIVE_END_PLAN_KEY = "live_end_plan_v1";

export type LiveEndPlan = { broadcastId: string; endAt: string };

export function parseLiveEndPlan(raw: unknown): LiveEndPlan | null {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    const broadcastId = String((v as { broadcastId?: unknown })?.broadcastId ?? "").trim();
    const endAt = String((v as { endAt?: unknown })?.endAt ?? "").trim();
    if (!broadcastId || !endAt || !Number.isFinite(new Date(endAt).getTime())) return null;
    return { broadcastId, endAt };
  } catch { return null; }
}

export function serializeLiveEndPlan(plan: LiveEndPlan): string {
  return JSON.stringify({ broadcastId: plan.broadcastId, endAt: plan.endAt });
}

/** 이 방송의 종료 예정 시각(ms). 다른 방송이거나 없으면 null. */
export function liveEndAtFor(plan: LiveEndPlan | null, broadcastId: string | null | undefined): number | null {
  if (!plan || !broadcastId || plan.broadcastId !== String(broadcastId)) return null;
  const t = new Date(plan.endAt).getTime();
  return Number.isFinite(t) ? t : null;
}

/** 「HH:MM」(한국 시각) → 지금 이후 가장 가까운 그 시각. 이미 지났으면 다음 날(자정 넘는 방송). */
export function nextKstTime(hhmm: string, now: number = Date.now()): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!m) return null;
  const h = Number(m[1]); const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  const kstNow = new Date(now + 9 * 3600_000);
  let t = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), h, mi) - 9 * 3600_000;
  if (t <= now) t += 24 * 3600_000;
  return new Date(t).toISOString();
}

/** 남은 시간 글자 — 「1시간 20분 5초」 · 1시간 안이면 「20분 5초」 · 지났으면 "" */
export function remainText(endAt: number, now: number = Date.now()): string {
  const s = Math.floor((endAt - now) / 1000);
  if (s <= 0) return "";
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
  return h > 0 ? `${h}시간 ${m}분 ${sec}초` : m > 0 ? `${m}분 ${sec}초` : `${sec}초`;
}

/** 관리자 표시용 「오늘 23:30」/「내일 01:00」 (한국 시각) */
export function kstLabel(endAt: string, now: number = Date.now()): string {
  const t = new Date(endAt).getTime();
  const d = new Date(t + 9 * 3600_000); const n = new Date(now + 9 * 3600_000);
  const day = d.getUTCDate() === n.getUTCDate() && d.getUTCMonth() === n.getUTCMonth() ? "오늘" : "내일";
  return `${day} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
