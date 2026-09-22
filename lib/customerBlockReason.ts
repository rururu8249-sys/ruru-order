// ═══ 차단사유 «유형 + 거파 품목 + 메모» — 2026-09-22 신설 ═══
//
//   사장님: 「거파 했을때 뭘 거파했는지 고르기 쉽게 할 수있으면 좋을거 같아」
//           「내용이 뭔지 안보여 차단목록을 눌렀을때만 내용이 보이고 몇월 몇일차단했는지도」
//
//   예전에는 차단사유가 자유 입력 한 칸이라, 사장님이 상품명을 손으로 옮겨 적고
//   끝에 「거파」라고 붙이셨다. 그래서 차단목록에서 한 덩어리로 뭉쳐 읽히지 않았다.
//
//   ⚠ DB는 안 고친다. 저장 칸은 그대로 customers.block_reason /
//     customer_phone_blocks.reason 텍스트 한 칸이고, 그 «안의 생김새»만 약속한다.
//     그래서 SQL 실행이 필요 없고, 옛 자유 텍스트도 그대로 읽힌다(메모로 취급).
//
//   ⚠ 구분자로 「·」를 쓰지 않는다 — 옵션 구분 가드 기준상 「· / |」는 상품 이름의 일부다
//     (scripts/guard-option-split.js). 품목은 «줄바꿈»으로 나눈다.
//
//   저장 생김새:
//     [거래파기(거파)]
//     · 노다001신더 (235) ×1 79,000원
//     · 젤NYC 오이스터그레이 (화이트/265) ×1 68,000원
//     메모: 연락 두절
//
//   ⚠ 차단사유는 «관리자 전용»이다. 손님 화면은 고정 문구(CustomerBlockedNotice)만 띄우고
//     사유를 보여주지 않는다. 그래도 /api/customer-block-check 응답에는 들어가므로
//     손님이 봐선 안 될 말은 적지 않는 게 안전하다.

export type BlockReasonType =
  | "deal_break"
  | "unpaid"
  | "refund_abuse"
  | "harassment"
  | "fake_info"
  | "custom";

/** 유형 버튼 — 사장님이 실제로 쓰시는 말 기준. 라벨을 고치면 옛 기록은 «직접 입력»으로 읽힌다. */
export const BLOCK_REASON_TYPES: { type: BlockReasonType; label: string; picksItems: boolean; hint: string }[] = [
  { type: "deal_break",   label: "거래파기(거파)",     picksItems: true,  hint: "주문해놓고 입금 안 하고 잠수" },
  { type: "unpaid",       label: "반복 미입금",         picksItems: true,  hint: "여러 번 미입금으로 끝남" },
  { type: "refund_abuse", label: "반품·환불 악용",      picksItems: true,  hint: "입고 반품·트집 환불 반복" },
  { type: "harassment",   label: "악성문의·진상",       picksItems: false, hint: "폭언·무리한 요구" },
  { type: "fake_info",    label: "주소·연락처 허위",    picksItems: false, hint: "가짜 주소·번호로 주문" },
  { type: "custom",       label: "직접 입력",           picksItems: false, hint: "위에 없는 경우" },
];

export function blockReasonTypeLabel(type: BlockReasonType): string {
  return BLOCK_REASON_TYPES.find((t) => t.type === type)?.label || "직접 입력";
}

/** 이 유형이 «무엇을 거파했는지» 품목 고르기를 보여줘야 하는가 */
export function blockReasonPicksItems(type: BlockReasonType | null): boolean {
  if (!type) return false;
  return Boolean(BLOCK_REASON_TYPES.find((t) => t.type === type)?.picksItems);
}

export type BlockReasonParts = {
  /** 아는 유형이면 그 값, 옛 자유 텍스트면 null */
  type: BlockReasonType | null;
  /** 화면에 띄울 유형 이름. 모르는 [대괄호] 라벨이면 그 글자 그대로. */
  label: string;
  /** 거파 품목들 */
  items: string[];
  /** 한 줄 메모(옛 자유 텍스트는 통째로 여기로 들어온다) */
  memo: string;
};

const ITEM_PREFIX = "· ";
const MEMO_PREFIX = "메모: ";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

/** 저장할 문자열을 만든다. 형식이 깨지지 않게 품목·메모의 줄바꿈은 지운다. */
export function buildBlockReason(input: {
  type: BlockReasonType | null;
  items?: string[];
  memo?: string;
}): string {
  const lines: string[] = [];

  if (input.type) lines.push(`[${blockReasonTypeLabel(input.type)}]`);

  for (const raw of input.items || []) {
    const item = clean(raw).replace(/[\r\n]+/g, " ");
    if (item) lines.push(`${ITEM_PREFIX}${item}`);
  }

  const memo = clean(input.memo).replace(/[\r\n]+/g, " ");
  if (memo) lines.push(`${MEMO_PREFIX}${memo}`);

  return lines.join("\n");
}

/** 저장된 문자열을 읽는다. 옛 자유 텍스트도 «메모만 있는 차단»으로 안전하게 읽힌다. */
export function parseBlockReason(raw: unknown): BlockReasonParts {
  const text = String(raw ?? "").replace(/\r\n/g, "\n").trim();

  if (!text) return { type: null, label: "", items: [], memo: "" };

  const lines = text.split("\n");
  let type: BlockReasonType | null = null;
  let label = "";
  const items: string[] = [];
  const memoLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;

    // 첫 줄의 [대괄호]만 유형으로 본다 — 메모 안의 대괄호가 유형으로 둔갑하면 안 된다
    if (index === 0) {
      const matched = line.match(/^\[(.+)\]$/);
      if (matched) {
        label = matched[1].trim();
        type = BLOCK_REASON_TYPES.find((t) => t.label === label)?.type ?? "custom";
        continue;
      }
    }

    if (line.startsWith(ITEM_PREFIX)) {
      const item = line.slice(ITEM_PREFIX.length).trim();
      if (item) items.push(item);
      continue;
    }

    if (line.startsWith(MEMO_PREFIX)) {
      const memo = line.slice(MEMO_PREFIX.length).trim();
      if (memo) memoLines.push(memo);
      continue;
    }

    memoLines.push(line);
  }

  return { type, label, items, memo: memoLines.join(" ") };
}

/** 차단목록 접힌 줄에 쓸 한 줄 요약 — 품목이 있으면 첫 품목 + 「외 N개」 */
export function blockReasonSummary(raw: unknown): string {
  const parts = parseBlockReason(raw);

  if (parts.items.length > 0) {
    const head = parts.items[0];
    const rest = parts.items.length - 1;
    return rest > 0 ? `${head} 외 ${rest}개` : head;
  }

  return parts.memo || parts.label || "";
}
