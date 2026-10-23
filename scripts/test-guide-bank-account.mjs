// [2026-10-23] 주문 기록 없을 때 손님 안내 계좌 = 설정 「고객별 계좌 노출 방식」
import assert from "node:assert/strict";
import { guideBankAccount } from "../lib/shopInfo.ts";
const P = { id: "primary", enabled: true, label: "기존", bankName: "새마을금고", bankAccount: "9002186993725", bankHolder: "유혜원" };
const S = { id: "secondary", enabled: true, label: "추가", bankName: "NH농협은행", bankAccount: "302-9464-3220-51", bankHolder: "한두희" };
const base = { bankName: P.bankName, bankAccount: P.bankAccount, bankHolder: P.bankHolder, bankAccounts: [P, S] };
const r = (mode, all, ex) => ({ mode, allAccountId: all, existingAccountId: ex, firstOrderAccountId: "secondary", firstOrderWindow: { enabled: false, startDate: "", endDate: "" } });
assert.equal(guideBankAccount({ ...base, bankRouting: r("all", "secondary", "primary") }).bankName, "NH농협은행");
assert.equal(guideBankAccount({ ...base, bankRouting: r("split", "primary", "secondary") }).bankName, "NH농협은행");
assert.equal(guideBankAccount({ ...base, bankRouting: r("all", "primary", "secondary") }).bankName, "새마을금고");
assert.equal(guideBankAccount({ ...base, bankAccounts: [P, { ...S, enabled: false }], bankRouting: r("all", "secondary", "secondary") }).bankName, "새마을금고");
assert.equal(guideBankAccount({ ...base, bankAccounts: [P], bankRouting: r("all", "secondary", "secondary") }).id, "primary");
console.log("guide bank account: ok");

// ── 손님 화면 시뮬레이션: 지금 운영 설정 모양(기존 새마을 · 추가 농협 · 전체 → 농협) ──
import { pendingOrderGuideBank, parseShopInfo } from "../lib/shopInfo.ts";
import { myOrderFilterOf, myOrderStatusLabel } from "../lib/customerOrderStatusView.ts";
const isPending = (o) => myOrderFilterOf(myOrderStatusLabel(o)) === "입금대기";
const live = { ...base, bankRouting: r("split", "secondary", "secondary") };
const guide = guideBankAccount(live); // 서버 /api/shop-guide-bank 가 돌려주는 값
assert.equal(guide.bankName, "NH농협은행", "안내 계좌 = 농협");
const 대기 = { order_manage_status: "주문확인전", order_status: "주문완료", payment_method: "무통장입금" };
const 취소 = { order_manage_status: "주문취소", payment_method: "무통장입금" };
const 확인 = { order_manage_status: "자동입금확인", payment_method: "무통장입금" };
const 새마을기록 = { payment_bank_name: "새마을금고", payment_bank_account: "9002186993725", payment_bank_holder: "유혜원" };
const 농협기록 = { payment_bank_name: "NH농협은행", payment_bank_account: "302-9464-3220-51", payment_bank_holder: "한두희" };
const sim = (orders) => pendingOrderGuideBank(orders, guide, isPending);
// ① 계좌 기록 없는 옛 입금대기 주문 → 농협(예전엔 새마을)
assert.equal(sim([{ ...대기 }]).bankName, "NH농협은행");
// ② 새 주문(농협 기록) → 농협
assert.equal(sim([{ ...대기, ...농협기록 }]).bankName, "NH농협은행");
// ③ 받는 계좌 목록을 모를 때(서버 실패)만 기록 그대로 — 목록을 알면 ⑨처럼 농협으로 바뀜
assert.deepEqual(sim([{ ...대기, ...새마을기록 }]), { bankName: "새마을금고", bankAccount: "9002186993725", bankHolder: "유혜원", fromOrder: true });
// ④ 취소·입금확인 주문의 새마을 기록은 무시 → 농협
assert.equal(sim([{ ...취소, ...새마을기록 }, { ...확인, ...새마을기록 }]).bankName, "NH농협은행");
// ⑤ 주문 없음 → 농협
assert.equal(sim([]).bankName, "NH농협은행");
// ⑥ 최근 입금대기(목록 맨 앞)가 우선
assert.equal(sim([{ ...대기, ...농협기록 }, { ...대기, ...새마을기록 }]).bankName, "NH농협은행");
// ⑦ 서버 응답 실패(useGuideBank null) → 예전처럼 기존 계좌 — 화면이 비지 않음
const fallback = { bankName: base.bankName, bankAccount: base.bankAccount, bankHolder: base.bankHolder };
assert.equal(pendingOrderGuideBank([{ ...대기 }], fallback, isPending).bankName, "새마을금고");
// ⑧ 지금 운영 실제값(기존 계좌도 농협으로 바꿈) → 어떤 경우든 농협
const S2 = { ...S, id: "primary" };
const liveNow = { bankName: S.bankName, bankAccount: S.bankAccount, bankHolder: S.bankHolder, bankAccounts: [S2, S], bankRouting: r("split", "secondary", "secondary") };
assert.equal(guideBankAccount(liveNow).bankName, "NH농협은행");
assert.equal(guideBankAccount({ ...liveNow, bankAccounts: [S2] }).bankName, "NH농협은행");
void parseShopInfo;
console.log("customer screen simulation (8 cases): ok");

// ── [2026-10-24] 새마을 기록 강제 차단: 주문에 새마을이 기록돼 있어도 지금 받는 계좌가 아니면 농협 ──
import { acceptedAccountDigits, isAcceptedBankAccount } from "../lib/shopInfo.ts";
const acceptedNow = acceptedAccountDigits(liveNow);
assert.deepEqual(acceptedNow, ["302946432205" + "1"]);
assert.equal(isAcceptedBankAccount({ bankAccount: "9002186993725" }, acceptedNow), false, "새마을 = 못 받는 계좌");
assert.equal(isAcceptedBankAccount({ bankAccount: "302-9464-3220-51" }, acceptedNow), true);
assert.equal(isAcceptedBankAccount({ bankAccount: "9002186993725" }, []), true, "목록 모르면 기록 그대로");
const guideNow = guideBankAccount(liveNow);
const simNow = (orders) => pendingOrderGuideBank(orders, guideNow, isPending, acceptedNow);
// ⑨ 어제 새마을로 안내받은 입금대기 주문 → 이제 농협(강제)
assert.equal(simNow([{ ...대기, ...새마을기록 }]).bankName, "NH농협은행");
assert.equal(simNow([{ ...대기, ...새마을기록 }]).fromOrder, false);
// ⑩ 농협 기록 주문 → 그 기록 그대로
assert.equal(simNow([{ ...대기, ...농협기록 }]).fromOrder, true);
console.log("새마을 강제 차단 시뮬레이션: ok");
