import assert from "node:assert/strict";
import { createUiLoader } from "./admin-ui-test-loader.mjs";
const { parseSolapiBalanceError, affordableAlertCount } = createUiLoader()("lib/solapiBalanceFit.ts");
const msg = "NotEnoughBalance: 보유 잔액이 부족하여 발송에 실패하였습니다. [차감금액: 54145, 보유잔액: 0, 보유포인트: 0, 보유예치금: 55514.5]";
assert.deepEqual(parseSolapiBalanceError(msg), { charge: 54145, balance: 0, point: 0, deposit: 55514.5 });
const n = affordableAlertCount(msg, 4165);
// 1명 13원 + 부가세 = 14.3원 → 55,514.5 / 14.3 ≈ 3,882 → 1% 여유 3,843
assert.equal(n, 3843);
assert.ok(n * 13 * 1.1 <= 55514.5);
assert.equal(affordableAlertCount("다른 오류", 100), 0);
console.log("test-solapi-balance-fit PASS");
