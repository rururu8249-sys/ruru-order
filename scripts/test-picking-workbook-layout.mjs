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
const sheet=workbook.getWorksheet('변경 및 추가');
assert.deepEqual(sheet.getRow(1).values.slice(1),['구분','주문일시','결제/변경일시','방송','고객','주문번호','변경 전','현재 내용','확인 내용']);
assert.equal(sheet.getCell('G2').value,'BB-60 · L · 2개');
assert.equal(sheet.getCell('H2').value,'BB-58 · XL · 1개');
for(const address of ['A2','B2','C2','D2','F2','G2','H2']){
 assert.equal(sheet.getCell(address).alignment.horizontal,address==='F2'?'left':'center');
 assert.equal(sheet.getCell(address).alignment.vertical,'middle');
}
assert(sheet.getCell('H2').alignment.wrapText);
assert.equal(sheet.autoFilter,'A1:I2');
for(const [changes,want] of [
 [{repickBefore:null},'BB-58 · XL · 1개'],
]){
 await exportLiveOrdersForPicking([{...orders[0],items:[{...orders[0].items[0],...changes}]}],{filterLabel:'전체보기'});
 const checked=new ExcelJS.Workbook();await checked.xlsx.load(await blob.arrayBuffer());
 assert.equal(checked.getWorksheet('변경 및 추가').getCell('H2').value??'',want);
}
await exportLiveOrdersForPicking([{...orders[0],items:[{...orders[0].items[0],repickRequiredAt:null}]}],{filterLabel:'전체보기'});
const ordinary=new ExcelJS.Workbook();await ordinary.xlsx.load(await blob.arrayBuffer());
assert.equal(ordinary.getWorksheet('물건챙기기').getCell('E2').value,1);
assert.equal(ordinary.getWorksheet('물건챙기기').getCell('F2').value,195000);
assert.equal(ordinary.getWorksheet('물건챙기기').getCell('F2').numFmt,'#,##0');
assert.equal(ordinary.getWorksheet('변경 및 추가').rowCount,1);
await exportLiveOrdersForPicking([{...orders[0],paidAtFull:'2026-10-04T01:00:00Z',items:[{...orders[0].items[0],repickRequiredAt:null}]}],{filterLabel:'전체보기'});
const late=new ExcelJS.Workbook();await late.xlsx.load(await blob.arrayBuffer());
assert.equal(late.getWorksheet('변경 및 추가').getCell('A2').value,'결제 후 추가 챙기기');
console.log('PASS real XLSX roundtrip: separate before/after fields, wrapped cells and unchanged amounts');
