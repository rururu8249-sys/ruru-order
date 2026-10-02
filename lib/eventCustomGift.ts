export function normalizeCustomGiftName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 40) {
    throw new Error('경품 상품명을 1~40자로 입력해 주세요.');
  }
  return value.trim();
}

export type EventCustomGiftResult = {
  ok: true; status: 'added' | 'already_added'; winnerId: string; orderId: string;
  orderGroupId: string | null; lookupCode: string | null; productName: string;
  targetState: 'active' | 'removed' | 'canceled';
} | { ok: false; code: string; message: string };
