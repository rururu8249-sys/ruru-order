// [2026-11-25] 물건챙기기 엑셀 두 번째 시트 「닉네임별 합계」 — 실제 export 함수로 파일을 만들어 읽어 봄
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {createUiLoader} from './admin-ui-test-loader.mjs';
let blob;
globalThis.window={URL:{createObjectURL(value){blob=value;return 'blob:test';},revokeObjectURL(){}}};
globalThis.document={createElement(){return {click(){},remove(){}};},body:{appendChild(){}}};
const {exportLiveOrdersForPicking}=createUiLoader({exceljs:{default:ExcelJS},'@/lib/adminToast':{showAdminToast(){}}})('components/admin-live/adminLiveOrderExcelExport.ts');
const o=(id,nickname,paymentStatus,items)=>({id,groupId:'G'+id,nickname,paymentStatus,createdAt:'2026-11-24T01:00:00Z',paidAtFull:'2026-11-24T01:00:00Z',items});
const orders=[
 o('1','행복나무','paid',[{id:'11',productName:'어그 디스케트',color:'브라운',size:'230',qty:1,amount:95000},{id:'12',productName:'MC-319',size:'2',qty:2,amount:540000}]),
 o('2','행복나무','pending',[{id:'21',productName:'어그 디스케트',color:'초코',size:'250',qty:1,amount:95000}]),
 o('3','시크도도','paid',[{id:'31',productName:'어그 디스케트',color:'브라운',size:'230',qty:1,amount:95000}]),
];
await exportLiveOrdersForPicking(orders,{filterLabel:'기간',rowOrder:'nickname'});
const wb=new ExcelJS.Workbook();await wb.xlsx.load(await blob.arrayBuffer());
assert.equal(wb.worksheets[0].name,'물건챙기기');
assert.equal(wb.worksheets[1].name,'닉네임별 합계');
const s=wb.getWorksheet('닉네임별 합계');
const val=(r,c)=>s.getRow(r).getCell(c).value;
assert.deepEqual([1,2,3,4,5].map(c=>val(1,c)),['닉네임','주문서','총 개수','상품금액 합','미입금 개수']);
// 행복나무: 주문서 2·개수 4·730,000·미입금 1 / 시크도도: 1·1·95,000
assert.deepEqual([1,2,3,4,5].map(c=>val(2,c)),['행복나무',2,4,730000,1]);
assert.match(String(val(2,6)),/어그 디스케트 .*×1\n.*MC-319.*×2\n.*초코.*×1 \(미입금\)/);
assert.deepEqual([1,2,3,4].map(c=>val(3,c)),['시크도도',1,1,95000]);
assert.deepEqual([1,2,3,4,5,6].map(c=>val(4,c)),['합계',3,5,825000,1,'2명']);
// 첫 시트 줄 수·내용은 예전 그대로(4줄 + 헤더)
assert.equal(wb.getWorksheet('물건챙기기').rowCount,5);
console.log('test-picking-nickname-summary: ok');
