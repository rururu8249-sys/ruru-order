// [2026-08-29] 같은디자인(색상만 다른 상품) 묶음 "후보" 판별 — 순수 계산. 표시/제안 전용.
//
// 왜 필요한가
//   브랜드 대표상품 안에 BB-401M 블랙 / BB-402M 브라운 / BB-403M 그레이 처럼
//   사진도 가격도 같고 색상만 다른 상품이 따로따로 나열된다. 손님은 같은 옷인 줄 모른다.
//   고객 화면의 묶음 UI(app/order/page.tsx)와 resolveDesignGroups()는 이미 만들어져 있고,
//   비어 있는 것은 product_note.design_groups 데이터뿐이다.
//   이 파일은 관리자가 "묶기" 화면에서 체크만 하면 되도록 후보를 계산해 준다. 저장은 하지 않는다.
//
// 반드시 지키는 원칙 (인계서 26장 「색상 추정 금지」)
//   - 자동 확정하지 않는다. 사람이 확인할 후보만 만든다.
//   - 색상이 저장돼 있지 않은 상품은 confident(확정 후보)에 절대 넣지 않는다.
//     같은 가격·같은 사이즈라도 실제로는 다른 디자인일 수 있다.
//     (실측 예: 버버리 39번 棉抽外套 와 40번 袖字母外套 는 둘 다 179,000원·같은 사이즈지만 다른 옷)
//   - 사진 URL은 판단에 쓰지 않는다. 엑셀 대량등록이 같은 원본 사진도 세부상품마다
//     따로 업로드해서 URL이 달라지기 때문(ExcelBulkImportPopup 의 uploadBlob).
//
// 의존성이 없는 순수 함수다. 호출부가 detailProducts(product) 결과를 그대로 넘기면 된다.
//   import { detailProducts, parseProductNote } from "@/lib/productDetailModel";
//   const details = detailProducts(product, { includeHidden: false });
//   const groups = Array.isArray(parseProductNote(product).design_groups) ? … : [];
//   const suggestion = suggestDesignGroups(details, groups.flatMap((g) => g.members ?? []));

export type DesignGroupSuggestInput = {
  detailName: string;
  code: string;
  price: number;
  colors: string[];
  sizes: string[];
};

export type DesignGroupCandidate = {
  id: string;
  members: string[];        // 세부상품명 (orders/재고키에 쓰이는 그 값 그대로)
  baseDescription: string;  // 코드·색상을 뺀 공통 상품 설명
  price: number;            // 실제 판매가 (대표가 + 추가금)
  sizes: string[];
  colors: string[];         // 확정 후보일 때만 채워짐
  codes: string[];
};

export type DesignGroupSuggestion = {
  // 색상이 전부 저장돼 있고 서로 달라서 바로 묶어도 되는 후보
  confident: DesignGroupCandidate[];
  // 같은 디자인으로 보이지만 색상이 없거나 겹쳐서 사람이 색상을 채워야 하는 후보
  needsColor: DesignGroupCandidate[];
};

export type DesignGroupRecord = { id: string; title?: string; members: string[] };

const CODE_HEAD = /^[A-Za-z]+(?:\([^)]*\))?-[0-9A-Za-z]+\s*/;
const EMPTY_OPTION = new Set(["", "없음", "없슴", "무", "-", "none", "n/a", "na"]);

function cleanValues(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((v) => String(v ?? "").trim()))].filter(
    (v) => !EMPTY_OPTION.has(v.toLowerCase()),
  );
}

// "BB(버버리)-401M 남성용 패딩 아우터 · 블랙" → "남성용 패딩 아우터"
//   코드 머리와, 그 상품에 실제로 저장된 색상으로 끝나는 꼬리표만 떼어낸다.
//   저장된 색상이 아닌 글자는 절대 색상으로 간주해 지우지 않는다(색상 추정 금지).
export function designBaseDescription(detailName: string, colors: string[] = []): string {
  let text = String(detailName || "").trim().replace(CODE_HEAD, "").trim();
  for (const color of cleanValues(colors)) {
    const escaped = color.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`\\s*[·・/\\-]?\\s*${escaped}\\s*$`, "i"), "").trim();
  }
  return text;
}

