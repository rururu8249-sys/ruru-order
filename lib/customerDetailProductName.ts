export const CUSTOMER_DETAIL_NAME_SEPARATOR = " · ";
export const CUSTOMER_DETAIL_NAME_MAX_LENGTH = 80;

function parseProductNote(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function normalizeCustomerDetailName(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CUSTOMER_DETAIL_NAME_MAX_LENGTH);
}

export function customerDetailInputEnabled(rawNote: unknown): boolean {
  const note = parseProductNote(rawNote);
  if (note.customer_detail_input_enabled !== true) return false;

  // 기존 조합형/브랜드 대표상품은 orders.product_name 자체가 재고 세부상품 식별자다.
  // 고객 자유입력으로 덮으면 재고 매칭이 깨질 수 있으므로 이 모드에서는 절대 켜지 않는다.
  if (note.combo_mode === true) return false;

  const brandGroup =
    note.brand_group && typeof note.brand_group === "object" && !Array.isArray(note.brand_group)
      ? (note.brand_group as Record<string, unknown>)
      : null;
  if (brandGroup?.enabled === true) return false;

  return true;
}

export function buildCustomerDetailProductName(baseProductName: unknown, customerDetail: unknown): string {
  const base = String(baseProductName ?? "").replace(/\s+/g, " ").trim();
  const detail = normalizeCustomerDetailName(customerDetail);
  if (!base || !detail) return "";
  return `${base}${CUSTOMER_DETAIL_NAME_SEPARATOR}${detail}`;
}

export function extractCustomerDetailName(baseProductName: unknown, storedProductName: unknown): string {
  const base = String(baseProductName ?? "").replace(/\s+/g, " ").trim();
  const stored = String(storedProductName ?? "").replace(/\s+/g, " ").trim();
  if (!base || !stored) return "";

  const prefix = `${base}${CUSTOMER_DETAIL_NAME_SEPARATOR}`;
  if (!stored.startsWith(prefix)) return "";

  return normalizeCustomerDetailName(stored.slice(prefix.length));
}

export function canonicalCustomerDetailProductName(
  baseProductName: unknown,
  submittedProductName: unknown,
): string {
  const detail = extractCustomerDetailName(baseProductName, submittedProductName);
  return detail ? buildCustomerDetailProductName(baseProductName, detail) : "";
}
