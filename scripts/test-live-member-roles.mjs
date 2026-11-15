// [2026-11-15] 방송 화면 권한 — 권한→판정·프리셋·표시·저장(가짜 DB)·예전 목록 맞추기
import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";

const load = createUiLoader({});
const R = load("lib/liveMemberRoles.ts");

// 프리셋 → 판정
const f = (p) => R.flagsFromPerms(R.cleanPerms(p));
assert.deepEqual(f(["owner"]), { isOwner: true, isManager: true, isMod: true, seeTest: true, persona: true, memory: true });
assert.deepEqual(f(["moderate", "test", "persona"]), { isOwner: false, isManager: false, isMod: true, seeTest: true, persona: true, memory: false }, "부관리자");
assert.deepEqual(f(["moderate"]), { isOwner: false, isManager: false, isMod: true, seeTest: false, persona: false, memory: false }, "채팅 관리자 = 테스트 표시 안 봄");
assert.deepEqual(f(["host"]), { isOwner: false, isManager: true, isMod: true, seeTest: true, persona: false, memory: false }, "방송 진행 = 예전 isManager");
assert.deepEqual(f(["test"]), { isOwner: false, isManager: false, isMod: false, seeTest: true, persona: false, memory: false });
assert.deepEqual(f(["memory"]), { isOwner: false, isManager: false, isMod: false, seeTest: false, persona: false, memory: true }, "구매 얘기 시험 보기만 — [테스트] 표시 없음");
assert.deepEqual(R.cleanPerms(["owner", "hack", "owner", 3]), ["owner"], "모르는 값·중복 버림");
assert.equal(R.presetOf(["moderate"]), "chat");
assert.equal(R.presetOf(["persona", "test", "moderate"]), "sub");
assert.equal(R.presetOf(["moderate", "test"]), "custom");
assert.equal(R.badgeFromRole(["owner"], "crown_pink"), "crown_pink");
assert.equal(R.badgeFromRole(["owner"], null), "crown");
assert.equal(R.badgeFromRole(["moderate"], null), "mod");
assert.equal(R.badgeFromRole(["test", "persona"], null), null, "테스트·닉네임만이면 R 없음");

// 가짜 DB — 저장·빼기·예전 목록(mirror)
function fakeDb(state) {
  const q = (table) => {
    const ctx = { table, filters: [], inList: null };
    const api = {
      select() { return api; }, order() { return api; },
      eq(c, v) { ctx.filters.push([c, v]); return api; },
      in(c, v) { ctx.inList = [c, v]; return api; },
      maybeSingle() { const rows = run(); return Promise.resolve({ data: rows[0] ?? null, error: null }); },
      then(res) { return Promise.resolve({ data: run(), error: null }).then(res); },
      upsert(rows) { for (const r of rows) { state.roles = state.roles.filter((x) => x.kakao_id !== r.kakao_id); state.roles.push(r); } return Promise.resolve({ error: null }); },
      update(v) { return { eq: (c, k) => { const row = state.settings.find((s) => s.key === k); row.value = v.value; return Promise.resolve({ error: null }); } }; },
      delete() { return { eq: (c, k) => { state.roles = state.roles.filter((x) => x.kakao_id !== k); return Promise.resolve({ error: null }); } }; },
    };
    function run() {
      let rows = table === "live_member_roles" ? state.roles : table === "customers" ? state.customers : state.settings;
      for (const [c, v] of ctx.filters) rows = rows.filter((r) => String(r[c]) === String(v));
      if (ctx.inList) rows = rows.filter((r) => ctx.inList[1].includes(r[ctx.inList[0]]));
      return rows;
    }
    return api;
  };
  return { from: q };
}
const S = load("lib/liveMemberRolesServer.ts");
const state = {
  roles: [{ kakao_id: "1", perms: ["owner", "host", "moderate", "test", "persona"], badge: "crown_pink", nickname: "루루동이" }],
  customers: [
    { kakao_id: "1", customer_phone: "01046822420", created_at: "1" },
    { kakao_id: "2", customer_phone: "01083388860", created_at: "1" },
    { kakao_id: "3", customer_phone: "01011112222", created_at: "1" },
  ],
  settings: [{ key: "live_watch_v1", value: JSON.stringify({ audience: "admin", phones: ["01099999999"], owners: [{ phone: "01046822420", badge: "crown_pink" }], mods: ["01083388860", "01087852465"] }) }],
};
const db = fakeDb(state);
const watch = () => JSON.parse(state.settings[0].value);

let r = await S.saveMemberRole(db, { kakaoId: "3", perms: ["moderate"], by: "t" });
assert.equal(r.ok, true);
assert.deepEqual(watch().mods.sort(), ["01011112222", "01087852465"].sort(), "표에 없는 회원(2) 번호는 빠지고, 회원 아닌 예전 번호는 남음");
assert.deepEqual(watch().phones, ["01099999999"], "보기 허용 목록 무변경");
assert.equal(watch().owners[0].phone, "01046822420");

r = await S.saveMemberRole(db, { kakaoId: "2", perms: ["moderate", "test", "persona"], by: "t" });
assert.ok(watch().mods.includes("01083388860"));
r = await S.saveMemberRole(db, { kakaoId: "2", perms: ["owner"], badge: "crown", by: "t" });
assert.ok(watch().owners.some((o) => o.phone === "01083388860" && o.badge === "crown"));
assert.ok(!watch().mods.includes("01083388860"), "총관리자는 mods 에 중복 안 들어감");

r = await S.removeMemberRole(db, "2");
assert.equal(r.ok, true);
r = await S.removeMemberRole(db, "1");
assert.equal(r.ok, false, "마지막 총관리자는 못 뺌");
r = await S.saveMemberRole(db, { kakaoId: "1", perms: ["moderate"], by: "t" });
assert.equal(r.ok, false, "마지막 총관리자 강등 금지");

r = await S.toggleModeratePerm(db, "3", false, "x", "chat");
assert.ok(!state.roles.some((x) => x.kakao_id === "3"), "채팅에서 해제 → 권한 0이면 줄 삭제");
assert.ok(!watch().mods.includes("01011112222"));
r = await S.toggleModeratePerm(db, "2", true, "김현아", "chat");
assert.deepEqual(state.roles.find((x) => x.kakao_id === "2").perms, ["moderate"]);
assert.equal((await S.saveMemberRole(db, { kakaoId: "abc", perms: ["owner"], by: "t" })).ok, false, "카카오 번호 형식 검사");

console.log("PASS live member roles — 권한 판정·프리셋·표시·저장·빼기·마지막 총관리자 보호·예전 목록 맞추기");