function alphaPrefix(code: string): string {
  const matched = String(code || "").match(/^([A-Za-z]+)/);
  return matched ? matched[1].toUpperCase() : "";
}

export function suggestDesignGroups(
  details: DesignGroupSuggestInput[],
  alreadyGroupedMembers: string[] = [],
): DesignGroupSuggestion {
  const already = new Set(alreadyGroupedMembers.map((m) => String(m ?? "").trim()).filter(Boolean));
  const pool = details.filter((detail) => !already.has(String(detail.detailName ?? "").trim()));

  // 같은 (설명 · 실제가 · 사이즈세트 · 코드 알파벳) 끼리 모은다.
  const buckets = new Map<string, DesignGroupSuggestInput[]>();
  for (const detail of pool) {
    const description = designBaseDescription(detail.detailName, detail.colors);
    if (!description) continue; // 설명이 없으면 근거가 약해 후보로 올리지 않는다
    const sizeKey = cleanValues(detail.sizes).slice().sort().join("");
    const key = [description, detail.price, sizeKey, alphaPrefix(detail.code)].join("");
    const bucket = buckets.get(key);
    if (bucket) bucket.push(detail);
    else buckets.set(key, [detail]);
  }

  const confident: DesignGroupCandidate[] = [];
  const needsColor: DesignGroupCandidate[] = [];

  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;

    const firstColors = bucket.map((detail) => cleanValues(detail.colors)[0] || "");
    const everyHasColor = firstColors.every(Boolean);
    const allColorsDistinct = new Set(firstColors).size === firstColors.length;

    const candidate: DesignGroupCandidate = {
      id: `design-${(alphaPrefix(bucket[0].code) || "x").toLowerCase()}-${bucket.map((d) => d.code).join("-")}`.slice(0, 120),
      members: bucket.map((detail) => detail.detailName),
      baseDescription: designBaseDescription(bucket[0].detailName, bucket[0].colors),
      price: bucket[0].price,
      sizes: cleanValues(bucket[0].sizes),
      colors: everyHasColor ? firstColors : [],
      codes: bucket.map((detail) => detail.code),
    };

    if (everyHasColor && allColorsDistinct) confident.push(candidate);
    else needsColor.push(candidate);
  }

  const byMembers = (a: DesignGroupCandidate, b: DesignGroupCandidate) =>
    b.members.length - a.members.length || a.members[0].localeCompare(b.members[0]);
  confident.sort(byMembers);
  needsColor.sort(byMembers);
  return { confident, needsColor };
}

// 확정한 후보를 product_note.design_groups 에 넣을 형태로 바꾼다.
// 기존 그룹은 그대로 두고 뒤에 붙이기만 한다(과거 데이터 보존).
export function appendDesignGroups(
  existingGroups: Array<{ id?: unknown; title?: unknown; members?: unknown }>,
  chosen: Array<{ id?: string; title?: string; members: string[] }>,
): DesignGroupRecord[] {
  const kept: DesignGroupRecord[] = (existingGroups ?? []).map((group, index) => ({
    id: String(group?.id || `design-${index + 1}`),
    ...(group?.title ? { title: String(group.title) } : {}),
    members: (Array.isArray(group?.members) ? group.members : [])
      .map((member) => String(member ?? "").trim())
      .filter(Boolean),
  }));
  const usedIds = new Set(kept.map((group) => group.id));
  const usedMembers = new Set(kept.flatMap((group) => group.members));

  for (const group of chosen ?? []) {
    const members = [...new Set((group.members ?? []).map((m) => String(m ?? "").trim()).filter(Boolean))];
    if (members.length < 2) continue;
    const clash = members.find((member) => usedMembers.has(member));
    if (clash) throw new Error(`이미 다른 묶음에 들어 있는 세부상품이 있어요: ${clash}`);
    let id = String(group.id || `design-${kept.length + 1}`);
    let suffix = 2;
    while (usedIds.has(id)) id = `${group.id || "design"}-${suffix++}`;
    usedIds.add(id);
    for (const member of members) usedMembers.add(member);
    kept.push({ id, ...(group.title ? { title: group.title } : {}), members });
  }
  return kept;
}
