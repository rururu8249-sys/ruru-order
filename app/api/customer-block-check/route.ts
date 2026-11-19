import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CHAT_SESSION_COOKIE, verifyChatIdentity } from '@/lib/liveChatSession';
import { canExposeBlockDetails, publicBlockDetails } from '@/lib/customerBlockPublic';

/** A public endpoint may reveal the blocked/not-blocked decision already used by the
 * ordering flow. Private reason, purchased items and amounts require the signed,
 * HttpOnly Kakao identity cookie and server-verified phone ownership.
 */
const clean=(x:unknown)=>String(x??'').trim();
const digitsOnly=(x:unknown)=>clean(x).replace(/\D/g,'');
const isBlockedValue=(x:unknown)=>x===true||x==='true'||x==='Y'||x==='y'||x===1||x==='1';
const missingTable=(e:{code?:unknown;message?:unknown}|null)=>{
  const code=String(e?.code||'');const message=String(e?.message||'');
  return code==='42P01'||message.includes('customer_phone_blocks')||message.includes('does not exist');
};
function variants(phone:string):string[]{
  const d=digitsOnly(phone),values=new Set<string>();
  if(d)values.add(d);
  if(d.length===11)values.add(`${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`);
  if(d.length===9&&d.startsWith('02'))values.add(`${d.slice(0,2)}-${d.slice(2,5)}-${d.slice(5)}`);
  if(d.length===10){
    values.add(`${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`);
    if(d.startsWith('02'))values.add(`${d.slice(0,2)}-${d.slice(2,6)}-${d.slice(6)}`);
  }
  return [...values];
}
const respond=(body:Record<string,unknown>,status=200)=>NextResponse.json(body,{
  status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'},
});
function adminDb(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLE;
  if(!url||!key)return null;
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}

type PhoneBlockRow={phone?:string;reason?:string;is_blocked?:unknown;created_at?:string|null};
type CustomerRow={customer_phone?:string;kakao_id?:string|null;is_blocked?:unknown;block_reason?:string|null;blocked_at?:string|null};

export async function GET(request:NextRequest){
  const sb=adminDb();
  if(!sb)return respond({ok:false,blocked:false,message:'차단 정보를 확인할 수 없습니다.'},500);
  const phone=digitsOnly(request.nextUrl.searchParams.get('phone'));
  if(phone.length<9||phone.length>11)return respond({ok:true,blocked:false});

  // The cookie is signed by the Kakao OAuth callback, not taken from localStorage,
  // query parameters or a caller-provided Kakao ID.
  const verified=verifyChatIdentity(request.cookies.get(CHAT_SESSION_COOKIE)?.value);

  const [direct, customer] = await Promise.all([
    sb.from('customer_phone_blocks').select('phone,reason,is_blocked,created_at').eq('phone',phone).eq('is_blocked',true).limit(1),
    sb.from('customers').select('customer_phone,kakao_id,is_blocked,block_reason,blocked_at').in('customer_phone',variants(phone)).limit(20),
  ]);
  if(direct.error&&!missingTable(direct.error))return respond({ok:false,blocked:false,message:'차단 확인 중 오류가 발생했습니다.'},500);
  if(customer.error)return respond({ok:false,blocked:false,message:'차단 확인 중 오류가 발생했습니다.'},500);

  const directBlock=((direct.data||[]) as PhoneBlockRow[]).find(x=>isBlockedValue(x.is_blocked));
  const rows=(customer.data||[]) as CustomerRow[];
  const customerBlock=rows.find(x=>isBlockedValue(x.is_blocked));
  const blocked=Boolean(directBlock||customerBlock);
  if(!blocked)return respond({ok:true,blocked:false,source:'none'});

  const mayView=canExposeBlockDetails(phone,verified,rows);
  const reason=clean(directBlock?.reason)||clean(customerBlock?.block_reason);
  const registeredAt=directBlock?.created_at||customerBlock?.blocked_at||'';
  const details=mayView?publicBlockDetails(reason,registeredAt):null;
  // Never echo raw administrator notes, even to a verified customer.
  return respond({
    ok:true,blocked:true,
    reason:details?.category||'',
    details,
    source:directBlock?'phone_block':'customer',
    message:'현재 사이트 이용이 제한되어 있습니다.',
  });
}
