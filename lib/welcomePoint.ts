// [2026-11-12 사장님 「그립처럼 처음 온 손님 선물」] 방송 시청 선물 포인트 — 순수 계산만(서버·화면 공용).
//   처음 오신 선물 = 결제완료 주문이 한 번도 없는 손님(카카오 계정·지금 전화번호 둘 다)
//   오랜만에 오신 선물 = 마지막 결제완료 주문이 N일 넘게 지난 손님(그 «잠든 기간»마다 한 번)
//   지급은 기존 관리자 포인트 지급 RPC(admin_change_customer_points) + 중복 방지 키(source_key)만 쓴다.

/** 포인트가 새로 들어왔을 때 화면들이 다시 읽게 하는 소식(선물 카드·주문서 포인트) */
export const POINT_GIFT_REFRESH_EVENT = "ruru-point-gift-refresh";

export type WelcomeKind = "first" | "back";

/** [2026-11-14 사장님 「30초 얼마 60초 얼마 구간」] 보는 시간 구간 — 구간마다 따로 한 번씩 지급(앞 구간부터 차례로) */
export type WelcomeTier = { sec: number; amount: number };
export const WELCOME_TIER_MAX = 3;

export type WelcomePointConfig = {
  /** amount = 첫 구간 금액(예전 값과 호환), tiers = 구간 목록(1~3개, 초 오름차순) */
  first: { on: boolean; amount: number; tiers: WelcomeTier[] };
  back: { on: boolean; amount: number; days: number; tiers: WelcomeTier[] };
  /** 예전 값: 방송을 몇 초 보면 들어오는지 — 지금은 구간이 없을 때 첫 구간 초로만 씀 */
  watchSec: number;
  /** 하루(한국 시간) 최대 지급 인원 — 넘으면 그날은 안 줌 */
  dailyCap: number;
};

export const WELCOME_POINT_DEFAULT: WelcomePointConfig = {
  first: { on: false, amount: 1000, tiers: [{ sec: 30, amount: 1000 }] },
  back: { on: false, amount: 1000, days: 90, tiers: [{ sec: 30, amount: 1000 }] },
  watchSec: 30, // 그립과 같음
  dailyCap: 30, // 손님 한 명은 늘 한 번뿐 — 이건 «하루 전체» 안전장치(설정 실수·악용 대비)
};

/** 서버가 받아들이는 범위 — 설정값이 이상해도 이 밖으로는 절대 안 줌 */
export const WELCOME_LIMITS = {
  amountMax: 10000,
  daysMin: 14,
  daysMax: 365,
  watchMax: 300,
  capMax: 500,
} as const;

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/** 구간 목록 정리 — 이상한 값은 범위 안으로, 초 겹치면 하나, 최대 3개. 없으면 예전 값(초·금액) 한 구간. */
export function parseWelcomeTiers(raw: unknown, fallbackSec: number, fallbackAmount: number): WelcomeTier[] {
  const out: WelcomeTier[] = [];
  if (Array.isArray(raw)) {
    for (const t of raw) {
      if (!t || typeof t !== "object") continue;
      const o = t as Record<string, unknown>;
      const sec = clampInt(o.sec, 0, WELCOME_LIMITS.watchMax, -1);
      const amount = clampInt(o.amount, 0, WELCOME_LIMITS.amountMax, -1);
      if (sec < 0 || amount < 0) continue;
      if (out.some((x) => x.sec === sec)) continue;
      out.push({ sec, amount });
    }
  }
  out.sort((a, b) => a.sec - b.sec);
  const list = out.slice(0, WELCOME_TIER_MAX);
  return list.length ? list : [{ sec: fallbackSec, amount: fallbackAmount }];
}

export function parseWelcomePointConfig(raw: unknown): WelcomePointConfig {
  let v: unknown = raw;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const f = (o.first && typeof o.first === "object" ? o.first : {}) as Record<string, unknown>;
  const b = (o.back && typeof o.back === "object" ? o.back : {}) as Record<string, unknown>;
  const D = WELCOME_POINT_DEFAULT;
  const watchSec = clampInt(o.watchSec, 0, WELCOME_LIMITS.watchMax, D.watchSec);
  const fTiers = parseWelcomeTiers(f.tiers, watchSec, clampInt(f.amount, 0, WELCOME_LIMITS.amountMax, D.first.amount));
  const bTiers = parseWelcomeTiers(b.tiers, watchSec, clampInt(b.amount, 0, WELCOME_LIMITS.amountMax, D.back.amount));
  return {
    first: { on: f.on === true, amount: fTiers[0].amount, tiers: fTiers },
    back: {
      on: b.on === true,
      amount: bTiers[0].amount,
      days: clampInt(b.days, WELCOME_LIMITS.daysMin, WELCOME_LIMITS.daysMax, D.back.days),
      tiers: bTiers,
    },
    watchSec,
    dailyCap: clampInt(o.dailyCap, 1, WELCOME_LIMITS.capMax, D.dailyCap),
  };
}

