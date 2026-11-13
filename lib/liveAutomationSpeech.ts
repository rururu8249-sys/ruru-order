/** Spoken aliases affect persona chat only; saved catalog/order names stay exact. */
const ALIASES: Record<string, readonly string[]> = {
  MIU:['미우','미우-'], MX:['막스','막스-'], BB:['버버','버'],
  MC:['몽클','몽클-'], PD:['프라다','프라다-'], CL:['셀린','셀린-'],
  LOE:['로에베','로에베-'], BC:['브루넬로','브루넬로-'], CH:['샤넬','샤넬-'], GC:['구찌','구찌-'], DR:['디올','디올-'],
};
export function spokenProductName(name: string, seed=0): string {
  return name.replace(/\b(MIU|MX|BB|MC|PD|CL|LOE|BC|CH|GC|DR)\s*-?\s*(\d+)\b/gi, (_,code:string,number:string)=>{
    const choices=ALIASES[code.toUpperCase()];
    return choices[Math.abs(Math.trunc(seed))%choices.length]+number;
  });
}
export function normalizeSpokenCodes(text:string,items:unknown[],seed=0):string {
  let result=text;
  for(const item of items){
    const name=String((item as {productName?:unknown})?.productName||'');
    const code=name.match(/\b(MIU|MX|BB|MC|PD|CL|LOE|BC|CH|GC|DR)\s*-?\s*(\d+)\b/i);
    if(!code)continue;
    result=result.replace(new RegExp('\\b'+code[1]+'\\s*-?\\s*'+code[2]+'\\b','gi'),spokenProductName(code[0],seed));
  }
  return result;
}
export function unsuitableSpeech(text:string,mode:string,kind:string):boolean {
  if(/\b[A-Z]{2,5}\s*-?\s*\d+\b/i.test(text))return true;
  if(/구성|조합.{0,8}(좋|깔끔|알차)|디테일.{0,8}(훌륭|만족)|탁월한 선택/.test(text))return true;
  if(kind==='chat'&&/\d+\s*(개|종)/.test(text))return true;
  if(mode!=='live'&&/(보여\s*(줘|주|주세요)|입어\s*(봐|주|줘)|착용해|설명\s*(해|부탁)|돌아\s*(봐|주|줘)|생방송|지금.{0,8}(입고|설명하고))/.test(text))return true;
  // No stored viewing history supports a specific earlier morning/yesterday visit.
  if(/(아침|오전|어제).{0,12}(봤|보던|보았|보다|방송)|아까.{0,8}(봤|보던|방송)/.test(text))return true;
  return false;
}
