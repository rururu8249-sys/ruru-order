// Read-only production-code simulation: all DB writes are in-memory fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import Renderer, {act} from 'react-test-renderer';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const page = fs.readFileSync('app/order/page.tsx', 'utf8');
const between = (start, end) => {
  assert.ok(page.includes(start) && page.includes(end), 'source extraction markers');
  return page.slice(page.indexOf(start), page.indexOf(end));
};
let now = '2026-10-01T14:00:00Z';
class TestDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return new Date(now).getTime(); }
}
const configured = {
  combine_shipping_enabled: 'true',
  combine_shipping_start_at: '2026-10-01T10:00:00.000Z',
  combine_shipping_end_at: '2026-10-06T20:00:00.000Z',
};
const settings = new Map(Object.entries(configured));
const broadcasts = new Map([['old', {id:'old', status:'ON', started_at:'2026-10-01T07:43:00Z'}]]);
let orders = [{id:1, product_id:'normal', customer_phone:'01012345678', kakao_id:'K1',
  created_at:'2026-10-01T13:07:00Z', address:'서울 A', detail_address:'101호',
  broadcast_id:'old', shipping_fee:4000, order_manage_status:'', is_deleted:false}];
let failure = '', gate = null;
const reads = [], writes = [], errors = [];
const notices = [], submissions = [];
const posted=[];
let submitting = false;
let postGate=null, postSuccess=false;
const db = {from(table) {
  const filters = [];
  const chain = {
    select() { return chain; },
    in(k,v) { filters.push([k,'in',v]); return chain; },
    eq(k,v) { filters.push([k,'eq',v]); return chain; },
    gte(k,v) { filters.push([k,'gte',v]); return chain; },
    lte(k,v) { filters.push([k,'lte',v]); return chain; },
    or() { return chain; }, // fixtures use one customer; actual identity exclusion remains in page code
    limit(n) { return execute(n); },
    then(ok,bad) { return execute().then(ok,bad); },
    async upsert(payload) {
      for (const row of Array.isArray(payload) ? payload : [payload]) settings.set(row.key,row.value);
      writes.push({table, payload}); return {error:null};
    },
  };
  async function execute(limit = Infinity) {
    const fail = failure === table;
    let data = table === 'settings' ? [...settings].map(([key,value])=>({key,value}))
      : table === 'products' ? [{id:'normal', shipping_type:'일반', combine_shipping:'Y'}, {id:'vendor',shipping_type:'업체',combine_shipping:'N'}]
      : orders;
    data = data.filter(row=>filters.every(([key,op,val])=>op==='in'?val.includes(row[key]):op==='eq'?row[key]===val:op==='gte'?row[key]>=val:row[key]<=val)).slice(0,limit).map(row=>({...row}));
    reads.push({table,filters,dataCount:data.length,fail});
    if (table === 'orders' && gate) await gate;
    return fail ? {data:null,error:{message:'SIMULATED_QUERY_FAILURE'}} : {data,error:null};
  }
  return chain;
}};
function loadModule(file, imports = {}) {
  const module = {exports:{}};
  const js = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js,{module,exports:module.exports,require:name=> {
    assert.ok(name in imports,'unexpected dependency '+name); return imports[name];
  },Date:TestDate,Intl,console});
  return module.exports;
}
const utilities = loadModule('lib/admin-v2/combineShipping.ts');
const {shippingAddressKey} = loadModule('lib/shippingAddressKey.ts');
const controller = loadModule('components/admin-live/liveBroadcastController.ts', {
  '@/lib/supabase':{supabase:db}, '@/lib/adminCatalogWrite':{adminCatalogWrite:async payload=>{
    writes.push(payload);
    if (payload.op === 'insert') { const row={id:'new',...payload.values};broadcasts.set('new',row);return {data:row,error:null}; }
    let result;
    for (const row of broadcasts.values()) if ((payload.filters||[]).every(f=>row[f.col]===f.val)) {Object.assign(row,payload.values);result={...row};}
    return {data:result,error:null};
  }},
});
const harnessSource = `
${between('const EMPTY_PAID_SHIPPING_GROUPS:', '// [2026-09-08] BANK_NAME')}
globalThis.Harness = function Harness({broadcast, address='서울 A', detailAddress='101호', baseShippingFee=4000, items, customerPhone='01012345678'}) {
 ${between('  const [combineShippingSettings,', '  const [customerPointBalance')}
 const currentShippingAddressSignature = shippingAddressKey(address,detailAddress);
 ${page.includes('const combineShippingContextRef') ? between('  const combineShippingContextRef', '  const resolveCurrentCombineShippingSettings') : ''}
 const markPaidShippingInThisBrowser = () => {};
 ${between('  const loadCombineShippingSettings =', '  // [2026-09-22] 합배송')}
 ${between('  const resolveCurrentCombineShippingSettings =', '  const getCombineShippingLocalKey =')}
 ${between('  const checkAlreadyPaidShippingGroups =', '  const checkAlreadyPaidShipping =')}
 ${between('  const getChargeableShippingItems =', '  const shippingFeeBreakdown =')}
 ${between('  const submitOrder =', '  const submitOrderWithoutDetailAddress =')}
 globalThis.current = {check:checkAlreadyPaidShippingGroups, groups:paidShippingGroups, alreadyPaidShipping,
 submit:submitOrder, settings:combineShippingSettings, error:combineShippingCheckError,
 fee:calculateShippingFeeBreakdown(items, paidShippingGroups).totalShippingFee};
 return null;
};`;
const context = vm.createContext({...utilities, React, useRef:React.useRef, useState:React.useState, useLayoutEffect:React.useLayoutEffect, Date:TestDate, Intl, supabase:db,
  shippingAddressKey, normalizePhone:v=>v.replace(/\D/g,''), formatOrderPhone:v=>v,
  toNumber:v=>Number(v||0), window:{localStorage:{getItem:()=> 'K1'}},
  console:{log:(...args)=>errors.push(args.join(' '))},
  submitInFlightRef:{current:false}, setSubmitting:v=>{submitting=v;},
  refreshCustomerBlockStatus:async()=>({blocked:false}), validate:()=>true,
  hasPrivacyConsent:true, privacyConsentChecked:false, adminTestOrderMode:false,
  getOperatorTestOrderFlags:async()=>({isTestOrder:false}),
  ORDER_PURCHASE_CONSENT_REQUIRED_MESSAGE:'CONSENT_REQUIRED',
  showCustomerNotice:message=>notices.push(message),
  saveCustomer:async()=>{submissions.push('saveCustomer');},
  productAmount:10000, paymentMethod:'무통장입금', pendingOrderKeyRef:{current:{groupId:'TEST-GROUP',lookupCode:'TEST-CODE'}},
  youtubeNickname:'TEST',customerName:'TEST',zipcode:'00000',requestMemo:'',
  pointUseInput:'',customerPointBalance:0,recipientName:'',recipientPhone:'',
  onlyNumber:v=>v.replace(/\D/g,''),getCartSessionKey:()=> 'TEST',itemLabel:()=> 'TEST',
  localStorage:{getItem:()=> 'K1'},
  fetch:async(url,options)=>{posted.push({url,body:JSON.parse(options.body)});if(postGate)await postGate;return {ok:postSuccess,json:async()=>postSuccess?{ok:true,point_original_amount:10000}:{message:'TEST_STOP_AFTER_PAYLOAD'}};},
  parseOrderBankRoutingResult:()=>({bankAccount:null}),formatPhone:v=>v,totalQty:1,cardRateForCustomer:7,
  setDone(){},setHistoricalPaymentBankAccount(){},setPaymentGuideOpen(){},setOrderSheetOpen(){},
  clearOrderDraftData(){},setItems(){},setRequestMemo(){},setPaymentMethod(){},setPointUseInput(){},setPin(){},
  setIsEditingCustomerInfo(){},setIsCustomerInfoOpen(){},emptyItem:{},
});
context.window.scrollTo=()=>{};
vm.runInContext(ts.transpileModule(harnessSource,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
let tree;
const cart = [{product_name:'일반 상품',qty:'1',product_price:'10000',color:'',size:'',shipping_type:'일반',combine_shipping:'Y'}];
let props={broadcast:{...broadcasts.get('old')},items:cart};
const mount = async () => {await act(async()=>{tree=Renderer.create(React.createElement(context.Harness,props));});};
const update = async patch => {props={...props,...patch};await act(async()=>{tree.update(React.createElement(context.Harness,props));});};
const check = async () => {await act(async()=>{await context.current.check();});};
const evidence=[];
function snapshot(label, expectedFee) {
  const query=[...reads].reverse().find(r=>r.table==='orders');
  const record={label,fee:context.current.fee,groups:{...context.current.groups},query:query?.filters};
  evidence.push(record);
  if (expectedFee !== undefined) assert.equal(record.fee,expectedFee,label);
  console.log(JSON.stringify(record));
}
function assertWindow() {
  const query=[...reads].reverse().find(r=>r.table==='orders');
  assert.equal(JSON.stringify(query.filters),JSON.stringify([
    ['created_at','gte',configured.combine_shipping_start_at],['created_at','lte',configured.combine_shipping_end_at],
  ]),'configured window, no broadcast restriction');
  for (const [k,v] of Object.entries(configured)) assert.equal(settings.get(k),v,'admin setting preserved '+k);
}
await mount(); await check(); snapshot('방송 ON 추가주문',0);assertWindow();
await controller.endAdminLiveBroadcast('old');
assert.equal(broadcasts.get('old').status,'OFF');
await update({broadcast:{...broadcasts.get('old')}}); await check();snapshot('실제 종료 함수 실행 후 OFF 재조회',0);assertWindow();
await controller.setShopOpen(true);
await update({broadcast:null});await check();snapshot('쇼핑몰 전환',0);assertWindow();
await act(async()=>tree.unmount());await mount();await check();snapshot('쇼핑몰 새로고침·재접속',0);assertWindow();
now='2026-10-01T16:00:00Z';await check();snapshot('한국 자정 이후',0);assertWindow();
const next = await controller.startAdminLiveBroadcast({title:'시뮬레이션 새 방송'});
await update({broadcast:next});await check();snapshot('새 방송 시작 후 과거 방송 주문 합배송',0);assertWindow();
await update({address:'다른 주소'});await check();snapshot('다른 배송지는 합배송 제외',4000);
await update({address:'서울 A'});orders[0].order_manage_status='주문서취소';await check();snapshot('취소 주문은 제외',4000);
orders[0].order_manage_status='';orders[0].is_deleted=true;await check();snapshot('삭제 주문은 제외',4000);
orders[0].is_deleted=false;orders[0].shipping_fee=0;await check();snapshot('기존 0원 주문도 합배송 근거',0);
await update({items:[{...cart[0],shipping_type:'업체',combine_shipping:'N'}]});await check();snapshot('다른 배송그룹은 별도 배송비',4000);
orders.push({...orders[0],id:2,product_id:'vendor'});await check();snapshot('기존 업체배송도 있으면 업체 합배송',0);
await update({items:cart});await check();
// Network failure test at the same requery boundary triggered by broadcast status change.
await controller.endAdminLiveBroadcast('new');await update({broadcast:{...broadcasts.get('new')}});
failure='orders';
await assert.rejects(check(), /배송비.*확인/, '조회 실패는 주문 없음이 아닌 검증 실패여야 함');
snapshot('종료 재조회 오류에도 기존 합배송 판정 유지',0);
failure='';await check();snapshot('재조회 성공 후 회복',0);
let releaseDelayed;
gate=new Promise(resolve=>{releaseDelayed=resolve;});failure='orders';
let delayed;
await act(async()=>{delayed=context.current.check().catch(error=>error);await Promise.resolve();await Promise.resolve();});
assert.equal(reads.at(-1).table,'orders','delayed request reached order lookup');
gate=null;failure='';await check();snapshot('이전 실패 조회 지연 중 최신 재조회 성공',0);
await act(async()=>{releaseDelayed();await delayed;});
snapshot('이전 실패 응답이 최신 합배송 결과를 덮지 않음',0);
assert.equal(context.current.groups.normal,true,'latest verified result retained');
await check();snapshot('지연 오류 이후 정상 재조회 회복',0);
// A delayed successful-but-empty older query must not replace a newer positive result.
const savedOrders=orders;orders=[];
gate=new Promise(resolve=>{releaseDelayed=resolve;});
await act(async()=>{delayed=context.current.check().catch(error=>error);await Promise.resolve();await Promise.resolve();});
orders=savedOrders;gate=null;await check();
await act(async()=>{releaseDelayed();await delayed;});
snapshot('이전 빈 조회 성공 응답도 최신 합배송 결과를 덮지 않음',0);
// Changing the address invalidates in-flight replies even before another query starts.
gate=new Promise(resolve=>{releaseDelayed=resolve;});
await act(async()=>{delayed=context.current.check().catch(error=>error);await Promise.resolve();await Promise.resolve();});
gate=null;await update({address:'다른 주소'});
await act(async()=>{releaseDelayed();const outcome=await delayed;assert.match(String(outcome?.message),/주문 정보/);});
await check();snapshot('주소 변경 후 과거 응답은 무시·새 주소 별도 배송비',4000);
await update({address:'서울 A'});await check();
await update({address:'다른 주소'});failure='orders';
await assert.rejects(check(),/배송비.*확인/);
snapshot('주소 변경 후 조회 실패 시 이전 주소 합배송 재사용 금지',4000);
failure='';await update({address:'서울 A'});await check();
await update({customerPhone:'01099999999'});failure='orders';await assert.rejects(check(),/배송비.*확인/);
snapshot('전화번호 변경 후 실패 시 이전 고객 판정 재사용 금지',4000);
failure='';await update({customerPhone:''});await check();snapshot('전화번호 삭제 시 이전 판정 재사용 금지',4000);
await update({customerPhone:'01012345678'});await check();
for (const table of ['settings','orders','products']) {
  failure=table;const before=submissions.length;
  await act(async()=>{await context.current.submit();});
  assert.equal(submissions.length,before,'validation failure must stop before saveCustomer '+table);
  assert.equal(submitting,false,'submission unlocks for retry');
  assert.equal(context.submitInFlightRef.current,false,'ref unlocks for retry');
  assert.match(notices.at(-1),/배송비.*확인/,'customer sees actionable failure');
  assert.ok(context.current.error,'unconfirmed fee warning set');
  snapshot(table+' 실패 시 실제 제출 함수가 저장 전에 중단',0);
  failure='';await check();assert.equal(context.current.error,'','successful recheck clears warning');
}
await act(async()=>{await context.current.submit();});
assert.equal(posted.length,1,'successful validation reaches submission boundary');
assert.equal(posted[0].body.orderRows[0].shipping_fee,0,'fresh verified combined fee is sent');
assert.equal(posted[0].body.orderRows[0].total_price,10000,'combined payload keeps original item amount');
assert.equal(submitting,false);snapshot('정상 검증 후 제출 요청 배송비 0원',0);
postSuccess=true;let releasePost;
postGate=new Promise(resolve=>{releasePost=resolve;});
let saving;
await act(async()=>{saving=context.current.submit();for(let i=0;i<15;i++)await Promise.resolve();});
assert.equal(posted.length,2,'successful submission is waiting at mocked endpoint');
await update({address:'다른 주소'});await check();
await act(async()=>{releasePost();await saving;});
postGate=null;
snapshot('늦은 주문 성공 응답도 새 배송지 판정을 덮지 않음',4000);
assert.equal(submitting,false);
await update({address:'서울 A'});await check();
failure='settings';await assert.rejects(check(),/배송비.*확인/);snapshot('설정 조회 실패에도 기존 화면 판정 유지·제출 검증 실패',0);
failure='';
now='2026-10-06T19:59:59Z';await check();snapshot('기간 종료 직전',0);assertWindow();
now='2026-10-06T20:00:01Z';await update({broadcast:null});await check();snapshot('기간 종료 뒤 기존 당일 규칙',4000);
await act(async()=>tree.unmount());
console.log(JSON.stringify({scenarios:evidence.length, errors, productionWrites:0,
 verifiedFix:'조회 실패 제출 차단·기존 화면 판정 유지·응답 역전 및 배송지 변경 차단',
 limitation:'실제 브라우저 E2E 및 고객 증상 원인 확정은 아님. React 배송비 상태·원본 계산 함수·원본 종료 함수 + 인메모리 DB 통합 시뮬레이션.'}));
