/** Consistent, mutually exclusive order-group counts for packing/invoice scope UI.
 * A scope can contain canceled and operation-excluded orders. These are never
 * work targets; they are counted explicitly so the preview never lies.
 * This is display-only. No order, payment, shipment or picking writes.
 */
import type {LiveOrder} from '../components/admin-live/types';
import type {WorkScopeKind} from './adminWorkScope';

export type WorkKind='picking'|'invoice';
export type WorkScopeSummary={
  total:number; paid:number; unpaid:number; canceled:number; excluded:number; eligible:number;
};
const PAID=new Set(['paid','auto_paid','manual_paid','card_paid']);
export function summarizeWorkScope(orders:readonly LiveOrder[],work:WorkKind):WorkScopeSummary{
  const result:WorkScopeSummary={total:0,paid:0,unpaid:0,canceled:0,excluded:0,eligible:0};
  const seen=new Set<string>();
  for(const o of orders){
    const id=String(o.groupId||o.id);
    // Preserve explicitly transferred work items as distinct from their origin.
    const target=o.pickPull?`${o.pickPull.pulledFor}/${o.pickPull.broadcastId||''}`:'original';
    const key=`${id}::${target}`;
    if(seen.has(key))continue;
    seen.add(key);
    result.total++;
    if(o.paymentStatus==='canceled'){result.canceled++;continue;}
    if(work==='picking'?o.excludeFromPicking===true:o.excludeFromShipping===true){result.excluded++;continue;}
    result.eligible++;
    if(PAID.has(o.paymentStatus))result.paid++;else result.unpaid++;
  }
  return result;
}
export function eligibleWorkScopeOrders(orders:readonly LiveOrder[],work:WorkKind):LiveOrder[]{
  const seen=new Set<string>();
  return orders.filter(o=>{
    if(o.paymentStatus==='canceled'||(work==='picking'?o.excludeFromPicking===true:o.excludeFromShipping===true))return false;
    const id=String(o.groupId||o.id);
    const pull=o.pickPull?`${o.pickPull.pulledFor}/${o.pickPull.broadcastId||''}`:'original';
    const key=`${id}::${pull}`;
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}
export function scopeCountLabel(x:WorkScopeSummary){
  return `전체 ${x.total}건 · 작업 ${x.eligible}건`;
}
/** For the picker only: never silently drop unpaid from the order list.
 * The picking panel toggles visibility using its initialShowUnpaid prop.
 */
export type PickingPaymentView='paid'|'all';
export function chosenPickingVisibleCount(s:WorkScopeSummary,view:PickingPaymentView){
  return view==='paid'?s.paid:s.eligible;
}
