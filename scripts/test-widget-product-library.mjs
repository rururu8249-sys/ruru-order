import assert from "node:assert/strict";

import {
  mergeWidgetHistory,
  parseWidgetHistory,
  parseWidgetLibraryRequest,
  parseWidgetRotation,
  recordWidgetHistory,
  removeWidgetHistory,
  selectWidgetRotationItems,
  widgetRotationSettingKey,
} from "../lib/widgetProductLibrary.ts";

assert.deepEqual(parseWidgetHistory("not-json"), [], "malformed history must fall back to an empty library");

const serverHistory = [
  { productId: "10", detailName: "", label: "서버 상품", count: 3, lastAt: 100 },
  { productId: "20", detailName: "브라운", label: "브라운", count: 2, lastAt: 200 },
];
const legacyHistory = [
  { productId: "10", detailName: "", label: "최신 상품명", count: 5, lastAt: 300 },
  { productId: "30", detailName: "", label: "새 상품", count: 1, lastAt: 250 },
];
const merged = mergeWidgetHistory(serverHistory, legacyHistory);
assert.equal(merged.length, 3, "duplicate product/detail targets must merge into one row");
assert.deepEqual(
  merged.find((entry) => entry.productId === "10"),
  { productId: "10", detailName: "", label: "최신 상품명", count: 5, lastAt: 300 },
  "migration must keep the larger count and newest non-empty label without double counting",
);
assert.deepEqual(mergeWidgetHistory(merged, legacyHistory), merged, "legacy import must be idempotent");

const recorded = recordWidgetHistory(serverHistory, { productId: "20", detailName: "브라운", label: "브라운 새이름" }, 500);
assert.deepEqual(
  recorded.find((entry) => entry.productId === "20" && entry.detailName === "브라운"),
  { productId: "20", detailName: "브라운", label: "브라운 새이름", count: 3, lastAt: 500 },
  "a successful pin must increment the exact detail target",
);
assert.equal(removeWidgetHistory(recorded, { productId: "20", detailName: "브라운" }).length, 1);

assert.deepEqual(
  parseWidgetRotation("broken"),
  { mode: "all", paused: false, targets: [] },
  "missing or malformed rotation settings must preserve legacy all-product rotation",
);
assert.equal(widgetRotationSettingKey("abc-123"), "widget_rotation_abc-123");

const candidates = [
  { id: "10", __parent_product_id: "10", __detail_name: "", available: true },
  { id: "20-a", __parent_product_id: "20", __detail_name: "브라운", available: true },
  { id: "20-b", __parent_product_id: "20", __detail_name: "블랙", available: true },
  { id: "30", __parent_product_id: "30", __detail_name: "", available: false },
];
const targetOf = (item) => ({ productId: item.__parent_product_id, detailName: item.__detail_name });
const available = (item) => item.available;
assert.deepEqual(
  selectWidgetRotationItems(
    candidates,
    { mode: "selected", paused: false, targets: [{ productId: "20", detailName: "블랙" }, { productId: "30", detailName: "" }] },
    targetOf,
    available,
  ).map((item) => item.id),
  ["20-b"],
  "selected rotation must match exact details and skip unavailable targets",
);
assert.deepEqual(
  selectWidgetRotationItems(candidates, { mode: "all", paused: false, targets: [] }, targetOf, available).map((item) => item.id),
  ["10", "20-a", "20-b"],
  "legacy all mode must keep every available broadcast item",
);

assert.deepEqual(
  parseWidgetLibraryRequest({ action: "record", target: { productId: 10, detailName: "브라운" }, label: "  상품  " }),
  { action: "record", target: { productId: "10", detailName: "브라운" }, label: "상품" },
);
assert.equal(parseWidgetLibraryRequest({ action: "saveRotation", broadcastId: "", rotation: {} }), null);

console.log("widget product library tests passed");

