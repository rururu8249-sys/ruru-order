import {identifiesChatProduct,productMeaningMismatch,type ChatProductFacts} from './liveAutomationProductFacts';
import {conversationTopics,repeatsRoomTopic} from './liveAutomationTopics';
/** Pure fail-closed policy for TEST-chat composition. No DB writes or network calls. */
export type StreamPhase = 'live'|'paused'|'replay';
export type ChatIntent = 'size'|'length'|'color'|'price'|'delivery'|'order'|'visit'|'pause'|'replay'|'live-action'|'memory'|'other';
export type ChatObservation = {text:string; at:number; actorId?:string|null; productKey?:string|null};
export type QualityInput = {
  text:string; mode:StreamPhase; now:number; actorId:string;
  currentProductKey?:string|null; currentProductName?:string|null; currentProduct?:ChatProductFacts|null;
  priority?:boolean; replyingToHuman?:boolean; recent:ChatObservation[];
  offAirSince?:string|null; replySourceText?:string|null;
  replySourceIsHuman?:boolean;
  lastHumanAt?:number;
};
export type QualityResult = {ok:true;intent:ChatIntent}|{ok:false;reason:string;intent:ChatIntent};
const norm=(t:string)=>t.toLowerCase().replace(/[\s!?.,~ㅋㅎㅠㅜ♡♥\p{Extended_Pictographic}]/gu,'');
export function chatIntent(text:string):ChatIntent {
 const t=String(text||'');
 if(/밴드/.test(t))return 'visit';
 if(/샀었|샀던|샀는데|샀더니|사봤는데|재구매|지난번.{0,15}(입|구매)/.test(t))return 'memory';
 if(/주문서|결제|입금|장바구니|카결/.test(t))return 'order';
 if(/키\s*\d{3}|\d{3}\s*(?:에|\/)\s*\d{2}|몇\s*사이즈|사이즈.{0,10}(추천|입|맞)|\b(?:XS|XXL|XL)\b/.test(t))return 'size';
 if(/기장|총장|가단|어깨|소매.{0,6}길이|길이/.test(t))return 'length';
 if(/색상|컬러|베이지|아이보리|블랙|초코|그레이|네이비|브라운|검정|색깔/.test(t))return 'color';
 if(/가격|얼마|금액/.test(t))return 'price';
 if(/배송|택배|언제.{0,6}(받|와)/.test(t))return 'delivery';
 if(/방송.{0,8}(놓쳤|끝났|끝난|종료)|다시\s*보기|다음\s*방송/.test(t))return 'replay';
 if(/방송.{0,8}(쉬는|잠시|재개)|다시\s*시작/.test(t))return 'pause';
 if(/입어\s*(봐|주|줘)|보여\s*(줘|주)|뒤태|착용해|지금.{0,8}(보여|입어|설명)/.test(t))return 'live-action';
 if(/유튜브|인스타|소개|추천받|친구가|지인이/.test(t))return 'visit';
 return 'other';
}
export function timeAppropriateTestChat(text:string,now:number):boolean {
 const hour=new Date(now+9*3600000).getUTCHours();
 if(/(굿모닝|좋은\s*아침|아침\s*인사)/.test(text)&&!(hour>=5&&hour<12))return false;
 if(/(점심\s*(맛있게|맛나게)|맛있는\s*점심)/.test(text)&&!(hour>=10&&hour<15))return false;
 if(/(저녁\s*(맛있게|맛나게)|맛있는\s*저녁)/.test(text)&&!(hour>=16&&hour<22))return false;
 if(/(굿밤|잘\s*자요|잘\s*주무|편히\s*주무|좋은\s*밤)/.test(text)&&!(hour>=20||hour<6))return false;
 return true;
}

