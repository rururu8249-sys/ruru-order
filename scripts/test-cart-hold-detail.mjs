import {
  buildCartHoldSnapshotItem,
  cartHoldPresentation,
  checkoutReminderCopy,
} from '../lib/cartHoldDetail.ts';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

const detail = buildCartHoldSnapshotItem({
  product_id: '673',
  product_name: 'BB(버버리)-401M 남성용 패딩 아우터 · 블랙',
  color: '블랙',
  size: 'M',
  qty: '2',
  product_price: '239,000',
});
assert(detail.productId === '673', 'productId 보존');
assert(detail.productName === 'BB(버버리)-401M 남성용 패딩 아우터 · 블랙', '정확한 세부상품명 보존');
assert(detail.unitPrice === 239000, '실판매 단가 숫자화');
assert(detail.qty === 2, '수량 숫자화');
const legacyPayload = buildCartHoldSnapshotItem({ product_id:'673', product_name:'버버리', size:'6', qty:'1' });
assert(legacyPayload.unitPrice === null, '금액 미전송은 null로 보존');
const freePayload = buildCartHoldSnapshotItem({ product_id:'1', product_name:'무료상품', qty:'1', product_price:'0' });
assert(freePayload.unitPrice === 0, '실제 무료상품 0원은 0으로 보존');

const shown = cartHoldPresentation({
  productName: detail.productName,
  fallbackProductName: '버버리',
  color: '블랙',
  size: 'M',
  qty: 2,
  unitPrice: 239000,
  legacySnapshot: false,
});
assert(shown.title === detail.productName, '관리자에는 세부상품명을 메인으로 표시');
assert(shown.optionText === '블랙 · M', '색상/사이즈 표시');
assert(shown.rowTotal === 478000, '행 금액 = 단가 × 수량');
assert(shown.legacySnapshot === false, '신규 스냅샷은 legacy 아님');

const placeholder = cartHoldPresentation({
  productName: '',
  fallbackProductName: '버버리',
  color: '없음',
  size: '6',
  qty: 1,
  unitPrice: null,
  legacySnapshot: true,
});
assert(placeholder.title === '버버리', '기존 행은 부모상품명만 안전 fallback');
assert(placeholder.optionText === '6', '없음 placeholder는 숨김');
assert(placeholder.rowTotal === null, '기존 금액 미기록은 금액 추측 금지');
assert(placeholder.legacySnapshot === true, '기존 행 표시');

const copy = checkoutReminderCopy();
assert(copy.title.includes('주문 확인'), '알림 제목');
assert(copy.message.includes('주문서 제출 전'), '알림 본문에 미제출 안내');
assert(copy.message.includes('자동 해제'), '선점 자동해제 안내');

console.log('cart hold detail / reminder tests passed');
