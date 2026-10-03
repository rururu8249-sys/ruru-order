export type PickingBroadcastWindow = {
  id: string;
  started_at: string | null;
  ended_at: string | null;
};

export type PickingScopeRow = {
  id: string | number;
  broadcast_id?: string | null;
  created_at?: string | null;
  is_deleted?: boolean | null;
  [key: string]: unknown;
};

export type PickingScopeSource<T extends PickingScopeRow = PickingScopeRow> = {
  getBroadcasts(ids: readonly string[]): Promise<PickingBroadcastWindow[]>;
  getOrdersByBroadcastIds(ids: readonly string[], from: number, to: number): Promise<T[]>;
  getOrdersByTimeRange(startedAt: string, endedAt: string, from: number, to: number): Promise<T[]>;
};

export function parsePickingWorkspaceRequest(input: unknown): { broadcastIds: string[] } {
  const value = input as { broadcastIds?: unknown } | null;
  if (!value || !Array.isArray(value.broadcastIds)) throw new Error("방송 선택값이 올바르지 않습니다.");
  const broadcastIds = Array.from(new Set(value.broadcastIds.map((id) => String(id ?? "").trim()).filter(Boolean)));
  if (broadcastIds.length > 31) throw new Error("방송은 최대 31개까지 선택할 수 있습니다.");
  return { broadcastIds };
}

export function kstDayStartIso(value: string | Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("날짜가 올바르지 않습니다.");
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
  return new Date(`${dateKey}T00:00:00+09:00`).toISOString();
}

export function mergePickingWorkspaceRows<T extends PickingScopeRow>(...groups: readonly (readonly T[])[]): T[] {
  const byId = new Map<string, T>();
  for (const row of groups.flat()) {
    if (row.is_deleted === true) continue;
    const key = String(row.id);
    if (!byId.has(key)) byId.set(key, row);
  }
  return [...byId.values()];
}

async function readAllPages<T>(reader: (from: number, to: number) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const page = await reader(from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function loadPickingWorkspaceRows<T extends PickingScopeRow>(
  source: PickingScopeSource<T>,
  broadcastIds: readonly string[],
): Promise<T[]> {
  const ids = parsePickingWorkspaceRequest({ broadcastIds }).broadcastIds;
  if (ids.length === 0) return [];

  const [broadcasts, directRows] = await Promise.all([
    source.getBroadcasts(ids),
    readAllPages((from, to) => source.getOrdersByBroadcastIds(ids, from, to)),
  ]);
  const idSet = new Set(ids);
  const fallbackGroups = await Promise.all(broadcasts.map((broadcast) => {
    if (!broadcast.started_at) return Promise.resolve([] as T[]);
    const end = broadcast.ended_at || new Date().toISOString();
    return readAllPages((from, to) => source.getOrdersByTimeRange(broadcast.started_at as string, end, from, to));
  }));

  const byId = new Map<string, T>();
  for (const row of [...directRows, ...fallbackGroups.flat()]) {
    if (row.is_deleted === true) continue;
    const rowBroadcast = String(row.broadcast_id || "").trim();
    if (rowBroadcast && !idSet.has(rowBroadcast)) continue;
    byId.set(String(row.id), row);
  }
  return [...byId.values()];
}
