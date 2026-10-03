import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";
import { createUiLoader } from "./admin-ui-test-loader.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture";

const winnerId = "33333333-3333-4333-8333-333333333333";
const eventId = "22222222-2222-4222-8222-222222222222";
const broadcastId = "11111111-1111-4111-8111-111111111111";

function queryFor(table) {
  const query = {
    select() { return query; },
    eq() { return query; },
    in() { return query; },
    order() { return query; },
    limit() { return query; },
    then(resolve) {
      const data = table === "event_roulette_winners"
        ? [{
            id: winnerId,
            event_id: eventId,
            nickname: "용이월드",
            winner_order_ids: ["71"],
            winner_note: "머리끈",
            winner_at: "2026-10-04T01:00:00Z",
            is_reward_done: true,
            is_test: false,
          }]
        : table === "event_roulette_events"
          ? [{ id: eventId, custom_gift_name: "머리끈", broadcast_id: broadcastId }]
          : table === "orders"
            ? [{
                id: 71,
                broadcast_id: broadcastId,
                youtube_nickname: "용이월드",
                customer_id: 10,
                customer_name: "이소윤",
                customer_phone: "010-1234-5678",
                phone: "",
                kakao_id: "kakao-1",
                created_at: "2026-10-03T22:00:00Z",
              }]
            : [];
      return Promise.resolve({ data, error: null }).then(resolve);
    },
  };
  return query;
}

const route = createUiLoader({
  "@/lib/admin-auth": { verifyAdminSessionFromRequest: async () => true },
  "@supabase/supabase-js": { createClient: () => ({ from: queryFor }) },
})("app/api/admin-live/event-roulette/route.ts");

const response = await route.GET(new NextRequest("http://localhost/api/admin-live/event-roulette?action=winners&includeTest=true"));
assert.equal(response.status, 200);
const payload = await response.json();
assert.equal(payload.winners.length, 1);
assert.equal(payload.winners[0].customer_name, "이소윤");
assert.equal(payload.winners[0].identity_status, "resolved");
assert.deepEqual(payload.winners[0].customer_ref, {
  kakao: "kakao-1",
  phone: "01012345678",
  nick: "용이월드",
});

console.log("PASS event winner history API enriches the exact winner with real name and customer reference");
