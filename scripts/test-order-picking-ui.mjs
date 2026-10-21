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
let productRows = [];
const db = { from(table) {
  return {
    select() { return { async in(_, ids) {
      const data = table === 'products' ? productRows.filter(row => ids.map(String).includes(String(row.id))) : ids.map(id => rows.get(Number(id))).filter(Boolean).map(row => ({...row}));
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
    if (spec === './adminLiveOrderExcelExport') return {exportLiveOrdersForPicking: async (orders,meta,pickedIds) => {exportsMade.push({orders,meta,pickedIds});}};
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
// [㉗] 상품별 = 상품 머리(총 N개·챙김 n/N) → 옵션 머리(h4·N개·n/N) → 사진 없는 손님 줄
assert.ok(tree.root.findAllByType('h4').length >= 1, 'batch view groups customer rows under option headers');
assert.ok(text().includes('전체 '), 'product header shows remaining / total quantity');
assert.ok(!text().includes('사진 없음'), 'customer rows under an option carry no photo cell');
// Scope/help remains available without occupying permanent work-list space.
const scopeDetails = tree.root.findAllByType('details');
assert.equal(scopeDetails.length, 1, 'help has a collapsed disclosure');
assert.ok(!scopeDetails[0].props.open, 'help is collapsed initially');
const scopeLine=tree.root.findByProps({'aria-label':'작업 범위'});
assert(!scopeLine.findAllByType('details').length,'scope is always visible outside disclosure');
assert(scopeLine.children.join('').includes('취소·챙기기 제외 주문 제외'));
assert.ok(scopeDetails[0].findByType('summary').children.length > 0);
const listToolbar = tree.root.findByProps({'aria-label':'물건챙기기 목록 도구'});
// [2026-10-22 사장님] 가로 스크롤 금지 — 도구는 두 줄(작업 탭·보기 / 결제 상태·정렬·검색), 어디에도 overflow-x-auto 없음
assert.equal(listToolbar.findAll(node => /overflow-x-auto/.test(String(node.props?.className || ''))).length + (/overflow-x-auto/.test(listToolbar.props.className) ? 1 : 0), 0, 'toolbar never scrolls sideways');
assert.ok(listToolbar.findAllByType('button').some(node => node.children.join('') === '요약'), 'summary view lives beside product/customer views');
assert.ok(listToolbar.findAllByType('button').some(node => node.children.join('') === '상품별'), 'product view belongs in the compact list toolbar');
assert.ok(listToolbar.findAllByType('button').some(node => node.children.join('') === '고객별'), 'customer view belongs in the compact list toolbar');
assert.ok(listToolbar.findAllByProps({'aria-label':'정렬 방식'}).length === 1, 'sort belongs beside the view switch');
const compactSearch = listToolbar.findByProps({'aria-label':'상품번호 또는 고객 이름 검색'});
assert.match(compactSearch.props.className, /flex-1/, 'search takes the remaining width of the second toolbar row');
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
assert.ok(text().includes('[✓ 챙김 완료]'), 'undo guidance names the visible completed button');
assert.ok(!text().includes('`완료됨` 버튼'), 'undo guidance does not use the retired button label');
await act(async () => check('고객1').props.onClick());
assert.equal(check('고객1').props['aria-checked'], false, 'clicking the completed row again immediately undoes it');
await act(async () => check('고객1').props.onClick());
await act(async () => button('챙긴 상품 탭').props.onClick());
assert.equal(check("고객1").props['aria-checked'], true);
await act(async () => button('고객별').props.onClick());
assert.equal(check("고객1").props['aria-checked'], true, 'customer view sees product-view completion');
await act(async () => { await check("고객1").props.onClick(); });
await act(async () => button('챙길 상품 탭').props.onClick());
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
await act(async () => button('챙긴 상품 탭').props.onClick());
assert.equal(check("고객2").props['aria-checked'], true, 'reopen reloads persisted state');
await act(async () => button('챙길 상품 탭').props.onClick());
// [㉖] 다시 열어도 「일반 챙김」에 이전에 챙긴 줄이 ✓로 그대로 보인다(챙김 완료 탭으로만 숨지 않음).
assert.equal(checks().length, 2, 'reopened standard tab keeps previously picked rows visible');
assert.equal(check("고객2").props['aria-checked'], true, 'previously picked row is shown as completed, not hidden');
// 고객1(S/36)·고객2(사이즈 없음)는 서로 다른 옵션 — 고객2 옵션만 전부 챙김이라 배지는 정확히 1개.
assert.equal(check("고객1").props['aria-checked'], false);
assert.equal(text().split('개 완료').length - 1, 1, 'option badge shows only on the option whose every row is picked');
await act(async () => tree.root.findByType('input').props.onChange({target: {value: 'miu2'}}));
assert.equal(checks().length, 2, 'separator-free search works inside the active work tab');
await act(async () => tree.root.findByType('input').props.onChange({target: {value: '고객1'}}));
assert.equal(checks().length, 1, 'search narrows the standard tab to the matching customer');
await act(async () => tree.root.findByType('input').props.onChange({target: {value: 'miu2'}}));
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
await act(async () => button('챙긴 상품 탭').props.onClick());
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
await act(async()=>button('챙긴 상품 탭').props.onClick());
assert.equal(checks().length,1,'completed-only filter');
assert.equal(check('나').props['aria-checked'],true);
await act(async()=>check('나').props.onClick());
await act(async()=>button('챙길 상품 탭').props.onClick());
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
// [㉖] 챙김 여부와 관계없이 범위 안 결제완료 줄 전부 + 챙긴 줄은 pickedIds 로 넘겨 「챙김」 칸 ✓.
assert.deepEqual(exportsMade.at(-1).orders.flatMap(order=>order.items.map(item=>item.id)),['1','2'],'one workbook contains every paid row in the applied scope, picked or not, regardless of the active tab or search');
assert.deepEqual([...exportsMade.at(-1).pickedIds],['1'],'picked rows are passed so the 챙김 column shows ✓');
assert.deepEqual(writes.at(-1).ids,[1,2],'print record covers exactly exported items');
assert.ok(exportsMade.at(-1).meta.filterLabel.includes('결제완료 전체'),'combined workbook scope is labeled');
// [㉘] 결제 상태 칩 — 목록·엑셀만 바뀌고 미결제 줄은 조회만, 숫자·출력 기록은 결제완료 기준.
const payChip = label => tree.root.findByProps({'aria-label':'결제 상태 보기'}).findAllByType('button').find(node => node.children.join('') === label);
assert.equal(payChip('결제완료만').props['aria-pressed'], true, 'paid-only is the default view');
await act(async()=>tree.root.findByType('input').props.onChange({target:{value:''}}));
const counterText = () => nodeText(tree.root.findByProps({'aria-live':'polite', className: tree.root.findAll(n=>n.props['aria-live']==='polite')[0].props.className}));
const countersBefore = counterText();
await act(async()=>payChip('미결제만').props.onClick());
assert.equal(checks().length, 1, 'unpaid-only view lists only the unpaid row');
assert.equal(checks()[0].props.disabled, false, 'unpaid rows can be picked by admin judgment (2026-10-21)');
assert.ok(text().includes('미결제'), 'unpaid badge is kept');
// [2026-10-21] 미결제 줄 챙기기 → 실제 저장(picked_at)까지 간다
{ const before = writes.length; await act(async()=>checks()[0].props.onClick()); assert.ok(writes.length > before, 'unpaid pick is saved'); assert.deepEqual(writes.at(-1).ids, [3], 'unpaid row id saved'); await act(async()=>checks()[0].props.onClick()); }
assert.equal(counterText(), countersBefore, 'header counters stay paid-based');
await act(async()=>payChip('전체').props.onClick());
assert.equal(checks().length, 3, 'all view lists paid and unpaid rows');
assert.ok(tree.root.findAll(node => (node.type === 'span' || node.type === 'div') && (nodeText(node) === '미결제 7' || nodeText(node) === '미결제 7개')).length >= 1, 'unpaid quantity is shown separately on the group header');
assert.equal(counterText(), countersBefore, 'header counters stay paid-based in all view');
await act(async()=>button('물건챙기기 엑셀').props.onClick());
assert.deepEqual(exportsMade.at(-1).orders.flatMap(order=>order.items.map(item=>item.id)).sort(),['1','2','3'],'all view exports unpaid rows too');
assert.ok(exportsMade.at(-1).meta.filterLabel.includes('미결제 포함 전체'),'scope label names unpaid inclusion');
assert.deepEqual(writes.at(-1).ids,[1,2],'print record is written only for paid rows');
await act(async()=>payChip('미결제만').props.onClick());
await act(async()=>button('물건챙기기 엑셀').props.onClick());
assert.deepEqual(exportsMade.at(-1).orders.flatMap(order=>order.items.map(item=>item.id)),['3'],'unpaid-only export follows the chip');
assert.ok(exportsMade.at(-1).meta.filterLabel.includes('미결제만'));
await act(async()=>payChip('결제완료만').props.onClick());
await act(async()=>tree.root.findByType('input').props.onChange({target:{value:'miu2'}}));
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
assert.equal(exportsMade.length,previousExports+1,'picked elsewhere after opening is still exported');
assert.ok(['1','2'].every(id=>exportsMade.at(-1).pickedIds.has(id)),'fresh picked state marks every exported row ✓');
const writesBeforeIssueOnly=writes.length;
exportSnapshot=pendingSnapshot.map(order=>({...order,paymentStatus:'canceled'}));
exportExceptions=[{date:'2026.10.05',customer:'검수',product:'취소상품',action:'환불',status:'미처리',memo:'출고 제외'}];
await act(async()=>button('물건챙기기 엑셀').props.onClick());
assert.equal(exportsMade.at(-1).orders.length,0,'issue-only export works when no paid item remains');
assert.equal(exportsMade.at(-1).meta.exceptions.length,1);
assert.equal(writes.length,writesBeforeIssueOnly,'issue-only export makes no picking/payment/issue writes');
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
assert(button('남은 상품 모두 챙기기'),'bulk completion control exists');
gate=new Promise(resolve=>{releaseSave=resolve;});
let bulk;
await act(async()=>{bulk=button('남은 상품 모두 챙기기').props.onClick();});
assert.equal(check('고객2').props['aria-checked'],false,'bulk waits for server confirmation');
await act(async()=>{releaseSave();await bulk;}); gate=null;
assert.deepEqual(writes.at(-1).ids,[2],'bulk touches only matching unpaid-in-work paid rows');
await act(async()=>button('챙긴 상품 탭').props.onClick());
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
// [㉚] 범위 = 주문서 필터 그대로(orders). 창 안 방송 선택 없음, 서버는 열 때 「오늘 추가 작업」용으로만 한 번(broadcastIds 빈 배열).
await act(async()=>{tree=Renderer.create(React.createElement(Modal,{orders:selectedBroadcastFixture,filterLabel:'방송: 1004(토) 오늘 방송',onClose(){}}));});
assert(!button('오늘+어제 방송') && !button('현재 목록으로') && tree.root.findAll(node=>node.props['aria-label']==='작업할 방송').length===0,'broadcast range selector is removed');
assert.equal(scopeRequests.length,1,'the server is called once on open');
assert.deepEqual(scopeRequests.at(0),{broadcastIds:[]},'opening asks only for additional work, never re-scopes the order-sheet list');
assert.ok(nodeText(tree.root.findByProps({'aria-label':'작업 범위'})).includes('1004(토) 오늘 방송'),'work scope line shows the order-sheet filter name');
assert(button('선택 방송 작업'),'selected-broadcast work has its own top-level scope');
assert(button('오늘 추가 작업'),'global safety work has a separate top-level scope');
assert.equal(checks().length,1,'the selected-broadcast view never mixes global safety rows');
assert(check('고객11'),'an active broadcast card payment without a timestamp remains normal selected-broadcast work');
await act(async()=>tree.unmount());
failScope=true;
await act(async()=>{tree=Renderer.create(React.createElement(Modal,{orders:selectedBroadcastFixture,filterLabel:'검수',onClose(){}}));});
assert.equal(checks().length,1,'additional-work load failure never hides the order-sheet scope rows');
await act(async()=>button('오늘 추가 작업').props.onClick());
assert(text().includes('오늘 추가 작업을 불러오지 못했습니다'),'additional-work load failure is explained in that area');
await act(async()=>tree.unmount());
failScope=false;
await act(async()=>{tree=Renderer.create(React.createElement(Modal,{orders:selectedBroadcastFixture,filterLabel:'검수',onClose(){}}));});
exportSnapshot=selectedBroadcastFixture;exportAdditional=attentionFixture;
globalThis.fetch=originalFetch;
await act(async()=>button('오늘 추가 작업').props.onClick());
assert(button('결제 후 추가 챙기기 탭'),'late-payment tab uses task-oriented language');
await act(async()=>button('결제 후 추가 챙기기 탭').props.onClick());
assert.equal(checks().length,2,'late-paid and card-paid-without-time items appear together');
assert(text().includes('카드결제 완료 · 추가로 챙겨야 합니다'),'legacy card-paid rows remain actionable without asking staff to verify a database timestamp');
assert(!text().includes('결제시각 누락') && !text().includes('결제시각 확인'),'technical payment-time warnings are removed from the work screen');
assert(!button('남은 상품 모두 챙기기'),'safety tabs never offer unsafe bulk completion');
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

// [㉙-0] 자정 넘긴 방송 — 선택 방송 23시대 주문이 자정 이후(오늘) 입금돼도 선택 방송 일반 챙김에 남고(「늦은 입금」 배지),
//   「오늘 추가 작업」엔 선택 방송 밖 줄과 repick 만. 같은 줄이 두 곳에 동시에 나오지 않는다.
for (const id of [20,21,22]) rows.set(id,{id,picked_at:null});
const nightLate=order(20,'paid',[item(20,1,'L')],{broadcastId:'b-night',createdAt:'2026-10-03T14:30:00Z',paidAtFull:'2026-10-03T15:40:00Z'});
const nightRepick=order(21,'paid',[{...item(21,1,'M'),repickRequiredAt:'2026-10-04T00:10:00Z',repickBefore:{product_name:'셔츠',color:'흰',size:'S',qty:1}}],{broadcastId:'b-night',createdAt:'2026-10-03T13:00:00Z',paidAtFull:'2026-10-03T13:10:00Z'});
const otherLate=order(22,'paid',[item(22,1,'S')],{broadcastId:'b-other',createdAt:'2026-10-02T01:00:00Z',paidAtFull:'2026-10-03T16:00:00Z'});
globalThis.fetch=async()=>({ok:true,json:async()=>({ok:true,orders:[nightLate,nightRepick],additionalOrders:[nightLate,nightRepick,otherLate],exceptions:[]})});
await act(async()=>{tree=Renderer.create(React.createElement(Modal,{orders:[nightLate,nightRepick],broadcastCalendar:[{id:'b-night',dateKey:'2026-10-03',label:'밤 방송'}],filterLabel:'검수',onClose(){}}));});
assert.deepEqual(checks().map(node=>node.props['aria-label'].split(' ')[0]),['고객20'],'selected broadcast keeps its late-paid row; repick stays out');
assert.ok(text().includes('늦은 입금'),'late payment is marked with a small badge only');
await act(async()=>button('오늘 추가 작업').props.onClick());
await act(async()=>button('결제 후 추가 챙기기 탭').props.onClick());
assert.deepEqual(checks().map(node=>node.props['aria-label'].split(' ')[0]),['고객22'],'additional work shows only rows outside the selected broadcast');
await act(async()=>button('상품 변경 · 다시 챙기기 탭').props.onClick());
assert.deepEqual(checks().map(node=>node.props['aria-label'].split(' ')[0]),['고객21'],'repick keeps its existing additional-work tab');
assert.ok(text().includes('주문서 범위에 속하지 않는'),'additional-work guidance names the real rule');
globalThis.fetch=originalFetch;
exportSnapshot=[nightLate,nightRepick];exportAdditional=[nightLate,nightRepick,otherLate];
await act(async()=>button('물건챙기기 엑셀').props.onClick());
assert.deepEqual(exportsMade.at(-1).orders.flatMap(order=>order.items.map(item=>item.id)).sort(),['20','21','22'],'each row is exported exactly once');
assert.deepEqual(exportsMade.at(-1).meta.attentionItemIds.sort(),['21','22'],'selected-broadcast late payment goes to the main sheet, not the additional sheet');
await act(async()=>tree.unmount());

// [㉙-2] 누락 대조 줄 · 숨김 경고 · 수량 배지 · sticky 머리 · 단가 · 사진 확대
for (const id of [30,31,32]) rows.set(id,{id,picked_at:null});
productRows=[{id:'p1',image_url:'https://img.test/p1.jpg'}];
const priced=(id,qty,size,price)=>({...item(id,qty,size),productId:'p1',productName:'코트',unitPrice:price});
const layoutFixture=[order(30,'paid',[priced(30,2,'S',50000)],{broadcastId:'b-z'}),order(31,'unpaid',[priced(31,1,'M',60000)],{broadcastId:'b-z'}),order(32,'canceled',[priced(32,1,'L',50000)],{broadcastId:'b-z'})];
globalThis.fetch=async()=>({ok:true,json:async()=>({ok:true,orders:layoutFixture,additionalOrders:[],exceptions:[]})});
await act(async()=>{tree=Renderer.create(React.createElement(Modal,{orders:layoutFixture,broadcastCalendar:[{id:'b-z',dateKey:'2026-10-04',label:'코트 방송'}],filterLabel:'검수',onClose(){}}));});
const recon=tree.root.findByProps({'aria-label':'누락 대조'});
assert.ok(nodeText(recon).includes('주문서 기준 4개'),'order-sheet total = paid + unpaid + moved + cancelled/excluded');
const reconButtons=recon.findAllByType('button');
assert.deepEqual(reconButtons.map(node=>nodeText(node)),['2','1','0','1'],'each part of the equation is a clickable number');
// [㉚-1] 좁은 화면에서 잘리지 않게 — 줄 전체 nowrap/가로 스크롤 금지, 항목 단위(nowrap span)로만 줄바꿈.
assert.doesNotMatch(recon.props.className,/whitespace-nowrap|overflow-x-auto/,'reconciliation line may wrap on phones');
assert.ok(reconButtons.every(node=>node.parent.type==='span'&&/whitespace-nowrap/.test(node.parent.props.className)),'each label+number item stays together when wrapping');
await act(async()=>reconButtons[3].props.onClick());
assert.ok(nodeText(tree.root.findByProps({'aria-label':'취소·챙기기 제외 목록'})).includes('취소'),'cancelled/excluded number opens the dropped list');
const warning=()=>tree.root.findAll(node=>node.type==='div'&&node.props['aria-label']==='숨김 경고');
assert.equal(warning().length,1,'hidden-by-chip warning appears while unpaid rows are hidden');
assert.ok(nodeText(warning()[0]).includes('1개가 숨겨져'));
await act(async()=>warning()[0].findByType('button').props.onClick());
assert.equal(warning().length,0,'clear shows everything again');
assert.equal(checks().length,2,'paid and unpaid rows are listed after clearing');
const badge=tree.root.findByProps({'aria-label':'수량 2개'});
assert.match(badge.props.className,/danger/,'quantity of 2+ is a red badge at the front of the row');
const h3=tree.root.findByType('h3'); const h4s=tree.root.findAllByType('h4');
assert.match(h3.parent.parent.props.className,/sticky top-0/,'product head is sticky');
assert.ok(h4s.every(node=>/sticky top-\[72px\]/.test(node.parent.props.className)),'option heads stick under the product head');
assert.ok(nodeText(h3.parent).includes('50,000~60,000원'),'product head shows the unit price range');
assert.ok(h4s.some(node=>nodeText(node).includes('60,000원')),'option heads show their own price when prices differ');
assert.ok(tree.root.findAll(node=>node.type==='div'&&nodeText(node)==='남은 2 / 전체 2개').length>=1,'remaining / total wording');
assert.ok(tree.root.findAll(node=>node.type==='div'&&/mx-auto max-w-\[760px\]/.test(node.props.className||'')).length===1,'list is centered with a 760px max width');
const zoomButtons=tree.root.findAll(node=>node.type==='button'&&node.props['aria-label']==='사진 크게 보기');
assert.ok(zoomButtons.length>=1,'thumbnails are zoom buttons');
await act(async()=>zoomButtons[0].props.onClick());
assert.equal(tree.root.findAll(node=>node.type==='img'&&node.props.alt==='상품 사진').length,1,'zoom overlay opens');
await act(async()=>button('사진 닫기').props.onClick());
assert.equal(tree.root.findAll(node=>node.type==='img'&&node.props.alt==='상품 사진').length,0,'zoom overlay closes');
// [㉙-3] 폰(640px 미만) 전용 구조 — 방송 범위 한 줄 버튼으로 접기/펼치기, 옵션 머리 sticky 해제, 짧은 푸터 글자.
const phoneScopeLine=tree.root.findByProps({'aria-label':'작업 범위'});
assert.doesNotMatch(phoneScopeLine.props.className,/max-sm:hidden/,'[㉚] work scope line is visible on phones too (range button removed)');
assert.match(tree.root.findByProps({role:'dialog'}).props.className,/w-\[min\(820px,96vw\)\] max-sm:w-\[98vw\]/,'[㉚] window is 820px wide on PC, phone width unchanged');
assert.ok(tree.root.findAllByType('h4').every(node=>/max-sm:static/.test(node.parent.props.className)),'option heads are not sticky on phones');
assert.match(tree.root.findByType('h3').parent.parent.props.className,/sticky top-0/,'product head stays sticky on phones');
assert.ok(button('물건챙기기 엑셀') && button('남은 상품 모두 챙기기'),'short phone labels keep full accessible names');
productRows=[];
globalThis.fetch=originalFetch;
await act(async()=>tree.unmount());

const modalSource=fs.readFileSync(path.join(root,'components/admin-live/LiveOrderPickingModal.tsx'),'utf8');
globalThis.Date = SystemDate;
// Opening from all orders must preserve the current list, not submit an
// automatically inferred 54-broadcast request that the API rejects (>31).
const broadOrders=Array.from({length:54},(_,i)=>{
  const id=100+i;
  rows.set(id,{id,picked_at:null});
  return order(id,'paid',[item(id,1)],{broadcastId:`broad-${i}`});
});
const broadRequests=[];
globalThis.fetch=async(_url,options)=>{broadRequests.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true,orders:[],additionalOrders:[],exceptions:[]})};};
await act(async()=>{tree=Renderer.create(React.createElement(Modal,{orders:broadOrders,filterLabel:'전체 주문',onClose(){}}));});
assert.deepEqual(broadRequests,[{broadcastIds:[]}],'opening 54 broadcasts never sends broadcast IDs (no 31-broadcast limit to hit)');
assert.equal(checks().length,54,'never silently truncate the order-sheet scope');
assert.equal(button('물건챙기기 엑셀').props.disabled,false);
await act(async()=>tree.unmount());
// [㉚] 주문서 필터가 너무 넓으면(전체 방송·전체 기간) 목록 대신 안내만 — 창은 열린다.
await act(async()=>{tree=Renderer.create(React.createElement(Modal,{orders:[],scopeTooWide:true,filterLabel:'방송: 전체보기',onClose(){}}));});
assert(text().includes('주문서에서 방송이나 날짜를 먼저 골라 주세요'),'too-wide scope shows guidance instead of a list');
assert.equal(tree.root.findAll(node=>node.props['aria-label']==='누락 대조').length,0,'no reconciliation line for a too-wide scope');
await act(async()=>tree.unmount());
globalThis.fetch=originalFetch;
assert(modalSource.includes('/api/admin-live/picking-workspace'),'scope refresh uses the complete server loader');
assert(modalSource.includes('setAdditionalError') && !modalSource.includes('PickingBroadcastSelector'),'[㉚] no in-window broadcast selector; additional-work failures are surfaced');
assert(!modalSource.includes('조회 목록 챙김 해제') && !modalSource.includes('>더보기<'),'dangerous bulk undo and redundant overflow menu are removed');
console.log('picking UI integration passed including simple work tabs, instant broadcast scope, safety exceptions, and safe bulk completion');
