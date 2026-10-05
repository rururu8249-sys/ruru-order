// Never substitute import time or time-of-day for the actual bank transaction date.
export function canAutoMatchDepositDate(orders: Record<string, any>[], deposit: Record<string, any>, now = Date.now()) {
  if (!orders.length || !deposit.deposited_at) return false;
  const received = Date.parse(String(deposit.deposited_at));
  if (!Number.isFinite(received) || received > now) return false;
  return orders.every(order => {
    const ordered = Date.parse(String(order.created_at || ''));
    return Number.isFinite(ordered) && ordered <= received;
  });
}
