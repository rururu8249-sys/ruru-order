// [2026-11-26] 물건챙기기 엑셀 — 자정 넘긴 방송도 「방송」 칸·방송별 시트로 그 방송에 묶임(실제 export 함수로 파일을 만들어 읽어 봄)
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {createUiLoader} from './admin-ui-test-loader.mjs';
let blob;
globalThis.window={URL:{createObjectURL(v){blob=v;return 'blob:t';},revokeObjectURL(){}}};
globalThis.document={createElement(){return {click(){},remove(){}};},body:{appendChild(){}}};
const {exportLiveOrdersForPicking,pickBroadcastGroup}=createUiLoader({exceljs:{default:ExcelJS},'@/lib/adminToast':{showAdminToast(){}}})('components/admin-live/adminLiveOrderExcelExport.ts');
// 실제 운영 모양: 의류14 = 11/21 00:00 ~ 11/22 01:15, 해외일정종료 = 11/22 01:16 ~ 12:06
const ranges=[
 {id:'A',title:'해외명품고퀄의류14',startedAt:'2026-11-20T15:00:00Z',endedAt:'2026-11-21T16:15:00Z'},
 {id:'B',title:'해외일정종료',startedAt:'2026-11-21T16:16:00Z',endedAt:'2026-11-22T03:06:00Z'},
];
const o=(id,nickname,createdAt,broadcastId,extra={})=>({id,groupId:'G'+id,nickname,paymentStatus:'paid',createdAt,paidAtFull:createdAt,broadcastId,items:[{id:id+'1',productName:'상품'+id,qty:1,amount:10000}],...extra});
const orders=[
 o('1','행복나무','2026-11-21T11:00:00Z','A'),            // 11/21 20:00
 o('2','시크도도','2026-11-21T15:40:00Z','A'),            // 11/22 00:40 — 자정 넘김
 o('3','커피','2026-11-21T15:31:00Z',null),               // 11/22 00:31 — 방송 기록 없음 → 방송 시간 안이라 의류14
 o('4','하나','2026-11-21T20:00:00Z','B'),                // 11/22 05:00
 o('5','두리','2026-11-23T02:00:00Z',null),               // 11/23 11:00 — 방송 없음 → 쇼핑몰
];
assert.equal(pickBroadcastGroup(orders[2],ranges).label,'11.21(토) 해외명품고퀄의류14','커피 = 의류14');
assert.equal(pickBroadcastGroup(orders[1],ranges).label,'11.21(토) 해외명품고퀄의류14','새벽 주문도 시작한 날 방송');
assert.equal(pickBroadcastGroup(orders[4],ranges).label,'11.23(월) 쇼핑몰 주문');
// 옮긴 주문 → 옮긴 방송
assert.equal(pickBroadcastGroup({createdAt:'2026-11-10T01:00:00Z',broadcastId:'X',pickPull:{pulledFor:'2026-11-22',broadcastId:'B'}},ranges).label,'11.22(일) 해외일정종료');
await exportLiveOrdersForPicking(orders,{filterLabel:'기간',rowOrder:'time',broadcastRanges:ranges});
let wb=new ExcelJS.Workbook();await wb.xlsx.load(await blob.arrayBuffer());
const names=wb.worksheets.map(w=>w.name);
assert.deepEqual(names,['물건챙기기','11.21(토) 해외명품고퀄의류14','11.22(일) 해외일정종료','11.23(월) 쇼핑몰 주문','닉네임별 합계','변경 및 추가','고객이슈·특이사항']);
const main=wb.getWorksheet('물건챙기기');
assert.equal(main.getRow(1).getCell(10).value,'방송');
assert.equal(main.rowCount,6,'전체 시트 5줄');
const nickOf=(ws)=>{const a=[];ws.eachRow((r,i)=>{if(i>1)a.push(r.getCell(2).value)});return a.sort();};
assert.deepEqual(nickOf(wb.getWorksheet('11.21(토) 해외명품고퀄의류14')),['시크도도','커피','행복나무'].sort());
assert.deepEqual(nickOf(wb.getWorksheet('11.22(일) 해외일정종료')),['하나']);
assert.deepEqual(nickOf(wb.getWorksheet('11.23(월) 쇼핑몰 주문')),['두리']);
// 전체 시트의 「방송」 칸으로 거르면 방송별 시트와 같음
const byCol={};main.eachRow((r,i)=>{if(i>1){const k=r.getCell(10).value;(byCol[k]||=[]).push(r.getCell(2).value);}});
assert.deepEqual(byCol['11.21(토) 해외명품고퀄의류14'].sort(),['시크도도','커피','행복나무'].sort());
// 방송 하나만이면 시트는 예전처럼(방송 칸만 붙음)
await exportLiveOrdersForPicking(orders.slice(0,3),{filterLabel:'방송',rowOrder:'time',broadcastRanges:ranges});
wb=new ExcelJS.Workbook();await wb.xlsx.load(await blob.arrayBuffer());
assert.deepEqual(wb.worksheets.map(w=>w.name),['물건챙기기','닉네임별 합계','변경 및 추가','고객이슈·특이사항']);
console.log('test-picking-broadcast-sheets: ok');
