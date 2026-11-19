import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {verifyAdminSessionFromRequest} from '@/lib/admin-auth';

export const dynamic='force-dynamic';
const output=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const clean=(v:unknown)=>String(v??'').trim();
const hasRegionMissing=(e:unknown)=>/42703|PGRST204|could not find the.*region_label|column .*region_label.*does not exist/i.test(clean((e as {message?:unknown}|null)?.message));
export async function GET(request:NextRequest){
  if(!await verifyAdminSessionFromRequest(request))return output({ok:false,message:'관리자 인증이 필요합니다.'},401);
  const kid=clean(request.nextUrl.searchParams.get('kakaoId'));
  if(!/^\d{1,30}$/.test(kid))return output({ok:true,records:[],message:'카카오 계정 연결 정보가 없어 접속 IP를 안전하게 특정할 수 없습니다.'});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLE;
  if(!url||!key)return output({ok:false,message:'접속 기록을 불러올 수 없습니다.'},500);
  try{
    const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const [member,presence]=await Promise.all([
      sb.from('customers').select('kakao_id,youtube_nickname,kakao_nickname').eq('kakao_id',kid).limit(3),
      sb.from('visitor_presence').select('visitor_key,kakao_id,last_seen_at,nickname').eq('kakao_id',kid).order('last_seen_at',{ascending:false}).limit(30),
    ]);
    if(member.error||presence.error)throw new Error('member presence lookup');
    if(!member.data?.length)return output({ok:true,records:[],message:'연결된 회원을 찾지 못했습니다.'});
    const validNames=new Set((member.data||[]).flatMap(p=>[clean(p.youtube_nickname),clean(p.kakao_nickname)]).filter(Boolean));
    const linked=(presence.data||[]).filter(p=>clean(p.visitor_key)).map(p=>({visitorKey:clean(p.visitor_key),at:clean(p.last_seen_at)}));
    const keys=[...new Set(linked.map(v=>v.visitorKey))];
    if(!keys.length)return output({ok:true,records:[],message:'연결된 접속 기록이 없습니다.'});
    const initial=await sb.from('visitor_visits').select('visitor_key,nickname,ip,region_label,started_at,last_seen_at').in('visitor_key',keys).order('last_seen_at',{ascending:false}).limit(80);
    let rows=(initial.data||[]) as Array<Record<string,unknown>>;
    let rowsError=initial.error;
    if(rowsError&&hasRegionMissing(rowsError)){
      const legacy=await sb.from('visitor_visits').select('visitor_key,nickname,ip,started_at,last_seen_at').in('visitor_key',keys).order('last_seen_at',{ascending:false}).limit(80);
      rows=(legacy.data||[]) as Array<Record<string,unknown>>;rowsError=legacy.error;
    }
    if(rowsError)throw new Error('visitor visits lookup');
    // Existing visit rows contain only a browser key and nickname, not a signed member identity.
    // A shared browser could belong to someone else in the past: only display the
    // most recent visit matching the currently linked member identity and nickname.
    const byVisitor=new Map(linked.map(x=>[x.visitorKey,Date.parse(x.at)]));
    const seen=new Set<string>();
    const records=rows.filter(row=>{
      const name=clean(row.nickname),key=clean(row.visitor_key);
      if(!validNames.has(name)||seen.has(key))return false;
      const updated=byVisitor.get(key)||0,last=Date.parse(clean(row.last_seen_at));
      if(!updated||!Number.isFinite(last)||Math.abs(updated-last)>10*60_000)return false;
      seen.add(key);return true;
    }).slice(0,8).map(r=>({
      at:r.last_seen_at,ip:clean(r.ip)||'',region:clean((r as {region_label?:unknown}).region_label)||'',
      source:'브라우저·닉네임 일치 기준(참고용)' as const,
    }));
    return output({ok:true,records,message:records.length?'':'본인 계정과 안전하게 연결된 기존 접속 IP가 없습니다.',regionInfo:'IP 기반 추정 지역이며 실제 거주지·위치를 의미하지 않습니다.'});
  }catch(e){console.error('[admin] member access read failed',e instanceof Error?e.message:'unknown');return output({ok:false,message:'접속 기록을 불러오지 못했습니다.'},500);}
}
