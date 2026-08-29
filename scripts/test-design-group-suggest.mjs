// [2026-08-29] 같은디자인 후보 판별 테스트 — 실제 버버리 데이터로 검증
//   productDetailModel.detailProducts() 결과를 그대로 넣어 실제 호출 경로와 같게 검사한다.
import { detailProducts, parseProductNote } from "../lib/productDetailModel.ts";
import { suggestDesignGroups, designBaseDescription, appendDesignGroups } from "../lib/designGroupSuggest.ts";

function assert(c, m) { if (!c) throw new Error(m); }
function equal(a, e, m) { if (a !== e) throw new Error(`${m}: expected=${String(e)} actual=${String(a)}`); }

const D = {
  b401: "BB(버버리)-401M 남성용 패딩 아우터 · 블랙",
  b402: "BB(버버리)-402M 남성용 패딩 아우터 · 브라운",
  b403: "BB(버버리)-403M 남성용 패딩 아우터 · 그레이",
  b404: "BB(버버리)-404M 남성용 패딩 아우터 · 블랙",
  b405: "BB(버버리)-405M 남성용 패딩 아우터 · 베이지",
  b39: "BB(버버리)-39 아우터",   // 색상 미기재 (엑셀 원본 棉抽外套)
  b40: "BB(버버리)-40 아우터",   // 색상 미기재 (엑셀 원본 袖字母外套 — 39와 다른 옷!)
  b41: "BB(버버리)-41 아우터",   // 색상 미기재 (40과 같은 옷)
  b203: "BB(버버리)-203 상의",
};
const names = Object.values(D);

const detailOptions = {
  [D.b401]: { colors: ["블랙"],   sizes: ["M","L","XL","2XL"] },
  [D.b402]: { colors: ["브라운"], sizes: ["M","L","XL","2XL"] },
  [D.b403]: { colors: ["그레이"], sizes: ["M","L","XL","2XL"] },
  [D.b404]: { colors: ["블랙"],   sizes: ["M","L","XL","2XL"] },
  [D.b405]: { colors: ["베이지"], sizes: ["M","L","XL","2XL"] },
  [D.b39]:  { colors: [], sizes: ["4","6","8","10","12"] },
  [D.b40]:  { colors: [], sizes: ["4","6","8","10","12"] },
  [D.b41]:  { colors: [], sizes: ["4","6","8","10","12"] },
  [D.b203]: { colors: [], sizes: ["S","M","L"] },
};

function makeRow(extraNote = {}) {
  return {
    id: 673,
    product_name: "버버리",
    price: 129000,
    color_options: names,
    product_note: {
      combo_mode: true,
      combo_detail_values: names,
      combo_hidden: [],
      option_pricing: {
        [D.b401]: 110000, [D.b402]: 110000, [D.b403]: 110000,  // 239,000
        [D.b404]: 90000,  [D.b405]: 90000,                      // 219,000
        [D.b39]: 50000,   [D.b40]: 50000,   [D.b41]: 50000,     // 179,000
        [D.b203]: 0,                                            // 129,000
      },
      brand_group: { enabled: true, brand_ko: "버버리", detail_options: detailOptions },
      ...extraNote,
    },
  };
}

const groupedMembers = (row) => {
  const raw = parseProductNote(row).design_groups;
  return Array.isArray(raw) ? raw.flatMap((g) => (Array.isArray(g.members) ? g.members : [])) : [];
};
const suggestFor = (row) => suggestDesignGroups(detailProducts(row, { includeHidden: false }), groupedMembers(row));

// ── 1. 색상이 다 있는 그룹은 확정 후보로 ──────────────────────────────────
{
  const { confident } = suggestFor(makeRow());
  const find = (codes) => confident.find((g) => codes.every((c) => g.codes.includes(c)));

  const g239 = find(["BB-401M","BB-402M","BB-403M"]);
  assert(g239, "401M/402M/403M 이 확정 후보로 묶여야 한다");
  equal(g239.members.length, 3, "239,000원 그룹은 3개");
  equal(g239.price, 239000, "그룹 실제가 = 대표가 129,000 + 추가금 110,000");
  equal(g239.baseDescription, "남성용 패딩 아우터", "코드와 색상을 뺀 공통 설명");
  assert(["블랙","브라운","그레이"].every((c) => g239.colors.includes(c)), "색상 3종이 실려야 한다");

  const g219 = find(["BB-404M","BB-405M"]);
  assert(g219, "404M/405M 은 별도 그룹");
  equal(g219.price, 219000, "가격이 다르면 다른 그룹");
  assert(!g239.members.includes(D.b404), "가격 다른 404M이 239,000 그룹에 섞이면 안 된다");
}

