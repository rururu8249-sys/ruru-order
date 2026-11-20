import {productFactsPrompt,type ChatProductFacts} from './liveAutomationProductFacts';
/** A limited, grounded opportunity for a TEST-labelled shopper to speak.
 * Does not create any chat, order, or payment action. Existing DB admission
 * and room-level repetition checks remain the final authority.
 */
export type ProductOpportunity = {
  now:number;
  mode:'live'|'paused'|'replay';
  hasCard:boolean;
  chatRate:number;
  hasPendingHuman:boolean;
  lastHumanAt:number;
  lastAiAt:number;
  lastFocusAt:number;
  candidates:number;
};

/** Do not try every scheduler tick when the first model chooses silence.
 * A verified product and a genuinely quiet room are both necessary.
 */
export function shouldRecoverProductSilence(q:ProductOpportunity):boolean {
  if(q.mode!=='live'||!q.hasCard||q.hasPendingHuman||q.candidates<1||q.chatRate<=0)return false;
  const intensity=Math.max(0,Math.min(100,q.chatRate));
  // Even at 100%, the DB's 6 unsolicited messages/hour limit still applies.
  const gap=intensity>=80?3*60_000:intensity>=50?5*60_000:intensity>=20?8*60_000:12*60_000;
  if(q.lastHumanAt>0&&q.now-q.lastHumanAt<100_000)return false;
  if(q.lastAiAt>0&&q.now-q.lastAiAt<gap)return false;
  if(q.lastFocusAt>0&&q.now-q.lastFocusAt<gap)return false;
  return true;
}

const compact=(x:unknown,n:number)=>String(x??'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim().slice(0,n);

/** Not a canned utterance: Gemini must compose a new line from observed facts.
 * Do not suggest arbitrary size numbers or speculate about shipping/stock.
 */
export function buildFocusedProductPrompt(q:{
  mode?:'live'|'paused'|'replay';product?:ChatProductFacts|null;
  productName:string;colors:readonly string[];candidates:readonly string[];
  recentAi:readonly string[];
}):string {
  const names=q.candidates.slice(0,6).map(s=>compact(s,32)).filter(Boolean);
  const product=compact(q.productName,110);
  const colors=[...new Set(q.colors.map(s=>compact(s,18)).filter(Boolean))].slice(0,8);
  if(!product||!names.length)return '';
  return [
    '너는 공개적으로 [테스트] 표시되는 라이브커머스 채팅 시뮬레이션의 문장 작성자다.',
    '현재 대화가 잠시 조용하고 실제로 등록된 상품이 있다. 한 명의 테스트 손님이 그 상품에 관해 남길 법한 새로운 한 줄을 작성한다.',
    `확인된 상품: ${product}`,
    `방송 상태: ${q.mode||'live'}. ${q.mode&&q.mode!=='live'?'실시간 시연·즉시 응답을 요구하거나 방송 재개를 추측하지 않는다.':'영상이나 음성을 직접 보고 들었다고 주장하지 않는다.'}`,
    ...(q.product?[productFactsPrompt(q.product)]:[]),
    `확인된 색상: ${colors.join(', ')||'별도 없음'}`,
    `사용 가능한 테스트 닉네임: ${names.join(' / ')}`,
    `최근 AI 발언(뜻이나 문장 모양 반복 금지): ${q.recentAi.slice(0,6).map(s=>compact(s,55)).join(' / ')||'없음'}`,
    '상품코드나 정확한 상품명을 문장에 포함하고, 실제 확인된 색상이나 디자인에 관한 짧은 관심·취향·확인 질문만 작성한다.',
    '구체적 사이즈 번호, 키·몸무게, 배송 기간이나 방식, 재고, 소재 성능, 실제 착용·구매·결제 경험, 방송 음성을 추측해서 말하지 않는다.',
    '근거 없는 감탄, 기계적인 인사, 반복 맞장구, 다른 손님의 말을 빌려온 답변, 대상이 없는 "넵"이나 "빠르네요"는 쓰지 않는다.',
    '"고민되네요", "깔끔하네요", "궁금하네요" 같은 정형화된 말끝을 반복하지 마라. 짧은 취향 질문이나 다른 관찰이 없다면 침묵해라.',
    '두세 단어 이상이면 기본 띄어쓰기를 유지한다. 긴 무띄어쓰기 문장이나 존재하지 않는 상품·품절 단정을 만들어내지 마라.',
    '한 번에 계정 하나, 메시지 하나만 만든다. 상품 사실에 근거한 새 화제가 도저히 없다면 빈 speaker로 침묵한다.',
    'JSON만 반환: {"speaker":"위 테스트 닉네임 중 정확히 하나 또는 빈 문자열","replyTo":0,"text":"짧은 상품 관련 발언 또는 빈 문자열"}',
  ].join('\n');
}
