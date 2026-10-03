import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("app/api/admin-live/event-roulette/route.ts", "utf8");

const rouletteInsert = source.slice(
  source.indexOf("if (!existingWinner)"),
  source.indexOf("return json({", source.indexOf("if (!existingWinner)")),
);
assert.match(
  rouletteInsert,
  /winner_order_ids:\s*picked\.winner\.orderIds\s*\|\|\s*\[\]/,
  "roulette winner history must keep the exact order ids used for the draw",
);

const survivalInsert = source.slice(
  source.indexOf("const toInsert = survivorNicknames"),
  source.indexOf("const allRows", source.indexOf("const toInsert = survivorNicknames")),
);
assert.match(
  survivalInsert,
  /winner_order_ids:[\s\S]*?survivors\.find\([\s\S]*?survivor\.nickname[\s\S]*?\)\?\.orderIds\s*\|\|\s*\[\]/,
  "each survival winner history row must keep that survivor's exact order ids",
);

console.log("PASS event winner rows retain exact order snapshots for safe identity lookup");
