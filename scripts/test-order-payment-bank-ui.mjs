// 주문완료 계좌 표시/복사 및 공개 설정 노출 회귀 테스트
// 실행: node --import ./scripts/_ts-resolve.mjs scripts/test-order-payment-bank-ui.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SHOP_INFO_PUBLIC_KEYS } from "../lib/shopInfo.ts";

assert.equal(SHOP_INFO_PUBLIC_KEYS.includes("shop_bank_config_v1"), false, "고객 브라우저에 두 계좌 전체 설정을 읽히면 안 된다");
assert.equal(SHOP_INFO_PUBLIC_KEYS.includes("shop_bank_account"), true, "기존 primary 호환 계좌는 공개 설정에 남긴다");

const page = await readFile(new URL("../app/order/page.tsx", import.meta.url), "utf8");
const guide = await readFile(new URL("../components/customer/CustomerPaymentGuideBottomSheet.tsx", import.meta.url), "utf8");
const hook = await readFile(new URL("../lib/useShopInfo.ts", import.meta.url), "utf8");

assert.match(page, /bankAccount:\s*OrderBankAccountSnapshot/);
assert.match(page, /parseOrderBankRoutingResult\(orderSubmitPayload\)/);
assert.match(page, /bankAccount:\s*assignedBank\.bankAccount/);
assert.match(page, /const activePaymentBankAccount(?:\s*:\s*OrderBankAccountSnapshot)?\s*=/);
assert.match(page, /navigator\.clipboard\.writeText\(activePaymentBankAccount\.bankAccount\)/);
assert.match(page, /bankName=\{activePaymentBankAccount\.bankName\}/);
assert.match(page, /bankAccount=\{activePaymentBankAccount\.bankAccount\}/);
assert.match(page, /bankHolder=\{activePaymentBankAccount\.bankHolder\}/);

assert.equal(
  guide.includes("입금 계좌는 변경될 수 있습니다. 입금 전 이 화면의 계좌번호를 꼭 확인해 주세요."),
  true,
  "확정 안내문을 계좌 바로 옆에 표시해야 한다",
);
assert.match(hook, /SHOP_INFO_PUBLIC_KEYS/);
assert.doesNotMatch(hook, /\.in\("key", \[\.\.\.SHOP_INFO_KEYS\]\)/);

console.log("order payment bank UI tests passed");
