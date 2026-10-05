type Row = Record<string, unknown>;
export type SalesOptionGroup = {label:string;sizes:Array<{label:string;qty:number}>};
const sizeOrder = ['XXS','XS','S','M','L','XL','XXL','XXXL'];
function compareSize(a:string,b:string) {
  const ai=sizeOrder.indexOf(a.toUpperCase()), bi=sizeOrder.indexOf(b.toUpperCase());
  if(ai>=0 && bi>=0) return ai-bi;
  if(ai>=0 || bi>=0) return ai>=0?-1:1;
  return a.localeCompare(b,'ko',{numeric:true});
}
// Exact stored detail keys only: never substitute another product's photo.
export function salesProductPhotos(name: string, product: Row, originalProductId?: string) {
  let note: Row = {};
  try { note = typeof product.product_note === 'string' ? JSON.parse(product.product_note) : (product.product_note || {}) as Row; } catch { /* legacy invalid notes */ }
  const sets = note?.detail_photo_sets as Record<string, unknown> | undefined;
  const photos = note?.detail_photos as Record<string, unknown> | undefined;
  const set = sets?.[name];
  const detail = Array.isArray(set) ? set.find(v=>typeof v==='string' && v.trim()) : undefined;
  const direct = photos?.[name];
  const brand = String(product.image_url || '');
  const grouped = note?.combo_mode === true || (note?.brand_group as Row | undefined)?.enabled === true;
  const exactId = originalProductId != null && String(product.id) === originalProductId;
  return {brand, detail: String(detail || (typeof direct === 'string' ? direct : '') || (!grouped && (exactId || String(product.product_name || '') === name) ? brand : ''))};
}
export const SALES_PAID_STATUSES = ['입금확인','수동입금확인','자동입금확인','출고대기','출고완료','카드결제완료'];
export function eligibleSalesOrder(row: Row) {
  return SALES_PAID_STATUSES.includes(String(row.admin_order_status_v2)) &&
    !['is_deleted','is_permanently_deleted','is_test_order','exclude_from_settlement'].some(k=>row[k]===true) &&
    row.event_gift_winner_id == null && !['취소','canceled','cancelled'].includes(String(row.order_status || row.order_manage_status));
}
export function salesPaymentAmount(row: Row) {
  return Number(row.final_amount ?? row.adjusted_total_price ?? row.total_price ?? 0);
}
export function aggregateSalesItems(orders: Row[], lineAmount?: (row: Row) => number, identity?: (row: Row) => string) {
  const map = new Map<string,{key:string;name:string;productId:string;thumb:string;qty:number;price:number;sales:number;opts:Map<string,number>;groups:Map<string,Map<string,number>>}>();
  for (const row of orders) {
    const name = String(row.product_name || '상품명 없음').trim();
    const price = Number(row.adjusted_product_price ?? row.product_price ?? 0);
    // IDs can identify a brand/parent containing many different products.
    const key = JSON.stringify(identity ? [identity(row), name, price] : [name, price]);
    const cur = map.get(key) || {key,name,productId:String(row.product_id || ''),thumb:'',qty:0,price,sales:0,opts:new Map<string,number>(),groups:new Map<string,Map<string,number>>()};
    const qty = Number(row.qty || 0);
    const option = [row.color,row.size].map(v=>String(v || '').trim()).filter(v=>v && v!=='없음').join(' / ') || '옵션 없음';
    cur.qty += qty; cur.sales += lineAmount ? lineAmount(row) : price * qty;
    cur.opts.set(option,(cur.opts.get(option)||0)+qty);
    // Use the original fields, not a split display string: slashes can be part of an option.
    const color=String(row.color || '').trim();
    const label=color==='없음'?'':color;
    const rawSize=String(row.size || '').trim();
    const size=rawSize && rawSize!=='없음'?rawSize:(label?'수량':'옵션 없음');
    const sizes=cur.groups.get(label)||new Map<string,number>();
    sizes.set(size,(sizes.get(size)||0)+qty);
    cur.groups.set(label,sizes);
    map.set(key,cur);
  }
  return [...map.values()].sort((a,b)=>b.sales-a.sales || a.name.localeCompare(b.name,'ko')).map(({opts,groups,...row})=>({...row,brandThumb:'',option:[...opts].map(([option,qty])=>`${option} · ${qty}개`).join('\n'),optionGroups:[...groups].sort(([a],[b])=>a.localeCompare(b,'ko',{numeric:true})).map(([label,sizes])=>({label,sizes:[...sizes].sort(([a],[b])=>compareSize(a,b)).map(([label,qty])=>({label,qty}))}))}));
}
export function sortedSalesBroadcasts<T extends {id:string;started_at:string}>(rows:T[], stats:Map<string,{count:number}>) {
  return rows.filter(row=>(stats.get(row.id)?.count || 0)>0).sort((a,b)=>(Date.parse(b.started_at)||0)-(Date.parse(a.started_at)||0));
}
