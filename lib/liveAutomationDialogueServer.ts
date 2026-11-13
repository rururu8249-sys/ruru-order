import {hasOverseasBadge} from './shippingGroups';
import {selectedDetailInfo} from './productDetailInfo';
import type {SupabaseClient} from '@supabase/supabase-js';
import {readAutomationFeatured} from './liveAutomationFeatured';
import {detailProducts,cleanOptionValues} from './productDetailModel';
import {isExposedProductRow} from './cartExposureServer';
import type {DialogueCard} from './liveAutomationDialogue';
/** No fuzzy matching and no cached catalogue fallback: missing/removed product fails closed. */
export async function readDialogueCard(db:SupabaseClient,bc:string):Promise<DialogueCard|null>{
 const card=await readAutomationFeatured(bc);if(!card)return null;
 const [linked,product]=await Promise.all([
  db.from('broadcast_products').select('product_id').eq('broadcast_id',bc).eq('product_id',card.productId).limit(1),
  db.from('products').select('*').eq('id',card.productId).maybeSingle(),
 ]);
 if(linked.error||!linked.data?.length||product.error||!product.data||!isExposedProductRow(product.data))return null;
 const p=product.data,metadata={overseas:hasOverseasBadge(product.data),shippingInfo:selectedDetailInfo(product.data,card.detailName).chips},details=detailProducts(p,{includeHidden:false});
 if(card.detailName){const d=details.find(d=>d.detailName===card.detailName);if(!d||d.stockManaged&&d.stock!==null&&d.stock<=0)return null;return {...card,...metadata,name:d.detailName,colors:d.colors,sizes:d.sizes};}
 if(details.length)return null;
 return {...card,...metadata,name:String(p.product_name||''),colors:cleanOptionValues(p.color_options),sizes:cleanOptionValues(p.size_options)};
}
