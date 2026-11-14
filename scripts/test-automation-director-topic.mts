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
for(const t of ['BB-59 160에 50인데 S면 맞을까요?','160에 50인데 S 입으면 될까용','베이지 엑라 커요?','165에 55인데 엑라 많이 커여?','버110 몇 입으면 될까요?','몽346 어깨 좁은 편인데 2 괜찮나요?'])if(!vq(t))throw Error('vague '+t);
for(const t of ['BB-59 160에 50인데 몇 입으면 될까요?','몽346 키 165 몸무게 58이면 몇 사이즈요?','버110 기장 몇이에요?','가격요'])if(vq(t))throw Error('ok '+t);
if(!rep('160에 50인데 S 입으면 될까용',['BB-59 160에 50인데 S면 맞을까요?']))throw Error('size repeat');
console.log('ok size ask');}
