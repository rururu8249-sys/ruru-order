/** Customer-safe block details: NEVER publish freeform internal operator memos.
 * Only a Kakao-authenticated, server-verified customer's own block may use this projection.
 * All functions are pure and perform no DB writes.
 */
import { parseBlockReason, type BlockReasonType } from './customerBlockReason';

export type PublicBlockItem = { product: string; amount: number | null };
export type PublicBlockDetails = {
  kind: BlockReasonType | 'other';
  category: string;
  dealDate: string;
  registeredDate: string;
  items: PublicBlockItem[];
  totalAmount: number | null;
  moreItems: number;
};

const CATEGORIES: Partial<Record<BlockReasonType, string>> = {
  deal_break: '거래파기(거파)',
  unpaid: '반복 미입금',
  refund_abuse: '반품·환불 관련 이용 제한',
  harassment: '이용 중 부적절한 언행',
  fake_info: '주문정보 확인 필요',
};

function categoryOf(raw: string, known: BlockReasonType | null): {kind:PublicBlockDetails['kind'];category:string} {
  if (known && CATEGORIES[known]) return { kind: known, category: CATEGORIES[known]! };
  // Backward compatibility: historical free text. Never send the original text.
  if (/거파|거래\s*파기|거래\s*취소\s*반복/i.test(raw)) return {kind:'deal_break',category:'거래파기(거파)'};
  if (/미입금|입금\s*지연\s*반복|미결제\s*반복/i.test(raw)) return {kind:'unpaid',category:'반복 미입금'};
  if (/반품|환불/.test(raw)) return {kind:'refund_abuse',category:'반품·환불 관련 이용 제한'};
  if (/욕설|폭언|악성|진상|비방/.test(raw)) return {kind:'harassment',category:'이용 중 부적절한 언행'};
  if (/허위|가짜\s*(번호|주소)/.test(raw)) return {kind:'fake_info',category:'주문정보 확인 필요'};
  return {kind:'other',category:'이용 제한 사유 확인 필요'};
}

function koreanDate(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const time = Date.parse(raw);
  if (!Number.isFinite(time)) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(time));
  const values = Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${values.year}.${values.month}.${values.day}`;
}

function dealDateOf(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const dt = new Date(`${raw}T00:00:00.000Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0,10)===raw ? raw.replace(/-/g,'.') : '';
}

const moneySuffix = /\s+(\d[\d,]*)\s*원\s*$/;
function publicItem(raw: string): PublicBlockItem | null {
  const text = String(raw||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,180);
  if (!text) return null;
  const m = moneySuffix.exec(text);
  const amount = m ? Number(m[1].replace(/,/g,'')) : NaN;
  const product = (m ? text.slice(0,m.index).trim() : text).slice(0,130);
  if (!product) return null;
  return {product,amount: Number.isSafeInteger(amount)&&amount>=0&&amount<=100_000_000?amount:null};
}

/** Verified identity only; caller MUST have validated an HttpOnly signed Kakao cookie. */
export function canExposeBlockDetails(
  requestedPhone: string,
  identity: {sub:string;phone:string}|null,
  matchingCustomers: readonly {customer_phone?:unknown;kakao_id?:unknown}[],
): boolean {
  if (!identity || !/^\d+$/.test(identity.sub)) return false;
  const requested = String(requestedPhone||'').replace(/\D/g,'');
  if (requested.length<9 || requested.length>11) return false;
  const verifiedProviderPhone = String(identity.phone||'').replace(/\D/g,'');
  if (verifiedProviderPhone.length>=9 && verifiedProviderPhone===requested) return true;
  return matchingCustomers.some(c=> String(c.kakao_id||'').trim()===identity.sub &&
    String(c.customer_phone||'').replace(/\D/g,'')===requested);
}

export function publicBlockDetails(reason: unknown, registeredAt: unknown): PublicBlockDetails {
  const raw = String(reason??'').slice(0,12000);
  const parsed = parseBlockReason(raw);
  const {kind,category}=categoryOf(raw,parsed.type);
  const items = parsed.items.slice(0,16).map(publicItem).filter((item):item is PublicBlockItem=>item!==null);
  const complete = items.length>0 && items.length===parsed.items.length && items.every(x=>x.amount!==null);
  return {
    kind,
    category,
    dealDate: kind==='deal_break'?dealDateOf(parsed.dealDate):'',
    registeredDate: koreanDate(registeredAt),
    items,
    totalAmount:complete?items.reduce((sum,it)=>sum+(it.amount||0),0):null,
    moreItems:Math.max(0,parsed.items.length-items.length),
  };
}
