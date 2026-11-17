import {NextRequest, NextResponse} from 'next/server';
import {verifyAdminSessionFromRequest} from '@/lib/admin-auth';
import {getServiceClient} from '@/lib/youtube';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Administrator-only, read-only TEST identity workspace. Do not join real customers or payments.
const error = (message:string,status=400) => NextResponse.json({ok:false,message},{status,headers:{'Cache-Control':'no-store'}});
const clean = (v:unknown) => String(v??'').trim();
const safeLine = (v:unknown) => clean(v).slice(0,120);
export async function GET(request:NextRequest){
  if(!await verifyAdminSessionFromRequest(request)) return error('관리자 로그인이 필요합니다.',401);
  const db = getServiceClient();
  const url = request.nextUrl;
  const keyword = clean(url.searchParams.get('q')).slice(0,40);
  const key = clean(url.searchParams.get('key')).slice(0,80);
  const page = Math.min(200,Math.max(1,Math.trunc(Number(url.searchParams.get('page'))||1)));
  const limit = 30;
  try {
    const countQuery = db.from('live_automation_nickname_pool').select('nickname_key',{count:'exact',head:true});
    const counts = await Promise.all([
      countQuery,
      db.from('live_automation_nickname_pool').select('nickname_key',{count:'exact',head:true}).eq('status','unused'),
      db.from('live_automation_nickname_pool').select('nickname_key',{count:'exact',head:true}).eq('status','assigned'),
    ]);
    if(counts.some(r=>r.error)) return error('닉네임 집계를 불러오지 못했습니다.',503);
    let pool = db.from('live_automation_nickname_pool').select('nickname_key,nickname,category,status,updated_at,actor_id',{count:'exact'}).order('nickname_key',{ascending:true});
    // PostgREST ilike search term is user input; strip wildcard and comma special syntax.
    const search = keyword.replace(/[%_(),]/g,'');
    if(search) pool = pool.ilike('nickname',`%${search}%`);
    const {data, error:poolError, count} = await pool.range((page-1)*limit,page*limit-1);
    if(poolError) return error('닉네임 목록을 불러오지 못했습니다.',503);
    let selected:null|{key:string;actors:unknown[];orders:unknown[]} = null;
    if(key){
      if(!/^[\p{L}\p{N}\s._-]{2,80}$/u.test(key)) return error('닉네임 키가 올바르지 않습니다.');
      const ar = await db.from('live_automation_actors')
        .select('id,nickname,profile,created_at,retired_at,order_count')
        .eq('nickname_key',key).order('created_at',{ascending:false}).limit(15);
      if(ar.error)return error('AI 회원 이력을 불러오지 못했습니다.',503);
      const actors=(ar.data||[]).map(a=>({id:a.id,nickname:a.nickname,profile:a.profile,created_at:a.created_at,retired_at:a.retired_at,order_count:a.order_count}));
      const ids=actors.map(a=>a.id);
      let orders:Array<{actor_id:unknown;completed_at:unknown;status:unknown;items:{name:string;color:string;size:string;qty:number}[]}> = [];
      if(ids.length){
        const rr=await db.from('live_automation_actions').select('actor_id,completed_at,status,plan')
          .in('actor_id',ids).eq('kind','order').order('created_at',{ascending:false}).limit(35);
        if(rr.error)return error('테스트 주문 이력을 불러오지 못했습니다.',503);
        orders=(rr.data||[]).map(x=>({actor_id:x.actor_id,completed_at:x.completed_at,status:x.status,
          items:(Array.isArray(x.plan?.lines)?x.plan.lines:[]).slice(0,6).map((i:Record<string,unknown>)=>({name:safeLine(i.productName),color:safeLine(i.color),size:safeLine(i.size),qty:Math.max(1,Number(i.qty)||1)}))}));
      }
      selected={key,actors,orders};
    }
    return NextResponse.json({ok:true,total:Number(counts[0].count)||0,unused:Number(counts[1].count)||0,assigned:Number(counts[2].count)||0,
      page,pages:Math.max(1,Math.ceil((count||0)/limit)),filtered:Number(count)||0,items:data||[],selected,readOnly:true},
      {headers:{'Cache-Control':'no-store'}});
  }catch{return error('AI 회원 데이터를 불러오지 못했습니다.',503);}
}
