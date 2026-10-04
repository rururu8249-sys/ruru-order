import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {createUiLoader} from './admin-ui-test-loader.mjs';
let blob;
globalThis.window={URL:{createObjectURL(value){blob=value;return 'blob:test';},revokeObjectURL(){}}};
globalThis.document={createElement(){return {click(){},remove(){}};},body:{appendChild(){}}};
const {exportLiveOrdersForPicking}=createUiLoader({exceljs:{default:ExcelJS},'@/lib/adminToast':{showAdminToast(){}}})('components/admin-live/adminLiveOrderExcelExport.ts');
const orders=[{id:'1',nickname:'유닝',paymentStatus:'paid',createdAt:'2026-10-03T01:00:00Z',paidAtFull:'2026-10-03T01:00:00Z',items:[{id:'1',productName:'BB-58',size:'XL',qty:1,amount:195000,repickRequiredAt:'2026-10-04T01:00:00Z',repickBefore:{product_name:'BB-60',size:'L',qty:2}}]}];
await exportLiveOrdersForPicking(orders,{filterLabel:'전체보기'});
const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await blob.arrayBuffer());
const sheet=workbook.getWorksheet('오늘 챙길 전체');
assert.deepEqual(sheet.getRow(1).values.slice(1),['날짜','닉네임','상품명','옵션','수량','상품금액','결제','비고']);
assert.equal(sheet.getCell('H2').value,'이전 주문 상품 변경 · 다시 챙기기\n변경 전: BB-60 · L · 2개\n변경 후: BB-58 · XL · 1개');
for(const address of ['A2','B2','C2','D2','E2','F2','G2','H2']){
 assert.equal(sheet.getCell(address).alignment.horizontal,'center');
 assert.equal(sheet.getCell(address).alignment.vertical,'middle');
}
assert.equal(sheet.getCell('E2').value,1);
assert.equal(sheet.getCell('F2').value,195000);
assert.equal(sheet.getCell('F2').numFmt,'#,##0');
assert(sheet.getColumn(5).width<=8);
assert(sheet.getCell('H2').alignment.wrapText);
assert(sheet.getRow(2).height>=54);
assert.equal(sheet.autoFilter,'A1:H2');
for(const [changes,want] of [
 [{repickBefore:null},'이전 주문 상품 변경 · 다시 챙기기\n변경 전: 기록 없음\n변경 후: BB-58 · XL · 1개'],
 [{repickRequiredAt:null},''],
]){
 await exportLiveOrdersForPicking([{...orders[0],items:[{...orders[0].items[0],...changes}]}],{filterLabel:'전체보기'});
 const checked=new ExcelJS.Workbook();await checked.xlsx.load(await blob.arrayBuffer());
 assert.equal(checked.getWorksheet('오늘 챙길 전체').getCell('H2').value??'',want);
}
await exportLiveOrdersForPicking([{...orders[0],paidAtFull:'2026-10-04T01:00:00Z',items:[{...orders[0].items[0],repickRequiredAt:null}]}],{filterLabel:'전체보기'});
const late=new ExcelJS.Workbook();await late.xlsx.load(await blob.arrayBuffer());
assert.equal(late.getWorksheet('오늘 챙길 전체').getCell('H2').value,'결제 후 추가 챙기기');
console.log('PASS real XLSX roundtrip: multiline before/after remarks, centered cells, narrow quantity and unchanged amounts');
