// lib/liveAutomationDirector.ts
// [2026-11-14 00:12 사장님 「모든 대화방식의 근본 문제」] 가상 손님 대화를 «채팅방 전체»를 보고 Gemini 가 정한다.
//   누가 말할지(아무도 안 해도 됨)·누구 글에 답할지·무슨 말 — 대화 전체(사이트 알림 포함)·상품 카드 글자·요일/시간·가상 손님 상태를 함께 보고.
//   코드 규칙은 안전장치만: 거짓 구매·결제·사용 경험, 테스트·AI 단어, 없는 상품번호, 같은 말 반복, 간격·밤.
//   돈·주문·입금 무접촉 — 채팅 글 한 줄만(기존 /api/live-chat 경로 그대로).
import type {SupabaseClient} from '@supabase/supabase-js';
import {callGeminiJson} from './geminiJson';
import {buildCompactConversationPrompt,shouldFallbackModel,eligibleTestChatSession} from './liveAutomationCompactPrompt';
import {shouldRecoverProductSilence,buildFocusedProductPrompt} from './liveAutomationProductOpportunity';
import {parseDirectorChoice,shouldTryFocusedProductTurn,cardRemainsInRotation,resolveExplicitReplyTarget} from './liveAutomationFocus';
import {readRoomSignals} from './liveAutomationRoomSignals';
import {CHAT_RATE_KEY,ratePercent,chatRateConfig} from './liveAutomationRate';
import {assessRoomTurn,type RoomTurnRow} from './liveAutomationTurnPolicy';
import {duplicateLine,safeConversationLine} from './liveAutomationPersona';
import type {AutomationContext} from './liveAutomationAuth';
import {AUTOMATION_OWNER} from './liveAutomation';
import {automationRpc,type Action,type Campaign,type Session,type Actor} from './liveAutomationServer';
import {automationPost} from './liveAutomationTransport';
import {streamModeOf} from './autoTestOrderServer';
import {judgeTestChat,canContinueTestConversation,canContinueOwnTestTurn,planColorTestThread,type ChatObservation} from './liveAutomationQualityGate'; // RURU_QUALITY_GATE_V1
import {unsupportedProductCode,unsuitableSpeech} from './liveAutomationSpeech';
import {falseExperience} from './liveAutomationDialogue';
import {mentionsNickname} from './liveAutomationConversation';
import {readEmojiSetting} from './liveChatEmojiServer';
import {readDialogueCard} from './liveAutomationDialogueServer';
import {computeWidgetFeatured} from './widgetFeaturedServer';
import {isNightKst} from './liveAutomationTempo';
import {learningDue,learningPromptText} from './liveAutomationLearning';
import {readLearning,refreshLearning} from './liveAutomationLearningServer';
import {shortProductCodes,spokenCardName,varyLaughTail} from './liveAutomationVoice';
import {readSubscribeFreeShipConfig} from './subscribeFreeShipServer';
import {isSubscribeFreeShipActive} from './subscribeFreeShip';
import {soldItems,purchaseMemoryText,type SoldItem,agreeTopic,agreeAnswerText,factTopic,factAnswerText,EMOJI_ONLY_LINES,emojiReactText,fixLaughCount,BRAND_WORDS,brandAskText,topProductNamesByBrand,smallTalkAnswer,smallTalkPool,topBrands,SMALL_TALKS,askLunaText,parseNextShow,type NextShow,greetChance,greetingPool,farewellTimePool,FAREWELL_LINES,ORDER_AFTER_LINES,ORDER_FIRST_LINES,VISIT_LINES,VISIT_RE,fillVisitLine,farewellPlan,hashOf,isEndNotice,isSizeQuestion,orderAfterDelay,orderNoticePlan,parseHeightWeight,personaVoice,sizeAnswerText,recentNameSet,similarToRecent} from './liveAutomationLines';
import {announceOrderThanks} from './liveOrderChatServer';
import {ORDERED_STYLE_LINES,PAID_STYLE_LINES,YOUTUBE_STYLE_RULES,pickStyleLines} from './liveAutomationStyleBank';

