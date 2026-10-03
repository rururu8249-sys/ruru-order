import assert from "node:assert/strict";

import * as widgetLibrary from "../lib/widgetProductLibrary.ts";

import {
  mergeWidgetHistory,
  filterAndSortWidgetHistory,
  parseWidgetHistory,
  parseWidgetLibraryRequest,
  parseWidgetRotation,
  recordWidgetHistory,
  removeWidgetHistory,
  selectWidgetRotationItems,
  visibleWidgetHistory,
  widgetRotationShouldAdvance,
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

const viewEntries = [
  { productId: "1", detailName: "", label: "BB-95", count: 2, lastAt: 500 },
  { productId: "2", detailName: "초코바나나", label: "MIU-201 초코바나나", count: 8, lastAt: 300 },
  { productId: "3", detailName: "", label: "가방-01", count: 4, lastAt: 700 },
  { productId: "4", detailName: "", label: "신발-02", count: 1, lastAt: 200 },
  { productId: "5", detailName: "", label: "의류-03", count: 1, lastAt: 100 },
];
assert.deepEqual(filterAndSortWidgetHistory(viewEntries, "miu 201", "recent").map((entry) => entry.productId), ["2"]);
assert.deepEqual(filterAndSortWidgetHistory(viewEntries, "", "frequent").map((entry) => entry.productId), ["2", "3", "1", "4", "5"]);
assert.deepEqual(filterAndSortWidgetHistory(viewEntries, "", "recent").map((entry) => entry.productId), ["3", "1", "2", "4", "5"]);
assert.deepEqual(visibleWidgetHistory(viewEntries, false, 4).map((entry) => entry.productId), ["1", "2", "3", "4"]);
assert.equal(visibleWidgetHistory(viewEntries, true, 4).length, 5);

const pausedRotation = parseWidgetRotation(JSON.stringify({
  mode: "selected",
  paused: true,
  targets: [{ productId: "20", detailName: "블랙" }, { productId: "20", detailName: "브라운" }],
}));
assert.equal(pausedRotation.paused, true);
assert.deepEqual(
  selectWidgetRotationItems(candidates, pausedRotation, targetOf, available).map((item) => item.id),
  ["20-b", "20-a"],
  "selected details must follow the operator's target order",
);
assert.equal(widgetRotationShouldAdvance(pausedRotation, false, 2), false, "paused selected rotation must not advance");
assert.equal(widgetRotationShouldAdvance({ ...pausedRotation, paused: false }, true, 2), false, "manual pin must override rotation");
assert.equal(widgetRotationShouldAdvance({ ...pausedRotation, paused: false }, false, 2), true);
assert.deepEqual(
  selectWidgetRotationItems(candidates, { mode: "selected", paused: false, targets: [] }, targetOf, available),
  [],
  "an explicit empty selection must stay empty rather than reintroducing all products",
);

assert.equal(typeof widgetLibrary.selectableWidgetTargets, "function", "bulk selection helper must exist");
assert.equal(typeof widgetLibrary.widgetRotationDraftChanged, "function", "rotation editor must detect unapplied changes");

const libraryItems = [
  { productId: "10", detailName: "", available: true, inBroadcast: true },
  { productId: "20", detailName: "브라운", available: true, inBroadcast: true },
  { productId: "30", detailName: "", available: false, inBroadcast: true },
  { productId: "40", detailName: "", available: true, inBroadcast: false },
];
assert.deepEqual(
  widgetLibrary.selectableWidgetTargets(libraryItems),
  [{ productId: "10", detailName: "" }, { productId: "20", detailName: "브라운" }],
  "bulk select must include only available products displayed in the current broadcast",
);
assert.deepEqual(
  widgetLibrary.selectableWidgetTargets(libraryItems.slice(1, 3)),
  [{ productId: "20", detailName: "브라운" }],
  "search-scoped bulk select must affect only eligible search results",
);

const savedSelection = {
  mode: "selected",
  paused: false,
  targets: [{ productId: "10", detailName: "" }, { productId: "20", detailName: "브라운" }],
};
assert.equal(
  widgetLibrary.widgetRotationDraftChanged(savedSelection, "selected", new Set(["20|브라운", "10|"])),
  false,
  "selection order alone must not create a false unsaved-change warning",
);
assert.equal(
  widgetLibrary.widgetRotationDraftChanged(savedSelection, "selected", new Set(["10|"])),
  true,
  "removing a selected product must create an unapplied change",
);
assert.equal(
  widgetLibrary.widgetRotationDraftChanged(savedSelection, "all", new Set(["10|", "20|브라운"])),
  true,
  "switching from selected rotation to all-product rotation must require apply",
);
assert.equal(
  widgetLibrary.widgetRotationDraftChanged({ mode: "all", paused: false, targets: [] }, "all", new Set(["10|"])),
  false,
  "draft product checks are irrelevant while the saved and draft modes are both all-product rotation",
);

console.log("widget product library tests passed");
