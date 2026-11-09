// lib/presenceActivity.ts
// [2026-11-09 사장님 「지금 접속 — 누가 뭐 하는지 실시간으로 제대로」] 손님 화면이 «지금 뭘 하는지»를 접속 신호에 얹는다.
// [2026-11-09 18:12 사장님 「일거수 일투족을 알고 싶다 — 너무 뭉뚱그린다」] 마지막 동작 하나 → «최근 동작 목록(타임라인)».
//   손님 쪽: logPresenceEvent(종류, 라벨) → 브라우저 저장(최근 30개·편의값) + 이벤트 → PresenceHeartbeat 가 «기존 신호 한 번»에 같이 실어 보냄
//            (요청 수는 그대로 — 3초 묶음/30초). 서버는 사람당 한 칸(activity_log JSON)에 덮어씀 → DB 줄 수도 그대로.
//   관리자 쪽: presenceActivityText 로 사람말. 돈·주문·장바구니 로직과 무관(표시 전용).

export const PRESENCE_ACTIVITY_KINDS = [
  "browse",      // 상품 보는 중(기본)
  "option",      // 옵션 창 열기 · 상품명
  "detail",      // 세부상품 고름(브랜드 묶음) · 세부상품명
  "color",       // 색상 고름
  "size",        // 사이즈 고름
  "qty",         // 수량 바꿈 · N개
  "cart",        // 장바구니에 담음 · 상품명
  "cart_remove", // 장바구니에서 뺌 · 상품명
  "sheet",       // 주문서 열기
  "sheet_close", // 주문서 닫기(제출 없이)
  "search",      // 상품 검색 · 검색어
  "submitted",   // 주문 완료
  "lookup",      // 주문조회 화면
] as const;
export type PresenceActivityKind = (typeof PRESENCE_ACTIVITY_KINDS)[number];
export type PresenceActivity = { kind: PresenceActivityKind; label: string; at: number };
/** 신호에 실리는 짧은 모양(글자 수 절약): k=종류 l=라벨 at=시각(ms) */
export type PresenceEvent = { k: PresenceActivityKind; l: string; at: number };

export const PRESENCE_ACTIVITY_STORAGE_KEY = "ruru_presence_activity";
export const PRESENCE_LOG_STORAGE_KEY = "ruru_presence_log";
export const PRESENCE_ACTIVITY_EVENT = "ruru-presence-activity";
/** 이보다 오래된 활동은 «지금 상태»로 안 씀(화면만 켜 둔 손님을 「옵션 고르는 중」으로 오래 보이지 않게) */
export const PRESENCE_ACTIVITY_MAX_AGE_MS = 10 * 60 * 1000;
/** 타임라인에 남기는 동작 — 최근 30개 · 3시간 안 */
export const PRESENCE_LOG_MAX = 30;
export const PRESENCE_LOG_MAX_AGE_MS = 3 * 60 * 60 * 1000;
export const PRESENCE_ACTIVITY_LABEL_MAX = 80;
/** 같은 동작(종류+라벨)이 이 시간 안에 또 오면 한 줄로 합침 */
export const PRESENCE_LOG_DEDUP_MS = 10 * 1000;

const KIND_SET = new Set<string>(PRESENCE_ACTIVITY_KINDS);
const cutLabel = (v: unknown) => String(v ?? "").trim().slice(0, PRESENCE_ACTIVITY_LABEL_MAX);

export function normalizePresenceActivity(raw: unknown): PresenceActivity | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = String(o.kind ?? "").trim();
  if (!KIND_SET.has(kind)) return null;
  const at = Number(o.at);
  return { kind: kind as PresenceActivityKind, label: cutLabel(o.label), at: Number.isFinite(at) ? at : 0 };
}

