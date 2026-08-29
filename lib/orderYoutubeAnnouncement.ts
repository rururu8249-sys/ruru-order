type AnyOrderRow = Record<string, unknown>;

const EMPTY_OPTION_WORDS = new Set(["", "없음", "없슴", "무", "-", "none", "n/a", "na", "null", "undefined"]);
const ORDER_AXIS_JOIN = " / ";

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function meaningful(value: unknown): string {
  const v = text(value);
  return EMPTY_OPTION_WORDS.has(v.toLowerCase()) ? "" : v;
}

function won(value: unknown): string {
  const n = Math.max(0, Math.floor(Number(value ?? 0) || 0));
  return `${n.toLocaleString("ko-KR")}원`;
}

function qtyOf(row: AnyOrderRow): number {
  return Math.max(1, Math.floor(Number(row.qty ?? row.quantity ?? 1) || 1));
}

function itemAmountOf(row: AnyOrderRow): number {
  const adjustedUnit = Number(row.adjusted_product_price);
  const unit = Number.isFinite(adjustedUnit) && adjustedUnit >= 0
    ? Math.floor(adjustedUnit)
    : Math.max(0, Math.floor(Number(row.product_price ?? 0) || 0));
  return unit * qtyOf(row);
}

function splitCompositeOption(productName: string, rawColor: string): { option: string; color: string } {
  if (!rawColor.includes(ORDER_AXIS_JOIN)) return { option: "", color: meaningful(rawColor) };
  const parts = rawColor.split(ORDER_AXIS_JOIN).map((v) => meaningful(v)).filter(Boolean);
  if (parts.length < 2) return { option: "", color: meaningful(rawColor) };
  const first = parts[0];
  const looksLikeDetail = /(?:[A-Z]{1,6}(?:\([^)]*\))?[- ]?\d)|(?:\b\d{1,4}M?\b)/i.test(first);
  if (!looksLikeDetail) return { option: "", color: meaningful(rawColor) };
  const option = first === productName ? "" : first;
  return { option, color: parts.slice(1).join(ORDER_AXIS_JOIN) };
}

// [2026-08-29 사장님 요청] 채팅 문구 정리
//
// 예전 문구
//   🛒 주문완료 | 닉네임: 몽상가8277\n상품: BB(버버리)-78 트렌치코트 | 사이즈: 8 | 수량: 1 | 금액: 255,000원
//   → 유튜브 채팅은 줄바꿈을 지운다. 그래서 "몽상가8277상품:" 처럼 붙어버렸다.
//   → "닉네임:", "상품:", "수량:" 같은 딱지가 많아 읽기 어려웠다. 감사 인사도 없었다.
//
// 새 문구
//   🛒 몽상가8277님 주문 감사합니다! 💗 BB(버버리)-78 트렌치코트 · 사이즈 8 · 1개 · 255,000원
//   · 줄바꿈을 아예 쓰지 않는다 (붙어버리는 사고 원천 차단)
//   · 딱지를 빼고 가운뎃점으로 나눈다. 사이즈만 숫자와 헷갈리므로 "사이즈"를 남긴다
//   · 상품 여러 개면 " / " 로 잇고, 길면 [1/2] 로 나눠 보낸다

export function formatYoutubeOrderItem(row: AnyOrderRow): string {
  const productName = text(row.product_name) || "상품";
  const rawColor = meaningful(row.color);
  const { option, color } = splitCompositeOption(productName, rawColor);
  const size = meaningful(row.size);
  const title = [productName, option].filter(Boolean).join(" ");
  return [
    title,
    color || "",
    size ? `사이즈 ${size}` : "",
    `${qtyOf(row)}개`,
    won(itemAmountOf(row)),
  ].filter(Boolean).join(" · ");
}

function splitExact(textValue: string, max: number): string[] {
  if (textValue.length <= max) return [textValue];
  const out: string[] = [];
  let rest = textValue;
  while (rest.length > max) {
    let cut = max;
    const candidates = [rest.lastIndexOf(" · ", max), rest.lastIndexOf(" ", max)];
    const best = Math.max(...candidates);
    if (best >= Math.floor(max * 0.55)) cut = best;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).replace(/^\s*[·|]?\s*/, "").trim();
  }
  if (rest) out.push(rest);
  return out;
}

export function buildYoutubeOrderAnnouncementMessages(opts: {
  nickname: string;
  rows: AnyOrderRow[];
  maxChars?: number;
}): string[] {
  const maxChars = Math.max(100, Math.min(200, Math.floor(Number(opts.maxChars ?? 180) || 180)));
  const nickname = text(opts.nickname) || "고객";
  const thanks = `🛒 ${nickname}님 주문 감사합니다! 💗`;

  const items = (Array.isArray(opts.rows) ? opts.rows : [])
    .map(formatYoutubeOrderItem)
    .filter(Boolean);

  if (items.length === 0) return [`${thanks} 주문내역 확인 부탁드려요`].map((m) => m.slice(0, maxChars));

  // 번호표([1/2])가 붙을 수 있으므로 그 자리를 미리 빼놓고 담는다.
  const roomWithTag = maxChars - thanks.length - 8;
  const groups: string[][] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const item of items) {
    // 상품 하나가 통째로 길면 그것만 잘라 담는다.
    const pieces = item.length > roomWithTag ? splitExact(item, roomWithTag) : [item];
    for (const piece of pieces) {
      const add = current.length === 0 ? piece.length : piece.length + 3; // " / "
      if (current.length > 0 && currentLen + add > roomWithTag) {
        groups.push(current);
        current = [piece];
        currentLen = piece.length;
      } else {
        current.push(piece);
        currentLen += add;
      }
    }
  }
  if (current.length > 0) groups.push(current);

  const total = groups.length;
  return groups.map((group, index) => {
    const tag = total > 1 ? ` [${index + 1}/${total}]` : "";
    // 줄바꿈을 쓰지 않는다 — 유튜브 채팅이 지워버려 글자가 붙는다.
    return `${thanks}${tag} ${group.join(" / ")}`.replace(/\s+/g, " ").trim().slice(0, maxChars);
  });
}
