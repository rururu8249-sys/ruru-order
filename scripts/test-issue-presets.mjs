// [2026-10-23] 고객이슈 자주 쓰는 내용 · 이체정보 한 줄 복사
import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const { ISSUE_MEMO_PRESETS, transferCopyText, transferCopyBlock } = createUiLoader()('lib/refundLedger.ts');
assert.equal(transferCopyText('국민은행', '461-302-04112708', '홍채윤', 69000), '국민은행 46130204112708 홍채윤 69,000원');
assert.equal(transferCopyText('신한은행', '91304888454', '입니다', 5000), '신한은행 91304888454 5,000원', '잘못된 예금주(입니다)는 빼고');
assert.equal(transferCopyText('', '123', '', 0), '123');
// [2026-10-25] 자주 쓰는 내용 + 사유 → «사유» 칩 한 줄. 환불·교환 칩은 모두 사유(반품비 판정)를 갖고, 출고는 사유 없음, 기타는 칩 없음.
for (const k of ['refund', 'exchange', 'ship']) assert.ok(ISSUE_MEMO_PRESETS[k].length >= 3, k);
assert.equal(ISSUE_MEMO_PRESETS.etc.length, 0, '기타는 사유 칩 없음');
for (const k of ['refund', 'exchange']) assert.ok(ISSUE_MEMO_PRESETS[k].every((p) => ['단순변심', '상품문제', '기타'].includes(p.reason)), `${k} 칩은 사유도 맞춤`);
assert.ok(ISSUE_MEMO_PRESETS.ship.every((p) => !p.reason && p.memo), '출고 칩 = 메모만');
for (const k of ['refund', 'exchange', 'ship']) { const labels = ISSUE_MEMO_PRESETS[k].map((p) => p.label); assert.equal(new Set(labels).size, labels.length, `${k} 칩 이름 중복 없음`); }
// 예전 칩의 반품비 판정 그대로: 품절·불량·오배송 = 상품문제(반품비 0), 단순변심·사이즈·색상 = 단순변심(반품비 칸)
const R = (k, l) => ISSUE_MEMO_PRESETS[k].find((p) => p.label === l).reason;
assert.equal(R('refund', '품절'), '상품문제'); assert.equal(R('refund', '불량·하자'), '상품문제'); assert.equal(R('refund', '단순변심'), '단순변심'); assert.equal(R('refund', '챙기기 전 취소'), '단순변심');
assert.equal(R('exchange', '사이즈'), '단순변심'); assert.equal(R('exchange', '불량'), '상품문제'); assert.equal(R('exchange', '오배송'), '상품문제');
// 다시 열 때 눌린 칩 고르기
const { presetFromSaved, issueKindTaskType, issueKindFromTaskTypes } = createUiLoader()('lib/refundLedger.ts');
assert.equal(presetFromSaved('refund', '품절 상품 환불', '상품문제'), '품절');
assert.equal(presetFromSaved('refund', '품절 상품 환불 · 손님 연락됨\n둘째 줄', '상품문제'), '품절', '칩 문구 뒤에 덧붙인 메모');
assert.equal(presetFromSaved('refund', '사이즈 작아서 반품', '단순변심'), '단순변심', '메모가 칩 문구가 아니면 사유 이름이 같은 칩');
assert.equal(presetFromSaved('refund', '사이즈 작아서 반품', '상품문제'), '', '상품문제는 어느 칩인지 모르면 안 고름(금액 판정은 저장값 그대로)');
assert.equal(presetFromSaved('exchange', '사이즈 교환', '단순변심'), '사이즈');
assert.equal(presetFromSaved('exchange', '팔 왼쪽 오른쪽 단면cm가 다름 불량 교환', '상품문제'), '불량', '메모 낱말 + 사유가 맞으면 그 칩(사장님 10/25 화면 사례)');
assert.equal(presetFromSaved('refund', '불량인 줄 알았는데 단순 변심', '단순변심'), '단순변심', '낱말이 있어도 사유가 다르면 그 칩 아님');
assert.equal(presetFromSaved('ship', '누락 상품 — 픽업 후 출고', ''), '누락 상품');
assert.equal(presetFromSaved('ship', '추가 주문건 — 확인 먼저 · 니트 S', ''), '추가 주문');
assert.equal(presetFromSaved('etc', '아무 메모', ''), '');
// 출고 = admin_tasks.task_type shipping (서버가 이미 받는 값)
assert.equal(issueKindTaskType('ship'), 'shipping'); assert.equal(issueKindTaskType('etc'), 'general'); assert.equal(issueKindTaskType('refund'), 'refund'); assert.equal(issueKindTaskType('exchange'), 'exchange');
assert.equal(issueKindFromTaskTypes(['shipping']), 'ship'); assert.equal(issueKindFromTaskTypes(['general']), 'etc'); assert.equal(issueKindFromTaskTypes(['return']), 'refund'); assert.equal(issueKindFromTaskTypes([], '교환'), 'exchange'); assert.equal(issueKindFromTaskTypes([]), 'refund');
// 사장님 14:44 사례(그니맘) — 이체정보 + 내용
assert.equal(transferCopyBlock({ bankName: 'NH농협은행', account: '10912208746', holder: '황선덕', amount: 47000, nickname: '그니맘', name: '황선덕', orderCode: 'RURU-MVDS9T9U', products: '메종 가디건(블랙/L)×1', memo: '사이즈 작아서 반품 만원 차감후 환불', deduct: 10000 }),
  'NH농협은행 10912208746 황선덕 47,000원\n그니맘(황선덕) · RURU-MVDS9T9U\n메종 가디건(블랙/L)×1\n사이즈 작아서 반품 만원 차감후 환불\n57,000원 − 차감 10,000원 = 47,000원');
assert.equal(transferCopyBlock({ bankName: 'X', account: '1', holder: 'a', amount: 24000, base: 24000, shipping: 4000 }).split('\n').at(-1), '20,000원 + 배송비 4,000원 = 24,000원');
console.log('test-issue-presets: ok');