// A short line may be harmless alone but unnatural when repeated by a roomful of actors.
export function isGenericRoomChatter(text:string):boolean {
 const t=String(text||'').trim();
 return /^(?:안녕|하이|반가|ㅎㅇ|왔어요|들어왔어요|출석|좋은\s*(?:아침|저녁)|굿모닝)/.test(t)
   || /(?:유튜브|인스타|릴스|쇼츠|알고리즘|구독|팔로우|소개|사이트).{0,24}(?:보고|타고|해서|하고|누르고|왔다|왔어요|들어왔어요|넘어왔어요)/.test(t)
   || /(?:방송|라이브).{0,10}(?:기다릴게|보러\s*올게|또\s*올게|기대돼)/.test(t);
}
/** Human-like spacing: one missing space is okay; a long, unbroken line isn't. */
export function hasRunOnKoreanSpacing(text:string):boolean {
 const s=String(text||'').replace(/\uE000[^\uE001]*\uE001/g,'').replace(/\p{Extended_Pictographic}/gu,'').trim();
 if(/[가-힣]{18,}/.test(s))return true;
 const hangul=(s.match(/[가-힣]/g)||[]).length;
 return hangul>=17&&!/\s/.test(s);
}
/** Test actors must not assert that a specific item does not exist without stock/catalog evidence. */
export function inventedProductAbsence(text:string):boolean {
 const s=String(text||'').replace(/\s+/g,'');
 if(/[?？]$/.test(s))return false; // Genuine customer questions remain questions.
 return /(?:\d{2,4}|제품|상품|재고|색상|컬러)/.test(s) &&
   /(?:없는(?:것|거)?같|없는듯|없나봐|없어요|없네|없대요|품절이|품절됐|품절같)/.test(s);
}
/** Detect *repeated conversational formulas*, not merely identical sentences. */
export function reactionFamily(text:string):string {
 const s=String(text||'').replace(/\s+/g,'');
 if(/고민(?:되네|되나|돼|중이|중인데)/.test(s))return 'dilemma';
 if(/깔끔하네요|깔끔하네용|깔끔하네여/.test(s))return 'tidy';
 if(/궁금하네요|궁금하네용|궁금해요|궁금해용/.test(s))return 'curious';
 return '';
}
/** Narrow question formulas observed in production; color preference and styling
 * are different topics. Product codes, nicknames and polite endings are irrelevant. */
export function productQuestionFamily(text:string):string {
 const s=String(text||'').replace(/\s+/g,'');
 if(!/[?？]|나요|까요|가요|어때|어떤|궁금/.test(s))return '';
 if(/색감|색상|컬러|색깔|색이/.test(s)&&
   /실제|실물|화면|조명/.test(s)&&/어때|어떤|비슷|다르|같|느낌/.test(s))return '실물·화면 색감 확인 질문';
 if(/디자인/.test(s)&&/어떻게.{0,8}(나왔|빠졌)|어떤.{0,4}(느낌|모양)/.test(s))return '막연한 디자인 확인 질문';
 return '';
}
/** Summaries only: hidden messages must never become reply targets or copied dialogue. */
export function productQuestionMemory(recent:ChatObservation[],now:number):string[] {
 return [...new Set(recent.filter(r=>Number.isFinite(r.at)&&r.at<=now&&r.at>=now-90*60_000)
   .map(r=>productQuestionFamily(r.text)).filter(Boolean))];
}
/** Off-air cadence follows conversational turns, not a timer that forgets an
 * unanswered question. Descriptions/preferences never require another question. */
export function seeksAnswer(text:string):boolean {
 const s=String(text||'').replace(/\s+/g,'');
 if(/고를까|살까|어쩌지|뭘고르/.test(s)&&!/(나요|가요|까요|어때|궁금)/.test(s))return false;
 return /[?？]|(?:인|한|은|는|떤)가[요용여유]|(?:나|까)[요용여유]|어때|알려|궁금/.test(s);
}
export function offAirQuestionPending(q:Pick<QualityInput,'recent'|'now'|'offAirSince'|'lastHumanAt'>):boolean {
 const off=Date.parse(String(q.offAirSince||''));
 // Without a verified boundary we cannot call an old live question unanswered
 // in this off-air period. Existing mode/repetition checks still apply.
 if(!Number.isFinite(off)||off>q.now)return false;
 const human=Number(q.lastHumanAt)||0;
 const since=Math.max(q.now-12*60*60_000,off,
   Number.isFinite(human)&&human<=q.now?human:0);
 return q.recent.filter(r=>Number.isFinite(r.at)&&r.at<=q.now&&r.at>since)
   .sort((a,b)=>b.at-a.at).slice(0,3).some(r=>seeksAnswer(r.text));
}
/** No ending-of-show farewell for an emoji-only message or an old pause.
 * An existing paused broadcast is not evidence the stream ended just now.
 * Only affects explicitly marked TEST automation, never live customer messages. */
