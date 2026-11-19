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

/** Only an explicit deal-break record (or a positively identified legacy deal-break)
 * may be described to the customer. All other administrator types and notes
 * produce one identical generic public view; do not classify private memos. */
const GENERIC_CATEGORY = '사이트 이용 제한';
function categoryOf(raw:string,known:BlockReasonType|null):{kind:PublicBlockDetails['kind'];category:string}{
  if(known==='deal_break')return {kind:'deal_break',category:'거래파기(거파)'};
  // An explicit non-deal classification always wins over incidental words in memo.
  if(known!==null)return {kind:'other',category:GENERIC_CATEGORY};
  // Backward compatibility for older unstructured entries clearly saying 거파.
  // A note saying "거파 아님" is not a deal-break record.
  const denied=/(?:거파|거래\s*파기)\s*(?:아님|아니|아닌|해당\s*없|없음)/i.test(raw);
  const positive=/(?:거래\s*파기|(?:^|[\s,;:()[\]\/])거파(?:$|[\s,;:()[\]\/]))/i.test(raw);
  return positive&&!denied ? {kind:'deal_break',category:'거래파기(거파)'} : {kind:'other',category:GENERIC_CATEGORY};
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
  // SECURITY: even a future caller of this helper cannot recover a non-deal
  // reason, date, item or amount from the public projection.
  if(kind!=='deal_break')return {kind:'other',category:GENERIC_CATEGORY,dealDate:'',registeredDate:'',items:[],totalAmount:null,moreItems:0};
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
