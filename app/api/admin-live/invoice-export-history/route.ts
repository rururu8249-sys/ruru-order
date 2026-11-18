import {NextRequest,NextResponse} from 'next/server';
import {verifyAdminSessionFromRequest} from '@/lib/admin-auth';
import {getServiceClient} from '@/lib/youtube';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type InvoiceExportItem={product:string;option:string;qty:number};
type InvoiceExportOrder={groupId:string;orderNo:string;items:InvoiceExportItem[]};
const fail=(message:string,status=400)=>NextResponse.json({ok:false,message},{status});
const limitText=(s:unknown,max:number)=>String(s??'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max);

export async function GET(request:NextRequest){
  if(!await verifyAdminSessionFromRequest(request))return fail('관리자 로그인이 필요합니다.',401);
  const {data,error}=await getServiceClient().from('admin_invoice_export_history')
    .select('id,created_at,scope_kind,scope_label,export_mode,order_count,line_count,order_snapshot')
    .order('created_at',{ascending:false}).limit(50);
  if(error)return fail('송장 출력 이력을 불러오지 못했습니다.',503);
  return NextResponse.json({ok:true,history:data||[]},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:NextRequest){
  if(!await verifyAdminSessionFromRequest(request))return fail('관리자 로그인이 필요합니다.',401);
  if(request.headers.get('origin')!==request.nextUrl.origin)return fail('잘못된 요청 출처입니다.',403);
  const raw=await request.json().catch(()=>null);
  if(!raw||typeof raw!=='object')return fail('출력 기록을 확인할 수 없습니다.');
  const scope_kind=raw.scopeKind;
  const export_mode=raw.exportMode;
  if(!['current','selected','broadcast','shop'].includes(scope_kind)||!['new','paid','selected','all'].includes(export_mode))return fail('출력 범위가 올바르지 않습니다.');
  if(typeof raw.scopeLabel!=='string'||!limitText(raw.scopeLabel,180))return fail('출력 범위 이름이 없습니다.');
  if(!Array.isArray(raw.orders)||raw.orders.length<1||raw.orders.length>5000)return fail('출력한 주문 목록이 올바르지 않습니다.');
  const snapshot:InvoiceExportOrder[]=(raw.orders as unknown[]).map((order:unknown):InvoiceExportOrder=>{
    const o=(order&&typeof order==='object'&&!Array.isArray(order)?order:{}) as Record<string,unknown>;
    const items=Array.isArray(o.items)?o.items.slice(0,80):[];
    return {groupId:limitText(o.groupId,120),orderNo:limitText(o.orderNo,120),items:items.map((item:unknown)=>{
      const it=(item&&typeof item==='object'&&!Array.isArray(item)?item:{}) as Record<string,unknown>;
      return {product:limitText(it.product,150),option:limitText(it.option,100),qty:Math.min(10000,Math.max(1,Math.round(Number(it.qty)||1)))};
    })};
  });
  if(snapshot.some(o=>!o.groupId||!o.orderNo||!o.items.length))return fail('출력 상품 정보가 누락됐습니다.');
  const line_count=snapshot.reduce((n,o)=>n+o.items.length,0);
  const {data,error}=await getServiceClient().from('admin_invoice_export_history').insert({
    scope_kind,scope_label:limitText(raw.scopeLabel,180),export_mode,
    order_count:snapshot.length,line_count,order_snapshot:snapshot
  }).select('id,created_at').single();
  if(error)return fail('송장 출력 이력 저장에 실패했습니다.',503);
  return NextResponse.json({ok:true,event:data});
}
