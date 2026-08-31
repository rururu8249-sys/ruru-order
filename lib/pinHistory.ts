// ── [2026-08-31 사장님 요청] 고정 기록 — 자주 고정하는 상품 원클릭 목록 ──
//   고정할 때마다 이 컴퓨터(localStorage)에 기록을 남기고, 자주 고정한 순서로 돌려준다.
//   표시 전용 — 방송/상품/주문/돈 데이터는 일절 변경하지 않는다. 기록 실패해도 고정은 정상.

const PIN_HISTORY_KEY = "ruru_pin_history_v1";
const MAX_ENTRIES = 30;

export type PinHistoryEntry = {
  productId: string;
  detailName: string; // 3단 세부상품이면 세부상품명, 아니면 ""
  label: string;      // 칩에 보여줄 이름
  count: number;      // 고정 누적 횟수
  lastAt: number;     // 마지막 고정 시각(ms)
};

function readRaw(): PinHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PIN_HISTORY_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e === "object" && String((e as PinHistoryEntry).productId || "").trim())
      .map((e) => ({
        productId: String((e as PinHistoryEntry).productId),
        detailName: String((e as PinHistoryEntry).detailName || ""),
        label: String((e as PinHistoryEntry).label || ""),
        count: Number((e as PinHistoryEntry).count) || 1,
        lastAt: Number((e as PinHistoryEntry).lastAt) || 0,
      }));
  } catch {
    return [];
  }
}

export function recordPinHistory(input: { productId: string; detailName?: string; label: string }) {
  if (typeof window === "undefined") return;
  try {
    const productId = String(input.productId || "").trim();
    if (!productId) return;
    const detailName = String(input.detailName || "").trim();
    const list = readRaw();
    const idx = list.findIndex((e) => e.productId === productId && e.detailName === detailName);
    if (idx >= 0) {
      list[idx] = { ...list[idx], label: input.label || list[idx].label, count: list[idx].count + 1, lastAt: Date.now() };
    } else {
      list.push({ productId, detailName, label: String(input.label || "").trim() || "상품", count: 1, lastAt: Date.now() });
    }
    // 오래 안 쓴 것부터 정리 — 자주 고정(횟수) 우선 보존
    list.sort((a, b) => b.count - a.count || b.lastAt - a.lastAt);
    window.localStorage.setItem(PIN_HISTORY_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
  } catch {
    /* 기록은 보조 기능 — 실패해도 고정 동작엔 영향 없음 */
  }
}

// 자주 고정한 순(횟수 → 최근) 상위 limit개
export function readPinHistory(limit = 8): PinHistoryEntry[] {
  return readRaw()
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .slice(0, limit);
}
