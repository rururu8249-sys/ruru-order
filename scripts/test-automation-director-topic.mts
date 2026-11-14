import {offCardProductMention as off,repeatsOwnLine as rep,advisesOthers as adv,mentionsSelf as self} from '../lib/liveAutomationDirector';
const card='BB-507 블랙 블랙';
const n=['🛍️ [테스트]강**분님 장바구니 담음 · MC-312 브라운(제니패딩) 3 · 190,000원 외 1종','🛒 [테스트]강변화분님 MC-312 브라운(제니패딩) 3 외 1종 주문 감사합니다!'];
const cases:[string,boolean][]=[['브라운 예쁘당 ㅎㅎ',true],['제니패딩 예쁘죠ㅎㅎ',true],['나도 블랙 성애자라 ㅋㅋ',false],['이거 66이면 라지될까요?',false],['가격 얼마에요?',false]];
for(const [t,e] of cases){const r=off(t,card,n);if(!!r!==e)throw Error(t+' '+r);}
if(!rep('네 카톡 보고 올게용',['카톡 확인하구 결제할게요용']))throw Error('rep1');
if(rep('넵 감사해요!',['카톡 확인하구 결제할게요용']))throw Error('rep2');
for(const t of ['55면 M 하시면 될걸요~','M 추천해요','정사이즈 입으시면 돼요'])if(!adv(t))throw Error('adv '+t);
for(const t of ['160에 55인데 M 될까요?','이거 라지 맞을까요','블랙 이쁘다'])if(adv(t))throw Error('adv no '+t);
if(!self('별빛님도 주문 완료하셨네용 축하드려요 ㅎㅎ','별빛향기'))throw Error('self1');
if(!self('별빛향기님 축하해요','[테스트]별빛향기'))throw Error('self2');
if(self('저도 주문완료했어용 ㅎㅎ','체리산책'))throw Error('self3');
if(self('블랙 이쁘다','별빛향기'))throw Error('self4');
console.log('ok');
// [2026-11-14 12:03] 방 전체 보고 반복 막기
import {roomAnnounceBlocked as rab} from '../lib/liveAutomationDirector';
if(!rab('장바구니 담았어유',[]))throw Error('rab cart');
if(!rab('카톡 확인했어용',['카결 링크 확인했어유']))throw Error('rab kakao');
if(rab('카톡 확인했어용',['요거 블랙 이뿌네유']))throw Error('rab kakao first');
if(!rab('저도 주문완료했어용 ㅎㅎ',['주문완료했어유 ㅎㅎ']))throw Error('rab order');
if(rab('블랙 4사이즈 이뿌당..',['카톡 확인했어용','주문완료용']))throw Error('rab product');
console.log('ok room announce');
// [2026-11-14 21:38] 사이즈는 키·몸무게 + 추천 받기, 사이즈 콕 집기·같은 질문 반복 금지
{const {vagueProductQuestion:vq}=await import('../lib/liveAutomationDirector');
for(const t of ['BB-59 160에 50인데 S면 맞을까요?','160에 50인데 S 입으면 될까용','베이지 엑라 커요?','165에 55인데 엑라 많이 커여?','버110 몇 입으면 될까요?','몽346 어깨 좁은 편인데 2 괜찮나요?','BB-58 이거 XL 크려나요 168에 62인뎅','안에 두꺼운거 입으면 맞으려나유'])if(!vq(t))throw Error('vague '+t);
for(const t of ['BB-59 160에 50인데 몇 입으면 될까요?','몽346 키 165 몸무게 58이면 몇 사이즈요?','버110 기장 몇이에요?','가격요','BB-58 안에 두꺼운 거 입으려면 168에 62인데 뭐가 맞을까요?'])if(vq(t))throw Error('ok '+t);
if(!rep('160에 50인데 S 입으면 될까용',['BB-59 160에 50인데 S면 맞을까요?']))throw Error('size repeat');
console.log('ok size ask');}
{const {wrongPaymentTalk:w}=await import('../lib/liveAutomationDirector');
if(!w('카결 링크 주세여~',false,true)||!w('결제 링크 언제 와요',false,false)||!w('입금했어요',true,false))throw Error('pay');
if(w('카결 링크 주세여~',true,false)||w('입금 계좌 어디예요',false,true)||w('가격요',false,true))throw Error('pay ok');
console.log('ok pay talk');}

