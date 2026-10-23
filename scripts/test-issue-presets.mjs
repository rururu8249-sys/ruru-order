// [2026-10-23] 고객이슈 자주 쓰는 내용 · 이체정보 한 줄 복사
import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const { ISSUE_MEMO_PRESETS, transferCopyText } = createUiLoader()('lib/refundLedger.ts');
assert.equal(transferCopyText('국민은행', '461-302-04112708', '홍채윤', 69000), '국민은행 46130204112708 홍채윤 69,000원');
assert.equal(transferCopyText('신한은행', '91304888454', '입니다', 5000), '신한은행 91304888454 5,000원', '잘못된 예금주(입니다)는 빼고');
assert.equal(transferCopyText('', '123', '', 0), '123');
for (const k of ['refund', 'exchange', 'etc']) assert.ok(ISSUE_MEMO_PRESETS[k].length >= 3, k);
assert.ok(ISSUE_MEMO_PRESETS.etc.filter((p) => p.pull).length >= 2, '기타 «챙겨서 출고»는 출고 넘기기로 이어짐');
assert.ok(ISSUE_MEMO_PRESETS.refund.every((p) => ['단순변심', '상품문제', '기타'].includes(p.reason)), '환불 칩은 사유도 맞춤');
console.log('test-issue-presets: ok');
