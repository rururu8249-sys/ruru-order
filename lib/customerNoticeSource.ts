export const CUSTOMER_NOTICE_ID_KEY = "popup_notice_id";
type Setting = { key: string; value: unknown };
type PublicNotice = { id: number; title: string; content: string; is_visible: boolean };
export type CustomerNoticeContent = {
  title: string; text: string; bar: string; linked: boolean; available: boolean;
};

/** A linked notice is the source of truth. Never fall back to stale legacy text on a failed read. */
export async function resolveCustomerNotice(
  rows: readonly Setting[],
  readPublicNotice: (id: number) => Promise<PublicNotice | null>,
): Promise<CustomerNoticeContent> {
  const get = (key: string) => String(rows.find(row => row.key === key)?.value ?? "");
  const rawId = get(CUSTOMER_NOTICE_ID_KEY).trim();
  if (!rawId) {
    const title = get("popup_notice_title");
    const text = get("popup_notice_text");
    const bar = get("popup_notice_bar");
    return { title, text, bar, linked: false, available: Boolean((title + text + bar).trim()) };
  }
  const unavailable: CustomerNoticeContent = { title: "", text: "", bar: "", linked: true, available: false };
  const id = Number(rawId);
  if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(id) || id <= 0) return unavailable;
  try {
    const notice = await readPublicNotice(id);
    if (!notice || notice.id !== id || notice.is_visible !== true) return unavailable;
    return { title: notice.title, text: notice.content, bar: notice.title, linked: true, available: true };
  } catch {
    return unavailable;
  }
}
