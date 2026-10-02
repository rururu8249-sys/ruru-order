import assert from "node:assert/strict";
import { buildCartHoldSummary } from "../lib/cartHoldSummary.ts";

assert.deepEqual(buildCartHoldSummary([]), { cartCount: 0, totalQty: 0 });

assert.deepEqual(buildCartHoldSummary([
  { session_key: "customer-a", qty: 2 },
  { session_key: "customer-a", qty: 1 },
  { session_key: "customer-b", qty: 4 },
]), { cartCount: 2, totalQty: 7 });

assert.deepEqual(buildCartHoldSummary([
  { session_key: "", qty: 99 },
  { session_key: "customer-a", qty: -3 },
  { session_key: "customer-b", qty: "2.9" },
  { session_key: "customer-c", qty: "not-a-number" },
]), { cartCount: 3, totalQty: 2 });

console.log("cart hold summary tests passed");
