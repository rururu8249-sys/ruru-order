import {identifiesChatProduct,type ChatProductFacts} from './liveAutomationProductFacts';
import type {ChatObservation} from './liveAutomationQualityGate';
const clean=(v:string,n=200)=>String(v||'').replace(/\s+/g,' ').trim().slice(0,n);
const APPEARANCE=/색감|컬러|색상|색깔|색(?:이|은|도|을|으로|만|이라)|디자인|블랙|화이트|베이지|브라운|카멜|그레이|네이비|아이보리|핑크|레드|초코|차콜|크림|카키|민트|실버|골드|퍼플|블루|그린|옐로우|오렌지|와인|버건디|소라|하늘|모카|라벤더|올리브|스카이|백색|검정|검은|흰색|회색|갈색|남색/;
/** Interest before color tokens: "아이보리 후드 분리" concerns construction. */
export function conversationInterest(text:string):string{
 const t=clean(text,200);
 if(/실측|총장|기장|가단|가슴.{0,8}(단면|둘레)|어깨.{0,6}(너비|넓이)|소매.{0,6}길이|치수|사이즈표/.test(t))return 'measurements';
 if(/세탁|드라이|빨래|세척|보관|관리/.test(t))return 'care';
 if(/주머니|포켓|후드|여밈|단추|지퍼|안감|탈부착|분리/.test(t))return 'structure';
 if(/소재|재질|원단|충전재|구스|덕다운|두께|두꺼|얇|무게|보온|따뜻/.test(t))return 'material';
 if(/코디|매치|어울|같이\s*입|받쳐\s*입|스타일.{0,6}입/.test(t))return 'styling';
 if(/사이즈|몇\s*입|맞을|맞나|핏/.test(t))return 'fit';
 if(/고르|고를|선택|고민|눈이\s*가|더\s*좋아|마음이\s*가/.test(t))return 'choice';
 if(APPEARANCE.test(t))return 'appearance';
 if(/주문|결제|입금|장바구니|배송|택배/.test(t))return 'transaction';
 return '';
}
const labels:Record<string,string>={measurements:'상품 실측·치수',care:'세탁·보관',structure:'여밈·후드·주머니 구조',material:'소재·두께·보온',styling:'코디·활용',fit:'개인 사이즈·핏',choice:'선택 고민·취향',appearance:'색감·외형 감상',transaction:'주문·결제·배송'};
/** Concrete questions retain their subject: a color in a product name does not
 * turn a construction/measurement question into another color impression.
 * Impressions may overlap: color, styling and preference are not exclusive. */
export function conversationTopics(text:string):string[]{
 const primary=conversationInterest(text);
 if(!primary)return [];
 if(!['appearance','styling','choice'].includes(primary))return [primary];
 const topics=new Set([primary]);
 if(APPEARANCE.test(text))topics.add('appearance');
 if(/코디|매치|어울|데일리|활용|두루두루|휘뚜루|받쳐|같이\s*입/.test(text))topics.add('styling');
 return [...topics];
}
function recentTopics(recent:ChatObservation[],now:number){
 return recent.filter(r=>Number.isFinite(r.at)&&r.at<=now&&r.at>=now-90*60000)
  .sort((a,b)=>b.at-a.at).slice(0,12).map(r=>conversationTopics(r.text));
}
export function recentTopicCounts(recent:ChatObservation[],now:number):Record<string,number>{
 const counts:Record<string,number>={};
 for(const topics of recentTopics(recent,now))for(const t of topics)counts[t]=(counts[t]||0)+1;
 return counts;
}
/** Same existing two-turn limit, now applied to overlapping interests and every
 * generation path. No keyword blacklist and no mandatory topic rotation. */
export function repeatsRoomTopic(text:string,recent:ChatObservation[],now:number):boolean{
 const last=recentTopics(recent,now);
 return conversationTopics(text).some(t=>last[0]?.includes(t)&&last[1]?.includes(t));
}
export function roomTopicPrompt(recent:ChatObservation[],now:number):string{
 const counts=recentTopicCounts(recent,now);
 const summary=Object.entries(counts).map(([t,n])=>`${labels[t]} ${n}회`).join(', ');
 return `최근 관심사: ${summary||'별도 기록 없음'}. 색상 감상을 코디·활용·선택 고민으로 바꾸어도 같은 색상 감상을 반복할 수 있다. 최근 두 발언과 겹치는 관심사를 세 번째 독립 발언으로 반복하지 않는다. 다른 계정·상품·말끝으로 바꾸어도 마찬가지다. 아직 다루지 않은 실제 관심이 있으면 표현하고, 없으면 침묵한다. 정해진 주제 순환은 하지 않는다.`;
}

/** A genuinely new, explicitly named catalog topic, not a carousel tick.
 * The interest must add something; a previously named product is not exhausted. */
export function hasNewGroundedInterest(text:string,product:ChatProductFacts|null,recent:ChatObservation[],now:number):boolean{
 if(!product||!identifiesChatProduct(text,product))return false;
 const topics=conversationTopics(text);if(!topics.length)return false;
 const rows=recent.filter(r=>Number.isFinite(r.at)&&r.at<=now&&r.at>=now-90*60000).sort((a,b)=>b.at-a.at).slice(0,12);
 if(rows.some(r=>identifiesChatProduct(r.text,product)&&conversationTopics(r.text).some(t=>topics.includes(t))))return false;
 return rows.slice(0,2).every(r=>!conversationTopics(r.text).some(t=>topics.includes(t)));
}
