// 테스트 주문서를 지워도 «주문 감사» 알림이 떴던 주문은 예정된 결제 알림이 원래 시각에 나가는지 (가짜 DB)
import {keepPaymentNoticesForDeleted, drainOrphanPayments, ORPHAN_PAYMENT_KEY, bankClosedAt} from '../lib/autoTestOrphanPayment';

type R = Record<string, any>;
function fakeDb(tables: Record<string, R[]>) {
  const q = (t: string) => {
    const f: ((r: R) => boolean)[] = [];
    let mode: 'select' | 'update' | 'insert' = 'select', patch: R = {}, lim = 1e9;
    const api: any = {
      select() { return api; },
      eq(k: string, v: any) { f.push((r) => r[k] === v); return api; },
      in(k: string, vs: any[]) { f.push((r) => vs.includes(r[k])); return api; },
      is(k: string, v: any) { f.push((r) => (r[k] ?? null) === v); return api; },
      limit(n: number) { lim = n; return api; },
      update(p: R) { mode = 'update'; patch = p; return api; },
      insert(row: R) { (tables[t] ??= []).push({ id: (tables[t]?.length ?? 0) + 1000, ...row }); return Promise.resolve({ error: null }); },
      maybeSingle() { const d = run(); return Promise.resolve({ data: d[0] ?? null, error: null }); },
      then(res: any, rej: any) { return Promise.resolve({ data: run(), error: null }).then(res, rej); },
    };
    const run = () => {
      const rows = (tables[t] ?? []).filter((r) => f.every((g) => g(r)));
      if (mode === 'update') { rows.forEach((r) => Object.assign(r, patch)); return rows; }
      return rows.slice(0, lim);
    };
    return api;
  };
  return { from: q };
}

const now = Date.parse('2026-11-15T01:00:00Z'); // 한국 10:00 — 은행 열림
if (bankClosedAt(now) || !bankClosedAt(Date.parse('2026-11-15T15:00:00Z'))) throw new Error('은행 점검 판정');
const db = fakeDb({
  settings: [],
  broadcasts: [{ id: 'bc1', status: 'ON', is_deleted: false }],
  live_chat_messages: [{ id: 1, broadcast_id: 'bc1', bot_ref: 'o:G1', hidden_at: null }, { id: 2, broadcast_id: 'bc1', bot_ref: 'o:G3', hidden_at: null }],
  live_automation_payment_events: [
    { order_action_id: 'A1', nickname: '숙이언니', kind: 'card', status: 'cancelled', due_at: new Date(now - 60000).toISOString(), created_at: new Date(now - 300000).toISOString() }, // 지남 → 바로
    { order_action_id: 'A2', nickname: '올리비아', kind: 'bank', status: 'pending', due_at: new Date(now - 60000).toISOString(), created_at: new Date(now - 300000).toISOString() }, // 주문 감사 알림 없음 → 안 보냄
    { order_action_id: 'A3', nickname: '별빛', kind: 'bank', status: 'pending', due_at: new Date(now + 120000).toISOString(), created_at: new Date(now - 60000).toISOString() }, // 2분 뒤
    { order_action_id: 'A4', nickname: '꾸리', kind: 'card', status: 'sent', due_at: new Date(now).toISOString(), created_at: new Date(now).toISOString() }, // 이미 보냄
  ],
});
const rows = [
  { id: 1, order_group_id: 'G1', broadcast_id: 'bc1', automation_action_id: 'A1' },
  { id: 2, order_group_id: 'G2', broadcast_id: 'bc1', automation_action_id: 'A2' },
  { id: 3, order_group_id: 'G3', broadcast_id: 'bc1', automation_action_id: 'A3' },
  { id: 4, order_group_id: 'G1', broadcast_id: 'bc1', automation_action_id: 'A4' },
];
const n = await keepPaymentNoticesForDeleted(db, rows, now);
const chat = (await db.from('live_chat_messages').select().eq('broadcast_id', 'bc1')) as any;
const bodies = chat.data.filter((m: R) => m.body).map((m: R) => m.body);
if (n !== 2) throw new Error('대기열에 2개여야 함: ' + n);
if (bodies.length !== 1 || bodies[0] !== '💗 숙이언니님 카드결제완료 감사합니다') throw new Error('바로 보낸 글: ' + JSON.stringify(bodies));
// 1분 뒤엔 아직, 2분 뒤엔 별빛 입금 알림
await drainOrphanPayments(db, now + 60000);
let c2 = ((await db.from('live_chat_messages').select().eq('broadcast_id', 'bc1')) as any).data.filter((m: R) => m.body);
if (c2.length !== 1) throw new Error('1분 뒤엔 아직: ' + c2.length);
await drainOrphanPayments(db, now + 130000);
await drainOrphanPayments(db, now + 190000); // 두 번 돌려도 한 번만
c2 = ((await db.from('live_chat_messages').select().eq('broadcast_id', 'bc1')) as any).data.filter((m: R) => m.body);
if (c2.length !== 2 || c2[1].body !== '💗 별빛님 입금완료 감사합니다' || c2[1].bot_ref !== 'ap:A3' || c2[1].kakao_id !== 'bot:ruru') throw new Error('2분 뒤: ' + JSON.stringify(c2));
const q = ((await db.from('settings').select().eq('key', ORPHAN_PAYMENT_KEY).maybeSingle()) as any).data;
if (JSON.parse(q.value).length !== 0) throw new Error('대기열 비어야 함');
console.log('PASS 지운 테스트 주문 결제 알림: 주문 감사 떴던 것만·지난 건 바로·예정은 시각 맞춰·한 번만');
