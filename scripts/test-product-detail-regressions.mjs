import { adminDetailSearch, buildDetailChatLine, detailProducts, expandForWidget, resolveDesignGroups } from "../lib/productDetailModel.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected=${String(expected)} actual=${String(actual)}`);
}

const row = {
  id: 77,
  product_name: "버버리",
  price: 129000,
  image_url: "brand.jpg",
  color_options: [
    "BB(버버리)-401M 남성용 패딩 아우터 · 블랙",
    "BB(버버리)-402M 남성용 패딩 아우터 · 브라운",
    "BB(버버리)-403M 남성용 패딩 아우터 · 그레이",
    "BB(버버리)-404M 남성용 패딩 아우터 · 블랙",
    "BB(버버리)-405M 남성용 패딩 아우터 · 베이지",
    "BB(버버리)-207 아우터",
  ],
  product_note: {
    combo_mode: true,
    combo_detail_values: [
      "BB(버버리)-401M 남성용 패딩 아우터 · 블랙",
      "BB(버버리)-402M 남성용 패딩 아우터 · 브라운",
      "BB(버버리)-403M 남성용 패딩 아우터 · 그레이",
      "BB(버버리)-404M 남성용 패딩 아우터 · 블랙",
      "BB(버버리)-405M 남성용 패딩 아우터 · 베이지",
    ],
    combo_hidden: ["BB(버버리)-207 아우터"],
    option_pricing: {
      "BB(버버리)-401M 남성용 패딩 아우터 · 블랙": 110000,
      "BB(버버리)-402M 남성용 패딩 아우터 · 브라운": 110000,
      "BB(버버리)-403M 남성용 패딩 아우터 · 그레이": 110000,
      "BB(버버리)-404M 남성용 패딩 아우터 · 블랙": 90000,
      "BB(버버리)-405M 남성용 패딩 아우터 · 베이지": 90000,
      "BB(버버리)-207 아우터": 50000,
    },
    detail_photo_sets: {
      "BB(버버리)-401M 남성용 패딩 아우터 · 블랙": ["401.jpg"],
      "BB(버버리)-402M 남성용 패딩 아우터 · 브라운": ["402.jpg"],
      "BB(버버리)-403M 남성용 패딩 아우터 · 그레이": ["403.jpg"],
    },
    brand_group: {
      enabled: true,
      detail_options: {
        "BB(버버리)-401M 남성용 패딩 아우터 · 블랙": { colors: ["블랙"], sizes: ["M", "L"] },
        "BB(버버리)-402M 남성용 패딩 아우터 · 브라운": { colors: ["브라운"], sizes: ["M", "L"] },
        "BB(버버리)-403M 남성용 패딩 아우터 · 그레이": { colors: ["그레이"], sizes: ["M", "L"] },
        "BB(버버리)-404M 남성용 패딩 아우터 · 블랙": { colors: ["블랙"], sizes: ["M", "L"] },
        "BB(버버리)-405M 남성용 패딩 아우터 · 베이지": { colors: ["베이지"], sizes: ["M", "L"] },
        "BB(버버리)-207 아우터": { colors: ["없음"], sizes: ["36", "38"] },
      },
    },
    design_groups: [
      { id: "design-33", members: [
        "BB(버버리)-401M 남성용 패딩 아우터 · 블랙",
        "BB(버버리)-402M 남성용 패딩 아우터 · 브라운",
        "BB(버버리)-403M 남성용 패딩 아우터 · 그레이",
      ] },
      { id: "design-34", members: [
        "BB(버버리)-404M 남성용 패딩 아우터 · 블랙",
        "BB(버버리)-405M 남성용 패딩 아우터 · 베이지",
      ] },
    ],
  },
};

const groups = resolveDesignGroups(row);
equal(groups.length, 2, "two same-design groups");
equal(groups[0].members.length, 3, "401M-403M grouped");
equal(groups[1].members.length, 2, "404M-405M grouped");

const details = detailProducts(row, { includeHidden: false });
const d401 = details.find((d) => d.code === "BB-401M");
assert(d401, "401M detail exists");
equal(d401?.price, 239000, "detail actual price includes surcharge");
equal(d401?.colors[0], "블랙", "explicit color retained");

const hiddenSearch = adminDetailSearch(row, "207");
equal(hiddenSearch.length, 1, "hidden admin detail remains searchable");
equal(hiddenSearch[0].hidden, true, "hidden result has hidden badge state");

const widgetRows = expandForWidget(row);
assert(widgetRows.every((p) => String(p.product_name || "").indexOf("207") < 0), "hidden detail excluded from widget");
assert(widgetRows.some((p) => String(p.product_name || "").includes("401M") && Number(p.price) === 239000), "widget uses exact detail actual price");

const line = buildDetailChatLine(d401);
assert(line.includes("239,000원"), "chat line uses actual price");
assert(line.includes("색상: 블랙"), "chat line uses meaningful color");

console.log("product detail regression tests passed");
