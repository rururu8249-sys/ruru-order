// [2026-10-22 → 10-23 «출고 넘기기»] 시뮬레이션 — 넣기 → 오늘 주문서 가상 묶음 → 송장·챙기기 엑셀 표기 → 빼기 원복.
//   돈·입금·정산 숫자 불변(가상 묶음은 숫자 띠에 안 들어감) · 원래 주문은 그대로(줄에 「가져감」 배지만).
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {createUiLoader} from './admin-ui-test-loader.mjs';

const lib = createUiLoader()('lib/orderPickPull.ts');
const { parsePickPullRequest, pickPullBadgeText, pickPullAwayText, restoreFromPrev, isPickPullKind, shortDateWithWeekday, pulledForOf, pickPullMatchesView, pullTargetLabelForBroadcast, pullTargetLabelForDate } = lib;

// ── 1. 순수 함수 ──
assert.equal(shortDateWithWeekday('2026-10-18'), '10.18(일)');
assert.equal(shortDateWithWeekday('2026-10-17T15:30:00+09:00'), '10.17(토)');
assert.equal(pickPullBadgeText('2026-10-17T15:30:00+09:00', '고객이슈 교환'), '지난 주문 10.17(토) · 고객이슈 교환');
assert.equal(pickPullBadgeText(null, ''), '지난 주문');
assert.equal(pickPullAwayText('2026-10-22'), '10.22(목) 출고로 넘김');
assert.equal(pickPullAwayText('2026-10-22', '10.22(목) 남녀공용의류'), '10.22(목) 남녀공용의류 출고로 넘김');
assert.equal(pullTargetLabelForBroadcast('남녀공용의류', '2026-10-22T11:00:00Z'), '10.22(목) 남녀공용의류');
assert.equal(pullTargetLabelForDate('2026-10-23'), '10.23(금) 쇼핑몰 주문');
// 보이는 곳: 방송으로 넘긴 건 그 방송에서만 / 날짜로 넘긴 건 그 날짜 쇼핑몰에서만 / 옛 기록은 날짜로(그날 시작 방송 포함)
const bcView = { kind: 'broadcast', broadcastId: 'B22', startedDay: '2026-10-22' };
assert.ok(pickPullMatchesView({ pulledFor: '2026-10-22', broadcastId: 'B22', target: 'x' }, bcView));
assert.ok(!pickPullMatchesView({ pulledFor: '2026-10-22', broadcastId: 'B21', target: 'x' }, bcView));
assert.ok(!pickPullMatchesView({ pulledFor: '2026-10-22', broadcastId: 'B22', target: 'x' }, { kind: 'date', day: '2026-10-22' }), '방송으로 넘긴 건 쇼핑몰 날짜 화면엔 안 붙음');
assert.ok(pickPullMatchesView({ pulledFor: '2026-10-23', broadcastId: '', target: '10.23(금) 쇼핑몰 주문' }, { kind: 'date', day: '2026-10-23' }));
assert.ok(!pickPullMatchesView({ pulledFor: '2026-10-22', broadcastId: '', target: '10.22(목) 쇼핑몰 주문' }, bcView), '쇼핑몰 날짜로 넘긴 건 방송엔 안 붙음');
assert.ok(pickPullMatchesView({ pulledFor: '2026-10-22' }, bcView) && !pickPullMatchesView({ pulledFor: '2026-10-23' }, bcView), '옛 기록=날짜');
assert.ok(!pickPullMatchesView({ pulledFor: '2026-10-22', broadcastId: 'B22' }, { kind: 'none' }));
assert.equal(pulledForOf({ pick_pulled_for: '2026-10-22' }), '2026-10-22');
assert.equal(pulledForOf({ pick_pulled_at: '2026-10-22T23:50:00+09:00' }), '2026-10-22'); // KST 날짜
assert.equal(pulledForOf({}), '');
assert.ok(isPickPullKind('넘겨받은 주문 10.17(토) · 늦게 입고') && isPickPullKind('10.22(목) 남녀공용의류 출고로 넘김') && isPickPullKind('지난 주문 10.17(토)') && !isPickPullKind('일반') && !isPickPullKind('결제 후 추가 챙기기'));
assert.deepEqual(parsePickPullRequest({ action: 'pull', rowIds: ['12', 12, 13, 'x', 0], reason: '  늦게   입고 ', target: { type: 'broadcast', broadcastId: 'B22' } }), { action: 'pull', rowIds: [12, 13], reason: '늦게 입고', target: { type: 'broadcast', broadcastId: 'B22' } });
assert.throws(() => parsePickPullRequest({ action: 'pull', rowIds: [1] }), /어느 출고/, '넘길 곳 없으면 거부');
assert.throws(() => parsePickPullRequest({ action: 'pull', rowIds: [1], target: { type: 'date', date: '10/23' } }), /올바르지/);
assert.equal(parsePickPullRequest({ action: 'unpull', rowIds: [5] }).reason, '직접 선택');
assert.throws(() => parsePickPullRequest({ action: 'pull', rowIds: [] }), /골라/);
assert.throws(() => parsePickPullRequest({ action: 'delete', rowIds: [1] }), /종류/);
assert.deepEqual(restoreFromPrev({ picked_at: '2026-10-17T10:00:00Z', invoice_printed_at: '' }), { picked_at: '2026-10-17T10:00:00Z', collected_at: null, invoice_printed_at: null });
assert.deepEqual(restoreFromPrev(null), { picked_at: null, collected_at: null, invoice_printed_at: null });

