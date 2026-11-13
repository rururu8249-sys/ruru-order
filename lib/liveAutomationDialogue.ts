import {BRAND_SPEECH_ALIASES} from './liveAutomationSpeech';
import type {FeaturedSnapshot} from './liveAutomationFeatured';
export type DialogueScope='general'|'product'|'history';
export type DialogueCard=FeaturedSnapshot&{name:string;colors:string[];sizes:string[];overseas?:boolean;shippingInfo?:string[]};
export const HISTORICAL_TOPICS={alo:['알로 부츠컷','알로 가방','알로 에코백','알로 밴딩바지','알로 반팔','알로 나시'],lulu:['룰루레몬'],burberry:['버버리 트렌치코트','버버리 코트','버버 코트','버코트','전지현 버버코트','전지현 버버리코트','버버리 트렌치','버버리 바바리','버버리 바바리코트']};
const BRANDS={...BRAND_SPEECH_ALIASES,ALO:['알로','alo'],LULU:['룰루레몬','lululemon'],DYSON:['다이슨','dyson'],HERMES:['에르메스'],LV:['루이비통'],CELINE:['셀린느']};
const flat=(s:string)=>s.toLowerCase().replace(/[\s-]/g,'');
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function mentions(text:string){
 const found=new Set<string>();
 for(const [brand,aliases] of Object.entries(BRANDS))for(const alias of aliases){
  // Single-syllable aliases need a following product number; don't match 버 in 버려요/셀 in 셀카.
  const re=new RegExp(alias.length===1?escape(alias)+'\\s*-?\\s*\\d+':/^[a-z]+$/i.test(alias)?'\\b'+escape(alias)+'(?=\\b|[0-9-])':escape(alias),'i');
  if(re.test(text))found.add(brand);
 }
 if(/버코트|버버\s*코트/.test(text))found.add('BB');
 return found;
}
const categories=[['부츠컷','부츠컷팬츠'],['가방','백','에코백'],['바지','팬츠','레깅스'],['나시','탱크탑'],['반팔','숏슬리브'],['코트','트렌치','바바리'],['패딩','다운'],['향수'],['노트북','냉장고','세탁기','청소기'],['드라이기','헤어드라이어','슈퍼소닉'],['신발','운동화','뮬'],['자켓','재킷','집업'],['니트','스웨터']];
const productWords=/가격|금액|충전재|배송|해외배송|해외 배송|배송기간|배송 기간|고퀄|퀄리티|품질|사이즈|기장|색상|핏|소재|안감|두께|재질|총장|어깨|가슴|허리|엉덩이|길이|세탁|비침|신축|착용|이거|이건|이상품|색이|블랙|화이트|아이보리|베이지|핑크|그레이|네이비|브라운|빨강|파랑|초록|옐로|부츠컷|가방|에코백|밴딩바지|반팔|나시|레깅스|코트|트렌치|바바리|패딩|드라이기|신발|니트/;
export function hasProductReference(text:string){return mentions(text).size>0||productWords.test(text)||/\b[a-z]{2,5}-?\d+\b/i.test(text)}
export function falseExperience(text:string,paymentKind?:'bank'|'card'){
 if(paymentKind==='bank'&&!/어제|지난|저번|전에/.test(text))text=text.replace(/입완/g,'');
 if(paymentKind&&!/어제|지난|저번|전에/.test(text))text=text.replace(paymentKind==='bank'?/입금\s*(완료\s*)?(했어요|했습니다|했어|했는데|했습니당|완료)/g:/결제\s*(완료\s*)?(했어요|했습니다|했어|했는데|완료)/g,'');
 return /입완|(입금|결제).{0,8}(했|했었|완료|끝냈|마쳤|됐|되었)|받았|배송.{0,5}(완료|도착|왔)|잘\s*(입|쓰|신|사용)|입어\s*보|써\s*보|신어\s*보|재구매|샀|사\s*봤|구매했|구매해\s*봤|저번.{0,8}샀|지난번.{0,8}샀|인스타.{0,8}(보고|왔)|친구.{0,8}(소개|추천)/.test(text);
}
export function validGroundedDialogue(answer:unknown,card:DialogueCard|null,scope:DialogueScope,now=Date.now(),facts:{paymentKind?:'bank'|'card';firstOrder?:boolean}={}):boolean{
 if(!answer||typeof answer!=='object')return false;
 const a=answer as Record<string,unknown>,text=String(a.text||'').trim();
 if(!text||text.length>80||a.scope!==scope||falseExperience(text,facts.paymentKind))return false;
 if(/첫\s*주문|처음.{0,4}주문/.test(text)&&!facts.firstOrder)return false;
 const hour=new Date(now+9*3600000).getUTCHours();
 if(/좋은\s*아침|굿모닝|아침\s*인사/.test(text)&&(hour<5||hour>=12))return false;
 if(/잘\s*자요|굿나잇|좋은\s*밤/.test(text)&&hour>=6&&hour<20)return false;
 if(scope==='general')return !hasProductReference(text);
 const brands=mentions(text);
 if(scope==='history'){
  const brand=[...brands][0];
  const topicNames=brand==='ALO'?['알로','alo'].flatMap(b=>['','부츠컷','가방','에코백','밴딩바지','반팔','나시'].map(t=>b+t)):brand==='LULU'?['룰루레몬','lululemon'].flatMap(b=>['','제품','운동복','레깅스','상의','부츠컷'].map(t=>b+t)):HISTORICAL_TOPICS.burberry.filter(t=>!t.includes('전지현'));
  const compact=flat(text).replace(/[?？!.,~ㅎㅋ\p{Extended_Pictographic}]/gu,'');
  const topic=topicNames.map(flat).sort((a,b)=>b.length-a.length).find(t=>compact.includes(t));
  if(!topic)return false;
  // Positive historical vocabulary: unknown product nouns cannot slip through a denylist.
  const rest=compact.replace(topic,'');
  if(!/^(?:(?:혹시|언니|다음|방송|한번|이번|나중|다시|언제|소개|입고|진행|예정|계획|부탁|드려|해주|해|하|시|실|나|까|인가|있|을|수|도|번|쯤|에|때|또|요|는|은|이|가|를|좀|세|주|면|겠|거))*$/.test(rest))return false;
  return brands.size===1&&[...brands].every(b=>['ALO','LULU','BB'].includes(b))&&/(다음|언제|또|다시)/.test(text)&&/(소개|방송|입고|진행).{0,10}(나요|까요|예정|계획|[?？])/.test(text)&&!/(지금|현재|오늘|사이즈|색상|핏|기장|\d|샀|구매|좋았|입어|비교|코디)/.test(text);
 }
 if(!card||String(a.productId)!==card.productId||String(a.detailName??'')!==card.detailName)return false;
 const name=card.name,allowed=mentions(name);
 if(/해외\s*배송/.test(text)&&!card.overseas)return false;
 // Shipping durations and quality are questions, never invented factual recommendations.
 if(/고퀄|퀄리티|품질|배송/.test(text)){
  if(!/[?？]|나요|까요|인가|맞[져죠아]|어때|어떤|얼마|궁금|알려/.test(text))return false;
  if(/(?:고퀄|퀄리티|품질).{0,8}(?:좋아|좋네|좋습|이에요|입니다|맞아요)|\d+\s*(?:일|주|개월|시간)/.test(text))return false;
 }
 if(allowed.has('DYSON')&&/허리|밴딩|가슴|엉덩이|어깨|총장|기장|핏|비침|신축|안감|착용/.test(text))return false;
 if([...brands].some(b=>!allowed.has(b)))return false;
 if(/전지현/.test(text)&&!name.includes('전지현'))return false;
 if(/버코트|버버\s*코트|트렌치|바바리/.test(text)&&!/(코트|트렌치|바바리)/.test(name))return false;
 for(const cat of categories)if(cat.some(w=>text.includes(w))&&!cat.some(w=>name.includes(w)))return false;
 // Spoken product numbers are checked independently of self-reported JSON IDs.
 let withoutCodes=text;
 for(const [brand,aliases] of Object.entries(BRANDS))for(const alias of aliases){
  const matches=text.matchAll(new RegExp(escape(alias)+'\\s*-?\\s*(\\d+)','gi'));
  for(const m of matches){if(!new RegExp('(?:'+escape(brand)+'|'+aliases.map(escape).join('|')+')\\s*-?\\s*'+m[1]+'(?!\\d)','i').test(name))return false;withoutCodes=withoutCodes.replace(m[0],'');}
 }
 const knownNumbers=new Set([...card.sizes,...card.colors].flatMap(s=>s.match(/\d+(?:\.\d+)?/g)||[]));
 if((withoutCodes.match(/\d+(?:\.\d+)?/g)||[]).some(n=>!knownNumbers.has(n)))return false;
 for(const color of ['블랙','화이트','아이보리','베이지','핑크','그레이','네이비','브라운','레드','블루','그린','옐로','보라'])if(text.includes(color)&&![name,...card.colors].some(s=>flat(s).includes(flat(color))))return false;
 for(const size of text.match(/\b(?:XXXL|XXL|XL|XS|S|M|L)\b/gi)||[])if(!card.sizes.some(s=>s.toUpperCase()===size.toUpperCase()))return false;
 // Unknown facts may be asked, never asserted as properties or promised by a pretend customer.
 if(/캐시미어|캐시|울\s*\d|가죽|실크|방수|정품|무료배송|당일배송|재고\s*\d|할인|원이에|원입니다/.test(text))return false;
 return true;
}
export function expressionPolicy(random=Math.random){const r=random();return r<.6?'기호·이모지 없이':r<.9?'이모지 최대 한 개':'ㅎㅎ·ㅋㅋ·~ 중 하나만 가볍게'}
/** Product questions need a reserved order journey, unless replying to an actual conversation. */
export function dialogueActionAllowed(text:string,scope:DialogueScope,kind:string,ordered=false){
 if(kind==='chat'&&/위주로|골랐네요|구성.{0,8}(좋|깔끔|알차)/.test(text))return false;
 return scope!=='product'||kind!=='chat'||ordered||!/[?？]|나요|까요|어때|어떤|얼마|있어요|있을|알려|보여|궁금|되요|돼요/.test(text);
}
export function expressionAllowed(text:string,policy:string){
 const emoji=(text.match(/\p{Extended_Pictographic}/gu)||[]).length;
 if(policy==='기호·이모지 없이')return emoji===0&&!/[ㅎㅋ~♡♥]/.test(text);
 if(policy==='이모지 최대 한 개')return emoji<=1;
 return emoji===0;
}
