/** Viewer-only filter. Never suppress a customer's payment question by keyword. */
export function includeChatViewMessage(message: {body: string; badge?: string | null; botRef?: string}): boolean {
 if (message.badge !== 'bot') return true;
 const ref = message.botRef || '';
 if (/^(?:c|card|paid):/.test(ref)) return false;
 if (/^o:/.test(ref)) return true;
 const body = message.body.replace(/\s+/g, ' ').trim();
 // Exact system templates, including messages mirrored to YouTube without bot_ref.
 if (/장바구니 (?:담음|담김)/.test(body)) return false;
 if (/(?:결제 ?완료|입금 ?확인|입금 ?완료|카드 ?결제 (?:링크|요청))/.test(body) && /(?:님|^💳|^💗|^✅)/u.test(body)) return false;
 return true;
}

/** /chat-view overlay and red unread badge only. Keep the actual site-chat list unchanged. */
export function includeChatViewNoticeMessage(message: {body: string; badge?: string | null; botRef?: string}): boolean {
  if (!includeChatViewMessage(message)) return false;
  if (message.badge !== 'bot') return true; // User-written messages are never suppressed by keywords.
  const ref = String(message.botRef || '').trim().toLowerCase();
  // Persisted bot-ref kinds (DB verified): cart, order submit, card and payment notices.
  if (/^(?:c|o|card|paid|ap|auto-paid|auto-card|auto-order):/.test(ref)) return false;
  // Legacy/mirrored notice without a usable botRef: only automated bot messages.
  const body = String(message.body || '').replace(/\s+/g, ' ').trim();
  if (/(?:장바구니.{0,16}(?:담음|담김|담았)|주문서.{0,16}(?:제출|접수|완료)|주문.{0,12}(?:접수|완료)|카드 ?결제.{0,16}(?:완료|요청|링크)|카결.{0,12}(?:완료|알림)|입금.{0,12}(?:확인|완료))/.test(body)) return false;
  return true;
}
