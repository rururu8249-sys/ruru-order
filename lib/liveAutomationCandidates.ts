import type {CompactRoomContext} from './liveAutomationCompactPrompt';
import type {ChatObservation} from './liveAutomationQualityGate';
import {parseDirectorChoice,type DirectorChoice} from './liveAutomationFocus';
import {productFactsPrompt,productSemanticFacts} from './liveAutomationProductFacts';
const clean=(v:unknown,n=100)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,n);
export function hasUnseenVisualClaim(text:string):boolean{
 return /보인다|보이네|보이네요|보여요|보여서|보여\s|눈에\s*띄|화면으로\s*(보는|보니)|비교해\s*보는\s*중/.test(text);
}
/** A draft is not a send. Never trust the model's self-labelled intent. */
export function parseChatCandidates(raw:string|null,allowed:string[]):DirectorChoice[]{
 if(!raw)return [];
 try{
  const obj=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
  const rows=Array.isArray(obj)?obj.slice(0,3):Array.isArray(obj?.candidates)?obj.candidates.slice(0,3):[obj];
  const seen=new Set<string>();
  return rows.flatMap((r:unknown)=>{
   const p=parseDirectorChoice(JSON.stringify(r),allowed);
   if(p.reason!=='ok'||p.replyTo!==0||seen.has(p.text))return [];
   seen.add(p.text);return [p];
  });
 }catch{return [];}
}
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
 if(/색감|컬러|색상|색깔|베이지|아이보리|블랙|네이비|그레이|와인|초코|디자인/.test(t))return 'appearance';
 if(/주문|결제|입금|장바구니|배송|택배/.test(t))return 'transaction';
 return '';
}
const labels:Record<string,string>={measurements:'상품 실측·치수',care:'세탁·보관',structure:'여밈·후드·주머니 구조',material:'소재·두께·보온',styling:'코디·활용',fit:'개인 사이즈·핏',choice:'선택 고민·취향',appearance:'색감·외형 감상',transaction:'주문·결제·배송'};
function recentInterests(recent:ChatObservation[],now:number){
 return recent.filter(r=>Number.isFinite(r.at)&&r.at<=now&&r.at>=now-90*60000).sort((a,b)=>b.at-a.at).slice(0,12).map(r=>conversationInterest(r.text));
}
/** Prefer under-discussed interests, without a fixed topic rotation. */
export function rankChatCandidates(choices:DirectorChoice[],recent:ChatObservation[],now:number):DirectorChoice[]{
 const interests=recentInterests(recent,now);
 const count=(t:string)=>t?interests.filter(x=>x===t).length:0;
 return choices.filter(c=>{const t=conversationInterest(c.text);return !t||interests[0]!==t||interests[1]!==t;})
  .sort((a,b)=>count(conversationInterest(a.text))-count(conversationInterest(b.text)));
}
export function buildChatCandidatePrompt(c:CompactRoomContext,recent:ChatObservation[]):string{
 const interests=recentInterests(recent,c.now??Date.now());
 const summary=[...new Set(interests.filter(Boolean))].map(t=>`${labels[t]} ${interests.filter(x=>x===t).length}회`).join(', ');
 const messages=c.messages.filter(m=>!m.bot_ref&&m.badge!=='bot'&&!/^\s*\//.test(String(m.body||''))).slice(0,18).reverse();
 const actors=c.actors.slice(0,6).map(a=>`${clean(a.nickname,32)} | 이전 발언: ${(a.own||[]).slice(0,2).map(x=>clean(x,60)).join(' / ')||'없음'} | 테스트 장바구니: ${(a.cart||[]).slice(0,2).map(x=>clean(x,45)).join(' / ')||'없음'} | 테스트 주문: ${(a.ordered||[]).slice(0,2).map(x=>clean(x,45)).join(' / ')||'없음'}`);
 return [
  '공개적으로 [테스트] 표시되는 쇼핑 채팅의 공개 전 검토용 후보를 작성한다. 서버가 빈도와 휴식 간격을 확인해 허용한 드문 독립 발언 기회다. 새 질문을 받지 않았어도 새로운 관심을 표현할 수 있다. 최종 전송 여부는 서버가 검사한다.',
  `방송 상태: ${c.mode}. ${c.mode==='live'?'진행자에게 상품의 모르는 점을 질문할 수 있다.':'즉시 시연·응답을 기대하지 않는 시간이다.'}`,
  `확인된 상품명·옵션: ${clean(c.cardText,240)}`,
  ...(c.product?[productFactsPrompt(c.product)]:[]),
  '입력에 사진·영상·소리는 없다. 이름·표시 옵션만 사실로 안다. 미확인 외형·구조·소재·착용감·성능을 봤다고 평가하거나 단정하지 않는다. 그 특성을 알고 싶은 질문과 사실 주장은 다르다. 상품 특성을 묻는 질문에는 실제 품번을 넣는다.',
  '개인에게 맞는 사이즈 추천 질문은 그 계정의 기존 키·몸무게 기록이 있어야 한다. 체형을 만들거나 특정 사이즈가 맞는지 근거 없이 묻지 않는다. 일반적인 상품 실측 문의와 개인 사이즈 추천은 다르다. 표시된 옵션의 존재 여부는 다시 묻지 않는다.',
  '실제 구매·결제·착용·시청 경험, 직장·관계·일정을 만들지 않는다. 다른 사람의 경험을 자기 것으로 말하지 않는다. 입을 상황을 고민하는 것과 이미 입어봤다고 하는 것은 다르다.',
  `최근 관심사: ${summary||'별도 기록 없음'}. 상품·색상·치수만 바꿔도 같은 관심사다. 총장·기장·가슴단면·사이즈별 치수 비교는 같은 실측 관심사다. 최근 두 발언이 같은 관심사면 세 번째 독립 발언까지 반복하지 않는다.`,
  `이미 나온 질문 유형: ${(c.questionMemory||[]).join(' / ')||'없음'}. 같은 질문을 다시 만들지 않는다.`,
  ...(c.product&&productSemanticFacts(c.product).wearable?['의류로 확인된 상품의 관심사에는 여밈·후드·주머니 같은 구조, 관리, 코디, 선택 과정도 있다. 이 목록은 사실 정보나 정해진 질문 순서가 아니다.']:[]),
  '[발언 가능한 계정의 확인된 기록]\n'+actors.join('\n'),
  '[최근 대화·오래된 순·독립 발언의 맥락으로만 참고]\n'+messages.map(m=>`${m.automation_actor_id?'테스트':'실제'} ${clean(m.nickname,24)}: ${clean(m.body,115)}`).join('\n'),
  '각 계정이 채팅창에 직접 쓸 짧은 구어체로, 서로 다른 관심사의 검토용 후보 3개를 만든다. 상품평·분석문처럼 서술형 "~다"로 설명하지 않는다. 문장·어미만 바꾸는 것은 다른 후보가 아니다. 품질이나 사이즈를 남에게 추천하지 않는다. 후보가 모두 부적절하면 빈 배열을 반환한다. 정해진 대사·인원·주제 순환으로 연출하지 않는다.',
  ...(c.mode!=='live'&&c.questionPending?['답을 기다리는 질문이 있음: 이번 후보는 모두 질문이 아닌 자기 취향·결정 망설임·고르는 과정에 관한 짧은 자기 생각으로 쓴다. 확인 요청·궁금하다는 말로 새 질문을 쌓지 않는다. 외형 감상이나 미확인 특성 평가도 하지 않는다. 실측을 비교하거나 사진을 본 적이 있다고 만들지 않는다.']:[]),
  'JSON만: {"candidates":[{"speaker":"위 계정 중 하나","replyTo":0,"text":"첫 관심사의 45자 이내 한 줄"},{"speaker":"위 계정 중 하나","replyTo":0,"text":"다른 관심사의 한 줄"},{"speaker":"위 계정 중 하나","replyTo":0,"text":"또 다른 관심사의 한 줄"}]}. 서버는 한 후보만 최종 선택한다. 세 개를 연속 전송하지 않는다.',
 ].join('\n');
}
