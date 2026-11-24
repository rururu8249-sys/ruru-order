// [2026-11-25] 방송 종료 카운트다운 — 시각 계산·방송 id 맞춤·남은 시간 글자
import assert from 'node:assert/strict';
import {createUiLoader} from './admin-ui-test-loader.mjs';
const m=createUiLoader({})('lib/liveEndPlan.ts');
const now=Date.parse('2026-11-24T13:00:00Z'); // 한국 22:00
assert.equal(m.nextKstTime('23:30',now),'2026-11-24T14:30:00.000Z','오늘 23:30');
assert.equal(m.nextKstTime('01:00',now),'2026-11-24T16:00:00.000Z','지난 시각 → 다음 날 01:00');
assert.equal(m.nextKstTime('22:00',now),'2026-11-25T13:00:00.000Z','지금 시각 그대로면 다음 날');
assert.equal(m.nextKstTime('25:00',now),null); assert.equal(m.nextKstTime('',now),null);
assert.equal(m.kstLabel('2026-11-24T14:30:00.000Z',now),'오늘 23:30');
assert.equal(m.kstLabel('2026-11-24T16:00:00.000Z',now),'내일 01:00');
const plan=m.parseLiveEndPlan(m.serializeLiveEndPlan({broadcastId:'b1',endAt:'2026-11-24T14:30:00.000Z'}));
assert.equal(m.liveEndAtFor(plan,'b1'),Date.parse('2026-11-24T14:30:00Z'));
assert.equal(m.liveEndAtFor(plan,'b2'),null,'다른 방송이면 안 보임');
assert.equal(m.parseLiveEndPlan(''),null); assert.equal(m.parseLiveEndPlan('{"broadcastId":"b1","endAt":"x"}'),null);
const end=Date.parse('2026-11-24T14:30:05Z');
assert.equal(m.remainText(end,now),'1시간 30분 5초');
assert.equal(m.remainText(Date.parse('2026-11-24T13:20:05Z'),now),'20분 5초');
assert.equal(m.remainText(Date.parse('2026-11-24T13:00:09Z'),now),'9초');
assert.equal(m.remainText(now,now),'','지나면 빈칸 → 안 보임');
console.log('test-live-end-plan: ok');
