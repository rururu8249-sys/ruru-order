// lib/liveAutomationLines.ts
// [2026-11-15 14:15~14:26 사장님] 가상 손님이 Gemini 없이 «코드로» 하는 말들 — 문장 은행·차례 정하기·말투(사람마다 버릇).
//   ① 방송 종료 인사(✅ 라이브방송이 종료되었습니다… 첫 등장 뒤, 그날 주문한 가상 손님 중 몇 명만 흩어서)
//   ② 어떻게 왔는지(소개·인스타·밴드) — 처음 말하는 가상 손님이 가끔, 방 전체 25분에 한 번
//   ③ 주문서 넣었다는 말 — 주문서마다 랜덤: 먼저 말하고 바로 주문 알림 / 알림 뒤에 말함 / 안 함
//   ④ 다른 가상 손님의 사이즈 질문(키·몸무게)에 한국 사이즈 대략 + «루루언니한테 물어보세요»
//   ⑤ 말투 버릇(personaVoice) — 띄어쓰기·~·!·..·^^·어미·가끔 오타를 사람마다 일정하게
//   돈·주문·입금 무접촉. 순수 함수만(테스트 scripts/test-automation-lines.mts).

export const hashOf = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const rng = (seed: number) => { let r = (hashOf('rng:' + Math.trunc(seed)) % 2147483646) + 1; const next = () => { r = (r * 48271) % 2147483647; return r / 2147483647; }; next(); next(); return next; };

// ───────── ① 방송 종료 인사 (100개) ─────────
export const FAREWELL_LINES: string[] = [
  // 수고 인사
  '수고하셨어요~', '루루언니 오늘도 수고 많으셨어요', '오늘 방송 수고하셨습니다', '언니 고생 많으셨어요', '루루언니 고생하셨어요',
  '오늘도 수고하셨어요 푹 쉬세요', '수고하셨어요 언니', '긴 시간 방송하시느라 고생하셨어요', '오늘 방송 재밌었어요 수고하셨어요', '언니 목 아프시겠어요 수고하셨어요',
  '루언니 수고했어요', '루사장님 오늘도 고생하셨어요', '루루사장님 수고 많으셨어요', '오늘도 감사했어요 수고하셨어요', '방송 잘 봤어요 수고하셨습니다',
  '수고 많으셨어요 다음 방송 기다릴게요', '언니 오늘 컨디션 좋아 보이셨어요 수고하셨어요', '오늘도 열일하셨네요 수고하셨어요', '고생하셨어요 맛있는 거 드세요', '수고하셨어요 언니 쉬세요',
  '오늘도 덕분에 즐거웠어요', '언니 덕분에 시간 가는 줄 몰랐어요', '재밌게 봤어요 고생하셨어요', '오늘 방송도 최고였어요', '언니 오늘 말 많이 하셔서 힘드시겠어요',
  // 예쁜 옷·득템·가격
  '오늘 예쁜 옷 많았네요', '오늘 득템한 거 같아요', '착한 가격에 잘 산 것 같아요', '오늘 고른 거 너무 마음에 들어요', '예쁜 거 많아서 고르기 힘들었어요',
  '오늘 옷들 다 이뻤어요', '오늘 건 진짜 득템이에요', '가격 착해서 기분 좋네요', '오늘 장바구니 행복했어요', '이번에도 예쁜 거 건졌어요',
  '오늘 상품들 진짜 예뻤어요', '빨리 받아보고 싶어요', '오늘 고른 거 기대돼요', '예쁜 옷 많아서 지갑이 울어요', '오늘 쇼핑 성공한 것 같아요',
  '이 가격에 이 퀄이면 득템이죠', '오늘 산 거 받으면 바로 입을래요', '오늘도 지름신 왔다 갔네요', '고민하다 샀는데 잘한 것 같아요', '오늘 옷 보는 재미 있었어요',
  '예쁜 거 소개해주셔서 감사해요', '오늘도 좋은 거 많이 보고 가요', '오늘 고른 색 너무 맘에 들어요', '다음에도 예쁜 거 부탁드려요', '오늘 건진 거 많아요',
  // 처음 왔어요
  '오늘 처음 왔는데 득템한 거 같아요', '처음 와봤는데 재밌네요', '처음인데 예쁜 거 많아서 놀랐어요', '오늘 처음 들어왔는데 단골 될 것 같아요', '처음 와서 주문까지 했어요',
  '처음 왔는데 언니 설명 너무 좋아요', '처음인데 가격 착해서 좋네요', '오늘 처음 봤는데 또 올게요', '처음 와봤는데 분위기 좋네요', '처음인데 벌써 다음 방송 기다려져요',
  // 또 올게요·다음 방송
  '또 올게요~', '다음 방송 때 또 올게요', '다음에도 꼭 올게요', '다음 방송 기다릴게요', '알림 켜놨어요 또 올게요',
  '다음 방송도 기대할게요', '다음에 또 뵐게요', '내일도 오실 거죠?', '다음 방송 언제예요?', '다음에도 예쁜 거 보러 올게요',
  '또 놀러 올게요', '다음 방송도 챙겨볼게요', '다음엔 친구랑 같이 올게요', '또 만나요 언니', '다음 주에도 올게요',
  '방송 알림 오면 바로 올게요', '다음엔 더 일찍 들어올게요', '또 봬요~', '다음 방송도 예쁜 거 많이 가져와 주세요', '담에 또 올게요',
  // 감사·마무리
  '오늘도 감사했어요', '좋은 방송 감사해요', '언니 감사합니다', '오늘도 행복했어요', '즐거운 시간이었어요',
  '감사합니다 조심히 들어가세요', '오늘 하루 마무리 잘하세요', '오늘도 잘 놀다 가요', '루루언니 사랑해요', '오늘 방송 덕분에 기분 좋아요',
  '오늘 진짜 재밌었어요', '언니 오늘 텐션 최고였어요', '푹 쉬시고 다음에 봬요', '오늘도 힐링하고 가요', '언니 늘 응원해요', '오늘도 수고하셨고 감사했어요',
  '언니 최고예요', '오늘도 좋은 시간이었어요', '다들 오늘 득템하셨나요?', '오늘 잘 샀어요 ㅎㅎ', '오늘 방송 알차서 좋았어요',
];

