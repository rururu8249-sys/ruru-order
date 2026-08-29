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
const joined = messages.join(' ');

// [2026-08-29] 유튜브 채팅은 줄바꿈을 지운다 → 줄바꿈이 있으면 글자가 붙어버린다(실제 사고)
assert(messages.every((m) => !m.includes('\n')), '채팅 문구에 줄바꿈이 있으면 안 됨');
assert(messages.every((m) => m.length <= 180), '모든 메시지는 제한 길이 이하');
assert(messages.every((m) => m.includes('루루테스트님 주문 감사합니다')), '닉네임 + 감사 인사');

// 중요 내용은 다 들어가야 한다
assert(joined.includes('MC(몽클레어)-105M 남성용 아우터'), '첫 상품명 누락 금지');
assert(joined.includes('2개'), '수량 표기');
assert(joined.includes('390,000원'), '상품별 총금액 표기');
assert(joined.includes('사이즈 38'), '사이즈 표기');
assert(joined.includes('BB(버버리)-401M 남성용 패딩 아우터'), '복합 옵션 세부상품 표기');
assert(joined.includes('블랙'), '복합 옵션 실제 색상 표기');
assert(!joined.includes('없음'), '없음 옵션 표기 금지');
assert(!/외\s*\d+/.test(joined), '외 N개 축약 금지');

// 딱지 제거 확인 — 읽기 쉽게
assert(!joined.includes('상품:'), '"상품:" 딱지 제거');
assert(!joined.includes('수량:'), '"수량:" 딱지 제거');
assert(!joined.includes('금액:'), '"금액:" 딱지 제거');
assert(!joined.includes('닉네임:'), '"닉네임:" 딱지 제거');

// 한 건짜리 주문 — 실제로 방송에서 제일 많이 나가는 형태
const one = buildYoutubeOrderAnnouncementMessages({
  nickname:'몽상가8277',
  rows:[{ product_name:'BB(버버리)-78 트렌치코트', color:'없음', size:'8', qty:1, product_price:255000 }],
  maxChars:180,
});
assert(one.length === 1, '한 건이면 메시지 하나');
assert(one[0] === '🛒 몽상가8277님 주문 감사합니다! 💗 BB(버버리)-78 트렌치코트 · 사이즈 8 · 1개 · 255,000원',
  '한 건 문구가 정확해야 함\n실제: ' + one[0]);

assert(savedWidgetPinMatches({widget_pin_mode:'pin',widget_pin_product_id:682,widget_pin_detail_name:'MC(몽클레어)-105M 남성용 아우터'}, {productId:'682',detailName:'MC(몽클레어)-105M 남성용 아우터'}), '저장된 고정값 검증');
assert(!savedWidgetPinMatches({widget_pin_mode:'pin',widget_pin_product_id:683,widget_pin_detail_name:'ZN-1M'}, {productId:'682',detailName:'MC-105M'}), '다른 고정값 거부');
assert(savedWidgetAutoMatches({widget_pin_mode:'auto',widget_pin_product_id:null,widget_pin_detail_name:null}), '자동모드 저장 검증');
assert(widgetPinTargetBroadcastId('live-1','live-1') === 'live-1', '활성 방송에서만 고정');
assert(widgetPinTargetBroadcastId('old-1','live-1') === '', '지난 방송 선택 시 위젯 고정 금지');
assert(registeredProductEditManualPrice('direct','239,000') === 239000, '직접입력 수정 시 기존 금액 복원');
assert(registeredProductEditManualPrice('direct','') === 0, '직접입력 기존 금액 없으면 0');
assert(registeredProductEditManualPrice('fixed','239000') === 0, '고정가 상품은 수동금액 복원하지 않음');
console.log('new live/order feature tests passed');