// ── 2. 색상이 없으면 절대 확정 후보에 넣지 않는다 (색상 추정 금지) ─────────
{
  const { confident, needsColor } = suggestFor(makeRow());
  const confirmed = confident.flatMap((g) => g.members);
  for (const n of [D.b39, D.b40, D.b41]) assert(!confirmed.includes(n), `${n} 은 색상이 없으므로 확정 후보 금지`);

  const pending = needsColor.find((g) => g.members.includes(D.b39));
  assert(pending, "색상 없는 39/40/41 은 '색상 채워야 하는 후보'로 올라와야 한다");
  assert(pending.members.length >= 2, "후보는 2개 이상");
  equal(pending.colors.length, 0, "색상이 없으므로 colors 는 비어 있어야 한다");
}

// ── 3. 색상이 겹치면 확정 후보가 아니다 ───────────────────────────────────
{
  const row = makeRow();
  row.product_note.brand_group.detail_options[D.b402] = { colors: ["블랙"], sizes: ["M","L","XL","2XL"] };
  const { confident } = suggestFor(row);
  const g = confident.find((x) => x.members.includes(D.b401));
  assert(!g || !g.members.includes(D.b402), "색상이 겹치면 확정 후보로 묶으면 안 된다");
}

// ── 4. 짝 없는 상품은 후보가 아니다 ───────────────────────────────────────
{
  const { confident, needsColor } = suggestFor(makeRow());
  const all = [...confident, ...needsColor].flatMap((g) => g.members);
  assert(!all.includes(D.b203), "짝이 없는 203 상의는 후보에 들어가면 안 된다");
}

// ── 5. 이미 묶인 상품은 다시 제안하지 않는다 ──────────────────────────────
{
  const row = makeRow({ design_groups: [{ id: "design-1", members: [D.b401, D.b402, D.b403] }] });
  const { confident, needsColor } = suggestFor(row);
  const all = [...confident, ...needsColor].flatMap((g) => g.members);
  for (const n of [D.b401, D.b402, D.b403]) assert(!all.includes(n), "이미 묶인 상품은 재제안 금지");
}

// ── 6. 공통 설명 추출 ─────────────────────────────────────────────────────
equal(designBaseDescription(D.b401, ["블랙"]), "남성용 패딩 아우터", "코드+색상 제거");
equal(designBaseDescription(D.b39, []), "아우터", "색상이 없으면 코드만 제거");
equal(designBaseDescription("BB(버버리)-45 후드 아우터+반바지 2종 세트", []), "후드 아우터+반바지 2종 세트", "특수문자 포함 설명 유지");
equal(designBaseDescription("BB(버버리)-77 아우터 · 특가", []), "아우터 · 특가", "저장 색상이 아니면 꼬리표를 지우지 않는다");
equal(designBaseDescription("BB(버버리)-88 코트 · 없음", ["없음"]), "코트 · 없음", "빈 옵션 센티널은 색상으로 치지 않는다");

// ── 7. 기존 그룹 보존 + 중복 멤버 차단 ────────────────────────────────────
{
  const existing = [{ id: "design-1", members: [D.b404, D.b405] }];
  const merged = appendDesignGroups(existing, [{ id: "design-2", members: [D.b401, D.b402, D.b403] }]);
  equal(merged.length, 2, "기존 그룹 보존 + 새 그룹 추가");
  equal(merged[0].id, "design-1", "기존 그룹이 앞에 그대로");
  equal(merged[1].members.length, 3, "새 그룹 3개");

  let blocked = false;
  try { appendDesignGroups(existing, [{ id: "x", members: [D.b404, D.b401] }]); } catch { blocked = true; }
  assert(blocked, "이미 다른 묶음에 있는 상품을 또 넣으면 막아야 한다");

  equal(appendDesignGroups(existing, [{ id: "y", members: [D.b401] }]).length, 1, "멤버 1개짜리 묶음은 무시");

  const dupId = appendDesignGroups(existing, [{ id: "design-1", members: [D.b401, D.b402] }]);
  equal(dupId.length, 2, "id가 겹쳐도 추가는 된다");
  assert(dupId[1].id !== "design-1", "겹치는 id는 자동으로 바꾼다");
}

console.log("design group suggest tests passed");