export const WELCOME_REASON: Record<WelcomeKind, string> = {
  first: "처음 오신 선물",
  back: "오랜만에 오신 선물",
};

export type PaidHistory = {
  /** 결제완료 주문서 수(테스트·취소·삭제 제외) */
  paidCount: number;
  /** 마지막 결제완료 주문 시각(ISO) */
  lastPaidAt: string | null;
  /** 마지막 결제완료 주문서 묶음 키(잠든 기간마다 한 번 주기용) */
  lastPaidKey: string | null;
};

/** sourceKey = 첫 구간 키(예전과 같음). tiers = 이 선물의 구간들. */
export type WelcomeDecision = { kind: WelcomeKind; amount: number; sourceKey: string; tiers: WelcomeTier[] } | null;

/** 구간 i 의 중복 방지 키 — 첫 구간은 예전 키 그대로(이미 받은 손님은 다시 못 받음), 둘째부터 #2·#3 */
export function welcomeTierKey(baseKey: string, index: number): string {
  return index <= 0 ? baseKey : `${baseKey}#${index + 1}`;
}

/** [2026-11-13 사장님 12:04 「가입 직후만」] 처음 오신 선물 = 카카오로 처음 가입한 지 이 시간 안 + 결제 0번. */
export const WELCOME_FIRST_JOIN_HOURS = 24;
/** [2026-11-13 12:16 사장님 예외] 2026-11-01 ~ 2026-11-13(한국 시간) 사이 처음 가입한 손님은 24시간이 지나도 «신규»(결제 0번이면). */
export const WELCOME_FIRST_GRACE_FROM = Date.parse("2026-11-01T00:00:00+09:00");
export const WELCOME_FIRST_GRACE_TO = Date.parse("2026-11-14T00:00:00+09:00");

/** 누가 어떤 선물을 받을 수 있는지. customerId = customers.id(카카오 계정), joinedAt = 처음 가입 시각(모르면 처음 선물 안 줌). */
export function decideWelcome(cfg: WelcomePointConfig, customerId: string, h: PaidHistory, nowMs: number, joinedAt?: string | null): WelcomeDecision {
  const id = String(customerId || "").trim();
  if (!id) return null;
  if (h.paidCount <= 0) {
    if (!cfg.first.on || cfg.first.amount <= 0) return null;
    const joined = Date.parse(String(joinedAt || ""));
    if (!Number.isFinite(joined)) return null;
    const inGrace = joined >= WELCOME_FIRST_GRACE_FROM && joined < WELCOME_FIRST_GRACE_TO;
    if (!inGrace && nowMs - joined > WELCOME_FIRST_JOIN_HOURS * 3600000) return null;
    return { kind: "first", amount: cfg.first.amount, sourceKey: `welcome_first:${id}`, tiers: cfg.first.tiers };
  }
  if (!cfg.back.on || cfg.back.amount <= 0 || !h.lastPaidAt) return null;
  const last = Date.parse(h.lastPaidAt);
  if (!Number.isFinite(last)) return null;
  if (nowMs - last < cfg.back.days * 86400000) return null;
  const key = String(h.lastPaidKey || h.lastPaidAt).replace(/[^0-9A-Za-z_:.-]/g, "").slice(0, 80);
  return { kind: "back", amount: cfg.back.amount, sourceKey: `welcome_back:${id}:${key}`, tiers: cfg.back.tiers };
}

/** 한국 시간 오늘 0시(ISO, UTC) */
export function kstDayStartIso(nowMs: number): string {
  const kst = new Date(nowMs + 9 * 3600000);
  const startKst = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  return new Date(startKst - 9 * 3600000).toISOString();
}

