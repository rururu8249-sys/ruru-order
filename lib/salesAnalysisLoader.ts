import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderRow } from './admin-v2/types';

// Only inputs consumed by sales grouping, payment amounts, buyer identity and item display.
// Do not download addresses, bank details, audit histories or inventory records for analytics.
const SALES_FIELDS='id,order_group_id,order_lookup_code,broadcast_id,created_at,youtube_nickname,customer_name,customer_phone,phone,product_id,product_name,color,size,qty,product_price,adjusted_product_price,total_price,adjusted_total_price,final_amount,refund_amount,shipping_fee,adjusted_shipping_fee,vat_amount,payment_method,admin_order_status_v2,order_manage_status,order_status,shipped_prev_status,is_deleted,is_permanently_deleted,is_test_order,exclude_from_settlement,event_gift_winner_id';

export type SalesBroadcast = {id:string; title:string; started_at:string; ended_at?:string|null};
export type SalesAnalysisSnapshot = {
  broadcasts: SalesBroadcast[];
  orders: OrderRow[];
  products: Array<Record<string, unknown>>;
};

/** Read-only, request-local snapshot. Never return a successful partial page set. */
export async function loadSalesAnalysisSnapshot(db: SupabaseClient, isCurrent: () => boolean): Promise<SalesAnalysisSnapshot> {
  const check = () => { if (!isCurrent()) throw new Error('Sales request superseded'); };
  // [2026-11-26] 1,000줄씩 «차례로» 읽던 것(운영 실측 판매분석 약 4초) → 첫 장에서 전체 줄 수를 받고 나머지는 4장씩 동시에.
  //   id 순 정렬이라 장 순서대로 이어 붙이면 예전과 같은 결과. 줄 수를 못 받으면 예전처럼 차례로.
  async function pages(table: string, fields: string) {
    const rows: Array<Record<string, unknown>> = [];
    const read = async (offset: number, withCount = false) => {
      check();
      const res = await db.from(table).select(fields, withCount ? { count: 'exact' } : undefined).order('id').range(offset, offset + 999);
      check();
      if (res.error) throw res.error;
      if (!Array.isArray(res.data)) throw new Error('Incomplete sales response');
      return { data: res.data as unknown as Array<Record<string, unknown>>, count: res.count };
    };
    const first = await read(0, true);
    rows.push(...first.data);
    if (first.data.length < 1000) return rows;
    let offset = 1000;
    if (typeof first.count === 'number') {
      const starts: number[] = [];
      for (let o = 1000; o < first.count; o += 1000) starts.push(o);
      for (let i = 0; i < starts.length; i += 4) {
        const batch = await Promise.all(starts.slice(i, i + 4).map((o) => read(o)));
        for (const page of batch) rows.push(...page.data);
      }
      offset = 1000 * (starts.length + 1);
      if (rows.length < offset) return rows;
    }
    for (; ; offset += 1000) {
      const page = await read(offset);
      rows.push(...page.data);
      if (page.data.length < 1000) return rows;
    }
  }
  const [broadcastRows, orders] = await Promise.all([
    pages('broadcasts','id,public_title,started_at,ended_at'),
    // Keep all statuses until grouping: removing an individual row can change a mixed legacy group.
    pages('orders',SALES_FIELDS),
  ]);
  const truthy=(value:unknown)=>[true,'true','t',1,'1'].includes(value as never);
  const salesStatuses=new Set(['입금확인','자동입금확인','수동입금확인','카드결제완료','결제완료','출고대기','출고완료','킵','픽업','픽업예정']);
  const visible=orders.filter(row=>!['is_deleted','is_permanently_deleted','is_test_order','exclude_from_settlement'].some(key=>truthy(row[key])) && row.event_gift_winner_id==null && ![row.admin_order_status_v2,row.order_manage_status,row.order_status].some(status=>['주문취소','주문서취소'].includes(String(status||'').trim())));
  const grouped=new Map<string,Array<Record<string,unknown>>>();
  for(const row of visible) {
    const key=JSON.stringify([row.broadcast_id??'__shop__',row.order_group_id||row.order_lookup_code||row.id]);
    const rows=grouped.get(key)||[];rows.push(row);grouped.set(key,rows);
  }
  // The adapter decides payment from the group's earliest row; enrich every included item,
  // including legacy siblings whose individual status differs from the group status.
  const eligible=[...grouped.values()].flatMap(rows=>{
    const first=rows.reduce((a,b)=>Number(a.id)<Number(b.id)?a:b);
    const current=String(first.admin_order_status_v2||first.order_manage_status||'').trim();
    const previous=String(first.shipped_prev_status||'').trim();
    const basis=['출고대기','출고완료','킵','픽업','픽업예정'].includes(current)&&previous?previous:current;
    return salesStatuses.has(basis)?rows:[];
  });
  const ids=[...new Set(eligible.map(row=>String(row.product_id||'')).filter(id=>/^[1-9][0-9]*$/.test(id)))];
  const products:Array<Record<string,unknown>>=[];
  // [2026-11-26] 상품 사진 100개씩도 동시에(순서대로 이어 붙임)
  const chunks:string[][]=[];
  for(let offset=0;offset<ids.length;offset+=100) chunks.push(ids.slice(offset,offset+100));
  for(let i=0;i<chunks.length;i+=4) {
    check();
    const results=await Promise.all(chunks.slice(i,i+4).map(chunk=>db.from('products').select('id,product_name,image_url,product_note').in('id',chunk)));
    check();
    for(const {data,error} of results) {
      if(error) throw error;
      if(!Array.isArray(data)) throw new Error('Incomplete product response');
      products.push(...data);
    }
  }
  return {broadcasts:broadcastRows.map(row=>({id:String(row.id),title:String(row.public_title||'제목 없음'),started_at:String(row.started_at||''),ended_at:row.ended_at?String(row.ended_at):null})).sort((a,b)=>(Date.parse(b.started_at)||0)-(Date.parse(a.started_at)||0)),orders:orders as unknown as OrderRow[],products};
}
