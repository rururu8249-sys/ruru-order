import {offCardProductMention as off,repeatsOwnLine as rep,advisesOthers as adv} from '../lib/liveAutomationDirector';
const card='BB-507 블랙 블랙';
const n=['🛍️ [테스트]강**분님 장바구니 담음 · MC-312 브라운(제니패딩) 3 · 190,000원 외 1종','🛒 [테스트]강변화분님 MC-312 브라운(제니패딩) 3 외 1종 주문 감사합니다!'];
const cases:[string,boolean][]=[['브라운 예쁘당 ㅎㅎ',true],['제니패딩 예쁘죠ㅎㅎ',true],['나도 블랙 성애자라 ㅋㅋ',false],['이거 66이면 라지될까요?',false],['가격 얼마에요?',false]];
for(const [t,e] of cases){const r=off(t,card,n);if(!!r!==e)throw Error(t+' '+r);}
if(!rep('네 카톡 보고 올게용',['카톡 확인하구 결제할게요용']))throw Error('rep1');
if(rep('넵 감사해요!',['카톡 확인하구 결제할게요용']))throw Error('rep2');
for(const t of ['55면 M 하시면 될걸요~','M 추천해요','정사이즈 입으시면 돼요'])if(!adv(t))throw Error('adv '+t);
for(const t of ['160에 55인데 M 될까요?','이거 라지 맞을까요','블랙 이쁘다'])if(adv(t))throw Error('adv no '+t);
console.log('ok');
