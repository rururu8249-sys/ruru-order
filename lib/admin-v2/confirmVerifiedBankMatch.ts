import { canAutoMatchDepositDate } from './paymentMatchDateGuard';

export async function confirmVerifiedBankMatch(db: any, orders: Record<string, any>[], deposit: Record<string, any>, groupId: string) {
  if (!deposit || !canAutoMatchDepositDate(orders, deposit)) return { error: { message: '은행 거래 날짜 미확인 또는 주문 이전 입금' } };
  // Snapshot every available matching input, including nulls. Rechecked under row locks.
  const fields = ['id', 'created_at', 'order_group_id', 'youtube_nickname', 'customer_name', 'final_amount',
    'adjusted_total_price', 'total_price', 'point_used_amount', 'payment_method', 'deposit_confirmed_at',
    'admin_order_status_v2', 'order_manage_status', 'is_deleted', 'is_test_order', 'exclude_from_payment_match'];
  const snapshot = (row: Record<string, any>, keys: string[]) => Object.fromEntries(keys.filter(key => key in row && row[key] !== undefined).map(key => [key, row[key]]));
  const { data, error } = await db.rpc('confirm_verified_bank_match', {
    p_order_ids: orders.map(order => Number(order.id)), p_group_id: groupId,
    p_deposit_id: Number(deposit.id), p_amount: Number(deposit.amount),
    p_expected_orders: orders.map(order => snapshot(order, fields)),
    p_expected_deposit: snapshot(deposit, ['id', 'amount', 'depositor_name', 'deposited_at', 'confirmed_at', 'match_order_group_id', 'match_customer_id', 'match_status']),
  });
  return { error: error || (data?.ok ? null : { message: data?.reason || '입금확인 조건이 바뀌어 중단했습니다.' }) };
}
