/** Viewer-only filter. Never suppress a customer's payment question by keyword. */
export function includeChatViewMessage(message: {body: string; badge?: string | null; botRef?: string}): boolean {
 if (message.badge !== 'bot') return true;
 const ref = message.botRef || '';
 if (/^(?:c|card|paid):/.test(ref)) return false;
 if (/^o:/.test(ref)) return true;
 const body = message.body.replace(/\s+/g, ' ').trim();
 // Exact system templates, including messages mirrored to YouTube without bot_ref.
 if (/장바구니 (?:담음|담김)/.test(body)) return false;
 if (/(?:결제 완료|입금 확인|입금확인|카드 ?결제 (?:링크|요청))/.test(body) && /(?:님|^💳|^💗|^✅)/u.test(body)) return false;
 return true;
}