// ── 2. 가상 묶음 — 원래 주문 G1(3줄) 중 2번 줄만 10.22 로 가져옴 ──
const adapter = createUiLoader()('components/admin-live/liveOrderAdapter.ts');
const pull = createUiLoader()('components/admin-live/liveOrderPickPull.ts');
const row = (id, over = {}) => ({ id, order_lookup_code: 'G1', youtube_nickname: '행복나무', customer_name: '김행복', customer_phone: '01012345678', created_at: '2026-10-17T15:30:00+09:00', product_name: `상품${id}`, color: '블랙', size: 'M', qty: 1, product_price: 10000, adjusted_product_price: 10000, total_price: 30000, adjusted_total_price: 30000, final_amount: 30000, shipping_fee: 0, payment_method: '무통장입금', admin_order_status_v2: '입금확인', order_manage_status: '입금확인', deposit_confirmed_at: '2026-10-17T16:00:00+09:00', is_deleted: false, ...over });
const rows = [row(1), row(2, { pick_pulled_at: '2026-10-22T09:00:00+09:00', pick_pulled_for: '2026-10-22', pick_pulled_reason: '고객이슈 교환', picked_at: null, invoice_printed_at: null, admin_order_status_v2: '출고완료', order_manage_status: '출고완료', shipped_prev_status: '입금확인' }), row(3, { picked_at: '2026-10-17T18:00:00+09:00' })];
const groups = adapter.buildAdminLiveOrderGroups(rows);
const originals = groups.map(adapter.toAdminLiveOrder);
assert.equal(originals.length, 1);
const original = originals[0];
assert.equal(original.items.length, 3, '원래 주문은 3줄 그대로');
assert.equal(original.items[1].pickPulledFor, '2026-10-22');
assert.deepEqual(pull.pulledAwayDays(original), ['2026-10-22']);

