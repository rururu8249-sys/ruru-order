// Regression: manually blocked customers without an actual deal break never reveal
// private reason labels, freeform comments, dates, order details or amounts.
import assert from 'node:assert/strict';
import {buildBlockReason} from '../lib/customerBlockReason.ts';
import {publicBlockDetails} from '../lib/customerBlockPublic.ts';

const registered='2026-11-19T09:30:00Z';
const notes=[
  '[악성문의·진상]\n메모: 악성고객이라고 적어놓은 내부 메모',
  '[반복 미입금]\n· 미입금 상품 ×1 23,000원\n메모: 노쇼 5회',
  '[반품·환불 악용]\n· 숨길 상품 ×1 40,000원\n메모: 클레임',
  '[주소·연락처 허위]\n메모: 주소확인 전화번호',
  '[직접 입력]\n메모: 다른 고객에게 공개해서는 안 될 내부 기록',
  '[직접 입력]\n메모: 이 고객은 거파 아님 (주의)',
  '[악성문의·진상]\n메모: 거래파기는 아니고 악성문의',
  '[기타]\n메모: 관리자 기록 (개인정보)',
  '단순 내부 주의 고객 / 특별 관리 요망',
  '거파 아님: 고객이 오해해서 문의한 기록',
  '',
];
let canonical='';
for(const reason of notes){
  const info=publicBlockDetails(reason,registered);
  assert.equal(info.kind,'other',`unexpected deal break: ${reason}`);
  assert.equal(info.category,'사이트 이용 제한');
  assert.equal(info.registeredDate,'','non-deal registration date must not be exposed');
  assert.equal(info.dealDate,'');
  assert.deepEqual(info.items,[],'non-deal items must be redacted');
  assert.equal(info.totalAmount,null);
  assert.equal(info.moreItems,0);
  const json=JSON.stringify(info);
  if(!canonical) canonical=json;
  assert.equal(json,canonical,'every non-deal reason gets identical response payload');
  for(const secret of ['악성','진상','미입금','반품','환불','허위','23,000','40,000','노쇼','클레임','관리자','내부'])
    assert.ok(!json.includes(secret),`internal term leaked: ${secret}`);
}
const d=publicBlockDetails(buildBlockReason({type:'deal_break',dealDate:'2026-11-18',items:['테스트용 상품 ×1 39,000원'],memo:'악성 내부 메모'}),registered);
assert.equal(d.kind,'deal_break');
assert.equal(d.category,'거래파기(거파)');
assert.equal(d.dealDate,'2026.11.18');
assert.equal(d.items[0].amount,39000);
assert.ok(!JSON.stringify(d).includes('악성 내부 메모'));
const legacy=publicBlockDetails('가디건 1개 거파 상담 필요','');
assert.equal(legacy.kind,'deal_break','existing manually registered legacy deal-breaks still recognized');
assert.equal(legacy.items.length,0,'unstructured memo never becomes an item');
console.log('PASS: non-deal block notices are identical, privacy-safe, and manual-deal-break-only');
