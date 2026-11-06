import assert from "node:assert/strict";
import { extendedHoldExpiry } from "../lib/cartHoldExtend.ts";
const now = new Date("2026-11-06T12:40:00Z");
// 4시간으로 담긴 줄 → 6일(8640분)로 늘림
assert.equal(extendedHoldExpiry("2026-11-06T12:25:55Z", "2026-11-06T16:25:55Z", 8640, now), "2026-11-12T12:25:55.000Z");
// 줄이는 건 안 함
assert.equal(extendedHoldExpiry("2026-11-01T12:00:00Z", "2026-11-07T12:00:00Z", 240, now), null);
// 이미 만료된 줄은 되살리지 않음
assert.equal(extendedHoldExpiry("2026-11-06T06:00:00Z", "2026-11-06T10:00:00Z", 8640, now), null);
// 같은 시간이면 그대로
assert.equal(extendedHoldExpiry("2026-11-06T12:25:55Z", "2026-11-12T12:25:55Z", 8640, now), null);
// 이상한 값
assert.equal(extendedHoldExpiry("", "2026-11-12T12:25:55Z", 8640, now), null);
console.log("test-cart-hold-extend OK");
