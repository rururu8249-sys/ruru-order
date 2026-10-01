import assert from "node:assert/strict";

import {
  FINAL_SUBMIT_CONFIRMATION_KEY,
  finalSubmitConfirmationReady,
  parseFinalSubmitConfirmationEnabled,
  toFinalSubmitConfirmationRow,
} from "../lib/finalSubmitConfirmation.ts";

assert.equal(FINAL_SUBMIT_CONFIRMATION_KEY, "final_submit_confirmation_enabled");

assert.equal(
  parseFinalSubmitConfirmationEnabled([]),
  true,
  "설정을 한 번도 저장하지 않았으면 기존 동작을 유지해야 한다",
);
assert.equal(
  parseFinalSubmitConfirmationEnabled([{ key: FINAL_SUBMIT_CONFIRMATION_KEY, value: "false" }]),
  false,
  "관리자가 OFF로 저장하면 체크 확인을 끈다",
);
assert.equal(
  parseFinalSubmitConfirmationEnabled([{ key: FINAL_SUBMIT_CONFIRMATION_KEY, value: "true" }]),
  true,
  "관리자가 ON으로 저장하면 체크 확인을 켠다",
);
assert.equal(
  parseFinalSubmitConfirmationEnabled([{ key: FINAL_SUBMIT_CONFIRMATION_KEY, value: "unexpected" }]),
  true,
  "잘못된 값은 안전하게 기존 ON 동작으로 돌아간다",
);

assert.deepEqual(toFinalSubmitConfirmationRow(true), {
  key: FINAL_SUBMIT_CONFIRMATION_KEY,
  value: "true",
});
assert.deepEqual(toFinalSubmitConfirmationRow(false), {
  key: FINAL_SUBMIT_CONFIRMATION_KEY,
  value: "false",
});

assert.equal(finalSubmitConfirmationReady(true, false), false, "ON이면 미체크 제출을 막는다");
assert.equal(finalSubmitConfirmationReady(true, true), true, "ON이어도 체크하면 제출 가능하다");
assert.equal(finalSubmitConfirmationReady(false, false), true, "OFF이면 체크 없이 제출 가능하다");

console.log("✅ 주문서 최종 확인 ON/OFF 규칙 테스트 통과");
