import {BRAND_SPEECH_ALIASES} from './liveAutomationSpeech';
/** Fictional presets, never inferred from a real customer's age or gender. */
export type Persona = {seed:number;age:30|40|50;gender:'남성'|'여성';style:string;interest:string;emoji:'none'|'rare';length:'short'|'medium'};
const STYLES = [
  '간결한 존댓말, 질문 한 가지씩, 느낌표 없이', '담백한 존댓말, 비교를 구체적으로, 웃음 표시는 드물게',
  '차분한 완문, 부탁드려요를 가끔 사용, 설명을 길게 반복하지 않음', '친근한 존댓말, 짧은 물결을 가끔, 애교 표현 없이',
  '부드러운 존댓말, 짧게 반응, 문장부호를 거의 쓰지 않음', '정중하고 구체적인 질문, 과장 없는 어휘',
  '밝지만 짧게, 요로 끝내고 감탄사는 드물게', '차분하게 핵심만 묻고 마침표 사용',
  '편안한 존댓말, 한 문장, 웃음 없이', '정돈된 존댓말, 확인하고 싶은 부분을 명시',
  '친근하고 담백하게, 긴 상품명 반복 없이', '간결한 부탁형, 감사합니다를 매번 덧붙이지 않음',
];
const GREET = [
 ['안녕하세요','구경하러 왔어요','잘 보고 있어요'], ['구경 왔어요','오늘은 뭐 있나요','천천히 보고 있어요'],
 ['안녕하세요. 잘 보겠습니다','조금 늦게 들어왔네요','상품들 보고 있어요'], ['저도 왔어요~','잠깐 들렀어요','잘 보이네요~'],
 ['네 잘 보고 있어요','반갑습니다','이제 들어왔어요'], ['안녕하세요. 구경할게요','설명 잘 듣고 있어요','잘 보입니다'],
 ['안녕하세요!','지금 들어왔어요','오늘도 잠깐 구경해요'], ['구경하고 있습니다.','잘 보이네요.','안녕하세요.'],
 ['안녕하세요 반가워요','보고 있었어요','잠시 구경할게요'], ['상품 좀 볼게요','잘 듣고 있습니다','처음부터 다시 보고 있어요'],
 ['저 왔어요','화면 잘 보여요','조금 구경하다 갈게요'], ['반가워요.','안녕하세요, 구경하겠습니다','잘 보고 갈게요'],
];
const SUBMITTED = [
 ['주문서 냈어요','방금 주문했어요','주문 들어갔어요'], ['주문서 보냈어요','저도 주문했어요','주문은 해뒀어요'],
 ['주문서 제출했습니다','주문 넣었습니다','방금 제출했어요'], ['주문 넣었어요~','하나 주문했어요','주문서 보냈습니다~'],
 ['네 주문했어요','주문서 냈습니다','주문 넣고 왔어요'], ['주문서 보냈습니다.','주문 제출했어요','주문했습니다'],
 ['방금 주문 넣었어요!','주문서 제출했어요','저 주문했어요'], ['주문했습니다.','주문서 냈어요.','주문 넣었습니다.'],
 ['저도 주문 넣었어요','주문 넣어뒀어요','주문서 보냈어요'], ['주문서 작성해서 보냈어요','주문 접수했어요','방금 제출했습니다'],
 ['주문하고 왔어요','지금 주문 넣었어요','주문서 보냈네요'], ['주문서 제출했어요.','주문 넣었어요.','제출했습니다.'],
];
export function createPersona(seed:number):Persona {
  const n=Math.abs(Math.trunc(seed))%12;
  return {seed:n,age:([30,40,50] as const)[Math.floor((n%6)/2)],gender:n%2?'여성':'남성',style:STYLES[n],interest:['색감','소재와 관리','구성','디테일'][n%4],emoji:n%3?'none':'rare',length:n%3?'short':'medium'};
}
export function personaLine(profile:Persona,kind:'greeting'|'submitted',index:number):string {
  const choices=(kind==='greeting'?GREET:SUBMITTED)[profile.seed%12];
  return choices[Math.abs(Math.trunc(index))%choices.length];
}
const norm=(s:string)=>s.normalize('NFC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
function speechCore(text:string):string {
 const aliases=Object.values(BRAND_SPEECH_ALIASES).flat().sort((a,b)=>b.length-a.length);
 return norm(text.replace(new RegExp('(?:'+aliases.join('|')+')\\s*-?\\s*\\d+','gi'),'')
  .replace(/블랙|화이트|아이보리|베이지|핑크|그레이|네이비|브라운|초코|와인|\b(?:XXL|XL|XS|S|M|L)\b|\d+/gi,'')
  .replace(/주문(?:했습니다|했어요|했어용|했네용|했네요|완료했어요)/g,'주문완료')
  .replace(/골랐(?:습니다|어요|어용|네요|네용)/g,'골랐어요'));
}
export function duplicateLine(text:string,recent:string[]):boolean {
  const key=norm(text);
  if(!key) return true;
  const grams=(s:string)=>new Set(Array.from({length:Math.max(0,s.length-2)},(_,i)=>s.slice(i,i+3)));
  const a=grams(key),core=speechCore(text);
  return recent.some(line=>{
    const other=norm(line);
    if(other===key) return true;
    const otherCore=speechCore(line);
    if(core.length>=4&&core===otherCore)return true;
    if(Math.min(core.length,otherCore.length)>=6&&(core.includes(otherCore)||otherCore.includes(core)))return true;
    // Catch repeated concluding phrases even when a different nickname/product leads the line.
    let tail=0;while(tail<Math.min(core.length,otherCore.length)&&core.at(-1-tail)===otherCore.at(-1-tail))tail++;
    if(tail>=6)return true;
    if(key.length<10 || other.length<10) return false;
    const b=grams(other); const intersection=[...a].filter(x=>b.has(x)).length;
    return intersection/(a.size+b.size-intersection)>=.8;
  });
}
export function safeConversationLine(text:string,allowPayment=false):boolean {
  return text.trim().length>0 && text.length<=100 && (allowPayment||!/(결제.{0,3}완료|입금.{0,3}완료)/.test(text)) && !/(테스트|\btest\b|\bAI\b|인공지능|API|프롬프트|한도|시스템|배송.{0,3}보장|https?:\/\/|\d{2,3}-\d{3,4}-\d{4})/i.test(text);
}