/** 말풍선 설명 3줄 — 화면·테스트 공용 */
const pointText = (n: number) => `${Math.max(0, Math.floor(n)).toLocaleString("ko-KR")}P`;
/** 「30초」「1분」「1분 30초」 */
export function welcomeSecText(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) return `${s}초`;
  return s % 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s / 60}분`;
}

/** [2026-11-14 12:14 사장님] 시청 선물 포인트 유효기간 안내(표시 문구) */
export const WELCOME_EXPIRY_TEXT = "유효기간: 지급일로부터 30일 이내 사용";

export function welcomeHelpLines(kind: WelcomeKind, amountOrTiers: number | WelcomeTier[], watchSec = 0): { title: string; lines: string[] } {
  const tiers: WelcomeTier[] = Array.isArray(amountOrTiers) ? amountOrTiers : [{ sec: watchSec, amount: amountOrTiers }];
  const t0 = tiers[0] ?? { sec: 0, amount: 0 };
  const total = tiers.reduce((s, t) => s + t.amount, 0);
  const lines: string[] = [];
  if (tiers.length > 1) {
    lines.push(t0.sec > 0 ? `방송을 ${welcomeSecText(t0.sec)} 보시면 ${pointText(t0.amount)}를 드려요` : `${pointText(t0.amount)}를 먼저 드려요`);
    for (const t of tiers.slice(1)) lines.push(`${welcomeSecText(t.sec)}까지 보시면 ${pointText(t.amount)}를 더 드려요`);
    lines.push(`끝까지 보시면 모두 ${pointText(total)}예요`);
  } else {
    lines.push(t0.sec > 0 ? `방송을 ${welcomeSecText(t0.sec)} 보시면 ${pointText(t0.amount)}를 드려요` : `${pointText(t0.amount)}를 드려요`);
  }
  if (t0.sec > 0) lines.push(tiers.length > 1 ? "다른 앱이나 탭으로 나가면 시간이 다시 시작돼요 (받은 선물 다음부터 남은 시간만)" : "다른 앱이나 탭으로 나가면 시간이 처음부터 다시 시작돼요");
  lines.push("받은 포인트는 주문할 때 바로 쓸 수 있어요");
  lines.push(WELCOME_EXPIRY_TEXT);
  lines.push(kind === "first" ? "한 분께 한 번만 드려요" : "오랜만에 오실 때마다 다시 드려요");
  return { title: kind === "first" ? "처음 오신 분께 드리는 시청 선물" : "오랜만에 오신 분께 드리는 시청 선물", lines };
}

/** 쿠폰 아래 한 줄 — 다음 구간 안내 또는 모두 받은 합계(표시 전용) */
export function welcomeCouponHint(tiers: WelcomeTier[], gotIndex: number): string {
  if (tiers.length < 2 || gotIndex < 0 || gotIndex >= tiers.length) return "";
  const next = tiers[gotIndex + 1];
  if (next) return `${welcomeSecText(next.sec)}까지 보시면 ${pointText(next.amount)} 더 드려요`;
  return `모두 ${pointText(tiers.reduce((s, t) => s + t.amount, 0))} 받으셨어요`;
}

// ── 선물 받은 사람 목록(관리자) — 선물 뒤 주문했는지 «읽기만» 판정 ──
export type WelcomeOrderRow = {
  id?: unknown; order_group_id?: unknown; kakao_id?: unknown; customer_phone?: unknown; created_at?: unknown;
  admin_order_status_v2?: unknown; order_manage_status?: unknown; is_test_order?: unknown; is_deleted?: unknown; final_amount?: unknown;
};
export type WelcomeOrderResult = { orders: number; paidOrders: number; paidAmount: number };

/** 선물(시각·카카오 계정·전화) 뒤에 들어온 주문서 수·결제완료 주문서 수·결제완료 금액. 취소·테스트·삭제 줄은 뺌. 표시 전용. */
export function welcomeOrderResult(
  gift: { at: string; kakaoId: string; phone: string },
  orders: WelcomeOrderRow[],
  paidStatuses: Set<string>,
): WelcomeOrderResult {
  const t = Date.parse(gift.at);
  const k = String(gift.kakaoId || "").trim();
  const p = String(gift.phone || "").replace(/[^0-9]/g, "");
  const groups = new Map<string, boolean>();
  let paidAmount = 0;
  for (const o of orders) {
    if (o.is_deleted === true || o.is_test_order === true) continue;
    const at = Date.parse(String(o.created_at ?? ""));
    if (!Number.isFinite(t) || !Number.isFinite(at) || at < t) continue;
    const ok = String(o.kakao_id ?? "").trim();
    const op = String(o.customer_phone ?? "").replace(/[^0-9]/g, "");
    const mine = (k && ok === k) || (p.length >= 9 && op === p);
    if (!mine) continue;
    const a = String(o.admin_order_status_v2 ?? "").trim();
    const b = String(o.order_manage_status ?? "").trim();
    if (a.includes("취소") || b.includes("취소")) continue;
    const paid = paidStatuses.has(a) || paidStatuses.has(b);
    const key = String(o.order_group_id || `o${o.id}`);
    groups.set(key, (groups.get(key) ?? false) || paid);
    if (paid) { const n = Number(o.final_amount); if (Number.isFinite(n) && n > 0) paidAmount += n; }
  }
  let paidOrders = 0;
  for (const v of groups.values()) if (v) paidOrders++;
  return { orders: groups.size, paidOrders, paidAmount: Math.round(paidAmount) };
}

/** source_key 에서 선물 종류·회원 id·구간(0부터) */
export function parseWelcomeSourceKey(key: unknown): { kind: WelcomeKind; customerId: string; tier: number } | null {
  const s = String(key ?? "");
  const m = /^welcome_(first|back):([^:#]+)/.exec(s);
  if (!m) return null;
  const t = /#(\d+)$/.exec(s);
  return { kind: m[1] as WelcomeKind, customerId: m[2], tier: t ? Math.max(0, Number(t[1]) - 1) : 0 };
}
