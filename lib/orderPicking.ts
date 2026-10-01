// Completion has one source of truth. Historical collectedAt is not completion.
export function pickingProgress(items: readonly { qty: unknown; pickedAt?: unknown; collectedAt?: unknown }[]) {
  let total = 0, got = 0;
  for (const item of items) {
    const qty = Math.max(0, Number(item.qty) || 0);
    total += qty;
    if (item.pickedAt) got += qty;
  }
  return { total, got };
}

type PickingClient = { from(table: string): { update(values: { picked_at: string | null }): {
  in(column: string, ids: number[]): { select(columns: string): PromiseLike<{
    data: { id: number; picked_at: string | null }[] | null; error: unknown;
  }> };
} } };

export async function savePicking(client: PickingClient, ids: readonly string[], picked: boolean, now = new Date().toISOString()) {
  const nums = [...new Set(ids.map(Number))];
  if (nums.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('잘못된 주문 ID입니다.');
  const value = picked ? now : null;
  for (let i = 0; i < nums.length; i += 500) {
    const chunk = nums.slice(i, i + 500);
    const { data, error } = await client.from('orders').update({ picked_at: value }).in('id', chunk).select('id, picked_at');
    if (error) throw error;
    const saved = new Map((data || []).map(row => [row.id, Boolean(row.picked_at)]));
    if (saved.size !== chunk.length || chunk.some(id => saved.get(id) !== picked)) {
      throw new Error('챙김 저장을 확인하지 못했습니다. 실제 상태를 다시 확인해 주세요.');
    }
  }
}
