import assert from 'node:assert/strict';
import {SETTINGS_NAV_GROUPS,searchSettingsNavigation} from '../components/admin-live/adminLiveSettingsNavigation.ts';
const items=SETTINGS_NAV_GROUPS.flatMap(g=>g.items);
// [2026-10-21 a1-1] 4그룹(돈·결제 / 손님 화면 / 방송·알림 / 상점·보안), 트렌드 추천·시스템 점검 삭제
// [2026-11-26] 6묶음
assert.deepEqual(SETTINGS_NAV_GROUPS.map(g=>g.label),['입금·결제','배송','혜택','손님 안내','알림','상점·보안']);
assert.equal(items.length,new Set(items.map(i=>i.label)).size,'labels unique');
assert.deepEqual(searchSettingsNavigation('구독').map(i=>i.destination),[{tab:'payment',section:'subscribe'}]);
assert.ok(SETTINGS_NAV_GROUPS.every(g=>g.collapsedByDefault===false));
assert.deepEqual([...new Set(items.filter(i=>'tab' in i.destination).map(i=>i.destination.tab))].sort(), ['combine','kakao','notes','notice','notices','order','payment','photo','point','roles','screen','security','shop','sound','telegram','youtube']);
assert.deepEqual(searchSettingsNavigation('계좌').map(i=>i.destination),[{tab:'shop',section:'bank'}]);
assert.deepEqual(searchSettingsNavigation('카드결제').map(i=>i.destination),[{tab:'shop',section:'payster'}]);
assert.equal(searchSettingsNavigation('트렌드').length,0);
// [2026-10-21 a1-2] 공지·구매동의는 고객 메뉴 점프가 아니라 설정 안 탭
assert.deepEqual(searchSettingsNavigation('구매동의').map(i=>[i.label,i.destination]),[['공지·구매동의',{tab:'notice'}]]);
assert.ok(!items.some(i=>'menu' in i.destination));
assert.ok(!items.some(i=>i.destination.menu==='audit'));
console.log('PASS settings search destinations and preserved coverage');
import {activeSettingsGroupId} from '../components/admin-live/adminLiveSettingsNavigation.ts';
// [2026-11-26] 왼쪽은 묶음 6개, 어느 화면이든 정확히 한 묶음에 속함
assert.equal(activeSettingsGroupId('shop','bank'),'money');
assert.equal(activeSettingsGroupId('shop','payster'),'money');
assert.equal(activeSettingsGroupId('shop','inquiry'),'shop');
assert.equal(activeSettingsGroupId('payment','subscribe'),'benefit');
assert.equal(activeSettingsGroupId('payment',undefined),'ship');
assert.equal(activeSettingsGroupId('notes',undefined),'customer');
console.log('PASS settings groups');
