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

// [2026-11-15 07:40] 상품번호 줄임말·웃음 끝맺음 바꾸기
{
 const {shortProductCodes,varyLaughTail}=await import('../lib/liveAutomationVoice');
 if(shortProductCodes('PD-222 이거 38사이즈면 맞을까요?',0)!=='프222 이거 38사이즈면 맞을까요?')throw new Error('PD 줄임');
 if(!/^(버|버버)58 /.test(shortProductCodes('BB-58 XL',1)))throw new Error('BB 줄임');
 if(/[A-Z]{2}-?\d/.test(shortProductCodes('MC-319 아이보리 MX117',2)))throw new Error('영어 코드 남음');
 const recent=['링크 확인했어요 ㅎㅎ','네~','좋아요','아하'];
 const outs=new Set<string>();
 for(let i=0;i<12;i++){const o=varyLaughTail('입금했어용 ㅎㅎ',recent,i);if(o.endsWith('ㅎㅎ')&&!o.endsWith('ㅎㅎㅎ'))throw new Error('같은 ㅎㅎ 반복 '+o);outs.add(o);}
 if(outs.size<3)throw new Error('끝맺음이 다양하지 않음 '+[...outs]);
 if(varyLaughTail('이쁘다 ㅋㅋㅋ',['네네'],1)!=='이쁘다 ㅋㅋㅋ')throw new Error('안 겹치면 그대로');
 if(/[ㅋㅎ]/.test(varyLaughTail('사이즈 될까요 ㅋㅋ',['오 ㅋㅋ'],2)))throw new Error('질문엔 웃음 금지');
 console.log('PASS 줄임말·웃음 끝맺음',[...outs].join(' / '));
}
