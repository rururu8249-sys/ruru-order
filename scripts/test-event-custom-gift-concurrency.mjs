import assert from 'node:assert/strict';
import {reset,seed,sql,register,W,E} from './event-custom-gift-db-fixture.mjs';
reset();await seed();
const rows=await Promise.all(Array.from({length:20},()=>register()));
assert.ok(rows.every(r=>r.ok&&r.orderId===rows[0].orderId));
assert.equal(await sql('select count(*) from orders where event_gift_winner_id is not null'),'1');
assert.equal(await sql('select count(*) from event_custom_gift_receipts'),'1');
// Simulated lost HTTP response: committed RPC response discarded, same winner retries.
assert.equal((await register()).orderId,rows[0].orderId);
await sql(`delete from event_roulette_winners where id='${W}';update event_roulette_events set status='idle';`);
const finalize=()=>sql(`set role service_role;select admin_finalize_custom_gift_event('${E}','[{"nickname":"A","orderIds":["1"]}]',now(),5000)`);
const results=await Promise.all([finalize(),finalize()]);
assert.equal(JSON.parse(results[0]).winnerId,JSON.parse(results[1]).winnerId);
assert.equal(await sql(`select count(*) from event_roulette_winners where event_id='${E}'`),'1');
await sql(`update event_roulette_events set status='idle';delete from event_roulette_winners;`);
await assert.rejects(()=>sql(`select admin_finalize_custom_gift_event('${E}','[{"nickname":"A","orderIds":["2"]}]',now(),5000)`));
assert.equal(await sql('select count(*) from event_roulette_winners'),'0');
assert.equal(await sql('select status from event_roulette_events'),'idle');
console.log('PASS real multi-connection PostgreSQL: 20 simultaneous registrations exactly once, lost-response retry, 2 simultaneous finalizations same winner, forged snapshot rollback');
