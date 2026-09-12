// scripts/test-nickname-owner-phone.mjs
// [2026-09-13] 닉네임 → 번호 확정 규칙 — 같은 닉네임 손님이 둘이면 «아무나 고르지 않는다»
// 실행: node --experimental-strip-types --loader ./scripts/_ts-resolve.mjs scripts/test-nickname-owner-phone.mjs
import assert from "node:assert/strict";
import { resolveUniqueOwnerPhone, resolveOwnerPhoneBySteps } from "../lib/nicknameOwnerPhone.ts";

let n = 0;
const ok = (label, fn) => { fn(); n += 1; console.log("  ✓", label); };
console.log("[닉네임 → 번호 확정]");

ok("① 한 명이면 그 번호", () => {
  assert.deepEqual(resolveUniqueOwnerPhone([{ customer_phone: "010-5841-7333" }]), { ok: true, phone: "01058417333" });
});

ok("② 같은 번호가 여러 줄이어도 한 명 (주문 여러 건)", () => {
  assert.deepEqual(
    resolveUniqueOwnerPhone([{ customer_phone: "01058417333" }, { customer_phone: "010-5841-7333" }, { customer_phone: "01058417333" }]),
    { ok: true, phone: "01058417333" },
  );
});

ok("③ 실측 sunny — 유동/김선혜 두 명이면 멈춘다", () => {
  const r = resolveUniqueOwnerPhone([{ customer_phone: "01058417333" }, { customer_phone: "01044964911" }]);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "ambiguous");
  assert.deepEqual(r.phones, ["01058417333", "01044964911"]);
});

ok("④ 없으면 none (다음 방법으로 넘어가도 된다)", () => {
  assert.deepEqual(resolveUniqueOwnerPhone([]), { ok: false, reason: "none" });
  assert.deepEqual(resolveUniqueOwnerPhone(null), { ok: false, reason: "none" });
});

ok("⑤ 10자리 미만 쓰레기 값은 번호로 안 센다", () => {
  assert.deepEqual(resolveUniqueOwnerPhone([{ customer_phone: "0000" }, { customer_phone: "01044964911" }]), { ok: true, phone: "01044964911" });
});

ok("⑥ 빈 값·null 줄은 무시", () => {
  assert.deepEqual(resolveUniqueOwnerPhone([{ customer_phone: null }, { customer_phone: "" }, { customer_phone: "01099992420" }]), { ok: true, phone: "01099992420" });
});

// ── 단계 조회(① 주문 → ② 회원 → ③ 카카오) 규칙 ────────────────────────────
// 실제 이벤트 포인트 지급이 쓰는 순서. «갈리면 멈춘다»가 핵심.
const okAsync = async (label, fn) => { await fn(); n += 1; console.log("  ✓", label); };
const rows = (...phones) => async () => phones.map((p) => ({ customer_phone: p }));

console.log("\n[단계 조회 — 갈리면 멈춘다]");

await okAsync("⑦ 1단계에서 확정되면 거기서 끝", async () => {
  assert.deepEqual(
    await resolveOwnerPhoneBySteps([rows("01099992420"), rows("01011111111")]),
    { ok: true, phone: "01099992420" },
  );
});

await okAsync("⑧ 1단계가 비면 2단계로 넘어간다", async () => {
  assert.deepEqual(
    await resolveOwnerPhoneBySteps([rows(), rows("01044964911")]),
    { ok: true, phone: "01044964911" },
  );
});

await okAsync("⑨ 1단계에서 갈리면 «멈춘다» — 2단계 답을 쓰지 않는다", async () => {
  const r = await resolveOwnerPhoneBySteps([
    rows("01031805071", "01087648075"), // 신디 = 김애경 / 나금혜
    rows("01099992420"),                 // 여기 답이 있어도 쓰면 안 된다
  ]);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "ambiguous");
  assert.deepEqual(r.phones, ["01031805071", "01087648075"]);
});

await okAsync("⑩ 끝까지 못 찾으면 none", async () => {
  assert.deepEqual(await resolveOwnerPhoneBySteps([rows(), rows(), rows()]), { ok: false, reason: "none" });
});

await okAsync("⑪ 마지막 단계에서 갈려도 멈춘다", async () => {
  const r = await resolveOwnerPhoneBySteps([rows(), rows(), rows("01056505531", "01081912420")]);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "ambiguous");
});

console.log(`\n✅ 닉네임 → 번호 확정 ${n}개 통과`);