// 2026-11-14 22:08 «요고 품번이 뭐예여?» — 무엇을 가리키는지 없는 질문은 버림
{
 const { vagueProductQuestion: vq } = await import("../lib/liveAutomationDirector");
 for (const t of ["요고 품번이 뭐예여?","이거 몇 번이에요?","품번이 뭐예요?","그거 블랙도 있나요?"]) { if (!vq(t)) throw new Error("가리키는 대상 없는 질문 통과: " + t); }
 for (const t of ["지금 입으신 거 품번이 뭐예요?","언니가 입은 패딩 몇 번이에요?","PD-530 와인 따뜻해요?","와 이쁘다"]) { if (vq(t)) throw new Error("정상 질문 막힘: " + t); }
 console.log("✓ 대상 없는 «요고·이거» 질문 버림");
}

// 2026-11-14 22:18 «블랙 XL도 핏 예쁘겠당» — 사이즈 집은 감탄·상품번호 없는 핏 얘기 버림
{
 const { vagueProductQuestion: vq } = await import("../lib/liveAutomationDirector");
 for (const t of ["블랙 XL도 핏 예쁘겠당","엑라도 이쁘겠다","핏 진짜 좋네요","M 사이즈 딱이겠어요"]) { if (!vq(t)) throw new Error("통과하면 안 됨: " + t); }
 for (const t of ["와 블랙 예쁘다","PD-530 와인 핏 예쁘네요","ㅋㅋㅋ 귀여워","가격요"]) { if (vq(t)) throw new Error("막히면 안 됨: " + t); }
 console.log("✓ 사이즈 집은 감탄·번호 없는 핏 얘기 버림");
}

// [2026-11-15 07:36] 카결 링크 — 결제 전엔 카톡·링크 얘기 금지, 결제 뒤엔 «결제완료»만
{
 const {cardLinkTalkBlocked}=await import('../lib/liveAutomationDirector');
 const cases:Array<[string,boolean,boolean,boolean]>=[
  ['링크 바로 확인했어용 ㅋㅋ',true,false,true],['네 카톡 볼게요~',true,false,true],['카결 완료했어요~',true,false,true],
  ['카결 완료했어요~',true,true,false],['결제완료했습니다!',true,true,false],['링크 확인했어요',true,true,true],
  ['확인했어용 감사합니당 ㅎㅎ',true,false,false],['계좌 입금하고 왔어용',false,false,false],['아이보리 예뻐요',true,false,false],
 ];
 for(const [t,card,paid,want] of cases){if(cardLinkTalkBlocked(t,card,paid)!==want)throw new Error('cardLinkTalkBlocked '+t);}
 console.log('PASS 카결 링크 대화 규칙',cases.length);
}

{
 const {cardAckBlocked,cardLinkTalkBlocked}=await import('../lib/liveAutomationDirector');
 for(const t of ['넵!','넹~','네 알겠습니다','알겠습니당'])if(cardLinkTalkBlocked(t,true,false)||cardAckBlocked(t,true,false))throw new Error('짧은 대답은 돼야 함 '+t);
 for(const t of ['확인했어용 감사합니당','네 볼게요','받았어요~'])if(!cardAckBlocked(t,true,false))throw new Error('확인 보고 막아야 함 '+t);
 if(cardAckBlocked('확인했어요',true,true))throw new Error('결제 뒤엔 상관없음');
 console.log('PASS 카결 링크 짧은 대답');
}

