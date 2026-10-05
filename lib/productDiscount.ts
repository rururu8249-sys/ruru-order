export type DiscountSetting={enabled:boolean;original_price:number};
export type DiscountDisplay=DiscountSetting & {details?:Record<string,DiscountSetting>};
export function renameDiscountDetail(display:DiscountDisplay,oldName:string,nextName:string):DiscountDisplay{
  const details={...display.details};
  if(Object.prototype.hasOwnProperty.call(details,oldName)){const setting=details[oldName];delete details[oldName];details[nextName]=setting;}
  return {...display,details};
}
export function resolveProductDiscount(note:unknown,actualPrice:number,detail='',surface:'site'|'widget'='site'):{originalPrice:number;percent:number}|null {
  if(surface==='widget'||!Number.isFinite(actualPrice)||actualPrice<=0)return null;
  let parsed:unknown=note;
  if(typeof parsed==='string'){try{parsed=JSON.parse(parsed);}catch{return null;}}
  if(!parsed||typeof parsed!=='object')return null;
  const display=(parsed as {discount_display?:DiscountDisplay}).discount_display;
  const setting=detail?display?.details?.[detail]:display;
  if(setting?.enabled!==true)return null;
  const original=Number(setting.original_price);
  if(!Number.isSafeInteger(original)||original<=actualPrice)return null;
  const percent=Math.floor((original-actualPrice)/original*100);
  return {originalPrice:original,percent};
}