type Row=Record<string,unknown>;
async function rows<T>(q:PromiseLike<{data:unknown;error:{message:string}|null}>):Promise<T[]>{const r=await q;if(r.error)throw Error(r.error.message);return (r.data||[]) as T[];}
const GREET=/안녕|하이|반가|ㅎㅇ|왔어요|왔습니다|들어왔|좋은\s*(아침|저녁|밤)|굿모닝|굿밤/;
const WORK=/업무|출근|퇴근|회사|사무실|점심\s*시간|근무|야근/;
const kstDate=(t:number)=>new Date(t+9*3600000);
const hhmm=(iso:unknown)=>{const t=Date.parse(String(iso));return Number.isFinite(t)?kstDate(t).toISOString().slice(11,16):'';};
const clean=(s:unknown)=>String(s??'').replace(/\uE000[^\uE001]*\uE001/g,'(이모티콘)').replace(/\s+/g,' ').trim();
const roleOf=(m:Row)=>m.badge==='bot'?'사이트알림':m.automation_actor_id?'가상손님':m.badge==='crown'||m.badge==='crown_pink'?'사장님':m.badge==='mod'?'채팅관리자':'손님';
const seedOf=(a:Actor)=>Number((a as unknown as {profile?:{seed?:unknown}}).profile?.seed)||0;
/** Gemini 답이 없거나 걸러졌을 때만 쓰는 짧은 답 */
function shortReply(q:string,recent:string[],seed:number,own:string[]=[],cardPaid=false):string|null{
 // [2026-11-15 07:36 사장님] 카결 링크 안내엔 «확인할게요» 답 안 함 — 결제완료 알림 뒤에만 «결제완료했어요»
 // [2026-11-15 07:50 사장님] 결제 전 카결 링크 안내엔 «넵!·넹~·네 알겠습니다·알겠습니당» 짧게 하거나 안 하거나(반반)
 if(/카톡|링크|결제/.test(q)&&!cardPaid){
  if(Math.abs(seed)%2===1)return null;
  const acks=['넵!','넹~','네 알겠습니다','알겠습니당','넵넵','네엥'];
  for(let i=0;i<acks.length;i++){const r=acks[(Math.abs(seed>>1)+i)%acks.length];if(!duplicateLine(r,recent.slice(0,15))&&!repeatsOwnLine(r,own))return r;}
  return null;
 }
 const sets:Array<[RegExp,string[]]>=[[/카톡|링크|결제/,['카결 완료했어요~','결제완료했습니다!','카드결제 했어요 😊']],// [19:33 사장님 「안녕하세요에 네 감사합니다? 밑도 끝도 없이」] 인사엔 인사, 밤 인사엔 밤 인사, 수고엔 수고 — «감사합니다»는 감사 말에만
  [/좋은\s*(밤|꿈)|잘\s*자|굿밤|평안|편안|쉬세요|주무세요/,['언니도 좋은 밤 되세요~','언니도 푹 쉬세요!','굿밤이에요 😊','언니도 편안한 밤 되세요']],
  [/수고/,['언니 수고하셨어요~','오늘도 수고 많으셨어요!','수고하셨어요 😊']],
  [/안녕|반가|하이|어서\s*오/,['언니 안녕하세요~','안녕하세요!','언니 반가워요 😊','하이요~']],
  [/좋은\s*(하루|저녁|아침)/,['언니도 좋은 하루 되세요~','네 언니도요 😊']],
  [/감사|고마/,['감사해요~','네 감사합니다 😊','넵 감사해요!']]];
 for(const [re,list] of sets)if(re.test(q)){for(let i=0;i<list.length;i++){const r=list[(Math.abs(seed)+i)%list.length];if(!duplicateLine(r,recent.slice(0,15))&&!repeatsOwnLine(r,own))return r;}return null;}
 return null;
}
// [2026-11-14 10:22 사장님 「소개 안 하는 상품·없는 브라운·제니패딩 얘기」] 상품 얘기는 «지금 상품 카드»(+그 손님 장바구니·주문)만.
//   사이트 알림(다른 손님 장바구니·주문)에 나온 상품 이름·색, 흔한 색 이름이 카드에 없으면 버림.
const COLOR_WORDS=['블랙','화이트','베이지','브라운','카멜','그레이','네이비','아이보리','핑크','레드','초코','차콜','크림','카키','민트','실버','골드','퍼플','블루','그린','옐로우','오렌지','와인','버건디','소라','하늘','연베이지','모카','라벤더','올리브','스카이','백색','검정','검은','흰색','회색','갈색','남색'];
const NOTICE_STOP=new Set(['장바구니','담음','주문','감사합니다','카톡','카드결제','링크','확인해주세요','결제','완료','감사','외','종','사이즈','원','상품','해외배송','배송','평균','소요되며']);
export function offCardProductMention(text:string,allowed:string,notices:string[]):string|null{
 const a=allowed.replace(/\s+/g,'');
 for(const c of COLOR_WORDS)if(text.includes(c)&&!a.includes(c))return c;
 for(const n of notices){
  for(const w of n.replace(/[A-Za-z]{1,4}-?\d+/g,' ').split(/[\s·()（）,/\[\]!~]+/)){
   const t=w.replace(/[^가-힣]/g,'');
   if(t.length<2||/\*/.test(w)||NOTICE_STOP.has(t)||/님$/.test(t)||a.includes(t))continue;
   if(text.includes(t))return t;
  }
 }
 return null;
}
// [2026-11-14 10:22 사장님 「반달지도 한 말을 또 함」] 같은 가상 손님이 같은 얘기(카톡·결제 등)를 또 하면 버림
const TOPICS=[/카톡|링크|결제|입금/,/사이즈|라지|미듐|스몰|엑라|몇\s*입|입으면|맞을까|맞나요|1[4-8]\d\s*(cm|센치|에|이고|이구|,|\/)|\d{2,3}\s*(cm|키로|kg)/i,/배송|언제\s*와/];
// [2026-11-14 21:24 사장님 「밑도 끝도 없이 주어 빼고 "베이지 엑라 커요?"」] 상품 치수·핏·소재 질문은
// 어느 상품인지(상품번호·줄임말+번호) 붙어 있어야 하고, 크기·핏 질문은 자기 체형(키·몸무게·평소 사이즈)도 같이 말해야 함.
const DETAIL_Q=/엑라|어깨|가슴|기장|총장|소매|핏|사이즈|커요|작아요|크게|작게|크나요|작나요|넉넉|두께|두꺼|얇|충전재|구스|덕다운|재질|소재|원단|무게/;
const ASKING=/\?|나요|까요|가요|인가|어때|커요|작아요|되나|될까|맞나|려나|겠죠|까유|나유|까용|나용|까여|나여|을까|ㄹ까/;
const HAS_REF=/[A-Za-z]{2,3}\s?-?\s?\d{2,4}|(몽클|몽|버버|버|막스|막|프라|프|미우|로에|셀|디올|브루)\s?-?\s?\d{2,4}|\d{2,4}\s?번/i;
// [2026-11-14 21:26 사장님 「날씬한데 엑스라지를 물어봐?」] 체형과 안 맞는 사이즈를 콕 집어 묻지 않음
const SMALL_BODY=/(^|[^\d])(44|55)(반)?([^\d]|$)|마른|날씬|슬림|(4\d)\s*(kg|키로)/i;
const BIG_SIZE=/엑라|엑스라지|투엑|2\s?xl|xxl|\bxl\b|빅사이즈|(^|[^\d])(77|88)([^\d]|$)/i;
const BIG_BODY=/(^|[^\d])(77|88)(반)?([^\d]|$)|통통|덩치|빅사이즈|([7-9]\d)\s*(kg|키로)/i;
const SMALL_SIZE=/스몰|엑스스몰|\bx?s\b|(^|[^\d])(44|55)([^\d]|$)/i;
export function sizeBodyMismatch(text:string):boolean{
 const small=SMALL_BODY.test(text),big=BIG_BODY.test(text);
 if(small&&!big&&BIG_SIZE.test(text))return true;
 if(big&&!small&&SMALL_SIZE.test(text))return true;
 return false;
}
// [2026-11-14 21:38 사장님 「사이즈를 말하지 말고 키 몸무게 말하고 추천을 받아」] 사이즈 질문은
//   상품번호 + 키·몸무게 + «몇 입으면 될까요?» — S·M·L·엑라·숫자 사이즈를 콕 집어 묻지 않음
const SIZE_REC=/사이즈|몇\s*(입|사이즈|호)|입으면|입어야|맞을까|맞나|맞을지|맞아요\?|커요|작아요|크나요|작나요|엑라|넉넉|핏|될까|되나요|괜찮(나|을|아요\?)|맞으|크려|작으려|크겠|작겠|맞겠|클까|작을까|두꺼운\s*(거|옷)?\s*(입|안에)/;
const HEIGHT_WEIGHT=/1[4-8]\d\s*(cm|센치)?\s*(에|이고|이구|,|\/|\s)\s*[3-9]\d(\.\d)?\s*(kg|키로)?|키\s*1[4-8]\d.{0,8}(몸무게|[3-9]\d\s*(kg|키로))/i;
export function namesSize(text:string):boolean{
 return /(^|[^A-Za-z])(xs|s|m|l|xl|xxl|2xl|3xl)(?![A-Za-z])/i.test(text.replace(/[A-Za-z]{2,3}\s?-?\s?\d{2,4}/g,' '))
  ||/엑라|엑스라지|라지|미듐|미디움|스몰|투엑|프리사이즈|(^|[^\d])[0-5]\s*(호|사이즈)?\s*(면|이면|으로|로|입|괜찮|맞|될|되)/.test(text)
  ||/(^|[^\d])(44|55|66|77|88)(반)?\s*(사이즈)?\s*(으로|로|입|면|이면|하면)?\s*(맞|될|되|괜찮|입)/.test(text)
  // [2026-11-15 09:41 사장님] «36하면 맞을까요?»처럼 숫자 사이즈(32~48·신발 220~290)를 집는 것도 사이즈 콕 집기
  ||/(^|[^\d])(3[2-9]|4[0-8]|2[2-9][05])\s*(호|사이즈)?\s*(하면|으로|로|면|이면|입|맞|될|되|괜찮)/.test(text)
  ||/(^|[^\d])[0-5]\s*(호|사이즈)?\s*하면/.test(text);
}
// [2026-11-14 21:57 사장님 「무통장 해놓고 카결 링크 달라고」] 결제 얘기는 그 손님 주문 결제 방법과 맞아야 함
const CARD_TALK=/카결|카드\s*결제|결제\s*링크|카드\s*링크|링크/;
const BANK_TALK=/입금|계좌|무통장|이체/;
// [2026-11-15 07:36 사장님 「카결링크 확인해 달라 = 결제하라는 것. 결제완료 알림 뜬 다음 «결제완료했어요»라고 해야지 확인했다고 채팅하냐」]
//   카드 주문인데 결제확인 전이면 카톡·링크·카결 얘기 자체를 안 함(«확인했어요·볼게요» 금지),
//   결제확인(카드) 뒤엔 «결제완료·카결 완료»만 되고 «확인했/볼게요»는 안 됨.
export function cardLinkTalkBlocked(text:string,card:boolean,cardPaid:boolean):boolean{
 if(!card)return false;
 const talk=/카톡|카결|카드|링크|결제/.test(text);
 if(!talk)return false;
 if(!cardPaid)return true;
 return !/(결제|카결).{0,4}(완료|했어|했습|했당|했어용)/.test(text);
}
// 결제 전에 «확인했어요·볼게요» 같은 말(링크를 봤다는 보고)도 안 함 — «넵!·알겠습니당» 짧은 대답만
export function cardAckBlocked(text:string,card:boolean,cardPaid:boolean):boolean{
 if(!card||cardPaid)return false;
 return /확인\s*(했|할게|해볼|하구|하고|해\s*볼|완료)|볼게|보고\s*올|봤어|받았어/.test(text);
}
export function wrongPaymentTalk(text:string,card:boolean,bank:boolean):boolean{
 if(CARD_TALK.test(text)&&!card)return true;
 if(BANK_TALK.test(text)&&card&&!bank)return true;
 return false;
}
// [2026-11-14 22:08 사장님 「요고 품번이 뭐예여? — 주어를 말해, 지금 입으신 거 품번이 뭐에요 처럼」]
//   «요고·이거·그거»만 있고 뭘 가리키는지 없으면 버림. 품번 묻기는 «입으신 거·들고 계신 거·방금 보여주신 거»처럼 대상이 있어야 함.
const POINTER=/(^|\s)(요고|요거|요것|요건|이거|이것|이건|그거|그것|그건|저거|저것|저건|얘|쟤|걔)(가|는|은|도|요|이|\s|$)/;
const SUBJECT=/입으신|입은|입고\s*계신|착용|걸치신|들고\s*계신|드신|메신|신으신|보여\s*주신|보여주시는|방금\s*(보여|입|소개)|지금\s*(소개|보여|입)|소개\s*(하시는|중인)|화면|모델|언니\s*(가|가\s*)?(입|들|신|메)/;
const CODE_Q=/품번|상품\s*번호|모델\s*번호|몇\s*번\s*(이에|예|이|인)|번호\s*(가|뭐|좀)/;
export function vaguePointerQuestion(text:string):boolean{
 if(!ASKING.test(text))return false;
 if(HAS_REF.test(text))return false;
 if(CODE_Q.test(text)&&!SUBJECT.test(text))return true;
 return POINTER.test(text)&&!SUBJECT.test(text);
}
// [2026-11-14 22:18 사장님 「밑도 끝도 없이 블랙 XL도 핏 예쁘겠당」] 질문이 아니어도 사이즈·핏·치수 얘기는
//   어느 상품인지(상품번호) 없으면 버리고, 사이즈를 콕 집어 «예쁘겠다·좋겠다»는 혼잣말은 아예 버림(남한테 사이즈 권하는 꼴).
export function vagueProductRemark(text:string):boolean{
 if(ASKING.test(text))return false;
 if(namesSize(text)||/(^|[^A-Za-z])(xs|s|m|l|xl|xxl|2xl)(?![A-Za-z])/i.test(text.replace(/[A-Za-z]{2,3}\s?-?\s?\d{2,4}/g,' ')))return true;
 // [2026-11-15 23:42 사장님 「36사이즈 핏 이쁘겠당 — 사이즈 넣어서 이쁘겠다니 어설퍼」] 숫자 사이즈(36사이즈·240호)를 넣은 감탄도 버림
 if(/(^|[^\d])\d{1,3}\s*(호|사이즈|size)/i.test(text))return true;
 if(DETAIL_Q.test(text)&&!HAS_REF.test(text))return true;
 return false;
}
export function vagueProductQuestion(text:string):boolean{
 if(vagueProductRemark(text))return true;
 if(!ASKING.test(text))return false;
 if(vaguePointerQuestion(text))return true;
 const sizeAsk=SIZE_REC.test(text)&&!/기장|총장|어깨|가슴|소매|단면/.test(text.replace(/어깨\s?(넓|좁)/g,''));
 if(sizeAsk)return !HAS_REF.test(text)||!HEIGHT_WEIGHT.test(text)||namesSize(text.replace(HEIGHT_WEIGHT,' '));
 if(!DETAIL_Q.test(text))return false;
 return !HAS_REF.test(text);
}
// [2026-11-14 10:24 사장님 「누가 물어본 것도 없는데 55면 M 하면 된다」] 가상 손님은 남에게 사이즈·상품을 추천·안내하지 않음
//   (방송 목소리를 듣는 것도 아니고 정답을 모름). 자기 키·몸무게를 말하고 «묻는» 것만.
export function advisesOthers(text:string):boolean{
 if(/[?？]|까요|나요|될까|맞을까|어때요|어떤가요/.test(text))return false;
 // [2026-11-15 14:15 사장님 「165에 55면 36이나 38이 나을 것 같아용」] 돌려 말한 추천·단정도 버림 — 사이즈 답은 코드(sizeAnswerFlow)만 함
 if(/(나을|맞을|될|클|작을|괜찮을|좋을|낫)\s*(것\s*같|거\s*같|수도|듯)|(이|가)\s*나아요|(크|작)게\s*나올/.test(text)&&/사이즈|\d{2}|[sml]\b|엑라|입으|입어|크|작|맞/i.test(text))return true;
 return /(하시면|하면|입으시면|사시면|고르시면|가시면)\s*(될|돼|되|맞|괜찮|좋|딱)/.test(text)||/추천(해요|드려요|드림|합니다)|정사이즈|한\s*치수\s*(크게|작게)|(작게|크게)\s*나왔/.test(text);
}
// [2026-11-14 10:53 사장님 「별빛이 지가 한 주문에 지가 축하」] 가상 손님이 자기 닉네임을 남처럼 부르는 말은 버림(별빛향기 → 「별빛님도 주문 완료하셨네용」)
export function mentionsSelf(text:string,nick:string):boolean{
 const n=nick.replace(/\[[^\]]*\]/g,'').replace(/\s+/g,'').trim();
 if(n.length<2)return false;
 const t=text.replace(/\s+/g,'');
 if(t.includes(n))return true;
 const heads=[n.slice(0,2),n.slice(0,3),n.slice(-2),n.slice(-3)].filter(x=>x.length>=2);
 return heads.some(h=>t.includes(h+'님'));
}
// [2026-11-14 12:03 사장님 「방송 대화 분석해서 AI 업데이트」] 11/14 아침 방송(syG7P-kTyXI) 실측: 가상 손님들이 돌아가며
//  「카톡 확인했어요」 9번·「주문완료했어요」 6번·「장바구니 담았어요」 2번 — 진짜 손님은 이런 보고를 거의 안 함(4시간에 「결제완료」 1번).
//  → 장바구니 담았다는 보고는 안 함, 카톡·결제 확인/주문 완료 보고는 방 전체에서 10분에 한 번만(다른 가상 손님이 했으면 버림).
const ANNOUNCE=[/카톡|카결|링크/,/주문.{0,3}완료|주문했|결제.{0,3}완료|결제했|입금했/];
export function roomAnnounceBlocked(text:string,recentAi:string[]):boolean{
 if(/장바구니.{0,4}(담았|넣었|담아\s*놨|담아\s*뒀)/.test(text))return true;
 return ANNOUNCE.some(re=>re.test(text)&&recentAi.some(o=>re.test(o)));
}
export function repeatsOwnLine(text:string,own:string[]):boolean{
 if(!own.length)return false;
 if(duplicateLine(text,own))return true;
 return TOPICS.some(re=>re.test(text)&&own.some(o=>re.test(o)));
}
// [2026-11-14 09:03] AI 채팅 양 — 관리자 「채팅 양」(settings live_automation_chat_pace). 간격은 AI 글 사이 시간
const CHAT_PACE_KEY='live_automation_chat_pace';
export const CHAT_PACE={low:{gapMin:120000,gapMax:240000,chance:.6},normal:{gapMin:45000,gapMax:90000,chance:.75},high:{gapMin:20000,gapMax:40000,chance:.95}} as const;
export const chatPaceOf=(v:unknown):keyof typeof CHAT_PACE=>{const t=String(v??'').replace(/"/g,'').trim();return t==='low'||t==='high'?t:'normal';};
// 최근 판단 30개(침묵·걸러짐·보냄)를 남겨 «왜 조용한지» 확인할 수 있게 — settings 한 줄, 실패해도 무시
async function noteDecision(db:SupabaseClient,entry:Record<string,unknown>){
 try{
  const cur=await db.from('settings').select('value').eq('key','live_automation_director_log').maybeSingle();
  let list:unknown[]=[];try{const v=JSON.parse(String((cur.data as {value?:unknown}|null)?.value??'[]'));if(Array.isArray(v))list=v;}catch{list=[];}
  await db.from('settings').upsert([{key:'live_automation_director_log',value:JSON.stringify([entry,...list].slice(0,30))}],{onConflict:'key'});
 }catch{/* 기록 실패는 무시 */}
}
// [2026-11-15 08:49 사장님 «대답이 엄청 늦음 — 빨리·늦게·적당히 섞어서»] 실측: 올리비아 카결 링크 안내 08:26:38 → 「넵알겠습니당」 08:46:12(20분 뒤).
//   Gemini 가 그 손님에게 «넵 확인했어용»(링크 봤다는 보고 — 금지)·«카결했어요»(결제 전이라 금지)만 계속 골라 30초마다 버려졌음.
//   → 카결 링크 안내 답은 Gemini 없이 코드가 정함: 안내마다 반은 답 안 함, 반은 8~60초 사이 아무 때나 짧게(넵!·넹~·알겠습니당…).
//   2분 30초 지나면 늦은 답은 안 함.
export const humanReplyDelay=(id:number)=>4000+(Math.abs(id*104729)%41000);
/** [2026-11-15 09:31 사장님] 배송 얘기 — 해배=해외배송 2~3주·국내 2~3일은 시스템이 아는 사실.
 *  손님(AI)은 해외배송 여부를 묻지 않고(상품에 표시됨), 배송을 단정·평가·반박하지 않는다.
 *  해외배송 카드일 때만 «언제쯤 받아요?/얼마나 걸려요?» 질문 하나 허용. */
export function shippingTalkBlocked(t:string,overseas:boolean):boolean{
 if(!/배송|해배|해외|국내|택배|도착|오래\s*걸|걸리|걸려|받아요|받을|받나|받으/.test(t))return false;
 if(!overseas)return true;
 if(/해외\s*배송\s*(인가|이에|이죠|맞|이야)|해배\s*(인가|이에|이죠|맞|이야|인\s*줄)|국내|인\s*줄|오래\s*걸리네|아니/.test(t))return true;
 const asksWhen=/(얼마나|언제|며칠).{0,10}(걸|와|받|도착|오)/.test(t);
 const isQuestion=/\?|나요|까요|ㄹ까|가요|요\s*$/.test(t);
 return !(asksWhen&&isQuestion);
}

/** [2026-11-15 21:14 사장님] 품절·재고·남은 수량은 상품에 표시돼 있음 — 가상 손님이 묻지 않는다. */
export function stockQuestionBlocked(t:string):boolean{
 const ask=/\?|나요|까요|가요|가용|나용|인가|있어요|있죠|요\s*$/.test(t);
 if(!ask)return false;
 if(/품절|재고|매진|솔드\s*아웃|sold\s*out|남았|남아\s*있|몇\s*개\s*(남|있)|구할\s*수/i.test(t))return true;
 // «36호 있나요?·L 되나요?·블랙 있어요?» — 옵션(사이즈·색) 있는지 묻기도 상품에 표시됨
 return /(\d{2,3}\s*호?|\b(xs|s|m|l|xl|xxl|2xl|free)\b|사이즈|색|컬러|블랙|화이트|베이지|그레이|네이비|브라운|아이보리|카멜)\s*(은|는|도|이|가)?\s*(있|되|돼)(나요|어요|을까|죠|나|요|냐)/i.test(t);
}
export function cardAckPlan(noticeId:number,noticeAt:number,now:number):'wait'|'go'|'skip'{
 if(Math.abs(noticeId)%2===1)return 'skip';
 const age=now-noticeAt;
 if(!(age>=0)||age>150000)return 'skip';
 return age>=8000+(Math.abs(noticeId*7919)%52000)?'go':'wait';
}
const CARD_ACKS=['넵!','넹~','네 알겠습니다','알겠습니당','넵넵','네엥','넵 알겠어요','네~','넵 감사해요','알겠어요','네네','넵 언니','네 언니 감사해요','넹넹','알겠습니다 언니','넵 바로 할게요','네 할게요','넵 감사합니다','오케이요','넵넵 감사해요','네 알겠어용'];
async function cardLinkAck(db:SupabaseClient,c:Campaign,origin:string,transport:typeof fetch,now:number,sessions:Session[],actors:Actor[],messages:Row[],actions:Action[],mode:string):Promise<boolean>{
 for(const n of messages){
  if(n.badge!=='bot'||!/카톡\s*카드결제\s*링크/.test(String(n.body||'')))continue;
  const nid=Number(n.id),at=Date.parse(String(n.created_at));
  if(cardAckPlan(nid,at,now)!=='go')continue;
  const body=String(n.body||'').replace(/\s+/g,'');
  const actor=actors.find(a=>{const nick=String(a.nickname||'').replace(/\[[^\]]*\]/g,'').replace(/\s+/g,'');return nick.length>=1&&body.includes(nick+'님');});
  const s=actor&&sessions.find(x=>x.actor_id===actor.id);
  if(!actor||!s)continue;
  if(messages.some(m=>String(m.automation_actor_id||'')===String(actor.id)&&Number(m.id)>nid))continue; // 이미 그 뒤에 말함
  if(actions.some(a=>Number(((a as unknown as {plan?:{ackFor?:unknown}}).plan?.ackFor))===nid))continue; // 이미 답 차례를 만듦
  const recent=messages.filter(m=>m.badge!=='bot').map(m=>clean(m.body));
  const seed=Math.abs(seedOf(actor)+nid);
  let text='';
  for(let i=0;i<CARD_ACKS.length;i++){const r=CARD_ACKS[(seed+i)%CARD_ACKS.length];if(!duplicateLine(r,recent.slice(0,10))){text=r;break;}}
  if(!text)return false;
  text=personaVoice(text,seedOf(actor),nid);
  try{
   await automationRpc(db,'live_automation_ai_admission',{p_actor:actor.id,p_kind:'chat'});
   const action=await automationRpc<Action>(db,'live_automation_action',{p_session:s.id,p_kind:'chat',p_due:new Date().toISOString(),p_plan:{director:true,text,mode,ackFor:nid},p_manual:false,p_source:null,p_revision:c.revision});
   const claimed=await automationRpc<Action|null>(db,'live_automation_claim',{p_action:action.id,p_revision:c.revision});
   if(!claimed)return true;
   try{
    const ctx=await automationRpc<AutomationContext>(db,'live_automation_context',{p_session:claimed.session_id,p_revision:claimed.revision,p_scope:'chat'});
    await automationRpc(db,'live_automation_ai_admission',{p_actor:claimed.actor_id,p_kind:claimed.kind});
    await automationPost(origin,'/api/live-chat',ctx,claimed,'chat',{kakao_id:AUTOMATION_OWNER,bc:c.broadcast_id,body:text},transport);
    void noteDecision(db,{at:new Date(now).toISOString(),human:false,speaker:String(actor.nickname||''),raw:text,result:'sent(카결 링크 답)'});
   }catch(e){await automationRpc(db,'live_automation_complete',{p_action:claimed.id,p_lease:claimed.lease_token,p_status:'skipped',p_result:{ok:false,message:e instanceof Error?e.message:'ACK_SKIPPED'}}).catch(()=>{});}
   return true;
  }catch{return false;}
 }
 return false;
}

// ───── [2026-11-15 14:15~14:26 사장님] 코드가 정한 말(Gemini 안 부름) ─────
type CodeCtx={mode:'live'|'paused'|'replay';db:SupabaseClient;c:Campaign;origin:string;transport:typeof fetch;now:number;sessions:Session[];actors:Actor[];messages:Row[];actions:Action[];orders:Row[];live:boolean;startedAt:number;spoke:Set<string>;nextShow:NextShow|null};
const planOf=(a:Action)=>((a as unknown as {plan?:Record<string,unknown>}).plan||{});
/** 가상 손님 한 명이 정해진 말 한 줄 — DB 차례·쉬는 시간 검사(admission)를 그대로 거침. 막히면 false(다음 틱에 다시). */
async function postCodeLine(x:CodeCtx,actor:Actor,kind:'chat'|'reply',text:string,plan:Record<string,unknown>,source:number|null,label:string):Promise<boolean>{
 const s=x.sessions.find(v=>v.actor_id===actor.id);
 if(!s||!text)return false;
 if(!/주문|종료/.test(label)&&similarToRecent(String(actor.nickname||''),recentNameSet(x.messages,x.now)))return false;
 // RURU_CONTEXT_FLOW_20261118: 4,800줄 말투 자료는 발화 양을 강제하지 않는다.
 // 주문 이벤트·실제 질문 답은 유지하고, 맥락 없는 자동 인사/맞장구/잡담은 느리게 보낸다.
 const priority=/주문서|주문 알림|종료 인사|카결/.test(label);
 // The last visible non-bot message must be the exact message this reply belongs to.
 // Follow-ups may use 8-90s, while unrelated spontaneous messages retain the 90/240s rule.
 const lastNonBot=x.messages.find(m=>m.badge!=='bot');
 const linkedFollowUp=canContinueTestConversation({mode:x.mode,now:x.now,actorId:String(actor.id),replyToMessageId:Number(plan.replyToAi||0),lastMessage:lastNonBot?{id:Number(lastNonBot.id),actorId:String(lastNonBot.automation_actor_id||''),at:Date.parse(String(lastNonBot.created_at||''))}:null});
 const linkedOwn=canContinueOwnTestTurn({mode:x.mode,now:x.now,actorId:String(actor.id),replyToMessageId:Number(plan.replyToAi||0),stage:Number(plan.threadStage||0),lastMessage:lastNonBot?{id:Number(lastNonBot.id),actorId:String(lastNonBot.automation_actor_id||''),at:Date.parse(String(lastNonBot.created_at||''))}:null});
 // No existing bot/system notice or human message may intervene in a planned thread.
 const linkedThread=(linkedOwn||linkedFollowUp)&&Number(plan.threadStage||0)>=2&&Number(x.messages[0]?.id||0)===Number(plan.replyToAi||0);
 if(!priority&&!linkedFollowUp&&!linkedThread){
   const last=x.messages.filter(m=>m.automation_actor_id&&m.badge!=='bot').reduce((v,m)=>Math.max(v,Date.parse(String(m.created_at))||0),0);
   const minGap=x.live?90000:240000;
   if(last&&x.now-last<minGap)return false;
   if(!x.live&&/사이즈 대략 답|손님끼리|맞장구|이모티콘|이모지만|브랜드 또 언제|지난 구매 얘기/.test(label))return false;
 }
 // Common quality gate for code-generated messages (not only Gemini output).
 const latestBroadcast=await x.db.from('broadcasts').select('*').eq('id',x.c.broadcast_id).maybeSingle();
 if(latestBroadcast.error||!latestBroadcast.data)return false;
 const latestMode=await streamModeOf(x.db,latestBroadcast.data);
 if(latestMode!==x.mode)return false;
 const latestCard=await readDialogueCard(x.db,x.c.broadcast_id).catch(()=>null);
 const recentForGate:ChatObservation[]=x.messages.filter(m=>m.automation_actor_id&&m.badge!=='bot').map(m=>({text:clean(m.body),at:Date.parse(String(m.created_at)),actorId:String(m.automation_actor_id||'')}));
 const quality=judgeTestChat({text,mode:latestMode,now:x.now,actorId:String(actor.id),currentProductKey:latestCard?`${latestCard.productId}:${latestCard.detailName}`:null,priority,replyingToHuman:(kind==='reply'&&source!==null)||linkedFollowUp||linkedThread,recent:recentForGate,
  offAirSince:String(latestBroadcast.data.paused_at||latestBroadcast.data.ended_at||''),
  replySourceText:String(x.messages.find(m=>Number(m.id)===Number(plan.replyToAi||source||0))?.body||'')});
 if(!quality.ok)return false;
 try{await automationRpc(x.db,'live_automation_ai_admission',{p_actor:actor.id,p_kind:kind});}catch{return false;}
 const action=await automationRpc<Action>(x.db,'live_automation_action',{p_session:s.id,p_kind:kind,p_due:new Date().toISOString(),p_plan:{director:true,text,...plan},p_manual:false,p_source:source,p_revision:x.c.revision});
 const claimed=await automationRpc<Action|null>(x.db,'live_automation_claim',{p_action:action.id,p_revision:x.c.revision});
 if(!claimed)return false;
 try{
  const ctx=await automationRpc<AutomationContext>(x.db,'live_automation_context',{p_session:claimed.session_id,p_revision:claimed.revision,p_scope:'chat'});
  await automationRpc(x.db,'live_automation_ai_admission',{p_actor:claimed.actor_id,p_kind:claimed.kind});
  await automationPost(x.origin,'/api/live-chat',ctx,claimed,'chat',{kakao_id:AUTOMATION_OWNER,bc:x.c.broadcast_id,body:text},x.transport);
  void noteDecision(x.db,{at:new Date(x.now).toISOString(),human:false,speaker:String(actor.nickname||''),raw:text,result:'sent('+label+')'});
  return true;
 }catch(e){await automationRpc(x.db,'live_automation_complete',{p_action:claimed.id,p_lease:claimed.lease_token,p_status:'skipped',p_result:{ok:false,message:e instanceof Error?e.message:'CODE_LINE_SKIPPED'}}).catch(()=>{});return false;}
}
const pickLine=(pool:string[],seed:number,recent:string[])=>{for(let i=0;i<pool.length;i++){const t=pool[(Math.abs(seed)+i)%pool.length];if(!duplicateLine(t,recent))return t;}return '';};
const recentBodies=(x:CodeCtx)=>x.messages.filter(m=>m.badge!=='bot').map(m=>clean(m.body)).slice(0,15);
/** 주문서 넣었다는 말 — 주문서마다 랜덤(먼저 말하고 바로 주문 알림 / 알림 뒤 12~82초에 말함 / 안 함) */
async function orderNoticeFlow(x:CodeCtx):Promise<boolean>{
 const groups=new Map<string,{actorId:string;at:number}>();
 for(const o of x.orders){const g=String(o.order_group_id||'');const at=Date.parse(String(o.created_at));if(g&&!groups.has(g)&&at>x.now-240000)groups.set(g,{actorId:String(o.automation_actor_id),at});}
 for(const [g,info] of groups){
  const plan=orderNoticePlan(g);
  if(plan==='none')continue;
  const actor=x.actors.find(a=>String(a.id)===info.actorId);
  if(!actor)continue;
  if(x.actions.some(a=>planOf(a).orderLineFor===g))continue; // 이미 말함
  const notice=x.messages.find(m=>String(m.bot_ref||'')==='o:'+g)||null;
  const seed=hashOf(g);
  if(!notice)continue; // 알림은 제출 때 바로 올라감(22:42 사장님) — 말은 그 뒤에
  if(plan==='first'){ // «주문서 넣었어요» — 알림 바로 뒤(다음 차례)
   const at0=Date.parse(String(notice.created_at));
   if(x.now>at0+120000)continue;
   if(x.messages.some(m=>String(m.automation_actor_id||'')===info.actorId&&m.badge!=='bot'&&Number(m.id)>Number(notice.id)))continue;
   const text=personaVoice(pickLine(ORDER_FIRST_LINES,seed,recentBodies(x)),seedOf(actor),seed);
   if(await postCodeLine(x,actor,'chat',text,{orderLineFor:g},null,'주문서 넣었다'))return true;
   continue;
  }
  const at=Date.parse(String(notice.created_at));
  if(x.now<at+orderAfterDelay(g)||x.now>at+240000)continue;
  if(x.messages.some(m=>String(m.automation_actor_id||'')===info.actorId&&m.badge!=='bot'&&Number(m.id)>Number(notice.id)))continue; // 그 뒤에 이미 말함
  const text=personaVoice(pickLine(ORDER_AFTER_LINES,seed,recentBodies(x)),seedOf(actor),seed);
  if(await postCodeLine(x,actor,'chat',text,{orderLineFor:g},null,'주문 알림 뒤'))return true;
 }
 return false;
}
/** 자동 실행이 1분마다 — «먼저 말하고 바로 알림»으로 미룬 주문 알림이 75초 넘게 안 나갔으면 알림만 올림(손님이 나갔거나 차례가 막힌 경우) */
export async function flushDeferredOrderNotices(db:SupabaseClient,c:Campaign,now=Date.now()):Promise<void>{
 const os=await rows<Row>(db.from('orders').select('order_group_id,created_at').eq('broadcast_id',c.broadcast_id).not('automation_actor_id','is',null).gte('created_at',new Date(now-900000).toISOString()).neq('is_deleted',true).limit(300));
 const late=[...new Set(os.filter(o=>Date.parse(String(o.created_at))<now-45000).map(o=>String(o.order_group_id||'')).filter(g=>g&&orderNoticePlan(g)==='first'))];
 if(!late.length)return;
 const posted=await rows<Row>(db.from('live_chat_messages').select('bot_ref').eq('broadcast_id',c.broadcast_id).in('bot_ref',late.map(g=>'o:'+g)));
 const done=new Set(posted.map(r=>String(r.bot_ref)));
 for(const g of late)if(!done.has('o:'+g))await announceOrderThanks(db,g,{force:true}).catch(()=>{});
}
/** 방송 종료 안내(✅ 라이브방송이 종료되었습니다…) 첫 등장 뒤 — 이 방송에서 주문한 가상 손님 중 0~4명이 띄엄띄엄 인사 */
async function farewellFlow(x:CodeCtx):Promise<boolean>{
 if(x.mode!=='replay')return false;
 const notice=[...x.messages].reverse().find(m=>!m.automation_actor_id&&isEndNotice(String(m.body||'')))||null; // 가장 먼저 나온 것
 if(!notice)return false;
 const nid=Number(notice.id),at=Date.parse(String(notice.created_at));
 if(!(at>x.now-900000))return false;
 // 같은 방송에서 종료 안내를 또 보내도 인사는 한 번 — 이 방송에서 이미 인사 계획이 있었으면 그 안내만 따름
 const earlier=x.actions.find(a=>Number(planOf(a).farewellFor)>0&&Number(planOf(a).farewellFor)!==nid);
 if(earlier)return false;
 const orderedIds=[...new Set(x.orders.map(o=>String(o.automation_actor_id)))].filter(id=>x.sessions.some(s=>String(s.actor_id)===id)).sort();
 for(const p of farewellPlan(nid,orderedIds)){
  if(x.now<at+p.delayMs||x.now>at+p.delayMs+180000)continue;
  if(x.actions.some(a=>planOf(a).farewellFor===nid&&String(a.actor_id)===p.actorId))continue;
  const actor=x.actors.find(a=>String(a.id)===p.actorId);if(!actor)continue;
  const used=x.messages.filter(m=>m.automation_actor_id&&Number(m.id)>nid).map(m=>clean(m.body));
  const seed=hashOf(p.actorId+':'+nid);
  const text=personaVoice(pickLine(farewellTimePool(x.now),seed,[...used,...recentBodies(x)]),seedOf(actor),seed);
  if(await postCodeLine(x,actor,'reply',text,{farewellFor:nid},nid,'방송 종료 인사'))return true;
 }
 return false;
}
/** 다른 가상 손님의 사이즈 질문(키·몸무게)에 — 가끔(55%) 다른 가상 손님이 한국 사이즈 대략 + «루루언니한테 물어보세요» */
async function sizeAnswerFlow(x:CodeCtx,holds:Row[]):Promise<boolean>{
 if(!x.live)return false;
 const q=x.messages.find(m=>m.automation_actor_id&&m.badge!=='bot'&&Date.parse(String(m.created_at))>x.now-240000);
 if(!q)return false;
 const body=clean(q.body),hw=parseHeightWeight(body);
 if(!hw||!isSizeQuestion(body)||/남성|남자|남편|아들|신발|운동화|구두|\d{3}\s*(mm|사이즈)/.test(body))return false;
 const qid=Number(q.id);
 if(hashOf('size:'+qid)%100>=55)return false;
 if(x.now<Date.parse(String(q.created_at))+12000+(hashOf('sd:'+qid)%40000))return false;
 if(x.actions.some(a=>planOf(a).sizeFor===qid))return false;
 if(x.messages.some(m=>Number(m.id)>qid&&m.badge!=='bot'))return false; // 그 뒤로 이미 다른 말이 오갔으면 안 끼어듦
 const holdSessions=new Set(holds.map(h=>String(h.session_id)));
 const cands=x.actors.filter(a=>String(a.id)!==String(q.automation_actor_id)&&(x.orders.some(o=>String(o.automation_actor_id)===String(a.id))||x.sessions.some(s=>s.actor_id===a.id&&holdSessions.has(String(s.id)))));
 if(!cands.length)return false;
 const actor=cands[hashOf('sa:'+qid)%cands.length];
 const raw=sizeAnswerText(hw.h,hw.w,qid);if(!raw)return false;
 return postCodeLine(x,actor,'chat',personaVoice(raw,seedOf(actor),qid),{sizeFor:qid},null,'사이즈 대략 답');
}

/** [2026-11-15 14:30 사장님] 방송 시작 초~중반에 들어온 가상 손님이 인사 — 다양하게(기본·처음 왔어요·구독·인스타·소개·방송 시작했죠?·언니 예뻐요).
 *  들어온 지 4분 안·이 방송에서 아직 말 안 한 손님만, 손님마다 확률(시작 45분 안 45%), 방 전체 인사는 40초에 한 번·소개 인사는 6분에 한 번. */
async function greetFlow(x:CodeCtx):Promise<boolean>{
 // No synthetic arrivals after the live ends; no greeting waves in a busy room.
 if(!x.live)return false;
 const acted=(key:string,ms:number)=>x.actions.some(a=>planOf(a)[key]&&Date.parse(String((a as Action&{created_at?:unknown}).created_at))>x.now-ms);
 if(acted('greet',12*60000))return false;
 if(x.actions.filter(a=>planOf(a).greet&&Date.parse(String((a as Action&{created_at?:unknown}).created_at))>x.now-60*60000).length>=3)return false;
 if(x.messages.some(m=>!m.automation_actor_id&&m.badge!=='bot'&&Date.parse(String(m.created_at))>x.now-90_000))return false;
 const sinceStart=Number.isFinite(x.startedAt)?x.now-x.startedAt:-1;
 const k=kstDate(x.now);
 for(const s of x.sessions){
  if(!s.watching||x.spoke.has(String(s.actor_id)))continue;
  const joined=Date.parse(String(s.joined_at));
  if(!(joined>x.now-240000))continue;
  if(x.actions.some(a=>planOf(a).greet&&String(a.actor_id)===String(s.actor_id)))continue;
  const seed=hashOf('greet:'+s.id);
  if((seed%1000)/1000>=greetChance({live:x.live,sinceStartMs:sinceStart}))continue;
  if(x.now<joined+8000+(seed%50000))continue; // 들어오자마자 말고 8~58초 뒤
  const actor=x.actors.find(a=>String(a.id)===String(s.actor_id));if(!actor)continue;
  const pool=greetingPool({phase:x.mode,nextShow:x.live?null:x.nextShow,live:x.live,sinceStartMs:sinceStart,kstHour:k.getUTCHours(),visitRecently:acted('greetVisit',360000),siteRecently:acted('greetSite',480000),weekend:k.getUTCDay()===0||k.getUTCDay()===6});
  const recent=recentBodies(x);
  let g=null as (typeof pool)[number]|null;
  for(let i=0;i<pool.length;i++){const c0=pool[(seed+i*7)%pool.length];const c={...c0,text:fillVisitLine(c0.text,seed+i)};if(!duplicateLine(c.text,recent)){g=c;break;}}
  if(!g)continue;
  const text=personaVoice(g.text,seedOf(actor),seed);
  if(await postCodeLine(x,actor,'chat',text,{greet:true,...(g.kind==='visit'?{greetVisit:true}:{}),...(g.kind==='site'?{greetSite:true}:{})},null,'들어온 인사'))return true;
 }
 return false;
}

/** [2026-11-15 14:41 사장님] 진짜 손님 사이즈 질문 — 가끔(35%) 가상 손님이 숫자 없이 «방송 때 루루언니한테 물어보세요»(관리자가 먼저 답하면 안 함) */
async function humanSizeAskFlow(x:CodeCtx,holds:Row[]):Promise<boolean>{
 if(!x.live)return false;
 const q=x.messages.find(m=>!m.automation_actor_id&&m.badge!=='bot'&&!['crown','crown_pink','mod'].includes(String(m.badge||''))&&Date.parse(String(m.created_at))>x.now-180000);
 if(!q)return false;
 const body=clean(q.body);
 if(!isSizeQuestion(body)&&!/사이즈|몇\s*입|몇\s*사이즈|맞을까|클까|작을까/.test(body))return false;
 const qid=Number(q.id);
 if(hashOf('hsize:'+qid)%100>=35)return false;
 if(x.now<Date.parse(String(q.created_at))+20000+(hashOf('hsd:'+qid)%50000))return false;
 if(x.actions.some(a=>planOf(a).askLunaFor===qid))return false;
 if(x.messages.some(m=>Number(m.id)>qid&&(m.badge!=='bot')))return false; // 그 뒤 누가(사장님·손님·가상 손님) 말했으면 안 끼어듦
 const holdSessions=new Set(holds.map(h=>String(h.session_id)));
 const cands=x.actors.filter(a=>x.orders.some(o=>String(o.automation_actor_id)===String(a.id))||x.sessions.some(s=>s.actor_id===a.id&&holdSessions.has(String(s.id))));
 if(!cands.length)return false;
 const actor=cands[hashOf('ha:'+qid)%cands.length];
 return postCodeLine(x,actor,'reply',personaVoice(askLunaText(qid),seedOf(actor),qid),{askLunaFor:qid},qid,'사이즈는 루루언니한테');
}

// [2026-11-15 14:47 사장님] 최근 90일 많이 팔린 브랜드(알로·룰루레몬 가중) — 1시간 기억
let brandCache:{at:number;list:string[];names:Map<string,string[]>}|null=null;
async function hotBrands(db:SupabaseClient,now:number):Promise<string[]>{
 if(brandCache&&now-brandCache.at<3600000)return brandCache.list;
 const r=await rows<Row>(db.from('orders').select('product_name').gte('created_at',new Date(now-90*86400000).toISOString()).neq('is_deleted',true).neq('is_test_order',true).is('automation_actor_id',null).limit(5000)).catch(()=>[] as Row[]);
 const names=r.map(x=>String(x.product_name||''));
 brandCache={at:now,list:topBrands(names),names:topProductNamesByBrand(names)};
 return brandCache.list;
}
/** «알로 또 언제 해요?» — 지금 카드 상품 브랜드는 빼고, 방 전체 20분에 한 번, 한 사람 한 번 */
async function brandAskFlow(x:CodeCtx,speakers:Actor[],cardName:string):Promise<boolean>{
 if(!x.live)return false;
 if(x.actions.some(a=>planOf(a).brandAsk&&Date.parse(String((a as Action&{created_at?:unknown}).created_at))>x.now-1200000))return false;
 const said=new Set(x.actions.filter(a=>planOf(a).brandAsk).map(a=>String(planOf(a).brandAsk)));
 const brands=(await hotBrands(x.db,x.now)).filter(b=>!said.has(b)&&!BRAND_WORDS.some(([re,name])=>name===b&&re.test(cardName)));
 if(!brands.length)return false;
 const who=speakers.filter(a=>!x.actions.some(v=>planOf(v).brandAsk&&String(v.actor_id)===String(a.id)));
 if(!who.length)return false;
 const seed=Math.floor(x.now/60000);
 const actor=who[seed%who.length],brand=brands[Math.min(brands.length-1,Math.floor((hashOf('b:'+seed)%100)/100*Math.min(brands.length,3)))];
 // [23:51 사장님 「몽클레어도 해주세요 말고 정확히 등록된 상품명으로」] 실제 판 등록 상품명(MC-319 연베이지·알로 부츠컷팬츠…)만 — 브랜드 이름만은 안 씀
 const named=(brandCache?.names.get(brand)||[]);
 if(!named.length)return false;
 const label=named[hashOf('bit:'+seed)%Math.min(named.length,3)];
 return postCodeLine(x,actor,'chat',personaVoice(brandAskText(label,seed),seedOf(actor),seed),{brandAsk:brand},null,'브랜드 또 언제');
}
/** 손님끼리 한두 마디 — 시작(묻기) */
async function smallTalkStart(x:CodeCtx,speakers:Actor[],hasCard:boolean):Promise<boolean>{
 if(!x.live)return false;
 if(x.actions.some(a=>planOf(a).smallTalk&&Date.parse(String((a as Action&{created_at?:unknown}).created_at))>x.now-1080000))return false;
 const pool=smallTalkPool({live:x.live,card:hasCard});
 if(!pool.length||speakers.length<2)return false;
 const seed=Math.floor(x.now/60000);
 const t=pool[hashOf('st:'+seed)%pool.length];
 const askers=t.id==='how'?speakers.filter(a=>!x.orders.some(o=>String(o.automation_actor_id)===String(a.id))):speakers;
 if(!askers.length)return false;
 const actor=askers[hashOf('stq:'+seed)%askers.length];
 const q=t.q[hashOf('stqq:'+seed)%t.q.length];
 return postCodeLine(x,actor,'chat',personaVoice(q,seedOf(actor),seed),{smallTalk:t.id,role:'q'},null,'손님끼리 묻기');
}
/** 손님끼리 한두 마디 — 15~45초 뒤 다른 가상 손님이 짧게 답(그사이 다른 말이 오갔으면 안 함) */
async function smallTalkAnswerFlow(x:CodeCtx,holds:Row[]):Promise<boolean>{
 const qa=x.actions.find(a=>planOf(a).role==='q'&&planOf(a).smallTalk&&Date.parse(String((a as Action&{created_at?:unknown}).created_at))>x.now-120000);
 if(!qa||x.actions.some(a=>planOf(a).answerOf===qa.id))return false;
 const qText=String(planOf(qa).text||'');
 const qm=x.messages.find(m=>String(m.automation_actor_id||'')===String(qa.actor_id)&&m.badge!=='bot'&&clean(m.body)===clean(qText));
 if(!qm)return false;
 if(x.messages.some(m=>Number(m.id)>Number(qm.id)&&m.badge!=='bot'))return false;
 const qid=Number(qm.id);
 if(x.now<Date.parse(String(qm.created_at))+15000+(hashOf('sw:'+qid)%30000))return false;
 const t=SMALL_TALKS.find(v=>v.id===planOf(qa).smallTalk);if(!t)return false;
 const holdSessions=new Set(holds.map(h=>String(h.session_id)));
 const cands=x.actors.filter(a=>String(a.id)!==String(qa.actor_id)&&x.sessions.some(s=>s.actor_id===a.id));
 if(!cands.length)return false;
 const actor=cands[hashOf('swa:'+qid)%cands.length];
 const ordered=x.orders.some(o=>String(o.automation_actor_id)===String(actor.id));
 const cart=x.sessions.some(s=>s.actor_id===actor.id&&holdSessions.has(String(s.id)));
 const text=personaVoice(smallTalkAnswer(t,qid,{cart,ordered}),seedOf(actor),qid);
 return postCodeLine(x,actor,'chat',text,{smallTalk:t.id,role:'a',answerOf:qa.id,replyToAi:qid},null,'손님끼리 답');
}

/** [2026-11-15 14:49 사장님] 할 말 없을 때 이모지만(👍·😍·💕💕…) — 방 전체 5분에 한 번 */
async function emojiFiller(x:CodeCtx,speakers:Actor[]):Promise<boolean>{
 if(x.actions.some(a=>planOf(a).emojiOnly&&Date.parse(String((a as Action&{created_at?:unknown}).created_at))>x.now-300000))return false;
 if(!speakers.length)return false;
 const seed=Math.floor(x.now/30000);
 const actor=speakers[hashOf('eo:'+seed)%speakers.length];
 const recent=recentBodies(x);
 const text=pickLine(EMOJI_ONLY_LINES,hashOf('eol:'+seed),recent);
 return text?postCodeLine(x,actor,'chat',text,{emojiOnly:true},null,'이모지만'):false;
}
/** 누가 사이트 이모티콘(그림)을 쓰면 가끔(35%) «이모티콘 귀엽다» — 그 글 하나에 한 번, 방 전체 10분에 한 번 */
let emojiNameCache:{at:number;list:string[]}|null=null;
async function siteEmojiNames(db:SupabaseClient):Promise<string[]>{
 if(emojiNameCache&&Date.now()-emojiNameCache.at<300000)return emojiNameCache.list;
 const list=await readEmojiSetting(db).then(st=>st.items.filter(e=>e.on).map(e=>e.name),()=>[] as string[]);
 emojiNameCache={at:Date.now(),list};return list;
}
async function emojiCuteFlow(x:CodeCtx):Promise<boolean>{
 const m=x.messages.find(v=>v.badge!=='bot'&&//.test(String(v.body||''))&&Date.parse(String(v.created_at))>x.now-150000);
 if(!m)return false;
 const mid=Number(m.id);
 if(hashOf('cute:'+mid)%100>=35)return false;
 if(x.now<Date.parse(String(m.created_at))+10000+(hashOf('cd:'+mid)%30000))return false;
 if(x.actions.some(a=>planOf(a).emojiCute&&(Number(planOf(a).emojiCute)===mid||Date.parse(String((a as Action&{created_at?:unknown}).created_at))>x.now-600000)))return false;
 const cands=x.actors.filter(a=>String(a.id)!==String(m.automation_actor_id||'')&&x.sessions.some(s=>s.actor_id===a.id));
 if(!cands.length)return false;
 const actor=cands[hashOf('ca:'+mid)%cands.length];
 // [19:40 사장님] 같은 이모티콘 따라 쓰기·짧은 반응+등록 이모티콘 섞어서(맨날 같은 «이모티콘 귀엽네요» 안 함)
 const srcNames=[...String(m.body||'').matchAll(/\uE000[^:\uE001]+:([^\uE001]+)\uE001/g)].map(v=>v[1]);
 const siteNames=await siteEmojiNames(x.db);
 const raw=emojiReactText(srcNames,siteNames,mid+seedOf(actor));
 const text=/^(:[^:\s]+:|\s)+$/.test(raw)?raw:personaVoice(raw,seedOf(actor),mid);
 return postCodeLine(x,actor,'chat',text,{emojiCute:mid},null,'이모티콘 귀엽다');
}

/** [2026-11-15 14:51] 주문서를 이미 낸 손님이 하면 이상한 «주문 전 질문» */
export function orderedAskBlocked(t:string):boolean{
 const asking=/[?？]|나요|까요|인가|되나|돼요\?|어떻게|어디|가요$/.test(t);
 return asking&&/구독|무배|무료\s*배송|배송비|카드\s*(결제)?\s*(돼|되|가능)|결제\s*(방법|어떻게)|주문\s*(어떻게|방법)|계좌|입금\s*(어디|어떻게)|합배송/.test(t);
}

/** RURU_THREAD_V2: A maximum of three grounded TEST-chat turns on the SAME live product.
 * Stage 2: same actor adds a short second thought (20-45s after first turn).
 * Stage 3: another eligible actor briefly responds (42-90s after stage 2).
 * No background Gemini requests, no synthetic purchases, no imagined options.
 * A real customer, site notice, card change, or unrelated line breaks this thread. */
async function continueProductThread(x:CodeCtx,holds:Row[]):Promise<boolean>{
 if(!x.live||!x.messages.length)return false;
 const last=x.messages[0];
 if(last.badge==='bot'||!last.automation_actor_id)return false;
 const mid=Number(last.id),actorId=String(last.automation_actor_id);
 const at=Date.parse(String(last.created_at||''));
 if(!Number.isFinite(mid)||!Number.isFinite(at))return false;
 const age=x.now-at;
 if(age<10000||age>90000)return false;
 if(x.actions.some(a=>Number(planOf(a).threadOf)===mid))return false;
 const current=await readDialogueCard(x.db,x.c.broadcast_id).catch(()=>null);
 if(!current||!current.productId||!Array.isArray(current.colors)||current.colors.length<2)return false;
 const productKey=`${current.productId}:${current.detailName}`;
 const sourceAction=x.actions.find(a=>String(a.actor_id)===actorId&&clean(planOf(a).text)===clean(last.body));
 const sourcePlan=sourceAction?planOf(sourceAction):null;
 // Avoid replacing genuine question/answer, order, welcome, or greeting flows with small talk.
 if(sourcePlan&&(sourcePlan.greet||sourcePlan.orderLineFor||sourcePlan.farewellFor||(sourcePlan.replyToAi&&!sourcePlan.threadStage)||sourcePlan.smallTalk||sourcePlan.role||sourcePlan.emojiOnly||sourcePlan.emojiCute||sourcePlan.sizeFor))return false;
 const stage=Number(sourcePlan?.threadStage||0);
 if(stage===3)return false;
 const seed=hashOf('thread:'+mid);
 const chosen=planColorTestThread({mode:x.mode,stage:stage===2?3:2,
   sourceText:clean(last.body),colors:current.colors,productKey,
   sourceProductKey:stage===2?String(sourcePlan?.threadProductKey||''):productKey,
   firstColor:stage===2?String(sourcePlan?.threadFirst||''):undefined,
   secondColor:stage===2?String(sourcePlan?.threadSecond||''):undefined});
 if(!chosen)return false;
 if(stage===0){
   if(seed%100>=38||age<20000||age>45000)return false;
   const actor=x.actors.find(a=>String(a.id)===actorId);
   if(!actor)return false;
   return postCodeLine(x,actor,'reply',chosen.text,{threadStage:2,threadOf:mid,
     replyToAi:mid,threadProductKey:productKey,threadFirst:chosen.firstColor,
     threadSecond:chosen.secondColor},mid,'상품 색상 이어 말하기');
 }
 if(stage===2){
   if(seed%100>=55||age<42000||age>90000)return false;
   const holders=new Set(holds.map(h=>String(h.session_id)));
   const eligible=x.actors.filter(a=>String(a.id)!==actorId&&x.sessions.some(s=>s.actor_id===a.id&&
      (x.orders.some(o=>String(o.automation_actor_id)===String(a.id))||holders.has(String(s.id)))));
   if(!eligible.length)return false;
   const actor=eligible[seed%eligible.length];
   return postCodeLine(x,actor,'reply',chosen.text,{threadStage:3,threadOf:mid,replyToAi:mid,
     threadProductKey:productKey,threadFirst:chosen.firstColor,threadSecond:chosen.secondColor},mid,'상품 색상 대화 마무리');
 }
 return false;
}

/** [2026-11-15 14:53~14:54 사장님] 다른 가상 손님 말에 한두 마디 — 사실이 정해진 질문엔 답(65%), 좋다·기대된다 같은 말엔 맞장구(35%).
 *  그 글 뒤에 아무도(사람·가상 손님) 말 안 했을 때만, 10~40초 뒤, 방 전체 2분에 한 번. */
async function replyToAiFlow(x:CodeCtx):Promise<boolean>{
 const m=x.messages.find(v=>v.badge!=='bot');
 if(!m||!m.automation_actor_id)return false; // 가장 최근 글이 가상 손님 글일 때만
 const at=Date.parse(String(m.created_at)),mid=Number(m.id);
 if(!(at>x.now-120000))return false;
 if(x.now<at+10000+(hashOf('rw:'+mid)%30000))return false;
 if(x.actions.some(a=>Number(planOf(a).replyToAi)===mid))return false;
 if(x.actions.some(a=>planOf(a).replyToAi&&Date.parse(String((a as Action&{created_at?:unknown}).created_at))>x.now-120000))return false;
 // 이 글이 다른 가상 손님에 대한 답·맞장구였으면 또 받지 않음(끝없는 주고받기 금지)
 if(x.actions.some(a=>String(a.actor_id)===String(m.automation_actor_id)&&(planOf(a).replyToAi||planOf(a).role==='a'||planOf(a).sizeFor||planOf(a).askLunaFor)&&clean(planOf(a).text)===clean(m.body)))return false;
 const body=clean(m.body);
 if(x.actions.some(a=>planOf(a).role==='q'&&clean(planOf(a).text)===body))return false; // 손님끼리 묻기는 그쪽에서 답함
 const subscribeOn=await readSubscribeFreeShipConfig(x.db).then(cfg=>isSubscribeFreeShipActive(cfg)).catch(()=>false);
 const card=await readDialogueCard(x.db,x.c.broadcast_id).catch(()=>null);
 const fact=factTopic(body,{subscribeOn,overseas:Boolean(card?.overseas),live:x.live});
 let text:string|null=null;
 if(fact){
  if(hashOf('fq:'+mid)%100>=65)return false;
  if((fact==='card'||fact==='overseas')&&x.messages.some(v=>Number(v.id)>mid&&v.badge==='bot'))return false; // 쇼핑도우미가 이미 답함
  text=factAnswerText(fact,mid);
 }else{
  const ag=agreeTopic(body);
  if(!ag||hashOf('aq:'+mid)%100>=35)return false;
  text=agreeAnswerText(ag,body,mid);
 }
 if(!text)return false;
 const cands=x.actors.filter(a=>String(a.id)!==String(m.automation_actor_id)&&x.sessions.some(s=>s.actor_id===a.id));
 if(!cands.length)return false;
 const actor=cands[hashOf('ra:'+mid)%cands.length];
 return postCodeLine(x,actor,'chat',personaVoice(text,seedOf(actor),mid),{replyToAi:mid},null,fact?'가상 손님 질문에 답':'맞장구');
}

// [2026-11-15 15:02 사장님 「뭐 팔았는지 인식되는지 시험」] 30~90일 전 실제 판 상품(브랜드+품목) — 1시간 기억
let soldCache:{at:number;list:SoldItem[]}|null=null;
async function hotSoldItems(db:SupabaseClient,now:number):Promise<SoldItem[]>{
 if(soldCache&&now-soldCache.at<3600000)return soldCache.list;
 const r=await rows<Row>(db.from('orders').select('product_name,color,size').gte('created_at',new Date(now-90*86400000).toISOString()).lt('created_at',new Date(now-30*86400000).toISOString()).neq('is_deleted',true).neq('is_test_order',true).is('automation_actor_id',null).limit(5000)).catch(()=>[] as Row[]);
 soldCache={at:now,list:soldItems(r as {product_name?:unknown;color?:unknown;size?:unknown}[])};
 return soldCache.list;
}
/** 지난 구매 얘기 — 방 전체 12분에 한 번·한 사람 한 번. 일반 손님 화면엔 안 보임(isTestOnlyLine) */
async function purchaseMemoryFlow(x:CodeCtx,speakers:Actor[]):Promise<boolean>{
 if(!x.live)return false;
 if(x.actions.some(a=>planOf(a).memory&&Date.parse(String((a as Action&{created_at?:unknown}).created_at))>x.now-3600000))return false;
 const items=await hotSoldItems(x.db,x.now);
 const exact=items.filter(it=>it.item.length>=3 && !/^(쭈리|기모|후드|니트|크롭|오버핏)$/.test(it.item));
 if(!exact.length)return false;
 const who=speakers.filter(a=>!x.actions.some(v=>planOf(v).memory&&String(v.actor_id)===String(a.id)));
 if(!who.length)return false;
 const seed=Math.floor(x.now/60000);
 const actor=who[hashOf('pm:'+seed)%who.length];
 const it=exact[hashOf('pmi:'+seed)%exact.length]; // 많이 팔린 것일수록 자주
 return postCodeLine(x,actor,'chat',personaVoice(purchaseMemoryText(it,seed),seedOf(actor),seed),{memory:`${it.brand} ${it.item}`.trim()},null,'지난 구매 얘기(시험)');
}
export async function runRoomDirector(db:SupabaseClient,c:Campaign,origin:string,transport:typeof fetch=fetch){
 if(!c.chat_enabled)return;
 // [2026-11-14] 학습 노트 — 3시간마다(새 채팅 40개 이상) 자동 정리, 실패해도 대화는 계속
 let learning=(await readLearning(db).catch(()=>null))?.notes||null;
 if(learning&&learningDue(learning,Date.now(),9999)){await refreshLearning(db,c.broadcast_id).catch(()=>null);learning=(await readLearning(db).catch(()=>null))?.notes||learning;}
 const now=Date.now(),k=kstDate(now);
 const sessions=await rows<Session>(db.from('live_automation_sessions').select('*').eq('campaign_id',c.id).is('stopped_at',null).gt('leave_at',new Date(now+30000).toISOString()));
 if(!sessions.length)return;
 const ids=sessions.map(s=>s.actor_id);
 const [actors,holds,orders,actions,messages,previousTestChat,bc,payments,spokeRows,paceRow,chatRateRow]=await Promise.all([
  rows<Actor>(db.from('live_automation_actors').select('*').in('id',ids).is('retired_at',null)),
  rows<Row>(db.from('live_automation_cart_holds').select('session_id,items').in('session_id',sessions.map(s=>s.id)).gt('expires_at',new Date(now).toISOString())),
  rows<Row>(db.from('orders').select('automation_actor_id,product_name,color,size,payment_method,order_group_id,created_at').in('automation_actor_id',ids).eq('broadcast_id',c.broadcast_id).neq('is_deleted',true)),
  rows<Action>(db.from('live_automation_actions').select('*').eq('campaign_id',c.id).gte('created_at',new Date(now-3600000).toISOString()).limit(500)),
  rows<Row>(db.from('live_chat_messages').select('id,nickname,body,created_at,badge,bot_ref,automation_actor_id,automation_action_id').eq('broadcast_id',c.broadcast_id).is('hidden_at',null).order('id',{ascending:false}).limit(40)),
  // Read-only quality memory: screen-clear hides messages in UI but should NOT reset anti-repeat checks.
  // Never use these hidden rows as reply targets, sales evidence, or public chat context.
  rows<Row>(db.from('live_chat_messages').select('id,body,created_at,automation_actor_id,automation_action_id').eq('broadcast_id',c.broadcast_id)
    .not('automation_actor_id','is',null).gte('created_at',new Date(now-2*60*60_000).toISOString())
    .order('id',{ascending:false}).limit(120)),
  db.from('broadcasts').select('*').eq('id',c.broadcast_id).maybeSingle(),
  rows<Row>(db.from('live_automation_payment_events').select('actor_id,kind').eq('campaign_id',c.id).eq('status','sent').limit(500)),
  rows<Row>(db.from('live_chat_messages').select('automation_actor_id').eq('broadcast_id',c.broadcast_id).in('automation_actor_id',ids).limit(2000)),
  db.from('settings').select('value').eq('key',CHAT_PACE_KEY).maybeSingle().then(r=>(r.data as {value?:unknown}|null)?.value,()=>null),
  db.from('settings').select('value').eq('key',CHAT_RATE_KEY).maybeSingle().then(r=>(r.data as {value?:unknown}|null)?.value,()=>null),
 ]);
 if(bc.error||!bc.data||!actors.length)return;
 const mode0=await streamModeOf(db,bc.data);
 const chatRate=ratePercent(chatRateRow,paceRow);
 if(chatRate===0)return; // 0% suppresses new TEST conversations; no customer impact.
 // [2026-11-15 14:34 사장님] 다음 방송 예정 — 관리자 「잠시 쉬는 중 문구」(예: 11/15(일) 저녁7시 예정). 시간을 못 읽으면 null
 const pausedRaw=await db.from('settings').select('value').eq('key','live_paused_text').maybeSingle().then(r=>String((r.data as {value?:unknown}|null)?.value??''),()=>'');
 const nextShow=mode0==='live'?null:parseNextShow(pausedRaw,now);
 if(await cardLinkAck(db,c,origin,transport,now,sessions,actors,messages,actions,mode0).catch(()=>false))return;
 // [2026-11-15 14:15~14:26 사장님] Gemini 없이 코드가 정한 말 — 주문서 넣었다는 말(알림 앞/뒤 랜덤)·방송 종료 인사·사이즈 대략 답
 // RURU_CONVERSATION_COORDINATOR_V2: no preemptive canned greetings or fixed three-turn conversations.
 // The model chooses between a grounded turn and silence. System cart/order notices remain untouched.
 // 언제 판단할지: 사람이 새 글을 쓰면(아직 판단 안 한 글) 10초 뒤 바로, 아니면 AI 글 사이 20~45초 + 확률(밤엔 아주 드물게)
 const considered=Math.max(0,...actions.map(a=>Number((a as Action&{source_message_id?:unknown}).source_message_id)||0));
 const newestHuman=messages.find(m=>!m.automation_actor_id&&m.badge!=='bot'&&!m.bot_ref&&Number(m.id)>considered&&Date.parse(String(m.created_at))>now-180000)||null;
 const lastAi=Math.max(0,...messages.filter(m=>m.automation_actor_id).map(m=>Date.parse(String(m.created_at))||0));
 const lastAction=Math.max(0,...actions.filter(a=>a.kind!=='order').map(a=>Date.parse(String((a as Action&{created_at?:unknown}).created_at))||0));
 // [2026-11-15 08:49 사장님 «빨리 할 때도·늦게 할 때도·적당히»] 사람 글에 답하는 시각을 글마다 다르게 4~45초(그 안에서 고르게)
 if(newestHuman){if(now-lastAction<10000)return;if(now-Date.parse(String(newestHuman.created_at))<Math.max(8_000,humanReplyDelay(Number(newestHuman.id))))return;}
 else{
  // DB 가 정한 방 쉬는 시간(auto_chat_after) 안이면 Gemini 를 부르지 않음(불러도 글이 막힘)
  const restUntil=Date.parse(String((c as Row).auto_chat_after||''));
  if(restUntil&&restUntil>now)return;
  // [2026-11-14 09:03 사장님 「채팅량도 적게·보통·많게」] 관리자 「채팅 양」 설정으로 AI 글 사이 간격·차례 확률을 정함(밤은 그대로 드물게)
  const pace=chatRateConfig(chatRate);
  const naturalGap=mode0==='live'?pace.gapMin+Math.floor(Math.random()*(pace.gapMax-pace.gapMin)):Math.max(120000,Math.round(pace.gapMax*2.4));
  if(now-lastAi<naturalGap||now-lastAction<(mode0==='live'?20000:90000))return;
  if(Math.random()>(isNightKst(now)?.08:mode0==='live'?pace.chance:Math.min(.65,pace.chance*.65)))return;
 }
 const spoke=new Set(spokeRows.map(r=>String(r.automation_actor_id)));
 const mode=await streamModeOf(db,bc.data);
 const card=await readDialogueCard(db,c.broadcast_id).catch(()=>null);
 // [2026-11-15 08:44 사장님] «구독하면 무배?»는 관리자에서 구독 인증 무료배송이 켜져 있을 때만
 const subscribeOn=await readSubscribeFreeShipConfig(db).then(cfg=>isSubscribeFreeShipActive(cfg)).catch(()=>false);
 const weekday=['일','월','화','수','목','금','토'][k.getUTCDay()],weekend=k.getUTCDay()===0||k.getUTCDay()===6;
 const roster=actors.flatMap(a=>{
  const s=sessions.find(x=>x.actor_id===a.id);if(!s)return [];
  const mine=orders.filter(o=>o.automation_actor_id===a.id);
  const hold=holds.find(h=>h.session_id===s.id);
  const cartItems=Array.isArray(hold?.items)?(hold?.items as Row[]):[];
  return [{actor:a,session:s,first:!spoke.has(a.id),
   ordered:mine.map(o=>[o.product_name,o.color,o.size].filter(Boolean).join(' ')),
   cardOrder:mine.some(o=>/카드/.test(String(o.payment_method||''))),
   bankOrder:mine.some(o=>!/카드/.test(String(o.payment_method||''))),
   cart:cartItems.map(i=>[i.productName,i.color,i.size].filter(Boolean).join(' ')),
   paid:payments.filter(p=>p.actor_id===a.id).map(p=>String(p.kind)),
   own:messages.filter(m=>String(m.automation_actor_id||'')===String(a.id)).map(m=>clean(m.body)).slice(0,8)}];
 });
 // [2026-11-14 21:07 사장님 「글이 안 올라와」] DB(live_automation_eligibility)는 오늘 담았거나 주문한 가상 손님만 AI 글을 허락함.
 // 그 밖의 손님을 말하게 고르면 전부 AI_NOT_ELIGIBLE 로 막혀 조용해졌음 → 처음부터 말할 수 있는 손님만 후보로.
 // [2026-11-15 03:47 사장님 「민여사 불렀는데 대답 안 함」] 자정이 지나도 이 방송에서 주문한 손님은 계속, 사람이 이름을 부른 손님은 장바구니·주문 없어도 답할 수 있게.
 const called=newestHuman?roster.filter(r=>mentionsNickname(String(newestHuman.body||''),r.actor.nickname)):[];
 const lastAiRow=messages.find(m=>m.automation_actor_id&&m.badge!=='bot'); // 주문 알림(루루동이 봇 글)은 빼고 진짜 가상 손님 글만
 const lastAiNick=lastAiRow&&Date.parse(String(lastAiRow.created_at))>now-180000?String(lastAiRow.nickname||''):'';
 // Only target sessions actually present with a fresh heartbeat. This matches
 // the server's TEST-chat admission instead of wasting model calls on actors
 // that will be rejected as AI_NOT_ELIGIBLE.
 const presence=await db.from('visitor_presence').select('automation_session_id')
   .in('automation_session_id',sessions.map(s=>s.id))
   .gt('last_seen_at',new Date(now-75_000).toISOString()).limit(300);
 if(presence.error)return;
 const presentSessionIds=new Set((presence.data||[]).map(v=>String(v.automation_session_id)));
 const speakable0=roster.filter(r=>called.includes(r)||eligibleTestChatSession(r.session,presentSessionIds,now));
 // [18:57 사장님 「닉네임도 맘맘 똑같고」] 바로 앞 가상 손님과 비슷한 닉네임(○○맘·○○맘)은 이번 차례 빼기(불린 손님은 그대로)
 const recentNames=recentNameSet(messages,now);if(lastAiNick)recentNames.push(lastAiNick);
 const notSimilar=speakable0.filter(r=>called.includes(r)||!similarToRecent(String(r.actor.nickname||''),recentNames));
 const speakable=called.length?called:speakable0; // A directly addressed actor takes precedence; a person may also speak twice.
 if(!speakable.length)return;
 roster.splice(0,roster.length,...speakable);
 // No roulette choosing stock small talk, emoji filler or fake purchase memories.
 const recent=messages.filter(m=>m.badge!=='bot').map(m=>clean(m.body));
 const recentAi=messages.filter(m=>m.automation_actor_id&&m.badge!=='bot'&&Date.parse(String(m.created_at))>now-600000).map(m=>clean(m.body));
 const notices=messages.filter(m=>m.badge==='bot'&&/^(c|o|p):/.test(String(m.bot_ref||''))).map(m=>clean(m.body));
 const transcript=[...messages].reverse().map(m=>`#${m.id} ${hhmm(m.created_at)} ${clean(m.nickname)||'알림'}(${roleOf(m)}): ${clean(m.body).slice(0,140)}`).join('\n');
 const rosterText=roster.map(r=>`- ${r.actor.nickname}: ${r.first?'이 방송에서 아직 말 안 함(인사는 강제하지 않음)':'이미 대화함'} / 장바구니 ${r.cart.join(', ')||'없음'} / 주문 ${r.ordered.join(', ')||'없음'}${r.cardOrder?(r.paid.includes('card')?'(카드결제 주문 — 결제 완료됨)':'(카드결제 주문 — 아직 결제 전, 카톡·링크 얘기 금지)'):''}${r.bankOrder&&!r.cardOrder?'(무통장 주문 — 계좌로 입금, 카드 결제 링크 없음)':''} / 결제확인 ${r.paid.length?'받음':'아직'}${r.own.length?` / 이미 한 말: ${r.own.slice(0,4).map(x=>`「${x.slice(0,30)}」`).join(' ')}`:''}`).join('\n');
 const cardText=card?`${spokenCardName(card.name)} / 색상 ${card.colors.join(',')||'-'} / 사이즈 ${card.sizes.join(',')||'-'}${card.overseas?' / 해외배송':''}`:'없음';
 // [2026-11-15 08:49] 최근 10분 걸러진 말(규칙 위반) — 같은 말을 계속 골라 30초마다 버려지며 조용해지던 것 막기
 const roomSignals=await readRoomSignals(db,c.broadcast_id,now).catch(()=>({style:'실제 채팅 표본을 못 읽음',realOrderProducts:[] as string[]}));
 // Read recent decisions once, preserving an auditable cooldown for a focused retry.
 const decisionLog:Row[]=await db.from('settings').select('value').eq('key','live_automation_director_log').maybeSingle().then(r=>{try{const v=JSON.parse(String((r.data as {value?:unknown}|null)?.value??'[]'));return Array.isArray(v)?v.filter((e:unknown):e is Row=>Boolean(e)&&typeof e==='object'&&!Array.isArray(e)):[];}catch{return [] as Row[];}},()=>[] as Row[]);
 const rejectedLines=decisionLog.filter(e=>e.result==='rejected'&&Date.parse(String(e.at))>now-600000).map(e=>`${clean(e.speaker)}: ${clean(e.raw)}`).slice(0,6);
 const lastFocusAt=Math.max(0,...decisionLog.filter(e=>e.result==='focus-attempt').map(e=>Date.parse(String(e.at))||0));
 const selectionBucket=Math.floor(now/180_000);
 // Rotate the small candidate set; prioritize a recently addressed TEST identity.
 const sortedRoster=[...roster].sort((a,b)=>hashOf(String(a.actor.id)+':'+selectionBucket)-hashOf(String(b.actor.id)+':'+selectionBucket));
 const modelRoster=[...called,...sortedRoster.filter(r=>!called.includes(r))].slice(0,8);
 const prompt=buildCompactConversationPrompt({
   mode,cardText,messages,pendingHumanId:newestHuman?Number(newestHuman.id):null,
   styleSummary:roomSignals.style,realOrderProducts:roomSignals.realOrderProducts,rejectedLines,
   nextShow:nextShow?nextShow.when:null,
   actors:modelRoster.map(r=>({nickname:String(r.actor.nickname),own:r.own,cart:r.cart,ordered:r.ordered,paid:r.paid}))
 });
 const priority=newestHuman?'interactive':'background';
 // A timeout is a service failure, not a decision to stay silent. Retry ONCE with a
 // different permitted model and the same grounded, short context. No extra turns.
 const primary=await callGeminiJson(prompt,{timeoutMs:12000,maxTokens:320,maxAttempts:1,temperature:.75,
   priority,models:['gemini-3.5-flash-lite']});
 let ans=primary;
 if(shouldFallbackModel(primary)){
   const secondary=await callGeminiJson(prompt,{timeoutMs:11000,maxTokens:320,maxAttempts:1,temperature:.75,
     priority,models:['gemini-3.1-flash-lite']});
   ans=secondary;
   void noteDecision(db,{at:new Date(now).toISOString(),result:'model-fallback',primary:primary.note.slice(0,80),secondary:secondary.note.slice(0,80)});
 }
 const firstChoice=parseDirectorChoice(ans.text,modelRoster.map(r=>String(r.actor.nickname)));
 let pick:Row=firstChoice.reason==='ok'?{speaker:firstChoice.speaker,text:firstChoice.text,replyTo:firstChoice.replyTo}:{};
 let lastModelNote=ans.note;
 let choiceReason=firstChoice.reason;
 let chosenPath='normal';
 const lastHumanRow=messages.find(m=>!m.automation_actor_id&&m.badge!=='bot'&&!m.bot_ref);
 const lastHumanAt=lastHumanRow?Date.parse(String(lastHumanRow.created_at))||0:0;
 // A verified displayed product can merit a rare, grounded conversational turn.
 // Retry once with a compact prompt if the full-context model returned no valid speaker.
 // The persisted 'focus-attempt' log prevents repeatedly retrying on each scheduler tick.
 if(!firstChoice.speaker&&!/no_key|quota|timeout|fetch_error|http_5\d\d/.test(ans.note)&&(
   mode==='live'?shouldRecoverProductSilence({
     now,mode,hasCard:Boolean(card),chatRate,hasPendingHuman:Boolean(newestHuman),
     lastHumanAt,lastAiAt:lastAi,lastFocusAt,candidates:roster.length
   }):shouldTryFocusedProductTurn({
     now,mode,hasProduct:Boolean(card),hasPendingHuman:Boolean(newestHuman),
     lastHumanAt,lastAiAt:lastAi,lastFocusAt
   })
 )){
   await noteDecision(db,{at:new Date(now).toISOString(),result:'focus-attempt',mode,cardPresent:true,firstReason:firstChoice.reason,firstModel:ans.note.slice(0,85)});
   const bucket=Math.floor(now/(10*60_000));
   const candidates=[...roster].sort((a,b)=>hashOf(String(a.actor.id)+':'+bucket)-hashOf(String(b.actor.id)+':'+bucket)).slice(0,6);
   const focusedPrompt=buildFocusedProductPrompt({
     productName:card?.name||'',colors:card?.colors||[],
     candidates:candidates.map(r=>String(r.actor.nickname)),recentAi
   });
   if(!focusedPrompt)return;
   const focused=await callGeminiJson(focusedPrompt,{timeoutMs:12000,maxTokens:200,maxAttempts:2,temperature:.8,priority:'background',models:['gemini-3.5-flash-lite','gemini-3.1-flash-lite']});
   const retryChoice=parseDirectorChoice(focused.text,candidates.map(r=>String(r.actor.nickname)));
   lastModelNote=focused.note;
   choiceReason=retryChoice.reason;
   chosenPath='focused';
   if(retryChoice.reason==='ok')pick={speaker:retryChoice.speaker,text:retryChoice.text,replyTo:retryChoice.replyTo};
   else await noteDecision(db,{at:new Date(now).toISOString(),result:'focus-unsent',why:retryChoice.reason,model:focused.note.slice(0,85),cardPresent:Boolean(card)});
 }
 const speaker=roster.find(r=>r.actor.nickname===String(pick.speaker||'').trim())||null;
 const replyId=Number(pick.replyTo)||0;
 // Reply to a specific recent human or TEST message only. A new human
 // message by itself is not proof that an unrelated AI product question answers it.
 const target=resolveExplicitReplyTarget(replyId,messages.filter(m=>!m.bot_ref),now);
 const acceptable=(t:string,r:(typeof roster)[number],tgt:Row|null)=>{
  if(t.length<1||t.length>70)return false;
  if(/밴드/.test(t))return false;
  if(mode!=='live'&&/(지금|방금|현재).{0,12}(입으|보여|설명|방송.{0,3}(중이|하|켜져))/.test(t)&&!/방송.{0,3}(중.{0,3}아니|끝|종료)/.test(t))return false;
  // Paused is off-air for AI chat: allow end-of-broadcast reactions without changing broadcast status.
  if(mode!=='live'&&/(방송\s*(곧\s*재개|잠시\s*쉬는\s*중)|잠깐\s*쉬었다\s*오)/.test(t))return false;
  if(!safeConversationLine(t,r.paid.length>0)||/가상|봇|자동|테스트/.test(t))return false;
  const pk=r.paid.includes('card')?'card':r.paid.includes('bank')?'bank':undefined;
  if(falseExperience(t.replace(/(링크|카톡|톡|문자|알림).{0,6}(받았|왔)/g,''),pk))return false;
  if(unsupportedProductCode(t,[...r.ordered,...r.cart,...(card?[card.name]:[])].map(productName=>({productName}))))return false;
  if(!tgt&&(unsuitableSpeech(t,mode,'chat')||duplicateLine(t,recent.slice(0,15))))return false;
  if(!r.ordered.length&&/주문.{0,8}(했|냈|넣었|제출했|보냈|완료)/.test(t))return false;
  if(repeatsOwnLine(t,r.own)||advisesOthers(t)||mentionsSelf(t,r.actor.nickname))return false;
  if(vagueProductQuestion(t)||sizeBodyMismatch(t))return false;
  if(wrongPaymentTalk(t,r.cardOrder,r.bankOrder))return false;
  if(cardLinkTalkBlocked(t,r.cardOrder,r.paid.includes('card')))return false;
  if(cardAckBlocked(t,r.cardOrder,r.paid.includes('card')))return false;
  if(!tgt&&roomAnnounceBlocked(t,recentAi))return false;
  if(offCardProductMention(t,[card?`${card.name} ${card.colors.join(' ')}`:'',...r.cart,...r.ordered].join(' '),notices))return false;
  if(/([가-힣]{2,}요)[\s\S]*\1/.test(t))return false;
  // 시청 상태 혼잣말은 금지 — 단 방송 시간이 아닐 때 «다시보기 보면서 주문/담기» 얘기는 사장님 요청(08:26)이라 허용
  if(/다시\s*보기|구경\s*(하는|중|하고)/.test(t)&&!(mode!=='live'&&/다시\s*보기/.test(t)&&/주문|담/.test(t)))return false;
  if(!subscribeOn&&/무배|무료\s*배송|구독.{0,6}(하면|인증|무료)/.test(t))return false;
  // [2026-11-15 14:51 사장님 「이미 주문서 냈는데 구독 무배를 물어?」] 주문서를 이미 낸 손님은 주문 전에 물을 말(구독·무배·배송비·카드 돼요·주문 방법·계좌) 안 함
  if(r.ordered.length&&orderedAskBlocked(t))return false;
  // [2026-11-15 14:51 사장님 「샵 뭔소리야? 우리가 샵이 어딨어」] 매장·샵이 없음 — 지어낸 장소·신청 경로 말 버림, 구독 인증은 주문서에서 캡처 올리는 것
  if(/샵|숍|매장|오프라인|스토어|가게에서|앱에서\s*신청|홈페이지에서\s*신청/.test(t))return false;
  if(/구독/.test(t)&&/신청했|인증했|등록했|가입했/.test(t)&&!/주문서/.test(t))return false;
  if(shippingTalkBlocked(t,Boolean(card?.overseas)))return false;
  // [2026-11-15 21:14 사장님 「막스119 36호 품절인가용? — 시스템 안 봐?」] 품절·재고는 사이트 상품에 표시됨 → 품절·재고·남았나 묻는 말 버림
  if(stockQuestionBlocked(t))return false;
  // [09:44 사장님 「배송 기간 질문은 아주 가끔, 남발 금지」] 다른 가상 손님이 최근(대화 40줄 안) 배송을 물었으면 버림
  if(/배송|받아요|받을|걸려|걸리/.test(t)&&messages.some(m=>m.automation_actor_id&&m.badge!=='bot'&&/배송|언제쯤\s*받|며칠\s*걸|얼마나\s*걸/.test(clean(m.body))))return false;
  // [09:31 사장님] 안내 글에 «아니 국내배송»처럼 대꾸 — 사람 글에 답하는 게 아니면 반박·맞장구로 시작하는 말 버림
  if(!tgt&&/^(아니|아닌데|아닌가|맞아요|맞네|그쵸|그죠|그니까)/.test(t.trim()))return false;
  // [2026-11-15 14:15 사장님 「카결 완료했다는데 카드 부가세 안내에 넵 알겠습니다」] 쇼핑도우미 일반 안내(자주 묻는 말)엔 넵·알겠습니다 대답 안 함
  if(/^(넵|넹|네|넴|알겠|알았|확인했|오케이|ok)/i.test(t.trim())&&t.length<=16&&String(messages[0]?.bot_ref||'').startsWith('f:'))return false;
  if(weekend&&WORK.test(t))return false;
  // [2026-11-15 08:26 사장님] 주말이라서 담는 게 아님(주말에도 방송함) — «방송 시간 아닌데도 다시보기로 주문» 이 맞는 말
  if(/(주말|평일|휴일|일요일|토요일)(에도|이라|이니|인데)/.test(t)&&/담|주문|사|구매|편하/.test(t))return false;
  if(learning?.bad.length&&duplicateLine(t,learning.bad))return false;
  // First-time actors may be silent, answer a person, or discuss a grounded product.
  // [19:33 사장님] «네 감사합니다»류는 그 손님이 감사·안내를 받았을 때만 — 인사·남의 글·알림 뒤에 뜬금없이 안 함
  if(/^(네|넵|넹)?\s*(감사(합니다|해요|해용|합니당)|고맙(습니다|습니당|어요))[\s~!.😊🙏ㅎ]*$/.test(t.trim())&&!(tgt&&/감사|고마|드려요|드릴게요|보내|확인|챙겨|축하|당첨|선물|포인트/.test(clean(tgt.body))&&mentionsNickname(clean(tgt.body),String(r.actor.nickname||''))))return false;
  return true;
 };
 let text=typeof pick.text==='string'?clean(pick.text):'';
 const rawText=text;
 if(speaker&&text&&!acceptable(text,speaker,target))text='';
 void noteDecision(db,{at:new Date(now).toISOString(),human:!!newestHuman,speaker:String(pick.speaker||''),raw:rawText.slice(0,70),result:!speaker?'silent:'+choiceReason:text?'sent':'rejected',model:lastModelNote.slice(0,85),path:chosenPath,cardPresent:Boolean(card)});
 if(speaker&&!text&&target)text=shortReply(clean(target.body),recent,seedOf(speaker.actor),speaker.own,speaker.paid.includes('card'))||'';
 if(speaker&&text&&(wrongPaymentTalk(text,speaker.cardOrder,speaker.bankOrder)||cardLinkTalkBlocked(text,speaker.cardOrder,speaker.paid.includes('card'))))text='';
 // [2026-11-15 07:40 사장님] 상품번호는 손님처럼 줄여 부름(프222·버58·몽319), 웃음·이모지 끝맺음은 최근 AI 글과 안 겹치게
 if(speaker&&text){const sd=seedOf(speaker.actor)+now;text=personaVoice(varyLaughTail(shortProductCodes(text,sd),recentAi,sd),seedOf(speaker.actor),now);}
 // RURU_QUALITY_GATE_V1: Final validation after persona styling and before any send.
 if(speaker&&text){
   const latestBroadcast=await db.from('broadcasts').select('*').eq('id',c.broadcast_id).maybeSingle();
   if(latestBroadcast.error||!latestBroadcast.data)return;
   const latestMode=await streamModeOf(db,latestBroadcast.data);
   if(latestMode!==mode)return; // Broadcast changed while Gemini generated a message.
   const latestCard=await readDialogueCard(db,c.broadcast_id).catch(()=>null);
   if(String(latestCard?.productId||'')!==String(card?.productId||'')||String(latestCard?.detailName||'')!==String(card?.detailName||'')){
     // The public widget auto-rotates in 5-second steps, while an LLM response
     // can take longer. Only reject if the ORIGINAL validated card disappeared
     // from the active carousel; do not reject a routine next-frame rotation.
     const freshRotation=await computeWidgetFeatured(c.broadcast_id).catch(()=>null);
     if(!cardRemainsInRotation(card,freshRotation)){
       void noteDecision(db,{at:new Date(now).toISOString(),result:'card-removed-or-unavailable',cardPresent:Boolean(card)});
       return;
     }
   }
   // Associate each previous TEST chat with the product actually discussed.
   // Do not confuse the 5-second rotating card with a new conversation topic.
   const actionById=new Map(actions.map(a=>[String(a.id),a]));
   const recentForGate:ChatObservation[]=[...new Map([...messages.filter(m=>m.automation_actor_id&&m.badge!=='bot'),...previousTestChat]
     .map(m=>[String(m.id),m] as const)).values()].map(m=>({
     text:clean(m.body),at:Date.parse(String(m.created_at)),actorId:String(m.automation_actor_id||''),
     productKey:String(actionById.get(String(m.automation_action_id||''))?.plan?.chatProductKey||'')
   }));
   const quality=judgeTestChat({text,mode:latestMode,now,actorId:String(speaker.actor.id),currentProductKey:card?`${card.productId}:${card.detailName}`:null,replyingToHuman:Boolean(target),recent:recentForGate,
    offAirSince:String(latestBroadcast.data.paused_at||latestBroadcast.data.ended_at||''),
    replySourceText:String(target?.body||'')});
   if(!quality.ok){text='';void noteDecision(db,{at:new Date(now).toISOString(),speaker:speaker.actor.nickname,raw:String(pick.text||'').slice(0,70),result:'quality:'+quality.reason});}
   if(text){
    // Identify whether previous AI messages were genuine replies to customers.
    const room:RoomTurnRow[]=messages.map(m=>({id:Number(m.id),at:Date.parse(String(m.created_at||'')),
      actorId:m.automation_actor_id?String(m.automation_actor_id):null,
      kind:(m.badge==='bot'||m.bot_ref?'system':m.automation_actor_id?'ai':'human') as RoomTurnRow['kind'],
      responseToId:actionById.get(String(m.automation_action_id||''))?.kind==='reply'?Number(actionById.get(String(m.automation_action_id||''))?.source_message_id)||0:0,
      asksQuestion:/[?？]|나요|까요|어때|뭐가/.test(clean(m.body))}));
    const roomPolicy=assessRoomTurn({now,mode:latestMode,
      currentProductKey:card?`${card.productId}:${card.detailName}`:'',
      replyToId:target?Number(target.id):0,speakerId:String(speaker.actor.id),room});
    if(!roomPolicy.ok){text='';void noteDecision(db,{at:new Date(now).toISOString(),speaker:speaker.actor.nickname,raw:String(pick.text||'').slice(0,70),result:'room:'+roomPolicy.reason});}
   }
 }
 // 사람 글은 한 번만 판단 — 침묵이어도 그 글 번호를 남겨 같은 글로 Gemini 를 다시 부르지 않음
 // A contextual reply to another TEST speaker is a reply too: treat it as such
 // for DB admission instead of incorrectly applying proactive-chat throttles.
 const sourceId=target?Number(target.id):newestHuman?Number(newestHuman.id):null;
 const who=speaker&&text?speaker:(sourceId?roster[0]:null);
 if(!who)return;
 const kind=speaker&&text&&target?'reply':'chat';
 try{await automationRpc(db,'live_automation_ai_admission',{p_actor:who.actor.id,p_kind:kind})}catch(e){void noteDecision(db,{at:new Date(now).toISOString(),human:!!newestHuman,speaker:String(pick.speaker||''),raw:'막힘 '+String((e as Error)?.message||e).slice(0,40),result:'blocked'});return}
 const action=await automationRpc<Action>(db,'live_automation_action',{p_session:who.session.id,p_kind:kind,p_due:new Date().toISOString(),p_plan:{director:true,text,mode,chatProductKey:card?`${card.productId}:${card.detailName}`:'',replyToAi:target?.automation_actor_id?Number(target.id):null},p_manual:false,p_source:sourceId,p_revision:c.revision});
 const claimed=await automationRpc<Action|null>(db,'live_automation_claim',{p_action:action.id,p_revision:c.revision});
 if(!claimed)return;
 const skip=(message:string)=>automationRpc(db,'live_automation_complete',{p_action:claimed.id,p_lease:claimed.lease_token,p_status:'skipped',p_result:{ok:false,message}}).catch(()=>{});
 if(!(speaker&&text)){await skip('SILENT');return;}
 try{
  const ctx=await automationRpc<AutomationContext>(db,'live_automation_context',{p_session:claimed.session_id,p_revision:claimed.revision,p_scope:'chat'});
  await automationRpc(db,'live_automation_ai_admission',{p_actor:claimed.actor_id,p_kind:claimed.kind});
  await automationPost(origin,'/api/live-chat',ctx,claimed,'chat',{kakao_id:AUTOMATION_OWNER,bc:c.broadcast_id,body:text},transport);
 }catch(e){await skip(e instanceof Error?e.message:'CHAT_SKIPPED');}
}