const virtual = pull.buildPulledVirtualOrders(groups);
assert.equal(virtual.length, 1);
const v = virtual[0];
assert.equal(v.id, 'G1#pull:2026-10-22');
assert.equal(v.groupId, 'G1');
assert.equal(v.orderNo, 'G1');
assert.deepEqual(v.items.map((it) => it.id), ['2'], '가상 묶음엔 가져온 줄만');
assert.deepEqual(v.pickPull, { pulledFor: '2026-10-22', pulledAt: '2026-10-22T09:00:00+09:00', reason: '고객이슈 교환', broadcastId: '', target: '', originalOrderId: 'G1' });
assert.equal(v.shippingStatus, null, '원래 출고완료였어도 가져온 줄은 다시 나가는 줄(송장 새로 출력 대상)');
assert.equal(v.createdAt, original.createdAt, '주문일은 원래 날짜 그대로(복사·변경 없음)');
assert.equal(pull.originalOrderIdOf(v), 'G1');
assert.equal(pull.originalOrderIdOf(original), 'G1');
assert.deepEqual(pull.pulledAwayDays(v), [], '가상 묶음엔 「가져감」 배지 없음');
assert.equal(pull.pulledOrdersForDay(virtual, '2026-10-22').length, 1);
assert.equal(pull.pulledOrdersForDay(virtual, '2026-10-21').length, 0);
assert.equal(pull.pulledOrdersForDay(virtual, '').length, 0, '전체보기엔 안 붙음(원래 주문이 이미 보이므로 중복 금지)');
assert.equal(pull.buildPulledVirtualOrders(adapter.buildAdminLiveOrderGroups([row(1), row(3)])).length, 0, '가져온 줄 없으면 가상 묶음 없음');
// 방송으로 넘긴 줄 — 사장님 10/23 사례(10.11 주문 → 10.22 시작 방송, 넘긴 날은 10.23)
const bcRows = [row(1), row(2, { pick_pulled_at: '2026-10-23T13:30:00+09:00', pick_pulled_for: '2026-10-22', pick_pulled_broadcast_id: 'B22', pick_pulled_target: '10.22(목) 남녀공용의류', pick_pulled_reason: '늦게 입고' })];
const bcGroups = adapter.buildAdminLiveOrderGroups(bcRows);
const bcVirtual = pull.buildPulledVirtualOrders(bcGroups);
assert.equal(bcVirtual[0].id, 'G1#pull:bcB22');
assert.equal(pull.pulledOrdersForView(bcVirtual, { kind: 'broadcast', broadcastId: 'B22', startedDay: '2026-10-22' }).length, 1, '그 방송 주문서에 보임');
assert.equal(pull.pulledOrdersForView(bcVirtual, { kind: 'date', day: '2026-10-23' }).length, 0, '누른 날짜(쇼핑몰) 화면엔 안 보임');
assert.deepEqual(pull.pulledAwayTargets(adapter.toAdminLiveOrder(bcGroups[0])), ['10.22(목) 남녀공용의류']);

