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
  recentAi:readonly string[]; questionMemory?:readonly string[]; questionPending?:boolean;
  conversationContext?:string;
}):string {
  const names=q.candidates.slice(0,6).map(s=>compact(s,32)).filter(Boolean);
  const product=compact(q.productName,110);
  const colors=[...new Set(q.colors.map(s=>compact(s,18)).filter(Boolean))].slice(0,8);
  if(!product||!names.length)return '';
  if(q.conversationContext)return [q.conversationContext,
    '조용한 방에서 드물게 발언할 기회를 다시 검토한다. 위의 같은 대화와 계정 기록을 유지한다. 상품 설명 한 줄로 맥락을 초기화하지 않는다. 앞선 색감 질문을 색감 감탄으로 바꾸는 것은 새 화제가 아니다. 현재 대화에 보탤 자연스러운 말이 있으면 작성하고, 없으면 그대로 침묵한다.',
  ].join('\n');
  return [
    '너는 공개적으로 [테스트] 표시되는 라이브커머스 채팅 시뮬레이션의 문장 작성자다.',
    '현재 대화가 잠시 조용하고 실제로 등록된 상품이 있다. 한 명의 테스트 손님이 그 상품에 관해 남길 법한 새로운 한 줄을 작성한다.',
    `확인된 상품: ${product}`,
    `방송 상태: ${q.mode||'live'}. ${q.mode&&q.mode!=='live'?'실시간 시연·즉시 응답을 요구하거나 방송 재개를 추측하지 않는다.':'영상이나 음성을 직접 보고 들었다고 주장하지 않는다.'}`,
    ...(q.product?[productFactsPrompt(q.product)]:[]),
    `확인된 색상: ${colors.join(', ')||'별도 없음'}`,
    `사용 가능한 테스트 닉네임: ${names.join(' / ')}`,
    `최근 AI 발언(뜻이나 문장 모양 반복 금지): ${q.recentAi.slice(0,6).map(s=>compact(s,55)).join(' / ')||'없음'}`,
    `최근 테스트 대화에서 이미 나온 질문 유형(답장 대상 아님): ${(q.questionMemory||[]).map(s=>compact(s,40)).join(' / ')||'없음'}. 상품명·색상·닉네임이 달라도 이 질문을 다시 만들지 않는다.`,
    '현재 상품은 대화의 근거이지 읽어 줄 대본이 아니다. 상품코드·전체 상품명·색감 질문을 매번 넣지 않는다. 자기 취향이나 선택 고민, 구경하는 마음을 짧게 말할 수 있다. 구체적인 상품 사실을 말하거나 질문할 때만 대상을 분명히 하고 확인된 정보에 한정한다.',
    ...(q.mode&&q.mode!=='live'?[`진행자가 없는 시간이다. ${q.questionPending?'답을 기다리는 질문이 있음: 또 다른 독립 질문을 만들지 않는다.':'가끔 필요한 질문은 가능하지만 질문부터 만들지 않는다.'} 답을 요구하지 않는 자기 생각을 짧게 남기거나 침묵한다. 실물·착용감·영상 장면을 보았다고 꾸미지 않는다.`]:[]),
    '구체적 사이즈 번호, 키·몸무게, 배송 기간이나 방식, 재고, 소재 성능, 실제 착용·구매·결제 경험, 방송 음성을 추측해서 말하지 않는다.',
    '근거 없는 감탄, 기계적인 인사, 반복 맞장구, 다른 손님의 말을 빌려온 답변, 대상이 없는 "넵"이나 "빠르네요"는 쓰지 않는다.',
    '"고민되네요", "깔끔하네요", "궁금하네요" 같은 정형화된 말끝을 반복하지 마라. 짧은 취향 질문이나 다른 관찰이 없다면 침묵해라.',
    '두세 단어 이상이면 기본 띄어쓰기를 유지한다. 긴 무띄어쓰기 문장이나 존재하지 않는 상품·품절 단정을 만들어내지 마라.',
    '한 번에 계정 하나, 메시지 하나만 만든다. 상품 사실에 근거한 새 화제가 도저히 없다면 빈 speaker로 침묵한다.',
    'JSON만 반환: {"speaker":"위 테스트 닉네임 중 정확히 하나 또는 빈 문자열","replyTo":0,"text":"짧은 상품 관련 발언 또는 빈 문자열"}',
  ].join('\n');
}
