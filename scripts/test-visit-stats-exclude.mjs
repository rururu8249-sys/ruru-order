// 접속 기록 제외 계정 — 설정 읽기·닉네임 모음·목록 합치기(가짜 DB)
import assert from "node:assert/strict";
import { parseExcludeSetting, namesOfCustomer, loadExcludedCustomers } from "../lib/visitStatsExclude.ts";

assert.deepEqual(parseExcludeSetting('{"customerIds":[6,6,"657",0,"x"],"nicknames":[" 루루동이 ","루루동이",""]}'), { customerIds: [6, 657], nicknames: ["루루동이"] });
assert.deepEqual(parseExcludeSetting(null), { customerIds: [], nicknames: [] });
assert.deepEqual(parseExcludeSetting("{bad"), { customerIds: [], nicknames: [] });

assert.deepEqual(namesOfCustomer({ youtube_nickname: " 그래나88이다 ", previous_nicknames: '["ㄱ루루동이","루루동이"]' }), ["그래나88이다", "ㄱ루루동이", "루루동이"]);
assert.deepEqual(namesOfCustomer({ youtube_nickname: "루루실장", previous_nicknames: "옛1, 옛2" }), ["루루실장", "옛1", "옛2"]);
assert.deepEqual(namesOfCustomer({ youtube_nickname: "a", previous_nicknames: [{ nickname: "b" }, "a"] }), ["a", "b"]);
assert.deepEqual(namesOfCustomer({ youtube_nickname: "", previous_nicknames: null }), []);

// 가짜 supabase: settings 에 6, 테스트 번호 01099992420 → 657
const customers = [
  { id: 657, youtube_nickname: "그래나88이다", previous_nicknames: '["ㄱ루루동이"]', customer_phone: "010-9999-2420", kakao_id: "k657" },
  { id: 6, youtube_nickname: "루루실장", previous_nicknames: null, customer_phone: "01087852465", kakao_id: "k6" },
];
const orders = [
  { kakao_id: "k657", youtube_nickname: "루루동이" },
  { kakao_id: "k657", youtube_nickname: "춥다추워" },
  { kakao_id: "k657", youtube_nickname: "그래나88이다" },
  { kakao_id: "k6", youtube_nickname: "두두" },
  { kakao_id: "k999", youtube_nickname: "남" },
];
function table(name) {
  const q = { _f: [] };
  const chain = {
    select() { return chain; },
    eq(k, v) { q._f.push((r) => r[k] === v); return chain; },
    in(k, vs) { q._f.push((r) => vs.includes(r[k])); return chain; },
    limit() { return chain; },
    then(res) {
      const src = name === "settings" ? [{ key: "visit_stats_exclude_v1", value: '{"customerIds":[6],"nicknames":["손닉"]}' }]
        : name === "operator_test_accounts" ? [{ customer_phone: "01099992420", is_active: true }]
        : name === "orders" ? orders
        : customers;
      return res({ data: src.filter((r) => q._f.every((f) => f(r))), error: null });
    },
  };
  return chain;
}
const sb = { from: (n) => table(n) };
const { list, nicknames, allNames } = await loadExcludedCustomers(sb);
assert.deepEqual(list.map((c) => [c.id, c.auto, c.names]), [[657, true, ["그래나88이다", "ㄱ루루동이", "루루동이", "춥다추워"]], [6, false, ["루루실장", "두두"]]]);
assert.equal(list[0].phoneTail, "2420");
assert.deepEqual(nicknames, ["손닉"]);
assert.deepEqual([...allNames].sort(), ["ㄱ루루동이", "그래나88이다", "두두", "루루동이", "루루실장", "손닉", "춥다추워"].sort());
assert.ok(!allNames.has("남"));
console.log("test-visit-stats-exclude: 통과");
