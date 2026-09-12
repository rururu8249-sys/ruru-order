// scripts/test-nickname-owner-phone.mjs
// [2026-09-13] 닉네임 → 번호 확정 규칙 — 같은 닉네임 손님이 둘이면 «아무나 고르지 않는다»
// 실행: node --experimental-strip-types --loader ./scripts/_ts-resolve.mjs scripts/test-nickname-owner-phone.mjs
import assert from "node:assert/strict";
import { resolveUniqueOwnerPhone, resolveOwnerPhoneBySteps } from "../lib/nicknameOwnerPhone.ts";
import { buildRouletteParticipants } from "../lib/eventRoulette.ts";

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

// ── 이벤트 명단: 같은 닉네임 다른 손님이 «한 칸»으로 합쳐지는 것 감지 ──────────
// 명단을 닉네임으로 묶는 기준 자체는 무변경(추첨 결과에 영향 없음). 합쳐진 칸을 표시만 한다.
console.log("\n[이벤트 명단 — 한 칸에 몇 명이 섞였나]");

const order = (id, nick, phone, amount = 10000) => ({
  id: String(id), youtube_nickname: nick, customer_phone: phone,
  qty: 1, final_amount: amount, admin_order_status_v2: "결제완료",
});

ok("⑫ 한 사람이 두 번 주문하면 1명", () => {
  const [p] = buildRouletteParticipants([order(1, "민연숙쨩", "01028495209"), order(2, "민연숙쨩", "010-2849-5209")]);
  assert.equal(p.orderCount, 2);
  assert.equal(p.personCount, 1);
});

ok("⑬ 실측 신디 — 김애경·나금혜가 한 칸으로 합쳐지면 2명으로 표시", () => {
  const [p] = buildRouletteParticipants([order(1, "신디", "01031805071"), order(2, "신디", "01087648075")]);
  assert.equal(p.nickname, "신디");
  assert.equal(p.orderCount, 2);   // 묶는 기준은 그대로 (추첨 무변경)
  assert.equal(p.personCount, 2);  // 다만 «2명»이라고 알려준다
  assert.deepEqual(p.orderIds, ["1", "2"]);
});

ok("⑭ 번호 없는 주문은 사람 수에 안 센다", () => {
  const [p] = buildRouletteParticipants([order(1, "곰", "01099992420"), order(2, "곰", "")]);
  assert.equal(p.personCount, 1);
});

ok("⑮ 당첨자의 그 주문서가 한 사람이면 그 번호로 확정", () => {
  const [p] = buildRouletteParticipants([order(1, "신디", "01031805071"), order(2, "신디", "01087648075")]);
  // 당첨자의 주문 줄로 번호를 찾는다 → 갈리므로 «멈춘다»
  const rows = [{ customer_phone: "01031805071" }, { customer_phone: "01087648075" }];
  assert.equal(resolveUniqueOwnerPhone(rows).ok, false);
  // 한 사람만 들어있는 주문서면 바로 확정
  assert.deepEqual(resolveUniqueOwnerPhone([{ customer_phone: "01031805071" }]), { ok: true, phone: "01031805071" });
  assert.equal(p.personCount, 2);
});

console.log(`\n✅ 닉네임 → 번호 확정 ${n}개 통과`);
