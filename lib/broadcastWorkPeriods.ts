export type BroadcastWorkPeriod = {
  id: string;
  broadcast_id: string;
  started_at: string;
  ended_at: string | null;
  source: "initial" | "resume";
};

export function periodAt(when: string | null | undefined, periods: readonly BroadcastWorkPeriod[]): BroadcastWorkPeriod | null {
  if (!when) return null;
  const ms = Date.parse(when);
  if (!Number.isFinite(ms)) return null;
  return periods.find(p => {
    const start = Date.parse(p.started_at);
    const end = p.ended_at ? Date.parse(p.ended_at) : Infinity;
    return Number.isFinite(start) && (Number.isFinite(end) || end === Infinity)
      && ms >= start && ms < end;
  }) || null;
}

export function periodName(p: BroadcastWorkPeriod, periods: readonly BroadcastWorkPeriod[]): string {
  const index = periods.findIndex(x => x.id === p.id);
  return `${Math.max(1,index+1)}차`;
}

export function periodTimeLabel(p: BroadcastWorkPeriod): string {
  const t = Date.parse(p.started_at);
  return Number.isFinite(t) ? new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit", hour12:false
  }).format(new Date(t)) : "시간 확인 필요";
}

export function ordersForPeriod<T extends {createdAt?:string|null; submittedAt?:string|null}>(orders: readonly T[], period: BroadcastWorkPeriod): T[] {
  return orders.filter(o => periodAt(o.createdAt || o.submittedAt, [period]) !== null);
}