// 방송 종료 안내(관리자 자주 쓰는 말) 첫 등장 판정
export const isEndNotice = (body: string): boolean => /라이브\s*방송이?\s*종료/.test(String(body || ''));

/** 종료 안내 하나에 대한 인사 계획 — 몇 명(0~4)·각자 몇 초 뒤. 첫 사람은 조금 뒤, 그다음은 띄엄띄엄, 한 명쯤은 한참 뒤(한 템포 늦게). */
export function farewellPlan(noticeId: number, actorIds: string[]): { actorId: string; delayMs: number }[] {
  const r = rng(noticeId * 7 + 3);
  const roll = r();
  let count = roll < 0.08 ? 0 : roll < 0.3 ? 1 : roll < 0.62 ? 2 : roll < 0.88 ? 3 : 4;
  const order = [...actorIds].sort((a, b) => hashOf(a + ':' + noticeId) - hashOf(b + ':' + noticeId));
  count = Math.min(count, order.length);
  const out: { actorId: string; delayMs: number }[] = [];
  let at = 25000 + Math.floor(r() * 50000); // 첫 마디 25~75초 뒤
  for (let i = 0; i < count; i++) {
    out.push({ actorId: order[i], delayMs: at });
    // 다음 사람: 보통 40초~2분 30초 뒤, 가끔(30%) 한 템포 늦게 3~7분 뒤
    at += r() < 0.3 ? 180000 + Math.floor(r() * 240000) : 40000 + Math.floor(r() * 110000);
  }
  return out;
}