// [2026-11-15 07:40] 상품번호 줄임말·웃음 끝맺음 바꾸기
{
 const {shortProductCodes,varyLaughTail}=await import('../lib/liveAutomationVoice');
 const want:Record<string,string[]>={'PD-222':['프라','프라다','푸라닭','프','프라땡','pd'],'MX-117':['막스','막땡','막지마라','mx'],'MC-319':['몽','몽클','몽ㅋ','mc'],'BB-58':['버','버버','버땡','bb']};
 const forms=new Set<string>();
 for(const [code,names] of Object.entries(want)){const n=code.split('-')[1];const got=new Set<string>();for(let i=0;i<80;i++)got.add(shortProductCodes(code,i));
  const exp=new Set(names.map(x=>x+n));for(const g of got)if(!exp.has(g))throw new Error('표 밖 이름 '+g);for(const e of exp)if(!got.has(e))throw new Error('안 나온 이름 '+e);if(code==='PD-222')got.forEach(x=>forms.add(x));}
 console.log('  PD 형태',[...forms].join(' '));
 const recent=['링크 확인했어요 ㅎㅎ','네~','좋아요','아하'];
 const outs=new Set<string>();
 for(let i=0;i<12;i++){const o=varyLaughTail('입금했어용 ㅎㅎ',recent,i);if(o.endsWith('ㅎㅎ')&&!o.endsWith('ㅎㅎㅎ'))throw new Error('같은 ㅎㅎ 반복 '+o);outs.add(o);}
 if(outs.size<3)throw new Error('끝맺음이 다양하지 않음 '+[...outs]);
 if(varyLaughTail('이쁘다 ㅋㅋㅋ',['네네'],1)!=='이쁘다 ㅋㅋㅋ')throw new Error('안 겹치면 그대로');
 if(/[ㅋㅎ]/.test(varyLaughTail('사이즈 될까요 ㅋㅋ',['오 ㅋㅋ'],2)))throw new Error('질문엔 웃음 금지');
 console.log('PASS 줄임말·웃음 끝맺음',[...outs].join(' / '));
}

// [2026-11-15 08:18] 같은 말도 띄어쓰기·마침표·^^·어미가 사람마다 다르게
{
  const {varySurface} = await import('../lib/liveAutomationVoice');
  const outs = new Set<string>();
  for (let i = 1; i < 200; i++) outs.add(varySurface('베이지도 예쁘네요', i * 97));
  if (outs.size < 10) throw new Error('varySurface 다양성 부족 ' + outs.size);
  if (![...outs].some((x) => x.includes('베이지도예쁘')) || ![...outs].some((x) => /\^\^$/.test(x)) || ![...outs].some((x) => /용/.test(x))) throw new Error('varySurface 종류 누락');
  if (varySurface('버58 160에 52인데 몇 입으면 될까요?', 5).indexOf('버58') !== 0 || !varySurface('버58 160에 52인데', 3).includes('160에 52')) throw new Error('숫자 건드림');
  console.log('varySurface ok', outs.size);
}

// [2026-11-15 08:28] 최근 웃음이 없어도 «ㅋㅋ/ㅎㅎ» 두 개 끝맺음은 늘 바꿈 + 주말이라 담는다는 말 금지
{
  const {varyLaughTail} = await import('../lib/liveAutomationVoice');
  // [08:45 사장님] ㅋㅋ·ㅎㅎ도 써도 됨 — 여러 모양이 섞이는지(두 개짜리 그대로는 절반 아래)
  let kept = 0; const kinds = new Set<string>();
  for (let i = 1; i < 200; i++) { const o = varyLaughTail('좋네용 ㅎㅎ', [], i * 13); if (/(^|[^ㅎ])ㅎㅎ$/.test(o)) kept++; kinds.add(o); }
  if (kept === 0 || kept > 100 || kinds.size < 8) throw new Error(`웃음 섞기 이상 kept=${kept} kinds=${kinds.size}`);
  console.log('stock laugh mix ok', kept, kinds.size);
}

// [2026-11-15 08:49] 카결 링크 답: 안내마다 반은 답 안 함, 반은 8~60초 사이, 2분 30초 지나면 안 함
{
  const {cardAckPlan} = await import('../lib/liveAutomationDirector');
  let skip = 0, delays: number[] = [];
  for (let id = 1000; id < 1400; id++) {
    const p0 = cardAckPlan(id, 0, 0);
    if (p0 === 'skip') { skip++; continue; }
    let d = 0; while (cardAckPlan(id, 0, d) === 'wait') d += 1000;
    if (cardAckPlan(id, 0, d) !== 'go' || d < 8000 || d > 60000) throw new Error('카결 답 시각 ' + id + ' ' + d);
    if (cardAckPlan(id, 0, 151000) !== 'skip') throw new Error('늦은 답');
    delays.push(d);
  }
  if (skip < 150 || skip > 250) throw new Error('반반 아님 ' + skip);
  const lo = delays.filter((d) => d < 20000).length, hi = delays.filter((d) => d > 45000).length;
  if (!lo || !hi) throw new Error('빠르게·늦게 섞이지 않음');
  console.log('card ack plan ok', skip, Math.min(...delays), Math.max(...delays));
}