export function misplacedTestFarewell(text:string,context:{
 mode:StreamPhase;now:number;offAirSince?:string|null;replySourceText?:string|null;
}):boolean {
 const t=String(text||'').replace(/\s+/g,'').trim();
 if(!/(?:고생하셨|고생많으|수고하셨|수고많으|안녕히|굿밤|잘자요|잘주무|푹쉬세요)/.test(t))return false;
 const source=String(context.replySourceText||'').trim();
 const emojiOnly=Boolean(source)&&
   /[\p{Extended_Pictographic}\uE000]/u.test(source)&&
   source.replace(/\uE000[^\uE001]*\uE001/g,'')
     .replace(/[\p{Extended_Pictographic}\uFE0F\u200D\s]/gu,'').length===0;
 if(emojiOnly)return true; // Waving 👋 is not explicit proof of a farewell.
 if(context.mode==='live')return false;
 const paused=Date.parse(String(context.offAirSince||''));
 if(!Number.isFinite(paused)||context.now-paused<45*60_000)return false;
 const directFarewell=/(고생|수고|안녕히|굿밤|잘\s*자|잘\s*주무|방송.{0,8}(종료|끝))/u.test(source);
 return !directFarewell;
}
export function judgeTestChat(q:QualityInput):QualityResult {
 const text=String(q.text||'').trim(), intent=chatIntent(text);
 const fail=(reason:string):QualityResult=>({ok:false,reason,intent});
 if(!text||text.length>100)return fail('invalid-length');
 if(q.currentProduct&&productMeaningMismatch(text,q.currentProduct,q.replySourceText||''))return fail('product-meaning-mismatch');
 if(misplacedTestFarewell(text,{mode:q.mode,now:q.now,offAirSince:q.offAirSince,replySourceText:q.replySourceText}))return fail('out-of-context-farewell');
 if(hasRunOnKoreanSpacing(text))return fail('run-on-korean-spacing');
 if(inventedProductAbsence(text))return fail('unverified-product-absence');
 if(!timeAppropriateTestChat(text,q.now))return fail('wrong-kst-greeting');
 if(/밴드/.test(text))return fail('band-forbidden');
 if(q.mode!=='live'&&/(?:지금|방금|막)\s*(?:유튜브|라이브)|유튜브\s*(?:라이브|생방송|방송)\s*(?:보면서|보다가)\s*(?:바로\s*)?(?:넘어|들어|왔)/.test(text))return fail('off-live-current-stream-claim');
 if(q.mode!=='live'&&/(입어\s*(봐|주|줘)|보여\s*(줘|주)|착용해|지금.{0,8}(입어|보여|설명))/.test(text))return fail('off-live-request');
 // Operationally paused can mean broadcast finished; only AI chat policy treats it as off-air.
 if(q.mode!=='live'&&/(잠시\s*쉬는|곧\s*재개|잠깐\s*쉬었다|다시\s*시작.{0,5}(하겠|하나))/.test(text))return fail('ended-as-paused');
 if(q.mode!=='live'&&intent==='size'&&!q.currentProductKey)return fail('off-size-talk');
 const recent=q.recent.filter(r=>Number.isFinite(r.at)&&r.at<=q.now&&r.at>=q.now-30*60_000);
 const questionFamily=productQuestionFamily(text);
 if(q.mode!=='live'&&!q.replySourceIsHuman&&seeksAnswer(text)&&offAirQuestionPending(q))return fail('off-air-unanswered-question');
 if(!q.replySourceIsHuman&&questionFamily&&productQuestionMemory(q.recent,q.now).includes(questionFamily))return fail('room-repeated-product-question');
 if(!q.replySourceIsHuman&&repeatsRoomTopic(text,q.recent,q.now))return fail('room-repeated-interest');
 if(q.currentProduct&&!q.replySourceIsHuman&&conversationTopics(text).includes('appearance')&&
   !identifiesChatProduct(text,q.currentProduct)&&!identifiesChatProduct(q.replySourceText||'',q.currentProduct))return fail('unanchored-product-impression');
 // Preserve a longer read-only memory of overused reactions, including screen-cleared TEST chat.
 const family=reactionFamily(text);
 if(family && q.recent.some(r=>Number.isFinite(r.at)&&r.at<=q.now&&r.at>=q.now-90*60_000&&
   r.actorId!==q.actorId&&reactionFamily(r.text)===family))return fail('room-repeated-reaction-template');
 if(recent.some(r=>norm(r.text)===norm(text)))return fail('exact-repetition');
 // Across TEST actors, repeating the same product's size question makes the
 // room look automated even if height/weight or wording differs. This check
 // never applies to real customer messages or payment/order notifications.
 if(!q.priority&&intent==='size'&&q.currentProductKey&&recent.some(r=>
   r.productKey===q.currentProductKey&&chatIntent(r.text)==='size'&&q.now-r.at<12*60_000
 ))return fail('room-product-size-wave');
 if(!q.priority&&!q.replyingToHuman){
  if(isGenericRoomChatter(text)) {
   if(q.mode!=='live')return fail('off-air-generic-chatter');
   if(recent.some(r=>isGenericRoomChatter(r.text)&&q.now-r.at<20*60_000))return fail('room-generic-chatter-wave');
  }
  const sameActor=recent.filter(r=>r.actorId===q.actorId);
  const topicIntent=['size','length','color','price','delivery','replay','pause','visit','memory'];
  if(topicIntent.includes(intent)&&sameActor.some(r=>chatIntent(r.text)===intent&&
      (!r.productKey||r.productKey===(q.currentProductKey||''))&&q.now-r.at<20*60_000))return fail('actor-topic-repeat');
  if(['replay','pause','memory','visit'].includes(intent)&&recent.some(r=>chatIntent(r.text)===intent&&q.now-r.at<6*60_000))return fail('room-topic-repeat');
  if(!q.currentProductKey&&intent==='other'&&!recent.length)return fail('unmotivated-chat');
 }
 return {ok:true,intent};
}

