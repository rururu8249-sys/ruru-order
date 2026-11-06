// 세부상품 단위 순환 넣기/빼기 순수 함수 + 위젯이 실제로 그것만 도는지(selectWidgetRotationItems)
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rotdetail-"));
execSync(`npx esbuild lib/widgetRotationDetail.ts lib/widgetProductLibrary.ts --bundle=false --format=cjs --outdir=${dir} --log-level=error`);
for (const f of fs.readdirSync(dir)) {
  const p = path.join(dir, f); fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/require\("\.\/widgetProductLibrary"\)/g, 'require("./widgetProductLibrary.js")'));
}
const require = createRequire(import.meta.url);
const R = require(path.join(dir, "widgetRotationDetail.js"));
const W = require(path.join(dir, "widgetProductLibrary.js"));
const names = ["BB-501 연베이지", "BB-502 찐베이지", "BB-503 블랙"];
const items = names.map((n) => ({ id: 751, __parent_product_id: 751, __detail_name: n, stock: 5 }))
  .concat([{ id: 745, __parent_product_id: 745, __detail_name: "PD-1", stock: 5 }]);
const run = (targets) => W.selectWidgetRotationItems(items, { mode: "selected", paused: false, targets }, W.widgetTargetFromProduct).map((x) => x.__detail_name).sort();
// 1) 세부상품 2개만 넣기 → 위젯은 그 2개만
let t = R.dedupeRotationTargets([R.detailRotationTarget({ pid: "751", detailName: "BB-502 찐베이지" }), R.detailRotationTarget({ pid: "751", detailName: "BB-503 블랙" })]);
assert.deepEqual(run(t), ["BB-502 찐베이지", "BB-503 블랙"]);
assert.equal(R.detailInRotation(t, { pid: "751", detailName: "BB-501 연베이지" }), false);
assert.equal(R.detailInRotation(t, { pid: "751", detailName: "BB-503 블랙" }), true);
// 2) 묶음 전체에서 하나만 빼기 → 나머지 이름으로 펼쳐짐
t = R.removeRotationTargets([{ productId: "751", detailName: "" }, { productId: "745", detailName: "" }], [], [{ pid: "751", detailName: "BB-501 연베이지" }], () => names);
assert.deepEqual(run(t), ["BB-502 찐베이지", "BB-503 블랙", "PD-1"].sort());
// 3) 줄 빼기 → 그 묶음 전부 빠짐
t = R.removeRotationTargets(t, ["751"], [], () => names);
assert.deepEqual(run(t), ["PD-1"]);
// 4) 연결 세부상품은 원래 상품 id 로
assert.deepEqual(R.detailRotationTarget({ pid: "751", detailName: "X", sourceId: "900" }), { productId: "900", detailName: "" });
// 5) 중복 제거
assert.equal(R.dedupeRotationTargets([{ productId: "1", detailName: "a" }, { productId: "1", detailName: "a " }]).length, 1);
console.log("✅ widget-rotation-detail 통과");
