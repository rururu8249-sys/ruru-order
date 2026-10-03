import {NextRequest, NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {verifyAdminSessionFromRequest} from '@/lib/admin-auth';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}});
function db(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('관리자 DB 연결 설정이 없습니다.');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
const clean=(value:unknown)=>String(value??'').trim();
const digits=(value:unknown)=>clean(value).replace(/\D/g,'');
export async function POST(req:NextRequest){
 if(!await verifyAdminSessionFromRequest(req))return json({ok:false,message:'관리자 로그인이 필요합니다.'},401);
 try{
  const body=await req.json();
  if(!body||typeof body.winnerId!=='string'||!uuid.test(body.winnerId)||Object.keys(body).some(k=>k!=='winnerId'))return json({ok:false,message:'당첨 ID만 전달해 주세요.'},400);
  const client=db();
  const {data,error}=await client.rpc('admin_register_event_custom_gift',{p_winner_id:body.winnerId});
  if(error||!data||typeof data.ok!=='boolean')return json({ok:false,message:'경품 저장 결과를 확인하지 못했습니다. 같은 당첨 건으로 재시도해 주세요.'},500);
  if(!data.ok)return json(data,data.code==='WINNER_NOT_FOUND'?404:409);

  const [{data:winner},{data:order}]=await Promise.all([
   client.from('event_roulette_winners').select('nickname').eq('id',body.winnerId).maybeSingle(),
   client.from('orders').select('customer_name,customer_phone,phone,kakao_id,youtube_nickname').eq('id',data.orderId).maybeSingle(),
  ]);
  const nickname=clean(winner?.nickname)||clean(order?.youtube_nickname)||null;
  const phone=digits(order?.customer_phone||order?.phone);
  const kakao=clean(order?.kakao_id);
  return json({
   ...data,
   nickname,
   customerName:clean(order?.customer_name)||null,
   customerRef:nickname&&(phone||kakao)?{kakao,phone,nick:nickname}:null,
  });
 }catch{return json({ok:false,message:'경품 등록에 실패했습니다. 같은 당첨 건으로 재확인해 주세요.'},500);}
}
export async function GET(req:NextRequest){
 if(!await verifyAdminSessionFromRequest(req))return json({ok:false,message:'관리자 로그인이 필요합니다.'},401);
 const winnerId=req.nextUrl.searchParams.get('winnerId')||'';
 if(!uuid.test(winnerId))return json({ok:false,message:'잘못된 당첨 ID입니다.'},400);
 try{
  const {data,error}=await db().from('event_custom_gift_receipts').select('winner_id,order_id,order_group_id,lookup_code,product_name').eq('winner_id',winnerId).maybeSingle();
  if(error)return json({ok:false,message:'경품 처리 기록 조회 실패'},500);
  return json({ok:true,status:data?'added':'pending',receipt:data||undefined});
 }catch{return json({ok:false,message:'경품 처리 상태를 확인하지 못했습니다.'},500);}
}
