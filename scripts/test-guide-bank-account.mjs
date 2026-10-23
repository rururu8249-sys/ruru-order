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
