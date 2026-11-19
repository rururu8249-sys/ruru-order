import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {verifyAdminSessionFromRequest} from '@/lib/admin-auth';
import {buildLifetimeStatsByProfile,type LifetimeOrderRow,type LifetimeMemberRef} from '@/lib/customerLifetimeStats';

export const dynamic='force-dynamic';
const response=(body:Record<string,unknown>,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const TABLE_PAGE_SIZE=1000;
export async function GET(request:NextRequest){
  if(!await verifyAdminSessionFromRequest(request))return response({ok:false,message:'관리자 인증이 필요합니다.'},401);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLE;
  if(!url||!key)return response({ok:false,message:'관리자 데이터베이스 환경변수가 없습니다.'},500);
  try{
    const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    // Keep the paginated reader inside the request scope. TS infers the exact
    // Supabase client generated above, including its public schema. Using
    // ReturnType<typeof createClient> here loses these generics (TS2345).
    async function allRows<T>(table:string, columns:string,filterActive=false):Promise<T[]> {
      const out:T[]=[];
      for(let from=0;from<100000;from+=TABLE_PAGE_SIZE){
        let q=sb.from(table).select(columns);
        if(filterActive)q=q.or('is_deleted.eq.false,is_deleted.is.null');
        const {data,error}=await q.order('id',{ascending:true}).range(from,from+TABLE_PAGE_SIZE-1);
        if(error)throw new Error(`${table}: ${error.message}`);
        const chunk=(data||[]) as T[];
        out.push(...chunk);
        if(chunk.length<TABLE_PAGE_SIZE)return out;
      }
      throw new Error(`${table}: safety pagination ceiling reached`);
    }

    const [profiles,orders]=await Promise.all([
      allRows<LifetimeMemberRef>('customers','id,kakao_id,customer_phone'),
      allRows<LifetimeOrderRow>('orders','id,order_group_id,created_at,kakao_id,customer_phone,is_deleted,final_amount,adjusted_total_price,total_price,order_manage_status,shipping_status,admin_order_status_v2',true),
    ]);
    const result=buildLifetimeStatsByProfile(profiles,orders);
    if(result.ambiguousRows>0)console.warn('[admin] ambiguous member order rows:',result.ambiguousRows);
    return response({ok:true,version:'full-history-v1',...result,checkedAt:new Date().toISOString()});
  }catch(e){
    console.error('[admin] lifetime summary read failed',e instanceof Error?e.message:'unknown');
    return response({ok:false,message:'전체 회원 누적 실적 조회에 실패했습니다. 다시 조회해 주세요.'},500);
  }
}