// ───────── ② 어떻게 왔는지 (소개·인스타·밴드) ─────────
export const VISIT_LINES: string[] = [
  '안녕하세요 지인 소개로 왔어요', '친구 소개로 들어왔어요~', '언니가 알려줘서 와봤어요', '인스타 보고 왔어요', '인스타에서 보고 들어왔어요',
  '인스타 광고 보고 왔는데 옷 예쁘네요', '밴드 가입했어요!', '밴드 보고 들어왔어요', '밴드 가입하고 처음 와봐요', '카톡 채널 추가하고 왔어요',
  '유튜브 보다가 떠서 들어왔어요', '알고리즘이 여기로 데려왔어요', '동생이 여기 옷 예쁘다고 해서 왔어요', '회사 동료 추천으로 왔어요', '엄마가 여기 좋다고 해서 와봤어요',
  '친구가 여기서 샀다고 해서 와봤어요', '인스타 릴스 보고 왔어요', '안녕하세요 처음 왔어요 소개받고 왔어요', '밴드 들어왔어요 반가워요', '지인이 링크 보내줘서 왔어요',
  '하이요 인스타 보고 왔어요', '유튜브 구독하고 왔어요', '언니 친구 추천으로 왔어요', '단톡방에서 소개받고 왔어요', '언니 밴드 가입했어요 잘 부탁드려요',
  '인스타 팔로우하고 왔어요', '유튜브 알림 보고 들어왔어요', '소개받고 왔는데 옷이 많네요', '친구 따라 왔어요 반가워요', '안녕하세요 밴드 보고 왔어요',
  // [2026-11-15 14:40 사장님] 유튜브 보고·구독하고 사이트로 넘어온 말
  '유튜브 보고 왔어요', '유튜브 구독하고 사이트로 넘어왔어요', '유튜브에서 링크 타고 왔어요', '유튜브 방송 보다가 넘어왔어요', '유튜브 설명란 보고 들어왔어요',
  '유튜브 구독 눌렀어요', '유튜브로 보다가 사이트로 왔어요', '유튜브 채팅 보다가 링크 눌렀어요', '유튜브 보고 사이트 처음 와봐요', '유튜브 구독하고 알림 설정했어요',
];
export const VISIT_RE = /소개|인스타|밴드|유튜브|채널\s*추가|알고리즘|추천으로|따라\s*왔|링크\s*보내|구독하고|팔로우/;

// ───────── ③ 주문서 넣었다는 말 ─────────
// [2026-11-15 14:42 사장님 「너무 똑같다 — 오만가지로」] 앞말 × 본말 × 뒷말 × 이음(. ! ~ 띄어쓰기)으로 조합 — 겹치지 않게 수백 가지
export function combineLines(heads:string[],cores:string[],tails:string[],max=45):string[]{
  const out=new Set<string>();const seps=[' ','. ','! ','~ ',', '];
  heads.forEach((h,hi)=>cores.forEach((c,ci)=>tails.forEach((t,ti)=>{
    const sep=seps[(hi*7+ci*3+ti)%seps.length];
    const line=[h,c].filter(Boolean).join(' ')+(t?sep+t:'');
    const clean=line.replace(/\s+/g,' ').replace(/\s([.!~,])/g,'$1').trim();
    if(clean.length>=2&&clean.length<=max)out.add(clean);
  })));
  return [...out];
}
const ORDER_HEADS=['','언니','루루언니','저','방금','드디어','고민하다가','언니 저','저도','고민 끝에'];
const ORDER_CORES_FIRST=['주문서 넣었어요','주문서 제출했어요','주문 넣었어요','주문서 보냈어요','주문했어요','주문서 냈어요','주문서 썼어요','주문 들어갔어요','주문서 올렸어요','주문 완료요'];
const ORDER_TAILS_FIRST=['','확인 부탁드려요','확인해주세요','확인 부탁드립니다','잘 부탁드려요','확인 좀 해주세요','봐주세요','부탁드려요','감사합니다'];
export const ORDER_FIRST_LINES: string[] = combineLines(ORDER_HEADS,ORDER_CORES_FIRST,ORDER_TAILS_FIRST);
const ORDER_CORES_AFTER=['주문서 넣었어요','주문했어요','주문 넣었어요','주문서 제출했어요','주문 들어갔네요','주문 완료했어요','주문서 보냈어요','주문 잘 들어갔네요','주문 접수됐네요','저 주문했어요'];
const ORDER_TAILS_AFTER=['','확인 부탁드려요','잘 부탁드려요','빨리 받고 싶어요','감사합니다','기대돼요','설레요','감사해요 언니','고민 끝','이쁘게 보내주세요'];
export const ORDER_AFTER_LINES: string[] = combineLines(['','언니','루루언니','방금','저','와','드디어'],ORDER_CORES_AFTER,ORDER_TAILS_AFTER);
/** 주문서마다 정함 — first: 가상 손님이 먼저 말하고 바로 주문 알림 / after: 알림 뒤에 말함 / none: 말 안 함 */
export function orderNoticePlan(groupId: string): 'first' | 'after' | 'none' {
  const n = hashOf('order-notice:' + groupId) % 100;
  return n < 30 ? 'first' : n < 55 ? 'after' : 'none';
}
export const orderAfterDelay = (groupId: string) => 12000 + (hashOf('after:' + groupId) % 70000); // 알림 뒤 12~82초

