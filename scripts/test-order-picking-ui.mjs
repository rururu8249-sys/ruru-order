import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let failExceptions=false;
let exportSnapshot=[], exportAdditional=[],exportExceptions=[];
globalThis.fetch=async()=>({ok:!failExceptions,json:async()=>({ok:!failExceptions,orders:exportSnapshot,additionalOrders:exportAdditional,exceptions:exportExceptions,message:'고객이슈 조회 실패'})});
const require = createRequire(import.meta.url);
const root = path.resolve('.');
const rows = new Map([[1, {id: 1, picked_at: null, collected_at: 'legacy'}], [2, {id: 2, picked_at: null}], [3, {id:3, picked_at:null}]]);
const writes = [], toasts = [], exportsMade = [];
let gate = null, deny = false, readGate = null;
const db = { from(table) {
  return {
    select() { return { async in(_, ids) {
      const data = table === 'products' ? [] : ids.map(id => rows.get(Number(id))).filter(Boolean).map(row => ({...row}));
      if (readGate) await readGate;
      return { data, error: null };
    } }; },
    update(payload) { const chain = { is() { return chain; }, in(_, ids) { if ('picking_list_printed_at' in payload) {writes.push({payload,ids}); return Promise.resolve({error:null});} return { async select() {
      writes.push({payload, ids});
      if (gate) await gate;
      if (deny) return {data: [], error: null};
      for (const id of ids) Object.assign(rows.get(id), payload);
      return {data: ids.map(id => rows.get(id)), error: null};
    } }; } }; return chain; },
  };
} };
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = {exports: {}};
  cache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022}}).outputText;
  const localRequire = spec => {
    if (spec === '@/lib/supabase') return {supabase: db};
    if (spec === '@/lib/adminToast') return {showAdminToast: (...args) => toasts.push(args)};
    if (spec === '@/lib/adminConfirm') return {showAdminConfirm: async () => true};
    if (spec === './adminLiveOrderExcelExport') return {exportLiveOrdersForPicking: async (orders,meta) => {exportsMade.push({orders,meta});}};
    if (spec.startsWith('@/') || spec.startsWith('.')) {
      const base = spec.startsWith('@/') ? path.join(root, spec.slice(2)) : path.resolve(path.dirname(filename), spec);
      const target = [base, base + '.ts', base + '.tsx'].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
      return load(target);
    }
    return require(spec);
  };
  vm.runInThisContext('(function(require,module,exports){' + source + '\n})', {filename})(localRequire, module, module.exports);
  return module.exports;
}
const Modal = load(path.join(root, 'components/admin-live/LiveOrderPickingModal.tsx')).default;
const item = (id, qty, size = 'S/36') => ({id: String(id), productId: '', productName: 'MIU-2', color: '', size, optionText: '원본 옵션', qty, amount: 10000});
const order = (id, status, items, extra = {}) => ({id: String(id), groupId: String(id), nickname: '고객' + id, name: '받는분' + id, phone: '', createdAt: '2026-10-01T10:00:00Z', paymentStatus: status, items, ...extra});
const orders = [order(1, 'paid', [item(1, 3)]), order(2, 'card_paid', [item(2, 1, '')], {paidAtFull:'2026-10-01T10:05:00Z'}), order(3, 'unpaid', [item(3, 7)]), order(4, 'canceled', [item(4, 9)]), order(5, 'paid', [item(5, 11)], {excludeFromPicking: true})];
let tree;
await act(async () => { tree = Renderer.create(React.createElement(Modal, {orders, filterLabel: '방송: 검수', onClose() {}})); });
const checks = () => tree.root.findAll(node => node.type === 'button' && node.props.role === 'checkbox');
const check = nickname => checks().find(node => node.props["aria-label"].startsWith(nickname + " "));
const button = text => tree.root.findAllByType('button').find(node => node.props['aria-label'] === text || node.children.join('') === text);
const text = () => JSON.stringify(tree.toJSON());
const nodeText = node => node.children.map(child => typeof child === 'string' ? child : nodeText(child)).join('');
assert.equal(checks().length, 2, 'only paid, non-canceled, included orders');
assert.equal(check("고객1").props['aria-checked'], false, 'legacy collected must not imply completion');
assert.ok(text().includes('원본 옵션'), 'optionText-only legacy orders must keep their option');
// Scope/help remains available without occupying permanent work-list space.
const scopeDetails = tree.root.findAllByType('details');
assert.equal(scopeDetails.length, 1, 'help has a collapsed disclosure');
assert.ok(!scopeDetails[0].props.open, 'help is collapsed initially');
const scopeLine=tree.root.findByProps({'aria-label':'작업 범위'});
assert(!scopeLine.findAllByType('details').length,'scope is always visible outside disclosure');
assert(scopeLine.children.join('').includes('취소·챙기기 제외 주문 제외'));
assert.ok(scopeDetails[0].findByType('summary').children.length > 0);
const listToolbar = tree.root.findByProps({'aria-label':'물건챙기기 목록 도구'});
assert.match(listToolbar.props.className, /flex-nowrap/, 'desktop work controls stay on one line');
assert.doesNotMatch(listToolbar.props.className, /flex-wrap/, 'desktop work controls do not wrap into a second line');
assert.ok(listToolbar.findAllByType('button').some(node => node.children.join('') === '상품별'), 'product view belongs in the compact list toolbar');
assert.ok(listToolbar.findAllByType('button').some(node => node.children.join('') === '고객별'), 'customer view belongs in the compact list toolbar');
assert.ok(listToolbar.findAllByProps({'aria-label':'정렬 방식'}).length === 1, 'sort belongs beside the view switch');
const compactSearch = listToolbar.findByProps({'aria-label':'상품번호 또는 고객 이름 검색'});
assert.match(compactSearch.props.className, /max-w-\[/, 'desktop search stays compact instead of occupying a separate full row');
assert.equal(tree.root.findAll(node => node.props.role === 'status').length, 1, 'save/error feedback stays accessible');
let release;
gate = new Promise(resolve => {release = resolve;});
let pending;
await act(async () => { pending = check("고객1").props.onClick(); check("고객1").props.onClick(); });
assert.equal(writes.length, 1, 'rapid duplicate clicks cannot race');
assert.equal(check("고객1").props['aria-checked'], false, 'not completed until server confirms');
assert.equal(check("고객2").props.disabled, true, 'overlapping writes blocked');
await act(async () => { release(); await pending; });
gate = null;
assert.equal(checks().length, 2, 'a newly completed row stays in its original working position');
assert.equal(check('고객1').props['aria-checked'], true, 'the row itself clearly shows completion');
assert.ok(nodeText(check('고객1')).includes('챙김 완료'), 'completed button uses plain-language status');
assert.equal(tree.root.findAllByProps({'aria-label':'방금 챙김 완료'}).length, 0, 'redundant completion banner does not consume another row');
assert.ok(text().includes('[챙김 완료] 버튼'), 'undo guidance names the visible completed button');
assert.ok(!text().includes('`완료됨` 버튼'), 'undo guidance does not use the retired button label');
await act(async () => check('고객1').props.onClick());
assert.equal(check('고객1').props['aria-checked'], false, 'clicking the completed row again immediately undoes it');
await act(async () => check('고객1').props.onClick());
await act(async () => button('챙김 완료 탭').props.onClick());
assert.equal(check("고객1").props['aria-checked'], true);
await act(async () => button('고객별').props.onClick());
assert.equal(check("고객1").props['aria-checked'], true, 'customer view sees product-view completion');
await act(async () => { await check("고객1").props.onClick(); });
await act(async () => button('일반 챙김 탭').props.onClick());
await act(async () => button('상품별').props.onClick());
assert.equal(check("고객1").props['aria-checked'], false, 'product view sees customer-view undo');
deny = true;
await act(async () => { await check("고객1").props.onClick(); });
assert.equal(check("고객1").props['aria-checked'], false, 'denied update never appears complete');
assert.ok(toasts.some(args => args[1] === 'error'));
deny = false;
await act(async () => { await check("고객2").props.onClick(); });
assert.equal(checks().length, 2, 'a newly completed row stays visible until the modal is reopened');
await act(async () => tree.unmount());
await act(async () => { tree = Renderer.create(React.createElement(Modal, {orders, filterLabel: '검수', onClose() {}})); });
await act(async () => button('챙김 완료 탭').props.onClick());
assert.equal(check("고객2").props['aria-checked'], true, 'reopen reloads persisted state');
await act(async () => button('일반 챙김 탭').props.onClick());
await act(async () => tree.root.findByType('input').props.onChange({target: {value: 'miu2'}}));
assert.equal(checks().length, 1, 'separator-free search works inside the active work tab');
// Existing IDs can change through Dashboard realtime updates from another admin.
rows.get(2).picked_at = null;
const refreshed = orders.map(order => ({...order, items: order.items.map(item => ({...item, pickedAt: null}))}));
await act(async () => tree.update(React.createElement(Modal, {orders: refreshed, filterLabel: '검수', onClose() {}})));
assert.equal(check('고객2').props['aria-checked'], false, 'same-ID realtime undo refreshes open modal');
// Scope refresh that started before a write must never overwrite its confirmed result.
let releaseRead;
readGate = new Promise(resolve => {releaseRead = resolve;});
rows.set(6, {id: 6, picked_at: null});
const expanded = [...refreshed, order(6, 'paid', [item(6, 1)])];
await act(async () => tree.update(React.createElement(Modal, {orders: expanded, filterLabel: '검수', onClose() {}})));
// Loading scope must block a check until the read is authoritative.
assert.equal(check('고객1').props.disabled, true);
await act(async () => { releaseRead(); });
readGate = null;
let releaseSave;
gate = new Promise(resolve => {releaseSave = resolve;});
let saving;
await act(async () => {saving = check('고객1').props.onClick();});
rows.set(7, {id: 7, picked_at: null});
readGate = new Promise(resolve => {releaseRead = resolve;});
await act(async () => tree.update(React.createElement(Modal, {orders: [...expanded, order(7, 'paid', [item(7, 1)])], filterLabel: '검수', onClose() {}})));
await act(async () => {releaseSave(); await saving;});
gate = null;
await act(async () => {releaseRead();});
readGate = null;
await act(async () => button('챙김 완료 탭').props.onClick());
assert.equal(check('고객1').props['aria-checked'], true, 'scope refresh cannot undo a confirmed save');
assert.ok(rows.get(1).picked_at);
await act(async () => tree.unmount());
for (const id of [1,2]) rows.set(id, {id, picked_at: null});
const sortingFixture = [order(1, 'paid', [{...item(1, 3), productName: 'MIU-2'}]), order(2, 'paid', [{...item(2, 1), productName: 'BB-69'}])];
await act(async () => {tree = Renderer.create(React.createElement(Modal, {orders: sortingFixture, filterLabel: '검수', onClose() {}}));});
assert.deepEqual(tree.root.findAllByType('h3').map(node => node.children.join('')), ['BB-69', 'MIU-2'], 'product groups sorted by product name, not customer name');
await act(async()=>tree.update(React.createElement(Modal,{orders:[order(1,'paid',[{...item(1,3),productName:'나 셔츠'}]),order(2,'paid',[{...item(2,1),productName:'가 셔츠10'}]),order(3,'paid',[{...item(3,1),productName:'가 셔츠2'}])],filterLabel:'검수',onClose(){}})));
assert.deepEqual(tree.root.findAllByType('h3').map(node=>node.children.join('')),['가 셔츠2','가 셔츠10','나 셔츠'],'Korean product names use 가나다 and natural numeric order');
await act(async () => tree.unmount());
// Natural sorting and stable working order remain available without payment/status filter clutter.
for (const id of [1,2,3]) rows.set(id, {id, picked_at: null});
const controlFixture = [order(1, 'paid', [{...item(1, 3), productName: 'MIU-10'}], {nickname: '나', createdAt:'2026-10-01T09:00:00Z'}), order(2, 'paid', [{...item(2, 1), productName:'MIU-2'}], {nickname:'가', createdAt:'2026-10-01T11:00:00Z'}), order(3, 'unpaid', [{...item(3, 7), productName:'MIU-1'}])];
await act(async () => {tree = Renderer.create(React.createElement(Modal, {orders: controlFixture, filterLabel:'방송: 검수 · 오늘', onClose() {}}));});
const select = label => tree.root.findAllByType('select').find(node=>node.props['aria-label']===label);
const headings = () => tree.root.findAllByType('h3').map(node=>node.children.join(''));
assert.deepEqual(headings(), ['MIU-2','MIU-10'], 'numeric product ordering');
assert.equal(checks().length,2,'unpaid rows do not clutter the picking workspace');
await act(async()=>select('정렬 방식').props.onChange({target:{value:'remaining'}}));
assert.deepEqual(headings(),['MIU-10','MIU-2'],'remaining quantity sort');
await act(async()=>check('나').props.onClick());
await act(async()=>button('챙김 완료 탭').props.onClick());
assert.equal(checks().length,1,'completed-only filter');
assert.equal(check('나').props['aria-checked'],true);
await act(async()=>check('나').props.onClick());
await act(async()=>button('일반 챙김 탭').props.onClick());
await act(async()=>button('고객별').props.onClick());
await act(async()=>select('정렬 방식').props.onChange({target:{value:'oldest'}}));
assert.deepEqual(headings(),['나','가'],'oldest submitted customer first');
await act(async()=>select('정렬 방식').props.onChange({target:{value:'newest'}}));
assert.deepEqual(headings(),['가','나'],'newest submitted customer first');
await act(async()=>tree.update(React.createElement(Modal,{orders:controlFixture.map(o=>({...o,createdAt:o.id==='1'?'2026-10-02T09:00:00Z':o.createdAt})),filterLabel:'검수',onClose(){}})));
assert.deepEqual(headings(),['나','가'],'newest sorting follows timestamps rather than nickname');
await act(async()=>tree.update(React.createElement(Modal,{orders:controlFixture,filterLabel:'검수',onClose(){}})));
await act(async()=>button('상품별').props.onClick());
assert.equal(select('정렬 방식').props.value,'remaining','product sort survives view switch');
await act(async()=>button('고객별').props.onClick());
assert.equal(select('정렬 방식').props.value,'newest','customer sort survives view switch');
await act(async()=>select('정렬 방식').props.onChange({target:{value:'name'}}));
assert.deepEqual(headings(),['가','나'],'customer nickname sort');
assert.equal(checks().length,2);
assert.equal(check('가').props['aria-checked'],false);
await act(async()=>tree.unmount());
for (const id of [1,2,3]) rows.set(id,{id,picked_at:null});
const stableFixture = [order(1,'paid',[{...item(1,3),productName:'MIU-10'}]),order(2,'paid',[{...item(2,2),productName:'MIU-2'}]),order(3,'paid',[{...item(3,1),productName:'MIU-10'}])];
await act(async()=>{tree=Renderer.create(React.createElement(Modal,{orders:stableFixture,filterLabel:'검수',onClose(){}}));});
await act(async()=>select('정렬 방식').props.onChange({target:{value:'remaining'}}));
await act(async()=>check('고객1').props.onClick());
assert.deepEqual(headings(),['MIU-10','MIU-2'],'remaining sort keeps partially visible groups in place under incomplete filter');
await act(async()=>button('다시 정렬').props.onClick());
assert.deepEqual(headings(),['MIU-2','MIU-10'],'explicit refresh updates remaining ranks');
await act(async()=>tree.unmount());
assert.ok(writes.every(write => Object.keys(write.payload).join() === 'picked_at'), 'no payment/order/collected writes');
await act(async()=>{tree=Renderer.create(React.createElement(Modal,{orders:controlFixture,filterLabel:'검수',onClose(){}}));});
await act(async()=>tree.root.findByType('input').props.onChange({target:{value:'miu2'}}));
exportSnapshot=controlFixture.map(order=>({...order,items:order.items.map(item=>({...item,pickedAt:rows.get(Number(item.id))?.picked_at}))}));
await act(async()=>button('물건챙기기 엑셀').props.onClick());
assert.deepEqual(exportsMade.at(-1).orders.flatMap(order=>order.items.map(item=>item.id)),['2'],'one workbook contains every paid, unpicked row in the applied scope regardless of the active tab');
assert.deepEqual(writes.at(-1).ids,[2],'print record covers exactly exported items');
assert.ok(exportsMade.at(-1).meta.filterLabel.includes('미챙김 전체'),'combined workbook scope is labeled');
const previousExports=exportsMade.length,previousWrites=writes.length;
failExceptions=true;
await act(async()=>button('물건챙기기 엑셀').props.onClick());
assert.equal(exportsMade.length,previousExports,'no download on incomplete issue lookup');
assert.equal(writes.length,previousWrites,'failed lookup cannot mark items printed');
failExceptions=false;
const pendingSnapshot=exportSnapshot;
exportSnapshot=pendingSnapshot.map(order=>({...order,paymentStatus:'canceled'}));
await act(async()=>button('물건챙기기 엑셀').props.onClick());
assert.equal(exportsMade.length,previousExports,'cancelled after opening the modal cannot enter picking export');
exportSnapshot=pendingSnapshot.map(order=>({...order,items:order.items.map(item=>({...item,pickedAt:'2026-10-05'}))}));
await act(async()=>button('물건챙기기 엑셀').props.onClick());
assert.equal(exportsMade.length,previousExports,'picked elsewhere after opening is excluded from the fresh export');
exportExceptions=[{date:'2026.10.05',customer:'검수',product:'취소상품',action:'환불',status:'미처리',memo:'출고 제외'}];
await act(async()=>button('물건챙기기 엑셀').props.onClick());
assert.equal(exportsMade.at(-1).orders.length,0,'issue-only export works when every item was picked');
assert.equal(exportsMade.at(-1).meta.exceptions.length,1);
assert.equal(writes.length,previousWrites,'issue-only export makes no picking/payment/issue writes');
exportExceptions=[];exportSnapshot=pendingSnapshot;
await act(async()=>tree.unmount());
// A background confirmation read must not replace already-known counters with dashes.
for (const id of [1,2,3]) rows.set(id,{id,picked_at:null});
await act(async()=>{tree=Renderer.create(React.createElement(Modal,{orders,filterLabel:'검수',onClose(){}}));});
readGate = new Promise(resolve=>{releaseRead=resolve;});
await act(async()=>{await check('고객1').props.onClick();});
await act(async()=>tree.update(React.createElement(Modal,{orders:orders.map(o=>({...o})),filterLabel:'검수',onClose(){}})));
assert(!text().includes('—'),'confirmed counters remain visible during post-save read');
await act(async()=>{releaseRead();});
readGate=null;
// Bulk completion is restricted to the displayed work scope, and remains server-confirmed.
await act(async()=>tree.root.findByType('input').props.onChange({target:{value:'고객2'}}));
assert(button('현재 목록 모두 챙김 완료'),'bulk completion control exists');
gate=new Promise(resolve=>{releaseSave=resolve;});
let bulk;
await act(async()=>{bulk=button('현재 목록 모두 챙김 완료').props.onClick();});
assert.equal(check('고객2').props['aria-checked'],false,'bulk waits for server confirmation');
await act(async()=>{releaseSave();await bulk;}); gate=null;
assert.deepEqual(writes.at(-1).ids,[2],'bulk touches only matching unpaid-in-work paid rows');
await act(async()=>button('챙김 완료 탭').props.onClick());
assert.equal(check('고객2').props['aria-checked'],true);
assert.equal(rows.get(3).picked_at,null,'unpaid row never modified');
await act(async()=>tree.unmount());

// Multi-broadcast and exception workflow: quick ranges, date filter, attention-only tab,
// before→current detail, and no unsafe bulk completion for attention rows.
// The fixture's "today" is October 4 KST; do not let the machine's date
// silently turn its "yesterday" broadcast into an older broadcast.
const SystemDate = globalThis.Date;
const fixtureNow = SystemDate.parse('2026-10-04T09:00:00+09:00');
globalThis.Date = class extends SystemDate {
  constructor(...args) { super(...(args.length ? args : [fixtureNow])); }
  static now() { return fixtureNow; }
};
for (const id of [8,9,10,11]) rows.set(id,{id,picked_at:null});
const selectedBroadcastFixture = [
  order(11,'card_paid',[item(11,2,'XL')],{broadcastId:'b-today',createdAt:'2026-10-03T03:00:00Z',paidAtFull:null}),
];
const attentionFixture = [
  order(8,'paid',[{...item(8,1,'L'),repickRequiredAt:'2026-10-04T01:00:00Z',repickBefore:{product_name:'재킷',color:'검정',size:'M',qty:1}}],{broadcastId:'b-today',createdAt:'2026-10-03T01:00:00Z',paidAtFull:'2026-10-03T02:00:00Z'}),
  order(9,'paid',[item(9,1,'S')],{broadcastId:'b-yesterday',createdAt:'2026-10-01T01:00:00Z',paidAtFull:'2026-10-03T02:00:00Z'}),
  order(10,'card_paid',[item(10,1,'M')],{broadcastId:'b-yesterday',createdAt:'2026-10-01T01:00:00Z',paidAtFull:null}),
];
const calendar=[{id:'b-today',dateKey:'2026-10-04',label:'오늘 방송'},{id:'b-yesterday',dateKey:'2026-10-03',label:'어제 방송'}];
const scopeRequests=[];
let failScope=false;
const originalFetch=globalThis.fetch;
globalThis.fetch=async (_url,options)=>{
  scopeRequests.push(JSON.parse(options.body));
  return failScope ? {ok:false,json:async()=>({ok:false,message:'조회 실패'})} : {ok:true,json:async()=>({ok:true,orders:selectedBroadcastFixture,additionalOrders:attentionFixture,exceptions:[]})};
};
await act(async()=>{tree=Renderer.create(React.createElement(Modal,{orders:selectedBroadcastFixture,broadcastCalendar:calendar,filterLabel:'검수',onClose(){}}));});
assert(button('오늘+어제 방송'),'today+yesterday scope shortcut exists');
assert(button('현재 목록으로'),'scope can return to the incoming list');
assert.deepEqual(scopeRequests.at(0).broadcastIds,['b-today'],'opening the modal loads only the incoming selected broadcast IDs');
assert(button('선택 방송 작업'),'selected-broadcast work has its own top-level scope');
assert(button('오늘 추가 작업'),'global safety work has a separate top-level scope');
assert.equal(checks().length,1,'the selected-broadcast view never mixes global safety rows');
assert(check('고객11'),'an active broadcast card payment without a timestamp remains normal selected-broadcast work');
await act(async()=>button('오늘+어제 방송').props.onClick());
assert.deepEqual(scopeRequests.at(-1).broadcastIds,['b-today','b-yesterday'],'today+yesterday sends both real broadcast IDs');
failScope=true;
await act(async()=>button('오늘 방송').props.onClick());
assert.equal(checks().length,1,'failed scope refresh keeps the previously confirmed selected-broadcast rows');
assert(text().includes('범위를 바꾸지 않았습니다'),'failed scope refresh explains that the old scope is retained');
assert.equal(button('물건챙기기 엑셀').props.disabled,true,'failed scope cannot silently export an old selection');
failScope=false;
await act(async()=>button('오늘+어제 방송').props.onClick());
exportSnapshot=selectedBroadcastFixture;exportAdditional=attentionFixture;
globalThis.fetch=originalFetch;
await act(async()=>button('오늘 추가 작업').props.onClick());
assert(button('결제 후 추가 챙기기 탭'),'late-payment tab uses task-oriented language');
await act(async()=>button('결제 후 추가 챙기기 탭').props.onClick());
assert.equal(checks().length,2,'late-paid and card-paid-without-time items appear together');
assert(text().includes('카드결제 완료 · 추가로 챙겨야 합니다'),'legacy card-paid rows remain actionable without asking staff to verify a database timestamp');
assert(!text().includes('결제시각 누락') && !text().includes('결제시각 확인'),'technical payment-time warnings are removed from the work screen');
assert(!button('현재 목록 모두 챙김 완료'),'safety tabs never offer unsafe bulk completion');
await act(async()=>button('물건챙기기 엑셀').props.onClick());
assert.deepEqual(exportsMade.at(-1).orders.flatMap(order=>order.items.map(item=>item.id)).sort(),['10','11','8','9'],'one workbook combines selected-broadcast work and additional work without using the active tab as a filter');
assert.deepEqual(exportsMade.at(-1).meta.attentionItemIds.sort(),['10','8','9'],'only additional-work rows are labeled as exceptions in Excel');
await act(async()=>button('상품 변경 · 다시 챙기기 탭').props.onClick());
assert.equal(checks().length,1,'post-pick changes have their own work tab');
assert(text().includes('상품 변경 · 다시 챙기기') && text().includes('검정 / M') && text().includes('→'),'repick uses plain language and shows before to current details');
await act(async()=>check('고객8').props.onClick());
assert.equal(checks().length,1,'individually confirmed repick stays visible and marked complete');
assert.equal(check('고객8').props['aria-checked'],true,'repick row itself shows that it was handled');
await act(async()=>tree.unmount());

const modalSource=fs.readFileSync(path.join(root,'components/admin-live/LiveOrderPickingModal.tsx'),'utf8');
globalThis.Date = SystemDate;
assert(modalSource.includes('/api/admin-live/picking-workspace'),'scope refresh uses the complete server loader');
assert(modalSource.includes('setScopeError') && modalSource.includes('setWorkspaceOrders'),'scope failures are surfaced while successful results replace the list');
assert(!modalSource.includes('조회 목록 챙김 해제') && !modalSource.includes('>더보기<'),'dangerous bulk undo and redundant overflow menu are removed');
console.log('picking UI integration passed including simple work tabs, instant broadcast scope, safety exceptions, and safe bulk completion');
