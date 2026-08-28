import { detailPricePresentation } from "../lib/productDetailModel.ts";

function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected=${String(expected)} actual=${String(actual)}`);
}

const priced = detailPricePresentation(139000, 100000);
equal(priced.actualPrice, 239000, "actual price should include option surcharge");
equal(priced.actualLabel, "239,000원", "actual price label");
equal(priced.surchargeLabel, "+100,000원", "surcharge label should remain visible");

const base = detailPricePresentation(139000, 0);
equal(base.actualPrice, 139000, "base option actual price");
equal(base.actualLabel, "139,000원", "base actual price label");
equal(base.surchargeLabel, "+0원", "base option surcharge label");

console.log("product detail price presentation tests passed");
