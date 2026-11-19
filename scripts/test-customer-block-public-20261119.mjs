import assert from 'node:assert/strict';
import { buildBlockReason, parseBlockReason } from '../lib/customerBlockReason.ts';
import { canExposeBlockDetails, publicBlockDetails } from '../lib/customerBlockPublic.ts';

const saved = buildBlockReason({type:'deal_break',dealDate:'2026-11-18',items:['폴로 니트 (블랙/M) ×1 39,000원','룰루 팬츠 (그레이/S) ×2 58,000원'],memo:'관리자 내부 메모: 욕설 내용 · 전화번호 01012345678'});
assert.match(saved,/거파 날짜: 2026-11-18/);
assert.equal(parseBlockReason(saved).dealDate,'2026-11-18');
const publicInfo=publicBlockDetails(saved,'2026-11-19T03:15:00Z');
assert.equal(publicInfo.kind,'deal_break');
assert.equal(publicInfo.dealDate,'2026.11.18');
assert.equal(publicInfo.registeredDate,'2026.11.19');
assert.deepEqual(publicInfo.items,[{product:'폴로 니트 (블랙/M) ×1',amount:39000},{product:'룰루 팬츠 (그레이/S) ×2',amount:58000}]);
assert.equal(publicInfo.totalAmount,97000);
assert.ok(!JSON.stringify(publicInfo).includes('욕설 내용'));
assert.ok(!JSON.stringify(publicInfo).includes('01012345678'));

const historical=publicBlockDetails('[거래파기(거파)]\n· 다이슨 에어랩 ×1 356,310원\n메모: 입금 안 하고 진상','2026-08-08T00:00:00Z');
assert.equal(historical.dealDate,'','기존 기록의 차단일을 거파 날짜로 지어내지 않을 것');
assert.equal(historical.registeredDate,'2026.08.08');
assert.equal(historical.items[0].amount,356310);
assert.ok(!JSON.stringify(historical).includes('진상'));

const freeText=publicBlockDetails('뉴발샌들 2개 거파 모욕적인 메모','');
assert.equal(freeText.category,'거래파기(거파)');
assert.equal(freeText.items.length,0,'관리자 자유 메모는 상품 정보인 척 공개하지 않기');
assert.ok(!JSON.stringify(freeText).includes('모욕적인 메모'));
assert.equal(publicBlockDetails('[악성문의·진상]\n메모: 내부내용','').category,'이용 중 부적절한 언행');
assert.equal(publicBlockDetails('[내가 만든 유형]\n메모: 별도비밀','').category,'이용 제한 사유 확인 필요');
assert.deepEqual(parseBlockReason(''),{type:null,label:'',items:[],memo:''});

// Date must be explicitly recorded and valid; 2026-02-30 must be rejected.
assert.equal(publicBlockDetails('[거래파기(거파)]\n거파 날짜: 2026-02-30','').dealDate,'');
assert.equal(publicBlockDetails('[거래파기(거파)]\n거파 날짜: 2026-02-28','').dealDate,'2026.02.28');

const id={sub:'12345',phone:'01011112222'};
const customers=[{customer_phone:'010-3333-4444',kakao_id:'12345'},{customer_phone:'010-5555-6666',kakao_id:'99999'}];
assert.equal(canExposeBlockDetails('01011112222',null,customers),false,'임의 전화번호 조회는 상세 사유 미제공');
assert.equal(canExposeBlockDetails('01011112222',id,[]),true,'카카오 본인 확인된 전화번호는 상세 제공');
assert.equal(canExposeBlockDetails('01033334444',id,customers),true,'동일 카카오ID와 연결된 DB 전화번호 허용');
assert.equal(canExposeBlockDetails('01055556666',id,customers),false,'다른 카카오 계정 전화번호 노출 금지');
assert.equal(canExposeBlockDetails('01099998888',{sub:'fake',phone:'01099998888'},customers),false,'검증되지 않는 ID 입력 방어');
console.log('PASS customer block public details: old/new format, dates, amounts, memo privacy, verified ownership');
