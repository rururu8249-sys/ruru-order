import {computeWidgetFeatured,type WidgetFeaturedState} from './widgetFeaturedServer';
import {rotationIndex} from './widgetRotationClock';
export type FeaturedSnapshot={productId:string;detailName:string;revision:string};
export function automationFeaturedSnapshot(state:WidgetFeaturedState,now=Date.now()):FeaturedSnapshot|null{
 if(!state.enabled||state.siteCardOff||!state.targets.length)return null;
 const target=state.targets[state.pinned?0:rotationIndex(state.config,state.targets.length,now)];
 if(!target)return null;
 return {productId:String(target.productId),detailName:String(target.detailName||''),revision:JSON.stringify([state.config,state.targets,state.pinned,target])};
}
export async function readAutomationFeatured(broadcast:string){
 try{return automationFeaturedSnapshot(await computeWidgetFeatured(broadcast))}catch{return null}
}
export function featuredMatches(item:unknown,card:FeaturedSnapshot):boolean{
 if(!item||typeof item!=='object')return false;
 const row=item as Record<string,unknown>;
 return String(row.productId)===card.productId&&(!card.detailName||String(row.productName)===card.detailName);
}