// ───────── ④ 사이즈 질문에 대략 답 + 루루언니한테 물어보라 ─────────
// 근거: 국가 기준(KS)은 가슴·엉덩이 둘레로 사이즈를 정함 → 키·몸무게 표는 업계에서 흔히 쓰는 «대략»(공식 통계 아님).
//   8차 사이즈코리아(2020~2021) 성인 여성 평균 키 159.6cm. 브랜드 숫자 사이즈(36·38·40 등)는 브랜드·상품마다 달라 말하지 않음.
const WEIGHT_BANDS: [number, string][] = [[45, '44'], [50, '44~55'], [55, '55'], [59, '55~66'], [64, '66'], [68, '66~77'], [74, '77'], [999, '77~88']];
const BAND_ORDER = ['44', '44~55', '55', '55~66', '66', '66~77', '77', '77~88'];
export function koreanSizeBand(heightCm: number, weightKg: number): string | null {
  if (!(heightCm >= 140 && heightCm <= 185 && weightKg >= 35 && weightKg <= 110)) return null;
  let i = WEIGHT_BANDS.findIndex(([max]) => weightKg <= max);
  if (heightCm >= 169) i = Math.min(BAND_ORDER.length - 1, i + 1); // 키가 크면 반 치수 위
  if (heightCm <= 152) i = Math.max(0, i - 1); // 키가 작으면 반 치수 아래
  return BAND_ORDER[i];
}
export function parseHeightWeight(text: string): { h: number; w: number } | null {
  const m = String(text || '').match(/(1[4-8]\d)\s*(?:cm|센치)?\s*(?:에|이고|이구|,|\/|\s)\s*([3-9]\d|1[01]\d)(?:\.\d)?\s*(?:kg|키로)?/i);
  return m ? { h: Number(m[1]), w: Number(m[2]) } : null;
}
export const isSizeQuestion = (text: string) => /사이즈|몇\s*(입|사이즈|호)|입으면|맞을까|맞나요|맞을지|될까요|크나요|작나요|클까요/.test(text) && /[?？]|까요|나요|까용|나용|까여|을지/.test(text);
const SIZE_REPLIES = [
  '{h}에 {w}면 보통 {b} 입으시더라구요 근데 방송할 때 {n}한테 확실하게 물어보시는 게 좋을 것 같아요',
  '{b} 정도 아닐까요? 브랜드마다 달라서 {n}한테 물어보시는 게 확실해요',
  '보통 {b} 입으실 것 같은데 {n}한테 한 번 물어보세요',
  '저도 비슷한데 {b} 입어요 그래도 이건 {n}한테 물어보시는 게 정확할 거예요',
  '{h}에 {w}면 {b} 쯤일 것 같아요 {n} 답 기다려 보세요',
  '사이즈는 {n}한테 물어보시는 게 제일 정확해요 보통 {b} 정도래요',
  '{b} 생각했는데 숫자 사이즈는 브랜드마다 달라서 {n}한테 확인해보세요',
  '키 몸무게면 대충 {b} 같은데 {n}이 실측 보고 알려주실 거예요',
  '{n}한테 물어보세요 저는 보통 {b}로 알고 있어요',
  '{b} 정도일 거 같은데 방송 때 {n}한테 꼭 물어보세요',
  '음 {b} 쯤? 정확한 건 {n}이 제일 잘 알아요',
  '{h} {w}면 {b} 많이 입던데 {n}한테 확실하게 물어보세요',
  '저랑 비슷하시네요 저는 {b} 입는데 옷마다 달라서 {n}한테 물어봐요',
  '{b} 아닐까 싶은데 {n}이 실측 재주실 거예요',
  '보통은 {b}인데 이 옷은 {n}한테 꼭 물어보세요',
  '{n} 실측 보고 말씀해주시는 게 정확해요 대충 {b}일 듯요',
  '그 정도면 {b} 많이 입으시던데요 {n}한테 확인해보세요',
  '{b} 같아요 근데 핏이 다 달라서 {n}한테 물어보시는 게 좋아요',
];
// [2026-11-15 14:41 사장님] 진짜 손님 사이즈 질문엔 숫자 없이 «방송 때 루루언니한테 물어보세요»만 — 자연스럽게 여러 모양으로
const ASK_HEADS=['','저도 궁금했는데','저도 그거 궁금해요','사이즈는','그건','옷마다 달라서','저도 늘 헷갈리는데','이 옷은','브랜드마다 달라서','저번에 저도 물어봤는데'];
const ASK_CORES=['{n}한테 물어보시면 실측 보고 알려주세요','방송 때 {n}한테 물어보세요','{n}한테 물어보시는 게 제일 정확해요','{n}이 실측 재서 알려주실 거예요','{n}한테 키 몸무게 말하면 딱 골라주세요','{n}이 사이즈 잘 봐주세요','방송할 때 {n}한테 꼭 물어보세요','{n}한테 여쭤보세요'];
const ASK_TAILS=['','저도 그렇게 해요','그게 확실해요','친절하게 알려주세요','금방 답해주실 거예요'];
export const SIZE_ASK_LUNA_LINES: string[] = combineLines(ASK_HEADS,ASK_CORES,ASK_TAILS,60);
export function honorificOf(seed:number):string{const p=rng(seed+101)();return p < 0.62 ? '루루언니' : p < 0.76 ? '루언니' : p < 0.88 ? '루사장님' : '루루사장님';}
/** 진짜 손님 사이즈 질문에 — 숫자 없이 «루루언니한테 물어보세요» */
export function askLunaText(seed:number):string{
  const n=honorificOf(seed);
  return SIZE_ASK_LUNA_LINES[hashOf('ask:'+seed)%SIZE_ASK_LUNA_LINES.length].split('{n}').join(n).replace(/(루루언니|루언니)이 /g,'$1가 ').replace(/(사장님)이 /g,'$1이 ');
}
export function sizeAnswerText(h: number, w: number, seed: number): string | null {
  const b = koreanSizeBand(h, w);
  if (!b) return null;
  const r = rng(seed);
  const p = r();
  void p;
  const n = honorificOf(seed);
  const t = SIZE_REPLIES[Math.floor(r() * SIZE_REPLIES.length)];
  return t.replace('{h}', String(h)).replace('{w}', String(w)).replace('{b}', b + ' 사이즈').split('{n}').join(n).replace(/(루루언니|루언니)이 /g,'$1가 ');
}

