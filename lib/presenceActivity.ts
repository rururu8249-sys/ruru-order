// lib/presenceActivity.ts
// [2026-11-09 사장님 「지금 접속 — 누가 뭐 하는지 실시간으로 제대로」] 손님 화면이 «지금 뭘 하는지»를 접속 신호에 얹는다.
//   손님 쪽: setPresenceActivity(종류, 라벨) → 브라우저 저장(편의값) + 이벤트 → PresenceHeartbeat 가 바로 보냄.
//   관리자 쪽: presenceActivityText 로 사람말. 돈·주문·장바구니 로직과 무관(표시 전용).

export const PRESENCE_ACTIVITY_KINDS = ["browse", "option", "cart", "sheet", "submitted", "lookup"] as const;
export type PresenceActivityKind = (typeof PRESENCE_ACTIVITY_KINDS)[number];
export type PresenceActivity = { kind: PresenceActivityKind; label: string; at: number };

export const PRESENCE_ACTIVITY_STORAGE_KEY = "ruru_presence_activity";
export const PRESENCE_ACTIVITY_EVENT = "ruru-presence-activity";
/** 이보다 오래된 활동은 안 보냄(화면만 켜 둔 손님을 「옵션 고르는 중」으로 오래 보이지 않게) */
export const PRESENCE_ACTIVITY_MAX_AGE_MS = 10 * 60 * 1000;
export const PRESENCE_ACTIVITY_LABEL_MAX = 80;

const KIND_SET = new Set<string>(PRESENCE_ACTIVITY_KINDS);

export function normalizePresenceActivity(raw: unknown): PresenceActivity | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = String(o.kind ?? "").trim();
  if (!KIND_SET.has(kind)) return null;
  const at = Number(o.at);
  return { kind: kind as PresenceActivityKind, label: String(o.label ?? "").trim().slice(0, PRESENCE_ACTIVITY_LABEL_MAX), at: Number.isFinite(at) ? at : 0 };
}

/** 관리자 화면 사람말. label 없으면 종류만. */
export function presenceActivityText(kind: string, label: string): string {
  const l = String(label || "").trim();
  switch (kind) {
    case "option": return l ? `옵션 고르는 중 · ${l}` : "옵션 고르는 중";
    case "cart": return l ? `담았어요 · ${l}` : "장바구니에 담았어요";
    case "sheet": return "주문서 확인 중";
    case "submitted": return l ? `주문 완료 · ${l}` : "주문 완료";
    case "lookup": return "주문조회 중";
    case "browse":
    default: return "상품 보는 중";
  }
}

/** 손님 화면 전용 — 저장 + 이벤트(하트비트가 바로 보냄). 서버·테스트에선 아무것도 안 함. */
export function setPresenceActivity(kind: PresenceActivityKind, label = ""): void {
  if (typeof window === "undefined") return;
  const value: PresenceActivity = { kind, label: String(label || "").trim().slice(0, PRESENCE_ACTIVITY_LABEL_MAX), at: Date.now() };
  try { window.localStorage.setItem(PRESENCE_ACTIVITY_STORAGE_KEY, JSON.stringify(value)); } catch { /* 편의값 — 실패 무시 */ }
  try { window.dispatchEvent(new CustomEvent(PRESENCE_ACTIVITY_EVENT, { detail: value })); } catch { /* 무시 */ }
}

/** 하트비트가 읽는 값 — 너무 오래된 건 null */
export function readPresenceActivity(now = Date.now()): PresenceActivity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PRESENCE_ACTIVITY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = normalizePresenceActivity(JSON.parse(raw));
    if (!parsed || !parsed.at || now - parsed.at > PRESENCE_ACTIVITY_MAX_AGE_MS) return null;
    return parsed;
  } catch { return null; }
}

/** 관리자 목록 줄 한 줄 — 활동이 있으면 활동, 없으면 화면 이름(주문서 작성중 등). */
export function presenceStatusText(args: { pageType: string; pageLabel: string; activity: { kind: string; label: string; at: number } | null; now?: number }): string {
  const { pageType, pageLabel, activity } = args;
  const now = args.now ?? Date.now();
  if (pageType === "admin") return "관리자";
  if (activity && activity.at && now - activity.at <= PRESENCE_ACTIVITY_MAX_AGE_MS) return presenceActivityText(activity.kind, activity.label);
  if (pageType === "order_form") return "상품 보는 중";
  return pageLabel;
}
