// [2026-11-09] lib/liveEvents — 소식(Broadcast) 듣기 연결 검사: 주제·이벤트 이름·payload 모양({new, old})
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";

const load = createUiLoader({});
const { subscribeLiveEvents, parseLiveOrderEvent, LIVE_EVENTS_TOPIC } = load("lib/liveEvents.ts");

assert.equal(LIVE_EVENTS_TOPIC, "ruru-live");
assert.equal(parseLiveOrderEvent(null), null);
assert.equal(parseLiveOrderEvent({ type: "DELETE", new: {} }), null);
assert.deepEqual(parseLiveOrderEvent({ type: "INSERT", new: { id: 1 } }), { type: "INSERT", new: { id: 1 }, old: {} });

const handlers = {};
let topic = "", cfg = null, subscribed = false, removed = false;
const supabase = {
  channel(t, c) { topic = t; cfg = c; const ch = { on(kind, filter, fn) { assert.equal(kind, "broadcast"); handlers[filter.event] = fn; return ch; }, subscribe() { subscribed = true; return ch; } }; return ch; },
  removeChannel() { removed = true; return Promise.resolve(); },
};
const got = [];
const off = subscribeLiveEvents(supabase, { onOrder: (e) => got.push(e), onCatalog: (e) => got.push(e) });
assert.equal(topic, "ruru-live");
assert.equal(cfg.config.private, false);
assert.ok(subscribed);
handlers.order({ payload: { type: "UPDATE", new: { id: 7, admin_order_status_v2: "자동입금확인" }, old: { admin_order_status_v2: "주문확인전" } } });
handlers.order({ payload: { junk: true } });
handlers.catalog({ payload: { table: "products", type: "UPDATE" } });
assert.equal(got.length, 2);
assert.equal(got[0].new.id, 7);
assert.equal(got[0].old.admin_order_status_v2, "주문확인전");
assert.deepEqual(got[1], { table: "products", type: "UPDATE" });
off();
assert.ok(removed);
console.log("live-events-client: 통과");
