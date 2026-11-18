/** Read-only selection of packing/invoice work scopes. No payment, order or pickup mutations. */
import type {LiveOrder} from '../components/admin-live/types';
import {getAlwaysOrderDateKey,isAlwaysOrderLike} from '../components/admin-live/alwaysOrderDateUtils';
import {pickPullMatchesView} from './orderPickPull';

export type WorkScopeKind='current'|'selected'|'broadcast'|'shop';
export type WorkScopeChoice={kind:WorkScopeKind;label:string;orders:LiveOrder[]};
export type WorkBroadcast={id:string;dateKey:string;label:string};

function workIdentity(o:LiveOrder):string {
  const pull=o.pickPull;
  return `${o.groupId||o.id}::${pull ? `${pull.pulledFor}/${pull.broadcastId||''}` : 'original'}`;
}
export function uniqueWorkOrders(list:readonly LiveOrder[]):LiveOrder[] {
  const seen=new Set<string>();
  return list.filter(o=>{const id=workIdentity(o);if(seen.has(id))return false;seen.add(id);return true;});
}
export function inBroadcastScope(order:LiveOrder,b:WorkBroadcast):boolean {
  if(order.pickPull)return pickPullMatchesView(order.pickPull,{kind:'broadcast',broadcastId:b.id,startedDay:b.dateKey});
  return !isAlwaysOrderLike(order)&&String(order.broadcastId||'')===b.id;
}
export function inShopDayScope(order:LiveOrder,dateKey:string):boolean {
  if(order.pickPull)return pickPullMatchesView(order.pickPull,{kind:'date',day:dateKey});
  return isAlwaysOrderLike(order)&&getAlwaysOrderDateKey(order.createdAt||order.submittedAt)===dateKey;
}
export function selectWorkScope(input:{
  kind:WorkScopeKind;allOrders:readonly LiveOrder[];currentOrders:readonly LiveOrder[];
  selectedOrders:readonly LiveOrder[];broadcasts:readonly WorkBroadcast[];
  chosenBroadcastIds?:readonly string[];chosenShopDays?:readonly string[];
}):LiveOrder[] {
  if(input.kind==='current')return uniqueWorkOrders(input.currentOrders);
  if(input.kind==='selected')return uniqueWorkOrders(input.selectedOrders);
  if(input.kind==='broadcast'){
    const ids=new Set(input.chosenBroadcastIds||[]);
    const broadcasts=input.broadcasts.filter(b=>ids.has(b.id));
    return uniqueWorkOrders(input.allOrders.filter(o=>broadcasts.some(b=>inBroadcastScope(o,b))));
  }
  const days=new Set(input.chosenShopDays||[]);
  return uniqueWorkOrders(input.allOrders.filter(o=>[...days].some(day=>inShopDayScope(o,day))));
}