// ───────── ⑤ 말투 버릇(사람마다 일정하게) ─────────
export type Voice = { spacing: 'tight' | 'loose' | 'neat'; mark: '~' | '!' | '..' | '^^' | '.' | '' | ':)'; ending: '요' | '여' | '용' | '당'; typo: number };
export function voiceOf(actorSeed: number): Voice {
  const s = hashOf('voice:' + actorSeed);
  const spacing = (['tight', 'loose', 'neat', 'neat', 'neat'] as const)[s % 5];
  const mark = (['~', '!', '..', '^^', '.', '', '~', '!', ':)'] as const)[(s >>> 3) % 9]; // [14:40 사장님] :) 웃는 표시 쓰는 사람도
  const ending = (['요', '여', '용', '요', '요', '당'] as const)[(s >>> 6) % 6];
  const typo = (s >>> 9) % 4 === 0 ? 0.4 : 0.05;
  return { spacing, mark, ending, typo };
}
const TYPOS: [RegExp, string[]][] = [
  [/같아요/, ['같아여', '같애요', '갔아요']], [/했어요/, ['햇어요', '했어여']], [/있어요/, ['잇어요', '있어여']],
  [/감사합니다/, ['감사함다', '감사합니당', '감사해요']], [/수고하셨/, ['수고하셧', '수고하셨']], [/예쁘/, ['이쁘', '예뿌']],
  [/예뻤/, ['이뻤', '예뻣']], [/너무/, ['넘', '너므', '너무너무']], [/진짜/, ['진쨔', '찐', '진짜진짜']], [/괜찮/, ['괜찬', '갠찮']],
  [/할게요/, ['할께요', '할게여']], [/올게요/, ['올께요', '올게용']], [/좋아요/, ['조아요', '좋아여']], [/부탁드려요/, ['부탁드려용', '부탁드립니당', '부탁드려여']],
  [/확인/, ['확인', '확잉']], [/고생/, ['고생', '고상']], [/기다릴게요/, ['기다릴께요', '기다릴게용']],
];
/** 가상 손님 한 사람의 버릇대로 글 모양만 바꿈(뜻·숫자·상품번호·영어 그대로). */
export function personaVoice(text: string, actorSeed: number, msgSeed: number): string {
  const v = voiceOf(actorSeed);
  const r = rng(hashOf(text) + msgSeed * 31 + actorSeed);
  let s = String(text || '').trim();
  if (!s) return s;
  // 띄어쓰기 — 한글 사이만
  if (v.spacing === 'tight' && r() < 0.85) s = s.replace(/([가-힣])\s+([가-힣])/g, '$1$2');
  else if (v.spacing === 'loose' && r() < 0.5) { let done = false; s = s.replace(/([가-힣])\s+([가-힣])/g, (m, a, b) => (done ? m : ((done = true), a + b))); }
  // 오타 한 군데
  if (r() < v.typo) {
    const hits = TYPOS.filter(([re]) => re.test(s));
    if (hits.length) { const [re, opts] = hits[Math.floor(r() * hits.length)]; s = s.replace(re, opts[Math.floor(r() * opts.length)]); }
  }
  // 끝 부호 떼고 몸통·끝 나눔
  const m = s.match(/^(.*?)([.!?~^…\s]*)$/u);
  let body = m ? m[1] : s;
  const tail = m ? m[2].trim() : '';
  if (!body) return s;
  if (/[ㅋㅎㅠㅜ]$|\p{Extended_Pictographic}$|:-?\)$/u.test(body)) return body + tail;
  const question = /\?|？/.test(tail);
  // 어미 버릇 — «요»로 끝날 때만 가끔
  if (/요$/.test(body) && v.ending !== '요' && r() < 0.55) body = body.replace(/요$/, v.ending === '당' ? (/[다]요$/.test(body) ? '요' : '용') : v.ending);
  if (/니다$/.test(body) && v.ending === '당' && r() < 0.5) body = body.replace(/니다$/, '니당');
  // 끝 부호 버릇
  if (question) return body + (v.mark === '~' && r() < 0.3 ? '?~' : v.mark === '!' && r() < 0.3 ? '?!' : r() < 0.15 ? '??' : '?');
  const want = r() < 0.78 ? v.mark : tail;
  if (want === ':)') return body + (r() < 0.25 ? ' :)' : r() < 0.4 ? ':-)' : ':)');
  const mark = want === '~' ? (r() < 0.3 ? '~~' : '~') : want === '!' ? (r() < 0.3 ? '!!' : '!') : want === '..' ? (r() < 0.5 ? '...' : '..') : want;
  return body + mark;
}