/** Only a directly anchored second turn can bypass the general conversation gap.
 * Unrelated greetings and self-replies are never treated as conversational continuations. */
export function canContinueTestConversation(q:{
 mode:StreamPhase;now:number;actorId:string;replyToMessageId:number;
 lastMessage:{id:number;actorId:string;at:number}|null;
}):boolean {
 if(q.mode!=='live'||!q.lastMessage||!Number.isSafeInteger(q.replyToMessageId)||q.replyToMessageId<=0)return false;
 const last=q.lastMessage;
 return last.id===q.replyToMessageId&&last.actorId.length>0&&last.actorId!==q.actorId&&
  Number.isFinite(last.at)&&q.now-last.at>=8000&&q.now-last.at<=90000;
}

/** The only allowed same-person exception: stage-2 follow-up to their actual latest message. */
export function canContinueOwnTestTurn(q:{
 mode:StreamPhase;now:number;actorId:string;replyToMessageId:number;stage:number;
 lastMessage:{id:number;actorId:string;at:number}|null;
}):boolean{
 if(q.mode!=='live'||q.stage!==2||!q.lastMessage||!Number.isSafeInteger(q.replyToMessageId)||q.replyToMessageId<=0)return false;
 const l=q.lastMessage;
 return l.id===q.replyToMessageId&&l.actorId.length>0&&l.actorId===q.actorId&&
   Number.isFinite(l.at)&&q.now-l.at>=8000&&q.now-l.at<=90000;
}

/** Fully grounded color discussion. A third turn is a short preference, not advice. */
export function planColorTestThread(q:{
 mode:StreamPhase;stage:2|3;sourceText:string;colors:string[];productKey:string;
 sourceProductKey?:string;firstColor?:string;secondColor?:string;
}):{text:string;firstColor:string;secondColor:string}|null{
 if(q.mode!=='live'||!q.productKey||!Array.isArray(q.colors)||q.colors.length<2)return null;
 const colors=[...new Set(q.colors.map(c=>String(c||'').trim()).filter(c=>c.length>=2&&c.length<=14))];
 if(colors.length<2)return null;
 if(q.stage===2){
   if(/[?？]/.test(q.sourceText)||!/(예쁘|이쁘|고민|끌리|맘에|마음에|괜찮|색감)/.test(q.sourceText))return null;
   const first=colors.find(c=>q.sourceText.includes(c));
   if(!first)return null;
   const second=colors.find(c=>c!==first&&!q.sourceText.includes(c));
   if(!second)return null;
   return {text:`근데 ${second}도 고민되네요`,firstColor:first,secondColor:second};
 }
 if(q.sourceProductKey!==q.productKey)return null;
 if(!q.firstColor||!q.secondColor||q.firstColor===q.secondColor)return null;
 if(!colors.includes(q.firstColor)||!colors.includes(q.secondColor))return null;
 if(!q.sourceText.includes(q.secondColor))return null;
 return {text:`저는 ${q.firstColor} 쪽이요`,firstColor:q.firstColor,secondColor:q.secondColor};
}
