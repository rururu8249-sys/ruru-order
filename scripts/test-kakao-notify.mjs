// [2026-10-26] 카톡 알림톡 변수·번호·템플릿 ID 규칙
import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const K = createUiLoader()('lib/kakaoNotify.ts');
const { KAKAO_NOTIFY_TEMPLATES: T, kakaoVariables, cartProductSummary, cleanTemplateId, kakaoTargetPhone, renderKakaoPreview, kakaoResultNote } = K;
// 템플릿 본문의 #{변수} = variables 목록과 정확히 같다(카카오 심사·발송 변수 불일치 방지)
for (const k of ['unpaid','cart']) {
  const inText = [...T[k].content.matchAll(/#\{([^}]+)\}/g)].map(m=>m[1]);
  assert.deepEqual([...new Set(inText)].sort(), [...T[k].variables].sort(), k);
  assert.ok(!/할인|쿠폰|특가|혜택|이벤트/.test(T[k].content), `${k} 광고성 낱말 없음`);
}
assert.deepEqual(kakaoVariables('unpaid', {닉네임:'맑은하늘', 주문번호:'RURU-1', 금액:'45,360원', 계좌:'NH농협은행 123 루루'}), {'#{닉네임}':'맑은하늘','#{주문번호}':'RURU-1','#{금액}':'45,360원','#{계좌}':'NH농협은행 123 루루'});
assert.equal(kakaoVariables('unpaid', {닉네임:'a', 주문번호:'', 금액:'1원', 계좌:'x'}), null, '빈 변수면 안 보냄');
assert.equal(cartProductSummary(['MIU-201 가디건','MIU-201 가디건','폴로 셔츠']), 'MIU-201 가디건 외 1개');
assert.equal(cartProductSummary([]), '');
assert.equal(cleanTemplateId(' KA01TP241026abcDEF '), 'KA01TP241026abcDEF');
assert.equal(cleanTemplateId('한글'), '');
assert.equal(kakaoTargetPhone('010-9779-5288'), '01097795288');
assert.equal(kakaoTargetPhone('02-6490-6376'), '', '집전화엔 안 보냄');
assert.ok(renderKakaoPreview('cart', {'#{닉네임}':'찡이','#{상품}':'가디건'}).includes('찡이님, 방송에서 접수하신'));
assert.equal(kakaoResultNote({status:'not_configured',sent:0}), '');
assert.ok(kakaoResultNote({status:'sent',sent:2}).includes('2명'));
console.log('test-kakao-notify: ok');

// 서버 발송: 템플릿·환경 없으면 안 보냄, 휴대폰 아니면 안 보냄, 빈 변수면 안 보냄(전부 네트워크 전에 멈춤)
const S = createUiLoader()('lib/kakaoNotifyServer.ts');
const fakeSb = (rows) => ({ from: () => ({ select: () => ({ in: async () => ({ data: rows }) }), insert: async () => ({}) }) });
delete process.env.SOLAPI_API_KEY;
let r = await S.sendKakaoNotify(fakeSb([{ key: 'kakao_notify_template_unpaid', value: 'KA01TPTEST01' }]), 'unpaid', [{ phone: '01011112222', vars: {} }], 't');
assert.equal(r.status, 'not_configured', '환경변수 없으면 안 보냄');
Object.assign(process.env, { SOLAPI_API_KEY: 'k', SOLAPI_API_SECRET: 's', SOLAPI_PF_ID: 'p', SOLAPI_SENDER: '0212345678' });
r = await S.sendKakaoNotify(fakeSb([]), 'cart', [{ phone: '01011112222', vars: { 닉네임: 'a', 상품: 'b' } }], 't');
assert.equal(r.status, 'not_configured', '템플릿 ID 없으면 안 보냄(쪽지만)');
r = await S.sendKakaoNotify(fakeSb([{ key: 'kakao_notify_template_cart', value: 'KA01TPTEST02' }]), 'cart', [{ phone: '0264906376', vars: { 닉네임: 'a', 상품: 'b' } }], 't');
assert.equal(r.status, 'no_phone', '집전화면 안 보냄');
r = await S.sendKakaoNotify(fakeSb([{ key: 'kakao_notify_template_cart', value: 'KA01TPTEST02' }]), 'cart', [{ phone: '01011112222', vars: { 닉네임: 'a', 상품: '' } }], 't');
assert.equal(r.status, 'bad_vars', '빈 변수면 안 보냄');
console.log('test-kakao-notify server: ok');
