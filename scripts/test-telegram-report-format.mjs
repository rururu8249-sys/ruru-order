// [2026-10-22] 텔레그램 결산 문구 — 형식·포인트 수동/실제·특수문자 이스케이프·상품 줄 상한·오류 한국어
import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const load = createUiLoader({ '@supabase/supabase-js': { createClient: () => ({}) } });
const { formatSettlementReport, parseManualPoint, escapeTelegramHtml, REPORT_PRODUCT_LINE_MAX } = load('lib/telegramReportFormat.ts');
const { formatReport } = load('lib/telegramReport.ts');
const { explainTelegramError } = load('lib/telegram.ts');

const base = { kind: '결산', title: '남녀 <공용> & 의류', when: '⏹ 10.22(목) 20:00 ~ 23:40', paidSum: 2345000, paidCount: 58, bankPaidSum: 1800000, cardPaidSum: 545000, goodsSum: 2200000, pointUsedActual: 12000, unpaidSum: 489000, unpaidBankCount: 3, unpaidCardCount: 0, products: [{ name: '꼼데 쭈리바지', qty: 12 }, { name: '폴로 <셔츠>', qty: 30 }, { name: '없음', qty: 0 }], monthLabel: '10월', monthSum: 25000000 };
const t = formatSettlementReport(base);
assert.match(t, /^📊 <b>결산<\/b> · 남녀 &lt;공용&gt; &amp; 의류\n/);
assert.match(t, /💰 매출 <b>2,345,000원<\/b> · 58건\n　무통장 1,800,000원 · 카드 545,000원\n📦 상품값 2,200,000원\n🪙 포인트 사용 12,000원\n⏳ 미결제 489,000원 · 3건 \(무통장 3 · 카드 0\)/);
assert.match(t, /🏆 <b>상품별 판매<\/b> · 총 42개 · 2종\n1\. 폴로 &lt;셔츠&gt; 30개\n2\. 꼼데 쭈리바지 12개/, '많이 팔린 순 · 0개 제외 · 이스케이프');
assert.match(t, /🗓 10월 누적 25,000,000원$/);
assert.doesNotMatch(t, /<셔츠>|<공용>/, 'HTML 괄호가 그대로 남으면 텔레그램이 거부');
// 수동 포인트
assert.match(formatSettlementReport({ ...base, pointUsedManual: 50000 }), /🪙 포인트 사용 50,000원 \(직접 입력\)/);
assert.match(formatSettlementReport({ ...base, pointUsedManual: null }), /🪙 포인트 사용 12,000원\n/);
assert.match(formatSettlementReport({ ...base, pointUsedManual: 0 }), /🪙 포인트 사용 0원 \(직접 입력\)/, '0원도 직접 입력으로 인정');
// 미결제 없음 · 월 누적 없음(조회범위 보고)
const r2 = formatSettlementReport({ ...base, unpaidSum: 0, unpaidBankCount: 0, unpaidCardCount: 0, monthLabel: undefined, monthSum: undefined, when: '' });
assert.match(r2, /⏳ 미결제 없음/); assert.doesNotMatch(r2, /누적/);
// 상품 줄 상한
const many = Array.from({ length: REPORT_PRODUCT_LINE_MAX + 5 }, (_, i) => ({ name: `상품${i}`, qty: 100 - i }));
const r3 = formatSettlementReport({ ...base, products: many });
assert.match(r3, new RegExp(`… 외 5종`)); assert.ok(r3.length < 4096, '텔레그램 4096자 안');
// 입력 파싱
assert.equal(parseManualPoint('12,000'), 12000); assert.equal(parseManualPoint(''), null); assert.equal(parseManualPoint('abc'), null); assert.equal(parseManualPoint('0'), 0);
assert.equal(escapeTelegramHtml('a<b>&c'), 'a&lt;b&gt;&amp;c');
// 서버 결산(liveSummary 스텁) — 중간보고/결산 구분 + 상품 전체 목록 사용
const sum = { scope: 'broadcast', title: '테스트방송', startedAt: '2026-10-22T11:00:00.000Z', endedAt: '2026-10-22T14:40:00.000Z', live: false, paidSum: 100, paidCount: 1, bankPaidSum: 100, cardPaidSum: 0, goodsSum: 90, pointUsedSum: 10, unpaidBankSum: 0, unpaidCardSum: 0, unpaidBankCount: 0, unpaidCardCount: 0, productAll: [{ name: 'A', qty: 2, amount: 90 }], monthLabel: '10월', monthSum: 100 };
assert.match(formatReport(sum), /^📊 <b>결산<\/b> · 테스트방송\n⏹ /);
assert.match(formatReport({ ...sum, live: true }), /^📊 <b>중간보고<\/b>[\s\S]*~ 지금/);
assert.match(formatReport(sum, { pointUsedManual: 7 }), /포인트 사용 7원 \(직접 입력\)/);
// 오류 한국어
assert.match(explainTelegramError('7176683355: Not Found; 7894355184: Not Found'), /봇 토큰이 맞지 않아요/);
assert.match(explainTelegramError('123: Bad Request: chat not found'), /chat id/);
assert.equal(explainTelegramError('123: Forbidden: bot was blocked by the user'), '123: Forbidden: bot was blocked by the user');
console.log('test-telegram-report-format: ok');
// [2026-10-23] 토큰 모양 검사
const { telegramTokenFormatIssue, telegramTokenHint } = load('lib/telegram.ts');
assert.equal(telegramTokenFormatIssue('7123456789:AAHabcdefghijklmnopqrstuvwxyz0123456789'), '');
assert.match(telegramTokenFormatIssue('bot7123456789:AAHabcdefghijklmnopqrstuvwxyz0123456789'), /bot/);
assert.match(telegramTokenFormatIssue('7123456789:AAHabc defghijklmnopqrstuvwxyz0123456789'), /공백/);
assert.match(telegramTokenFormatIssue('abc'), /모양/);
assert.equal(telegramTokenHint('7123456789:AAHx'), '봇 번호 7123456789');
console.log('token format: ok');