// [2026-10-25 완전 이동] 주문서 «전부»를 넘기면 옮긴 주문 — 원래 금액·상품 그대로, 원래 자리에선 빠짐
{
  const mv = { pick_pulled_at: '2026-10-25T22:30:00+09:00', pick_pulled_for: '2026-10-25', pick_pulled_broadcast_id: 'B25', pick_pulled_target: '10.25(일) 남녀공용의류', pick_pulled_reason: '직접 선택' };
  // 취소된 줄은 넘기지 않으므로 «살아 있는 줄 전부»로 판정
  const wRows = [row(1, mv), row(2, mv), row(3, { admin_order_status_v2: '주문취소', order_manage_status: '주문취소' })];
  const wGroups = adapter.buildAdminLiveOrderGroups(wRows);
  assert.equal(pull.isWholeMovedGroup(wGroups[0]), true, '살아 있는 줄 전부 같은 곳으로 → 옮긴 주문');
  assert.deepEqual([...pull.wholeMovedGroupIds(wGroups)], ['G1']);
  const wOrig = adapter.toAdminLiveOrder(wGroups[0]);
  const wVirtual = pull.buildPulledVirtualOrders(wGroups);
  assert.equal(wVirtual.length, 1);
  assert.equal(wVirtual[0].pickPull.whole, true);
  assert.equal(wVirtual[0].id, 'G1#pull:bcB25');
  assert.equal(wVirtual[0].totalAmount, wOrig.totalAmount, '옮긴 주문 금액 = 원래 주문 금액');
  assert.deepEqual(wVirtual[0].rowIds, wOrig.rowIds, '같은 주문 줄(입금·출고 기록이 같은 줄에)');
  assert.deepEqual(wVirtual[0].items.map((it) => it.id), wOrig.items.map((it) => it.id));
  assert.equal(pull.pulledOrdersForView(wVirtual, { kind: 'broadcast', broadcastId: 'B25', startedDay: '2026-10-25' }).length, 1, '옮긴 곳 화면에 보임');
  // 일부만 넘기면 지금처럼(옮긴 주문 아님)
  const partGroups = adapter.buildAdminLiveOrderGroups([row(1, mv), row(2)]);
  assert.equal(pull.isWholeMovedGroup(partGroups[0]), false, '일부만 넘기면 옮긴 주문 아님');
  assert.equal(pull.buildPulledVirtualOrders(partGroups)[0].pickPull.whole, undefined);
  // 다른 곳으로 나눠 넘기면 옮긴 주문 아님
  const splitGroups = adapter.buildAdminLiveOrderGroups([row(1, mv), row(2, { ...mv, pick_pulled_broadcast_id: 'B26', pick_pulled_for: '2026-10-26' })]);
  assert.equal(pull.isWholeMovedGroup(splitGroups[0]), false, '두 곳으로 나눠 넘기면 옮긴 주문 아님');
  // 받은 돈: 화면 목록(원래 자리 빠짐 + 옮긴 주문은 원래 주문으로 바꿔 셈) — 같은 화면이면 한 번만
  const moved = pull.wholeMovedGroupIds(wGroups);
  const sameView = [wOrig, ...wVirtual].filter((o) => o.pickPull || !moved.has(String(o.id)));
  const counted = sameView.map((o) => (o.pickPull?.whole ? wOrig : o)).filter((o) => !o.pickPull);
  assert.equal(counted.length, 1, '같은 방송으로 옮겨도 한 줄·한 번만 셈(맑은하늘 두 줄 사례)');
  assert.equal(counted[0].id, 'G1', '셀 때는 원래 주문(입금매칭·주문상세가 원래 주문으로)');
  assert.equal(lib.pickPullMovedFromText('10.22(목) 남녀공용의류', '늦게 입고'), '10.22(목) 남녀공용의류에서 옮김 · 늦게 입고');
  assert.equal(lib.pickPullMovedToText('2026-10-25', '10.25(일) 남녀공용의류'), '10.25(일) 남녀공용의류로 옮김');
  assert.equal(lib.pickPullMovedToText('', '10.26(월) 쇼핑몰 주문'), '10.26(월) 쇼핑몰 주문으로 옮김');
  // 송장: 옮긴 주문은 일반 주문처럼(상품명 앞 [지난 주문] 표시 없음) — 아래 엑셀 블록에서 확인
  globalThis.__wholeVirtual = wVirtual[0];
  console.log('PASS 완전 이동(주문서 전부 넘김) 판정·금액 동일·한 번만 셈·문구');
}

// 받은 돈 숫자: 가상 묶음을 뺀 목록 = 원래 그대로(LiveStatsCards 는 filteredOrdersNoPull 만 받음)
const today = [...originals, ...virtual];
const noPull = today.filter((o) => !o.pickPull);
assert.equal(noPull.reduce((s, o) => s + o.totalAmount, 0), original.totalAmount, '가상 묶음 제외 합계 = 원래 주문 합계(중복 없음)');

