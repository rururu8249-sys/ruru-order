import assert from "node:assert/strict";

import {
  DEFAULT_ORDER_PURCHASE_CONSENT,
  assertOrderPurchaseConsent,
  orderNeedsPurchaseConsent,
  parseOrderPurchaseConsentSettings,
  toOrderPurchaseConsentRows,
} from "../lib/orderPurchaseConsent.ts";

const settings = (values = {}) =>
  Object.entries(values).map(([key, value]) => ({ key, value }));

const overseas = {
  id: 101,
  product_name: "해외 코트",
  badge_type: "new",
  badge_types: ["new", "overseas"],
};
const domestic = {
  id: 102,
  product_name: "국내 셔츠",
  badge_type: "new",
  badge_types: ["new"],
};

{
  const parsed = parseOrderPurchaseConsentSettings([]);
  assert.deepEqual(parsed, DEFAULT_ORDER_PURCHASE_CONSENT, "설정이 없어도 해외배송 자동 모드가 기본이어야 한다");
}

{
  const parsed = parseOrderPurchaseConsentSettings(settings({
    order_purchase_consent_mode: "all",
    order_purchase_consent_title: "  주문 전 확인  ",
    order_purchase_consent_text: "  안내 본문  ",
    order_purchase_consent_checkbox: "  동의합니다  ",
  }));
  assert.equal(parsed.mode, "all");
  assert.equal(parsed.title, "주문 전 확인");
  assert.equal(parsed.text, "안내 본문");
  assert.equal(parsed.checkboxLabel, "동의합니다");
}

{
  const parsed = parseOrderPurchaseConsentSettings(settings({
    order_purchase_consent_mode: "invalid",
    order_purchase_consent_title: " ",
    order_purchase_consent_text: " ",
    order_purchase_consent_checkbox: " ",
  }));
  assert.deepEqual(parsed, DEFAULT_ORDER_PURCHASE_CONSENT, "깨진 값은 안전한 자동 기본값으로 복구해야 한다");
}

{
  const rows = toOrderPurchaseConsentRows({
    mode: "off",
    title: " 제목 ",
    text: " 본문 ",
    checkboxLabel: " 확인 ",
  });
  assert.deepEqual(rows, [
    { key: "order_purchase_consent_mode", value: "off" },
    { key: "order_purchase_consent_title", value: "제목" },
    { key: "order_purchase_consent_text", value: "본문" },
    { key: "order_purchase_consent_checkbox", value: "확인" },
  ]);
}

{
  const orderRows = [{ product_id: "101" }];
  assert.equal(orderNeedsPurchaseConsent("auto", orderRows, new Map([["101", overseas]])), true);
  assert.equal(orderNeedsPurchaseConsent("auto", orderRows, new Map([["101", domestic]])), false);
  assert.equal(orderNeedsPurchaseConsent("all", [{ product_id: "102" }], new Map([["102", domestic]])), true);
  assert.equal(orderNeedsPurchaseConsent("off", orderRows, new Map([["101", overseas]])), false);
}

{
  const legacyOverseas = { id: 103, badge_type: "overseas", badge_types: [] };
  assert.equal(
    orderNeedsPurchaseConsent("auto", [{ product_id: 103 }], new Map([["103", legacyOverseas]])),
    true,
    "옛 badge_type 단일 컬럼도 해외배송으로 판정해야 한다",
  );
}

{
  assert.throws(
    () => assertOrderPurchaseConsent(true, false),
    /구매 동의/,
    "필수인데 동의값이 없으면 서버 제출을 차단해야 한다",
  );
  assert.doesNotThrow(() => assertOrderPurchaseConsent(true, true));
  assert.doesNotThrow(() => assertOrderPurchaseConsent(false, false));
}

console.log("✅ 주문 구매동의 설정·해외배송 판정·서버 차단 테스트 통과");
