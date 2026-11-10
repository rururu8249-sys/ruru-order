// Site: 100% = 20px; both controls advance one percentage point at a time.
export const CHAT_FONT_SIZES = Array.from({ length: 111 }, (_, i) => (60 + i) / 5);
export const CHAT_YT_SCALES = Array.from({ length: 121 }, (_, i) => (80 + i) / 100);
export const CHAT_FONT_KEY = "ruru_chat_view_font_px";
export const CHAT_YT_SCALE_KEY = "ruru_chat_view_yt_scale";

/** New preferences store the actual size. Old indices keep their original meaning. */
export function readChatViewSizeIndex(storage: Pick<Storage, "getItem">, kind: "site" | "yt", compact: boolean): number {
  const site = kind === "site";
  const values = site ? CHAT_FONT_SIZES : CHAT_YT_SCALES;
  const fallback = values.indexOf(site ? (compact ? 16 : 20) : (compact ? 1 : 1.5));
  try {
    const raw = storage.getItem(site ? CHAT_FONT_KEY : CHAT_YT_SCALE_KEY);
    const index = raw === null ? -1 : values.indexOf(Number(raw));
    if (index >= 0) return index;
    const old = storage.getItem(site ? "ruru_chat_view_size" : "ruru_chat_view_yt_size");
    const oldIndex = Number(old);
    const legacy = site ? [16, 18, 20, 23, 26, 30, 34] : [1, 1.15, 1.3, 1.5, 1.75, 2];
    if (old !== null && Number.isInteger(oldIndex) && oldIndex >= 0 && oldIndex < legacy.length) return values.indexOf(legacy[oldIndex]);
  } catch { /* Storage unavailable: keep a usable default. */ }
  return fallback;
}