// ── 3. 엑셀 — 송장(로젠) 상품명 앞 [지난 주문 …] + 「(총 N개)」 없음 · 물건챙기기 본 시트 비고 「지난 주문 …」 ──
let blob;
globalThis.window = { URL: { createObjectURL(value) { blob = value; return 'blob:test'; }, revokeObjectURL() {} } };
globalThis.document = { createElement() { return { click() {}, remove() {} }; }, body: { appendChild() {} } };
const excel = createUiLoader({ exceljs: { default: ExcelJS }, '@/lib/adminToast': { showAdminToast() {} } })('components/admin-live/adminLiveOrderExcelExport.ts');
const loadWb = async () => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await blob.arrayBuffer()); return wb; };
await excel.exportLiveOrdersForRosen([{ ...v, address: '서울시', detailAddress: '1동', zipcode: '01234' }, { ...original, address: '서울시', detailAddress: '1동', zipcode: '01234' }], { filterLabel: '오늘' });
const rosen = (await loadWb()).getWorksheet('주소통합_제목필터');
assert.match(String(rosen.getCell('I2').value), /^\[지난 주문 10\.17\(토\) · 고객이슈 교환\] 상품2/, '송장 상품명 맨 앞 지난 주문 표식');
assert.doesNotMatch(String(rosen.getCell('I2').value), /총 \d+개/, '사장님 요청: (총 N개) 없음');
assert.doesNotMatch(String(rosen.getCell('I3').value), /총 \d+개|지난 주문/);
await excel.exportLiveOrdersForRosen([{ ...globalThis.__wholeVirtual, address: '서울시', detailAddress: '1동', zipcode: '01234' }], { filterLabel: '오늘' });
assert.doesNotMatch(String((await loadWb()).getWorksheet('주소통합_제목필터').getCell('I2').value), /지난 주문|옮김/, '옮긴 주문 송장은 일반 주문처럼(앞 표식 없음)');
await excel.exportLiveOrdersForPicking([v], { filterLabel: '오늘' });
const picking = (await loadWb()).getWorksheet('물건챙기기');
assert.equal(picking.rowCount, 2, '가져온 줄은 본 시트에(추가 작업 시트로 안 보냄)');
assert.equal(picking.getCell('C2').value, '상품2');
assert.equal(picking.getCell('H2').value, '지난 주문 10.17(토) · 고객이슈 교환');
// 원래 주문(가져간 날 아님) 쪽 엑셀은 그 줄 비고에 「10.22(목) 로 가져감」 — 단 오늘이 10.22 라면 「지난 주문」 로 읽히므로 오늘이 아닌 날짜로 검사
const pullRows = createUiLoader()('lib/orderPickingExportRows.ts');
const awayRows = pullRows.buildPickingExportRows([{ ...original, items: [{ ...original.items[1], pickPulledFor: '2020-01-02', pickPulledAt: '2020-01-02T00:00:00Z' }] }]);
assert.equal(awayRows.mainRows[0].kind, '01.02(목) 출고로 넘김');

