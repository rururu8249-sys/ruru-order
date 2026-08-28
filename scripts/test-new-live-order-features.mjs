import { buildYoutubeOrderAnnouncementMessages } from '../lib/orderYoutubeAnnouncement.ts';
import { savedWidgetPinMatches, savedWidgetAutoMatches, widgetPinTargetBroadcastId } from '../lib/widgetPinState.ts';
import { registeredProductEditManualPrice } from '../lib/registeredProductPricePolicy.ts';
function assert(cond, msg){ if(!cond) throw new Error(msg); }
const rows = [
  { product_name:'MC(몽클레어)-105M 남성용 아우터', color:'블랙', size:'1', qty:2, product_price:195000, adjusted_product_price:195000 },
  { product_name:'DR(디올)-207 아우터', color:'없음', size:'38', qty:1, product_price:229000, adjusted_product_price:229000 },
  { product_name:'버버리', color:'BB(버버리)-401M 남성용 패딩 아우터 / 블랙', size:'M', qty:1, product_price:239000, adjusted_product_price:239000 },
];
const messages = buildYoutubeOrderAnnouncementMessages({ nickname:'루루테스트', rows, maxChars:180 });
assert(messages.length >= 2, '여러 상품은 여러 메시지로 분할');
assert(messages.every((m) => m.length <= 180), '모든 메시지는 제한 길이 이하여야 함');
assert(messages.every((m) => m.includes('루루테스트')), '각 메시지에 닉네임 표기');
const joined = messages.join('\n');
assert(joined.includes('MC(몽클레어)-105M 남성용 아우터'), '첫 상품명 누락 금지');
assert(joined.includes('수량: 2'), '수량 표기');
assert(joined.includes('금액: 390,000원'), '상품별 총금액 표기');
assert(joined.includes('사이즈: 38'), '사이즈 표기');
assert(!joined.includes('없음'), '없음 옵션 표기 금지');
assert(!/외\s*\d+/.test(joined), '외 N개 축약 금지');
assert(joined.includes('옵션: BB(버버리)-401M 남성용 패딩 아우터'), '복합 옵션 세부상품 표기');
assert(joined.includes('색상: 블랙'), '복합 옵션 실제 색상 표기');
assert(savedWidgetPinMatches({widget_pin_mode:'pin',widget_pin_product_id:682,widget_pin_detail_name:'MC(몽클레어)-105M 남성용 아우터'}, {productId:'682',detailName:'MC(몽클레어)-105M 남성용 아우터'}), '저장된 고정값 검증');
assert(!savedWidgetPinMatches({widget_pin_mode:'pin',widget_pin_product_id:683,widget_pin_detail_name:'ZN-1M'}, {productId:'682',detailName:'MC-105M'}), '다른 고정값 거부');
assert(savedWidgetAutoMatches({widget_pin_mode:'auto',widget_pin_product_id:null,widget_pin_detail_name:null}), '자동모드 저장 검증');
assert(widgetPinTargetBroadcastId('live-1','live-1') === 'live-1', '활성 방송에서만 고정');
assert(widgetPinTargetBroadcastId('old-1','live-1') === '', '지난 방송 선택 시 위젯 고정 금지');
assert(registeredProductEditManualPrice('direct','239,000') === 239000, '직접입력 수정 시 기존 금액 복원');
assert(registeredProductEditManualPrice('direct','') === 0, '직접입력 기존 금액 없으면 0');
assert(registeredProductEditManualPrice('fixed','239000') === 0, '고정가 상품은 수동금액 복원하지 않음');
console.log('new live/order feature tests passed');
