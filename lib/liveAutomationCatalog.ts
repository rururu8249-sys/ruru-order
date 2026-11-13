import type {SupabaseClient} from '@supabase/supabase-js';
import {readDialogueCard} from './liveAutomationDialogueServer';
import {AUTO_TEST_ORDERED_SINCE,productChoices,type AutoTestChoice,type AutoTestSettings} from './autoTestOrder';
import {buildCartHoldSnapshotItem} from './cartHoldDetail';
export async function readAutomationSettings(db:SupabaseClient):Promise<AutoTestSettings> {
  const defaults:Record<string,number>={default_shipping_fee:4000,remote_area_shipping_fee:6000,vendor_shipping_fee:4000,vendor_remote_area_shipping_fee:7000,overseas_shipping_fee:0,overseas_remote_area_shipping_fee:0,customer_card_extra_rate:10,actual_card_fee_rate:7,card_payment_min_amount:100000};
  const {data,error}=await db.from('settings').select('key,value').in('key',Object.keys(defaults));
  if(error)throw Error('ORDER_SETTINGS_UNAVAILABLE');
  for(const row of data||[]){const n=Number(row.value);if(!Number.isFinite(n)||n<0)throw Error('ORDER_SETTINGS_INVALID');defaults[row.key]=n;}
  return {shipping:{normalFee:defaults.default_shipping_fee,normalRemoteFee:defaults.remote_area_shipping_fee,vendorFee:defaults.vendor_shipping_fee,vendorRemoteFee:defaults.vendor_remote_area_shipping_fee,overseasFee:defaults.overseas_shipping_fee,overseasRemoteFee:defaults.overseas_remote_area_shipping_fee},customerCardRate:defaults.customer_card_extra_rate,actualCardRate:defaults.actual_card_fee_rate,cardMinAmount:defaults.card_payment_min_amount};
}
export function automationChoices(row:Record<string,unknown>,overseas:boolean):AutoTestChoice[] {
  let note:Record<string,unknown>;
  try{note=typeof row.product_note==='string'?JSON.parse(row.product_note):row.product_note as Record<string,unknown>||{};}catch{return []}
  if(!note||typeof note!=='object')return [];
  // Catalog extraction can include stock-managed goods now: the transaction validates stock
  // and the authenticated shared save suppresses its mutation. Never modify the stored product.
  return productChoices({...row,stock_management_enabled:false,product_note:JSON.stringify({...note,stock_management_enabled:false})},overseas).map(choice=>{
    const normalized=buildCartHoldSnapshotItem({...choice,qty:1});
    return {...choice,color:normalized.color,size:normalized.size};
  });
}
export async function loadAutomationChoices(db:SupabaseClient,broadcastId:string,settings:AutoTestSettings):Promise<AutoTestChoice[]> {
  const linked=await db.from('broadcast_products').select('product_id,is_visible').eq('broadcast_id',broadcastId);
  if(linked.error)throw Error('CATALOG_UNAVAILABLE');
  const ids=[...new Set((linked.data||[]).filter(r=>r.is_visible!==false).map(r=>r.product_id))];
  if(!ids.length)return [];
  const products=await db.from('products').select('*').in('id',ids);
  if(products.error)throw Error('CATALOG_UNAVAILABLE');
  const choices=(products.data||[]).flatMap(p=>automationChoices(p,(settings.shipping.overseasFee||0)>0));
  if(!choices.length)return [];
  const card=await readDialogueCard(db,broadcastId);
  // Keep the original real-order history window, but match IDs AND detail names.
  // Generated orders must never make their own products eligible for future orders.
  const ordered=new Set<string>();
  for(let start=0;start<ids.length;start+=100){
    for(let page=0;;page++){
      const result=await db.from('orders').select('product_id,product_name')
        .in('product_id',ids.slice(start,start+100))
        .gte('created_at',new Date(AUTO_TEST_ORDERED_SINCE).toISOString())
        .or('is_test_order.is.null,is_test_order.eq.false')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .is('automation_actor_id',null).order('id').range(page*1000,page*1000+999);
      if(result.error)throw Error('ORDER_HISTORY_UNAVAILABLE');
      for(const row of result.data||[])ordered.add(JSON.stringify([String(row.product_id),String(row.product_name||'').trim()]));
      if((result.data||[]).length<1000)break;
    }
  }
  return choices.filter(choice=>ordered.has(JSON.stringify([choice.productId,choice.productName.trim()]))
    ||Boolean(card&&choice.productId===card.productId&&choice.productName===card.name));
}
