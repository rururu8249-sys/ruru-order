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