/** 신호로 온 동작 목록 정리(서버·테스트 공용): 종류 화이트리스트·라벨 80자·시각 숫자·최근 30개·시각 오름차순·같은 동작 10초 안 연속 중복 제거 */
export function normalizePresenceEvents(raw: unknown, now = Date.now()): PresenceEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: PresenceEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const k = String(o.k ?? o.kind ?? "").trim();
    if (!KIND_SET.has(k)) continue;
    const at = Number(o.at);
    if (!Number.isFinite(at) || at <= 0 || at > now + 60_000 || now - at > PRESENCE_LOG_MAX_AGE_MS) continue;
    out.push({ k: k as PresenceActivityKind, l: cutLabel(o.l ?? o.label), at: Math.round(at) });
  }
  out.sort((a, b) => a.at - b.at);
  const dedup: PresenceEvent[] = [];
  for (const e of out) {
    const prev = dedup[dedup.length - 1];
    // 같은 동작이 10초 안에 또 오면 하나로(사이즈 3 → 사이즈 3 두 번 눌림 등) — 사장님 18:34
    if (prev && prev.k === e.k && prev.l === e.l && e.at - prev.at < PRESENCE_LOG_DEDUP_MS) { prev.at = e.at; continue; }
    dedup.push(e);
  }
  return dedup.slice(-PRESENCE_LOG_MAX);
}

/** 관리자 화면 사람말. label 없으면 종류만. */
export function presenceActivityText(kind: string, label: string): string {
  const l = String(label || "").trim();
  switch (kind) {
    case "option": return l ? `옵션 고르는 중 · ${l}` : "옵션 고르는 중";
    case "detail": return l ? `세부상품 고름 · ${l}` : "세부상품 고름";
    case "color": return l ? `색상 ${l} 고름` : "색상 고름";
    case "size": return l ? `사이즈 ${l} 고름` : "사이즈 고름";
    case "qty": return l ? `수량 ${l}개` : "수량 바꿈";
    case "cart": return l ? `담았어요 · ${l}` : "장바구니에 담았어요";
    case "cart_remove": return l ? `장바구니에서 뺌 · ${l}` : "장바구니에서 뺌";
    case "sheet": return "주문서 확인 중";
    case "sheet_close": return "주문서 닫음(제출 안 함)";
    case "search": return l ? `검색 「${l}」` : "상품 검색";
    case "submitted": return l ? `주문 완료 · ${l}` : "주문 완료";
    case "lookup": return "주문조회 중";
    case "browse":
    default: return "상품 보는 중";
  }
}

function readLogRaw(): PresenceEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PRESENCE_LOG_STORAGE_KEY);
    return raw ? normalizePresenceEvents(JSON.parse(raw)) : [];
  } catch { return []; }
}

/** 손님 화면 전용 — 동작 하나를 타임라인에 추가 + 지금 상태 저장 + 이벤트(하트비트가 바로 보냄). 서버·테스트에선 아무것도 안 함. */
export function logPresenceEvent(kind: PresenceActivityKind, label = ""): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const value: PresenceActivity = { kind, label: cutLabel(label), at: now };
  try { window.localStorage.setItem(PRESENCE_ACTIVITY_STORAGE_KEY, JSON.stringify(value)); } catch { /* 편의값 — 실패 무시 */ }
  try {
    const next = normalizePresenceEvents([...readLogRaw(), { k: kind, l: value.label, at: now }], now);
    window.localStorage.setItem(PRESENCE_LOG_STORAGE_KEY, JSON.stringify(next));
  } catch { /* 무시 */ }
  try { window.dispatchEvent(new CustomEvent(PRESENCE_ACTIVITY_EVENT, { detail: value })); } catch { /* 무시 */ }
}

/** 예전 이름 — logPresenceEvent 와 같다(기존 호출 4곳 유지) */
export const setPresenceActivity = logPresenceEvent;

/** 하트비트가 읽는 «지금 상태» — 너무 오래된 건 null */
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

/** 하트비트가 읽는 «최근 동작 목록»(3시간 안·30개) */
export function readPresenceEvents(now = Date.now()): PresenceEvent[] {
  return normalizePresenceEvents(readLogRaw(), now);
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
