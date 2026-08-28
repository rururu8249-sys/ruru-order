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

export function formatYoutubeOrderItem(row: AnyOrderRow): string {
  const productName = text(row.product_name) || "상품";
  const rawColor = meaningful(row.color);
  const { option, color } = splitCompositeOption(productName, rawColor);
  const size = meaningful(row.size);
  const fields = [
    `상품: ${productName}`,
    option ? `옵션: ${option}` : "",
    color ? `색상: ${color}` : "",
    size ? `사이즈: ${size}` : "",
    `수량: ${qtyOf(row)}`,
    `금액: ${won(itemAmountOf(row))}`,
  ].filter(Boolean);
  return fields.join(" | ");
}

function splitExact(textValue: string, max: number): string[] {
  if (textValue.length <= max) return [textValue];
  const out: string[] = [];
  let rest = textValue;
  while (rest.length > max) {
    let cut = max;
    const candidates = [rest.lastIndexOf(" | ", max), rest.lastIndexOf(" ", max)];
    const best = Math.max(...candidates);
    if (best >= Math.floor(max * 0.55)) cut = best;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).replace(/^\s*\|?\s*/, "").trim();
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
  const baseHeader = `🛒 주문완료 | 닉네임: ${nickname}`;
  const bodyLimit = Math.max(40, maxChars - baseHeader.length - 14);
  const segments = (Array.isArray(opts.rows) ? opts.rows : [])
    .map(formatYoutubeOrderItem)
    .filter(Boolean)
    .flatMap((line) => splitExact(line, bodyLimit));

  if (segments.length === 0) return [`${baseHeader} | 주문내역 확인`].map((m) => m.slice(0, maxChars));

  const bodies: string[] = [];
  let current = "";
  for (const seg of segments) {
    const next = current ? `${current}\n${seg}` : seg;
    if (next.length <= bodyLimit) current = next;
    else {
      if (current) bodies.push(current);
      current = seg;
    }
  }
  if (current) bodies.push(current);

  const total = bodies.length;
  return bodies.flatMap((body, index) => {
    const header = total > 1 ? `${baseHeader} [${index + 1}/${total}]` : baseHeader;
    const full = `${header}\n${body}`;
    return full.length <= maxChars ? [full] : splitExact(full, maxChars);
  });
}