// ───────── ⑥ 들어온 가상 손님 인사 (방송 시작 초~중반에 많이, 그 뒤·다시보기엔 드물게) ─────────
// [2026-11-15 14:30 사장님] 다양하게, 쌩뚱맞은 말 금지. kind: plain=기본 인사 / visit=어떻게 왔는지(방 전체 6분에 한 번) /
//   start=방송 막 시작(시작 15분 안·생방송만) / live=언니 칭찬(생방송만) / morning·evening=시간대
export type Greeting={text:string;kind:'plain'|'visit'|'site'|'start'|'live'|'morning'|'evening'|'next'};
export const GREETINGS:Greeting[]=[
  ...['안녕하세요','안녕하세요~','언니 안녕하세요','하이요','반가워요','안녕하세요 반가워요','언니 하이','안녕하세용','루루언니 안녕하세요','왔어요~',
      '들어왔어요','언니 저 왔어요','안녕하세요 오늘도 왔어요','오늘도 출석이요','출석했어요','안녕하세요 오늘 처음 왔어요','오늘 처음 와봤어요','처음 왔어요 반가워요','안녕하세요 구경하러 왔어요','언니 반가워요'
     ].map(text=>({text,kind:'plain' as const})),
  ...VISIT_LINES.map(text=>({text,kind:'visit' as const})),
  ...['방송 지금 시작한 거죠?','방금 시작했나요?','딱 맞춰 왔네요','시작하자마자 왔어요','알림 보고 바로 들어왔어요','오늘 방송 기다렸어요','오늘 뭐 나와요?','오늘도 기대돼요','시작했네요 반가워요','늦지 않게 왔어요'
     ].map(text=>({text,kind:'start' as const})),
  ...['언니 너무 예뻐요','언니 오늘 너무 귀여우세요','루루언니 오늘 예쁘시네요','언니 목소리 좋아요','언니 오늘 분위기 좋아요','언니 보러 왔어요','안녕하세요 언니 오늘도 예쁘세요','언니 오늘 기분 좋아 보여요'
     ].map(text=>({text,kind:'live' as const})),
  // [2026-11-15 14:40 사장님] 사이트 칭찬 — 방 전체 8분에 한 번
  ...['여기 사이트 좋네요','와 신기하다','사이트에서 바로 주문되니까 편하네요','방송 보면서 바로 담을 수 있어서 좋아요','여기 사이트 신기해요','사이트 깔끔하고 좋네요',
      '채팅도 되고 주문도 되네요 신기해요','와 이렇게 보면서 주문하는 거 처음이에요','사이트 보기 편해요','여기서 바로 살 수 있어서 좋네요','사이트 잘 만들었네요',
      '주문서 쓰기 편하네요','상품 보기 편해서 좋아요','이거 완전 편하다','방송이랑 같이 보니까 좋네요'
     ].map(text=>({text,kind:'site' as const})),
  ...['좋은 아침이에요','굿모닝이요','아침부터 왔어요'].map(text=>({text,kind:'morning' as const})),
  ...['좋은 저녁이에요','저녁 먹고 왔어요','퇴근하고 바로 왔어요'].map(text=>({text,kind:'evening' as const})),
];
/** 지금 쓸 수 있는 인사 — 생방송인지·시작 몇 분째인지·한국 몇 시인지·소개 인사를 방금 누가 했는지에 따라 */
export function greetingPool(o:{live:boolean;sinceStartMs:number;kstHour:number;visitRecently:boolean;weekend:boolean;nextShow?:NextShow|null;siteRecently?:boolean}):Greeting[]{
  const next=!o.live?nextShowLines(o.nextShow??null).map(text=>({text,kind:'next' as const})):[];
  return [...next,...next,...GREETINGS].filter(g=>g.kind==='next'||
    g.kind==='plain'||
    (g.kind==='visit'&&!o.visitRecently)||
    (g.kind==='site'&&!o.siteRecently)||
    (g.kind==='start'&&o.live&&o.sinceStartMs>=0&&o.sinceStartMs<15*60000)||
    (g.kind==='live'&&o.live)||
    (g.kind==='morning'&&o.kstHour>=6&&o.kstHour<11)||
    (g.kind==='evening'&&o.kstHour>=18&&o.kstHour<22&&!(o.weekend&&/퇴근/.test(g.text))));
}
/** 들어온 가상 손님이 인사할지 — 생방송 시작 45분 안 45%, 그 뒤 15%, 다시보기·쉬는 중 10% */
export function greetChance(o:{live:boolean;sinceStartMs:number}):number{
  if(!o.live)return 0.1;
  return o.sinceStartMs>=0&&o.sinceStartMs<45*60000?0.45:0.15;
}

