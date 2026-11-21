import type {SupabaseClient} from '@supabase/supabase-js';
import type {DialogueCard} from './liveAutomationDialogue';
import {detailProducts,cleanOptionValues} from './productDetailModel';
import {isExposedProductRow} from './cartExposureServer';
import {hasOverseasBadge} from './shippingGroups';

/** Read-only topic sources: today's real orders, exact current catalog matches.
 * Never return buyers, quantities, paid amounts or an ordered customer's size.
 * Order history is evidence that an item existed, not that a TEST actor bought it. */
export async function readOrderedDialogueCards(db:SupabaseClient,broadcastId:string,now=Date.now()):Promise<DialogueCard[]>{
 const day=Math.floor((now+9*3600000)/86400000)*86400000-9*3600000;
 const orders=await db.from('orders').select('product_id,product_name')
  .eq('broadcast_id',broadcastId).eq('is_test_order',false).is('automation_actor_id',null)
  .or('is_deleted.is.null,is_deleted.eq.false')
  .gte('created_at',new Date(day).toISOString()).lte('created_at',new Date(now).toISOString())
  .order('created_at',{ascending:false}).limit(150);
 if(orders.error)return [];
 const unique=[...new Map((orders.data||[]).filter(r=>r.product_id&&r.product_name)
  .map(r=>[`${r.product_id}:${r.product_name}`,r])).values()].slice(0,12);
 const ids=[...new Set(unique.map(r=>String(r.product_id)))];
 if(!ids.length)return [];
 const [products,links]=await Promise.all([
  db.from('products').select('*').in('id',ids),
  db.from('broadcast_products').select('product_id').eq('broadcast_id',broadcastId).in('product_id',ids),
 ]);
 if(products.error||links.error)return [];
 const linked=new Set((links.data||[]).map(r=>String(r.product_id)));
 const result:DialogueCard[]=[];
 for(const order of unique){
  const id=String(order.product_id),name=String(order.product_name);
  const product=(products.data||[]).find(p=>String(p.id)===id);
  if(!linked.has(id)||!product||!isExposedProductRow(product))continue;
  const details=detailProducts(product,{includeHidden:false});
  const detail=details.find(d=>d.detailName===name);
  if(details.length&&!detail)continue;
  if(!details.length&&String(product.product_name||'')!==name)continue;
  if(detail?.stockManaged&&detail.stock!==null&&detail.stock<=0)continue;
  result.push({productId:id,detailName:detail?.detailName||'',name,parentName:String(product.product_name||''),
   colors:detail?.colors||cleanOptionValues(product.color_options),sizes:detail?.sizes||cleanOptionValues(product.size_options),
   overseas:hasOverseasBadge(product),revision:`orders:${day}`});
  if(result.length===6)break;
 }
 return result;
}
