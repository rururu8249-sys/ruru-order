import {productFactsPrompt,type ChatProductFacts} from './liveAutomationProductFacts';
import {roomTopicPrompt} from './liveAutomationTopics';
import type {ChatObservation} from './liveAutomationQualityGate';
/** Only retry transport/service failures once, never a deliberate model silence. */
export function shouldFallbackModel(r:{text:string|null;note:string}):boolean {
 return !r.text?.trim() && /(?:timeout|fetch_error|http_5\d\d|empty_|:quota)/.test(r.note);
}

/** Eligibility mirrors the visitor-presence and heartbeat admission checks. */
export function eligibleTestChatSession(s:{id?:unknown;watching?:unknown;last_ack_at?:unknown},present:ReadonlySet<string>,now:number):boolean {
 const heartbeat=Date.parse(String(s.last_ack_at||''));
 return s.watching===true&&present.has(String(s.id||''))&&Number.isFinite(heartbeat)&&heartbeat>now-75_000&&heartbeat<=now+5_000;
}

/** Compact, fact-grounded prompt for AI-labelled test chat. Read-only/pure. */
export type CompactRoomMessage = {
  id?: unknown; nickname?: unknown; body?: unknown; bot_ref?: unknown;
  badge?: unknown; automation_actor_id?: unknown; created_at?:unknown;
};
export type CompactRoomActor = {
  nickname: string; own?: string[]; cart?: string[]; ordered?: string[]; paid?: string[];
};
export type CompactRoomContext = {
  mode: 'live' | 'paused' | 'replay'; cardText: string; product?: ChatProductFacts | null; actors: CompactRoomActor[];
  messages: CompactRoomMessage[]; pendingHumanId?: number | null;
  styleSummary?: string; realOrderProducts?: string[];
  rejectedLines?: string[]; nextShow?: string | null; questionMemory?: readonly string[]; questionPending?:boolean; now?:number;
  recentTopics?: ChatObservation[];
  orderedProducts?: ChatProductFacts[];
};
const clean = (value: unknown, max = 80) => String(value ?? '')
  .replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function buildCompactConversationPrompt(c: CompactRoomContext): string {
  const actors = c.actors.slice(0, 8).map(a => {
    const mine = (a.own || []).slice(0, 2).map(x => clean(x, 48)).join(' / ');
    const items = (a.ordered || []).slice(0, 2).map(x => clean(x, 38)).join(' / ');
    const cart = (a.cart || []).slice(0, 2).map(x => clean(x, 38)).join(' / ');
    return `${clean(a.nickname, 36)} | 이전 발언: ${mine || '-'} | 테스트 주문: ${items || '-'} | 테스트 장바구니: ${cart || '-'}`;
  });
  // Notifications must not consume the conversational context budget.
  const chronological = c.messages.filter(m=>!m.bot_ref&&m.badge!=='bot'&&!/^\s*\//.test(String(m.body||''))).slice(0,18).reverse();
  const cartNotices = c.messages.filter(m=>String(m.bot_ref||'').startsWith('c:')).length;
  const orderNotices = c.messages.filter(m=>String(m.bot_ref||'').startsWith('o:')).length;
  const chat = chronological.flatMap(m => {
    const ref = String(m.bot_ref || '');
    if (ref || m.badge === 'bot') {
      return []; // Do not expose a different customer's identity or order details to the generator.
    }
    const id = Number(m.id);
    if (!Number.isSafeInteger(id) || id <= 0) return [];
    const actorLabel = m.automation_actor_id ? '테스트' : '실제';
    const age=(c.now??Date.now())-Date.parse(String(m.created_at||''));
    const stale=c.now!==undefined&&(!Number.isFinite(age)||age<0||age>=150_000);
    return [`${stale?'[이전 대화·반복 방지 참고만·답장 불가]':'#'+id} ${actorLabel} ${clean(m.nickname, 24)}: ${clean(m.body, 115)}`];
  });
  const mode = c.mode === 'live' ? '라이브 방송 중' : c.mode === 'paused' ? '방송 일시정지, 카드/주문은 유지될 수 있음' : '방송 종료, 다시보기/상품카드 이용 가능';
  const lines = [
    '너는 [테스트] 표시가 있는 쇼핑몰 채팅 시뮬레이션에서 다음 메시지 하나를 작성하는 AI다.',
    `상황: ${mode}. 실시간 영상을 보거나 음성을 들었다고 주장하지 마라.`,
    `지금 실제 위젯이 보여주는 상품: ${clean(c.cardText, 240)}. 검증된 상품 외 번호·색상·사이즈·가격을 지어내지 마라.`,
    ...(c.product ? [productFactsPrompt(c.product)] : []),
    ...orderedProductPrompt(c.orderedProducts||[]),
    `실제 고객의 최근 발언 가운데 응답 판단 대상: ${c.pendingHumanId ? '#' + c.pendingHumanId : '없음'}. 실제 질문이나 닉네임 호출에만 필요할 때 답한다.`,
    '현재 카드가 바뀌었다고 새 화제가 생긴 것은 아니다. 상품번호를 매번 부르지 않아도 된다. 실제 대화는 취향 혼잣말 → 그 말에 짧은 호응 → 같은 화제의 고민처럼 이어질 수 있지만, 정해진 순서나 인원으로 연출하지 않는다. 고객의 경험·관계·말을 자기 것으로 복제하지 않는다.',
    ...(c.mode!=='live'?[`지금은 진행자가 즉시 답하는 자리가 아니다. ${c.questionPending?'답을 기다리는 질문이 있음: 새로운 독립 질문을 더 쌓지 않는다.':'필요한 질문이 가끔 나올 수 있지만 질문부터 만들지 않는다.'} 자기 취향·선택 고민·구경하는 마음을 짧게 표현하거나, 실제 최근 글에 이어갈 말이 있으면 호응하고 없으면 쉰다. 상품 실물·착용감·영상 장면을 본 것처럼 단정하지 않는다.`]:[]),
    '인사/질문/감탄/대답/침묵 모두 가능하다. 인사나 상품 질문을 의무적으로 만들지 않는다. 다른 사람의 질문에 답하되 모르는 사실·사이즈 추천·입금 정보를 꾸며내지 않는다.',
    '방 전체의 최근 발언을 읽고 이미 많이 나온 관심사는 이어 말할 이유가 있을 때만 다룬다. 색상 감상을 질문에서 혼잣말로 바꾸는 것도 같은 관심사의 반복이다. 취향과 선택 과정, 코디 고민, 상품의 길이·디테일에 대한 질문, 실제 대화에 대한 짧은 반응 중 지금 맥락에 맞는 말은 가능하다. 이 목록을 순서대로 순환하거나 억지로 할당하지 않는다. 개인 사이즈 추천을 물으려면 그 계정이 이미 밝힌 체형이 필요하며, 키·몸무게나 착용 경험을 새로 만들지 않는다.',
    roomTopicPrompt(c.recentTopics||[],c.now??Date.now()),
    '다른 메시지에 답할 때만 그 메시지의 정확한 #번호를 replyTo에 적는다. 관련 없는 새 상품 이야기에는 replyTo:0. 혼잣말로 "네", "그쵸", "생각보다 빠르네" 같은 맥락 없는 반응을 하지 마라.',
    '방송이 paused 또는 다시보기여도 방금 종료된 것은 아니다. 종료 안내가 방금 올라온 근거가 없다면 "고생하셨어요" "수고하셨어요"처럼 방송 마무리 인사로 반응하지 마라. 👋는 채팅방 입장/가벼운 인사 버튼으로도 쓰인다. 이는 방송 종료 통지가 아니다. 👋에 답할 이유가 있을 때는 짧은 일반 인사(예: 반가워요)를 하거나 침묵하되, 수고하셨어요처럼 방송을 마친 듯 말하지 마라.',
    '같은 상품의 키/몸무게 사이즈 질문이 최근에 나왔다면 다른 테스트 계정이 다시 묻지 마라. 직전 화제에 더할 말 없으면 침묵한다. 연속된 3명 인사/감탄/유사 맞장구 금지.',
    '누군가 색상·코디·선택을 고민한다고 썼다면, 가능할 때만 그 글의 정확한 #번호로 짧게 답한다. 개인 취향을 묻거나 본인의 선호를 가볍게 말할 수 있으나, 상품 재고·실측·색상 존재 여부는 추측하지 마라. 한두 마디면 충분하며 억지로 후속 글을 만들지 않는다.',
    '"고민되네요", "깔끔하네요", "궁금하네요" 같은 동일한 감상 어미를 다른 테스트 계정이 연달아 반복하지 마라. 같은 뜻이라도 질문·취향·관찰을 나누고, 새 맥락이 없으면 침묵한다.',
    `최근 테스트 대화에서 이미 나온 질문 유형(답장 대상 아님): ${(c.questionMemory||[]).map(x=>clean(x,40)).join(' / ')||'없음'}. 닉네임·상품·색상·말끝만 바꿔 같은 질문을 다시 꺼내지 마라. 실제 고객에게 필요한 답장은 그 고객의 현재 글을 기준으로 판단한다.`,
    '사람처럼 간혹 한 군데 붙여 쓸 수 있지만 긴 문장을 통째로 붙여 쓰면 안 된다. 두세 단어 이상인 문장은 읽을 수 있게 기본 띄어쓰기를 유지한다.',
    '상품을 찾지도 않고 "529는 없는 것 같아요"처럼 등록·재고·품절 여부를 단정하거나 반박하지 마라. 정확히 확인된 상품 정보만 언급하고 모르면 단정하지 않는다.',
    '누가 특정 테스트 닉네임을 부르면 그 계정이 맥락에 맞게 대답한다. 응답을 요구하지 않는 채팅에는 가만히 있어도 된다.',
    '주문·결제·배송완료를 했다고 말할 때는 해당 테스트 계정의 실제 기록으로 확인된 경우에만 가능하다. 고객의 장바구니·주문·결제 개인정보는 말하지 않는다.',
    '보통은 짧고 직접적인 한국어 한 줄. 정해진 3인 대화, 반복적인 ㅋㅋ/이모지, 기계적 말투, 유입 경로 자랑을 피한다. 예문을 베끼거나 채팅을 채우려고 하지 않는다.',
    c.mode === 'live' ? '진행자에게 하는 일반적인 질문은 가능하나 무조건 답변을 요구하지 않는다.' : '진행자에게 지금 입어달라거나 즉시 답하라고 요구하지 않는다. 방송 중이라고 말하지 않는다.',
    `최근 관찰된 실제 채팅 형태(참고만): ${clean(c.styleSummary, 190) || '별도 통계 없음'}`,
    `해당 방송 실제 주문에서 관찰된 상품명(테스트 제외, 순위/구매수 주장 금지): ${(c.realOrderProducts || []).slice(0, 4).map(x => clean(x, 30)).join(' / ') || '없음'}`,
    `최근 채팅 중 주문/장바구니 자동 알림: ${orderNotices}건/${cartNotices}건. 고객명·주문상품을 추측하거나 자기 주문으로 말하지 않는다.`,
    ...(c.nextShow ? [`관리자가 설정한 다음 방송 안내: ${clean(c.nextShow, 65)}. 아직 확정되지 않은 일정은 만들어내지 말 것.`] : []),
    ...(c.rejectedLines?.length ? [`최근 부적절해 거절된 문장(반복 금지): ${c.rejectedLines.slice(0, 2).map(x => clean(x, 45)).join(' / ')}`] : []),
    `[발언 가능한 테스트 닉네임과 이전 기록]\n${actors.join('\n')}`,
    `[최근 채팅 - 오래된 순]\n${chat.join('\n') || '없음'}`,
    '오직 JSON 객체만 반환: {"speaker":"위 테스트 닉네임 중 하나 또는 빈 문자열","replyTo":0,"text":"짧은 한 마디 또는 빈 문자열"}. 답변이면 replyTo는 실제 #글번호, 독립 발언이면 0. 발언 필요 없으면 speaker와 text를 비운다.',
  ];
  return lines.join('\n');
}

export function orderedProductPrompt(products:ChatProductFacts[]):string[]{
 if(!products.length)return [];
 return ['[당일 주문에서 확인하고 현재 판매 목록과 대조한 다른 대화 소재]',
  ...products.slice(0,6).map(productFactsPrompt),
  '현재 카드에만 머무를 필요 없다. 이 상품들도 방송 중·일시정지·종료 모두 대화 소재로 쓸 수 있다. 다른 상품을 꺼낼 때는 정확한 품번 또는 기존 한글 약칭+번호를 밝혀 한 상품에 대해 말한다. 주문 내역은 상품을 확인하는 근거일 뿐, 자기 구매·착용 경험이나 인기·판매량의 근거가 아니다. 고객·주문량·주문자의 옵션을 추측하지 않는다. 정해진 상품 순환도 하지 않는다.'];
}
