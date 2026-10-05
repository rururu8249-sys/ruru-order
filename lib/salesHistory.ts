type Row = Record<string, unknown>;
export const SALES_PAID_STATUSES = ['입금확인','수동입금확인','자동입금확인','출고대기','출고완료','카드결제완료'];
export function eligibleSalesOrder(row: Row) {
  return SALES_PAID_STATUSES.includes(String(row.admin_order_status_v2)) &&
    !['is_deleted','is_permanently_deleted','is_test_order','exclude_from_settlement'].some(k=>row[k]===true) &&
    row.event_gift_winner_id == null && !['취소','canceled','cancelled'].includes(String(row.order_status || row.order_manage_status));
}
export function salesPaymentAmount(row: Row) {
  return Number(row.final_amount ?? row.adjusted_total_price ?? row.total_price ?? 0);
}
export function aggregateSalesItems(orders: Row[]) {
  const map = new Map<string,{key:string;name:string;productId:string;thumb:string;qty:number;price:number;sales:number;opts:Map<string,number>}>();
  for (const row of orders) {
    const name = String(row.product_name || '상품명 없음').trim();
    const price = Number(row.adjusted_product_price ?? row.product_price ?? 0);
    // IDs can identify a brand/parent containing many different products.
    const key = JSON.stringify([name, price]);
    const cur = map.get(key) || {key,name,productId:String(row.product_id || ''),thumb:'',qty:0,price,sales:0,opts:new Map<string,number>()};
    const qty = Number(row.qty || 0);
    const option = [row.color,row.size].map(v=>String(v || '').trim()).filter(v=>v && v!=='없음').join(' / ') || '옵션 없음';
    cur.qty += qty; cur.sales += price * qty;
    cur.opts.set(option,(cur.opts.get(option)||0)+qty);
    map.set(key,cur);
  }
  return [...map.values()].sort((a,b)=>b.sales-a.sales || a.name.localeCompare(b.name,'ko')).map(({opts,...row})=>({...row,option:[...opts].map(([option,qty])=>`${option} · ${qty}개`).join('\n')}));
}
export function sortedSalesBroadcasts<T extends {id:string;started_at:string}>(rows:T[], stats:Map<string,{count:number}>) {
  return rows.filter(row=>(stats.get(row.id)?.count || 0)>0).sort((a,b)=>(Date.parse(b.started_at)||0)-(Date.parse(a.started_at)||0));
}