// ───────── ⑦ 다음 방송 예정(관리자 「잠시 쉬는 중 문구」) ─────────
// [2026-11-15 14:34 사장님] 방송 중이 아닐 때 들어온 가상 손님은 저장된 문구(예: 「11/15(일) 저녁7시 예정」)를 보고 말함.
//   시간을 못 읽으면(기본 문구 등) 이 말은 안 함 — 시간을 지어내지 않음.
export type NextShow={when:string;today:boolean};
export function parseNextShow(raw:string,nowMs:number):NextShow|null{
  const t=String(raw||'').replace(/\s+/g,' ');
  const tm=t.match(/(오전|오후|아침|점심|저녁|밤|새벽)?\s*(\d{1,2})\s*시(\s*(\d{1,2})\s*분|\s*반)?/);
  if(!tm)return null;
  const k=new Date(nowMs+9*3600000);
  let hour=Number(tm[2]);
  if(hour>24)return null;
  const pm=/오후|저녁|밤/.test(tm[1]||'')&&hour<12;
  const h24=pm?hour+12:hour;
  const timeText=`${tm[1]?tm[1]+' ':''}${hour}시${tm[3]?tm[3].replace(/\s+/g,''):''}`.trim();
  const dm=t.match(/(\d{1,2})\s*[\/.월]\s*(\d{1,2})/);
  let today=true,dayText='';
  if(dm){
    const mo=Number(dm[1]),d=Number(dm[2]);
    const tgt=Date.UTC(k.getUTCFullYear(),mo-1,d),cur=Date.UTC(k.getUTCFullYear(),k.getUTCMonth(),k.getUTCDate());
    const diff=Math.round((tgt-cur)/86400000);
    if(diff<0||diff>14)return null; // 지난 날짜·너무 먼 날짜는 안 씀
    today=diff===0;dayText=diff===0?'오늘':diff===1?'내일':`${mo}/${d}`;
  }else if(/내일/.test(t)){today=false;dayText='내일';}
  else dayText=/오늘/.test(t)?'오늘':'';
  if(today&&h24<=k.getUTCHours())return null; // 오늘인데 이미 지난 시각
  return {when:(dayText?dayText+' ':'')+timeText,today};
}
const NEXT_SHOW_LINES=['{w} 방송 기다릴게요','{w}에 또 올게요','{w} 방송 알림 켜놨어요','{w}에 꼭 들어올게요','{w} 방송 때 봬요','{w} 방송 기대돼요','{w}에 다시 올게요 언니','다음 방송 {w}이죠? 그때 올게요','{w} 방송 때 예쁜 거 기대할게요','{w}까지 기다릴게요'];
export function nextShowLines(show:NextShow|null):string[]{
  if(!show)return [];
  return NEXT_SHOW_LINES.map(l=>l.replace('{w}',show.when));
}
