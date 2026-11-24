// [2026-11-25] 물건챙기기 엑셀 「2개↑ 색칠」 — 이벤트 선물 빼고 수량 합 2개 이상인 손님 닉네임 칸만 색. 실제 export 함수로 파일을 만들어 읽어 봄
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {createUiLoader} from './admin-ui-test-loader.mjs';
let blob;
globalThis.window={URL:{createObjectURL(value){blob=value;return 'blob:test';},revokeObjectURL(){}}};
globalThis.document={createElement(){return {click(){},remove(){}};},body:{appendChild(){}}};
const mod=createUiLoader({exceljs:{default:ExcelJS},'@/lib/adminToast':{showAdminToast(){}}})('components/admin-live/adminLiveOrderExcelExport.ts');
const {exportLiveOrdersForPicking,isEventGiftItem}=mod;
// 선물 판정 — 실데이터 모양
assert.equal(isEventGiftItem({productName:'이벤트 당첨자',amount:0}),true);
assert.equal(isEventGiftItem({productName:'이벤트(구매자)',amount:0}),true);
assert.equal(isEventGiftItem({productName:'양말선물',amount:0}),true);
assert.equal(isEventGiftItem({productName:'이벤트 머리끈',amount:0,eventGiftWinnerId:'w1'}),true);
assert.equal(isEventGiftItem({productName:'선물포장 니트',amount:39000}),false,'돈 받은 상품은 이름에 선물이 있어도 선물 아님');
assert.equal(isEventGiftItem({productName:'어그 디스케트',amount:0}),false,'0원이어도 이름이 선물 아니면 상품');
const o=(id,nickname,paymentStatus,items)=>({id,groupId:'G'+id,nickname,paymentStatus,createdAt:'2026-11-24T01:00:00Z',paidAtFull:'2026-11-24T01:00:00Z',items});
const orders=[
 o('1','행복나무','paid',[{id:'11',productName:'어그 디스케트',color:'브라운',size:'230',qty:1,amount:95000}]),
 o('2','행복나무','pending',[{id:'21',productName:'MC-319',size:'2',qty:1,amount:270000}]), // 주문서 2개 합쳐 2개 → 색
 o('3','시크도도','paid',[{id:'31',productName:'어그 디스케트',color:'브라운',size:'230',qty:1,amount:95000},{id:'32',productName:'이벤트 당첨자',qty:1,amount:0}]), // 1개+선물 → 색 없음
 o('4','하나','paid',[{id:'41',productName:'알로 부츠컷팬츠',size:'S',qty:2,amount:156000}]), // 한 줄 수량 2 → 색
 o('5','두리','paid',[{id:'51',productName:'이벤트(구매자)',qty:1,amount:0},{id:'52',productName:'양말선물',qty:1,amount:0}]), // 선물만 → 색 없음
];
async function load(meta){blob=null;await exportLiveOrdersForPicking(orders,{filterLabel:'기간',rowOrder:'nickname',...meta});const wb=new ExcelJS.Workbook();await wb.xlsx.load(await blob.arrayBuffer());return wb;}
const fillOf=(cell)=>cell.fill?.fgColor?.argb||null;
// 켬
let wb=await load({colorMultiBuyers:true});
const main=wb.getWorksheet('물건챙기기');
const byNick=new Map();
main.eachRow((r,i)=>{ if(i===1) return; const n=r.getCell(2).value; (byNick.get(n)||byNick.set(n,[]).get(n)).push(fillOf(r.getCell(2))); });
const happy=byNick.get('행복나무'); assert.ok(happy.length===2 && happy[0] && happy.every(c=>c===happy[0]),'행복나무 두 줄 같은 색');
const hana=byNick.get('하나'); assert.ok(hana[0] && hana[0]!==happy[0],'하나 다른 색');
assert.deepEqual(byNick.get('시크도도'),[null,null],'시크도도 색 없음');
assert.deepEqual(byNick.get('두리'),[null,null],'선물만 산 두리 색 없음');
// 미입금 줄(행복나무 MC-319)의 다른 칸은 예전 분홍 그대로
main.eachRow((r,i)=>{ if(i>1 && r.getCell(3).value==='MC-319') assert.equal(fillOf(r.getCell(3)),'FFF48FB1'); });
// 합계 시트 닉네임 칸도 같은 색
const sum=wb.getWorksheet('닉네임별 합계');
sum.eachRow((r,i)=>{ if(i===1) return; const n=r.getCell(1).value; if(n==='행복나무') assert.equal(fillOf(r.getCell(1)),happy[0]); if(n==='하나') assert.equal(fillOf(r.getCell(1)),hana[0]); if(n==='시크도도'||n==='두리') assert.equal(fillOf(r.getCell(1)),null); });
// 끔 → 닉네임 칸 색 없음(미입금 줄은 원래 분홍)
wb=await load({});
wb.getWorksheet('물건챙기기').eachRow((r,i)=>{ if(i===1) return; const pink=fillOf(r.getCell(3))==='FFF48FB1'; assert.equal(fillOf(r.getCell(2)), pink?'FFF48FB1':null); });
console.log('test-picking-multi-buyer-color: ok');
