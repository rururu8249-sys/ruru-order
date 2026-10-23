// [2026-10-23] 진행 중 교환 표식 — 주문 행 id 로만(추정 없음), 완료·거절은 안 붙음 · 송장 상품명에 [교환: …]
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const { exchangeMarksFromLedgers, exchangeOpen } = createUiLoader()('lib/exchangeMarks.ts');
const L = (over) => ({ kind: '교환', stage: '접수', done_at: null, exchange_option: '아크네스튜디오 청바지 XS → S', product_snapshot: [{ lineId: '501', productName: '아크네스튜디오 청바지', size: 'XS', qty: 1 }], ...over });
assert.equal(exchangeMarksFromLedgers([L({})]).get('501'), '교환: 아크네스튜디오 청바지 XS → S');
assert.equal(exchangeMarksFromLedgers([L({ stage: '완료' })]).size, 0, '완료된 교환은 안 붙음');
assert.equal(exchangeMarksFromLedgers([L({ kind: '반품' })]).size, 0);
assert.equal(exchangeMarksFromLedgers([L({ product_snapshot: [{ productName: 'x' }] })]).size, 0, 'lineId 없으면 안 붙임(추정 매칭 금지)');
assert.ok(!exchangeOpen(L({ exchange_option: '' })));
// 송장
let blob;
globalThis.window = { URL: { createObjectURL(v) { blob = v; return 'b'; }, revokeObjectURL() {} } };
globalThis.document = { createElement() { return { click() {}, remove() {} }; }, body: { appendChild() {} } };
const excel = createUiLoader({ exceljs: { default: ExcelJS }, '@/lib/adminToast': { showAdminToast() {} } })('components/admin-live/adminLiveOrderExcelExport.ts');
const order = { id: '9', groupId: 'G', orderNo: 'G', nickname: '김점무', name: '김정환', phone: '01000000000', address: '서울', detailAddress: '1', zipcode: '1', paymentStatus: 'paid', items: [{ id: '501', productName: '아크네스튜디오 청바지', color: '', size: 'XS', optionText: 'XS', qty: 1, amount: 85000 }] };
await excel.exportLiveOrdersForRosen([order], { filterLabel: 't', exchangeByItemId: new Map([['501', '교환: 아크네스튜디오 청바지 XS → S']]) });
const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await blob.arrayBuffer());
assert.match(String(wb.getWorksheet('주소통합_제목필터').getCell('I2').value), /\[교환: 아크네스튜디오 청바지 XS → S\]/);
await excel.exportLiveOrdersForRosen([order], { filterLabel: 't' });
const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(await blob.arrayBuffer());
assert.doesNotMatch(String(wb2.getWorksheet('주소통합_제목필터').getCell('I2').value), /교환/, '표식 없으면 그대로');
console.log('test-exchange-marks: ok');