// ── 4. 서버 라우트 시뮬 — pull: 기록 보관·비움 / 취소 줄 건너뜀 / 다시 pull 해도 prev 유지 / unpull 원복 ──
const db = new Map([
  [1, { id: 1, is_deleted: false, admin_order_status_v2: '입금확인', order_manage_status: '입금확인', picked_at: '2026-10-17T18:00:00Z', collected_at: null, invoice_printed_at: '2026-10-17T19:00:00Z', pick_pulled_at: null, pick_pulled_for: null, pick_pulled_reason: null, pick_pulled_prev: null, total_price: 30000 }],
  [2, { id: 2, is_deleted: false, admin_order_status_v2: '주문취소', order_manage_status: '주문취소', picked_at: null, collected_at: null, invoice_printed_at: null, pick_pulled_at: null, pick_pulled_for: null, pick_pulled_reason: null, pick_pulled_prev: null, total_price: 5000 }],
]);
const touched = new Set();
const fakeClient = { from(table) { if (table === 'broadcasts') return { select() { return { eq(_c, id) { return { maybeSingle: () => Promise.resolve({ data: id === 'B22' ? { id: 'B22', public_title: '남녀공용의류', started_at: '2026-10-22T11:00:00Z', created_at: null } : null, error: null }) }; } }; } }; assert.equal(table, 'orders'); return {
  select() { return { in(_col, ids) { return Promise.resolve({ data: ids.map((id) => db.get(id)).filter(Boolean).map((r) => ({ ...r })), error: null }); } }; },
  update(patch) { return { eq(_col, id) { for (const k of Object.keys(patch)) touched.add(k); Object.assign(db.get(id), patch); return Promise.resolve({ error: null }); } }; },
}; } };
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://x'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
const route = createUiLoader({ '@supabase/supabase-js': { createClient: () => fakeClient }, '@/lib/admin-auth': { verifyAdminSessionFromRequest: async () => true }, 'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } } })('app/api/admin-live/picking-pull/route.ts');
const call = async (body) => route.POST({ json: async () => body });
let res = await call({ action: 'pull', rowIds: [1, 2, 99], reason: '늦게 입고', target: { type: 'broadcast', broadcastId: 'B22' } });
assert.equal(res.status, 200);
assert.deepEqual(res.body.updated, [1]);
assert.deepEqual(res.body.skipped.map((s) => s.why).sort(), ['줄을 찾지 못함', '취소된 주문']);
const r1 = db.get(1);
assert.equal(r1.pick_pulled_reason, '늦게 입고');
assert.equal(r1.pick_pulled_for, '2026-10-22', '방송 시작 날짜(누른 날짜 아님)');
assert.equal(r1.pick_pulled_broadcast_id, 'B22'); assert.equal(r1.pick_pulled_target, '10.22(목) 남녀공용의류', '이름은 서버가 방송 표에서');
assert.equal(res.body.target, '10.22(목) 남녀공용의류');
assert.equal((await call({ action: 'pull', rowIds: [1], target: { type: 'broadcast', broadcastId: 'NONE' } })).status, 400, '없는 방송 거부');
assert.equal(r1.picked_at, null); assert.equal(r1.invoice_printed_at, null);
assert.deepEqual(r1.pick_pulled_prev, { picked_at: '2026-10-17T18:00:00Z', collected_at: null, invoice_printed_at: '2026-10-17T19:00:00Z' });
assert.equal(db.get(2).pick_pulled_at, null, '취소 줄 무변경');
// 다시 pull — 사유만 바뀌고 prev 는 처음 것 유지
res = await call({ action: 'pull', rowIds: [1], reason: '사이즈 교환', target: { type: 'date', date: '2026-10-23' } });
assert.equal(db.get(1).pick_pulled_broadcast_id, null); assert.equal(db.get(1).pick_pulled_for, '2026-10-23'); assert.equal(db.get(1).pick_pulled_target, '10.23(금) 쇼핑몰 주문');
assert.equal(db.get(1).pick_pulled_reason, '사이즈 교환');
assert.equal(db.get(1).pick_pulled_prev.picked_at, '2026-10-17T18:00:00Z');
// unpull — 원복
res = await call({ action: 'unpull', rowIds: [1, 2] });
assert.deepEqual(res.body.updated, [1]);
assert.equal(res.body.skipped[0].why, '넘긴 줄이 아님');
assert.equal(db.get(1).pick_pulled_at, null); assert.equal(db.get(1).pick_pulled_for, null); assert.equal(db.get(1).pick_pulled_prev, null);
assert.equal(db.get(1).picked_at, '2026-10-17T18:00:00Z'); assert.equal(db.get(1).invoice_printed_at, '2026-10-17T19:00:00Z');
assert.equal(db.get(1).total_price, 30000, '금액 무접촉');
// 건드린 칸 = 챙김·송장 기록 + pick_pulled_* 뿐 (돈·상태·입금 칸 0)
assert.deepEqual([...touched].sort(), ['collected_at', 'invoice_printed_at', 'pick_pulled_at', 'pick_pulled_broadcast_id', 'pick_pulled_for', 'pick_pulled_prev', 'pick_pulled_reason', 'pick_pulled_target', 'picked_at']);
res = await call({ action: 'pull', rowIds: [] });
assert.equal(res.status, 400);
const noAuth = createUiLoader({ '@supabase/supabase-js': { createClient: () => fakeClient }, '@/lib/admin-auth': { verifyAdminSessionFromRequest: async () => false }, 'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } } })('app/api/admin-live/picking-pull/route.ts');
assert.equal((await noAuth.POST({ json: async () => ({ action: 'pull', rowIds: [1] }) })).status, 401);

console.log('test-order-pick-pull: ok');
