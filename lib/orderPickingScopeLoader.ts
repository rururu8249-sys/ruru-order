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
