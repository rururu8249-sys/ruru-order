// [2026-11-12 사장님 「그립처럼 처음 온 손님 선물」] 방송 시청 선물 포인트 — 순수 계산만(서버·화면 공용).
//   처음 오신 선물 = 결제완료 주문이 한 번도 없는 손님(카카오 계정·지금 전화번호 둘 다)
//   오랜만에 오신 선물 = 마지막 결제완료 주문이 N일 넘게 지난 손님(그 «잠든 기간»마다 한 번)
//   지급은 기존 관리자 포인트 지급 RPC(admin_change_customer_points) + 중복 방지 키(source_key)만 쓴다.

/** 포인트가 새로 들어왔을 때 화면들이 다시 읽게 하는 소식(선물 카드·주문서 포인트) */
export const POINT_GIFT_REFRESH_EVENT = "ruru-point-gift-refresh";

export type WelcomeKind = "first" | "back";

export type WelcomePointConfig = {
  first: { on: boolean; amount: number };
  back: { on: boolean; amount: number; days: number };
  /** 방송을 몇 초 보면 들어오는지(0 = 바로) */
  watchSec: number;
  /** 하루(한국 시간) 최대 지급 인원 — 넘으면 그날은 안 줌 */
  dailyCap: number;
};

export const WELCOME_POINT_DEFAULT: WelcomePointConfig = {
  first: { on: false, amount: 1000 },
  back: { on: false, amount: 1000, days: 90 },
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

export function parseWelcomePointConfig(raw: unknown): WelcomePointConfig {
  let v: unknown = raw;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const f = (o.first && typeof o.first === "object" ? o.first : {}) as Record<string, unknown>;
  const b = (o.back && typeof o.back === "object" ? o.back : {}) as Record<string, unknown>;
  const D = WELCOME_POINT_DEFAULT;
  return {
    first: { on: f.on === true, amount: clampInt(f.amount, 0, WELCOME_LIMITS.amountMax, D.first.amount) },
    back: {
      on: b.on === true,
      amount: clampInt(b.amount, 0, WELCOME_LIMITS.amountMax, D.back.amount),
      days: clampInt(b.days, WELCOME_LIMITS.daysMin, WELCOME_LIMITS.daysMax, D.back.days),
    },
    watchSec: clampInt(o.watchSec, 0, WELCOME_LIMITS.watchMax, D.watchSec),
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

export type WelcomeDecision = { kind: WelcomeKind; amount: number; sourceKey: string } | null;

/** 누가 어떤 선물을 받을 수 있는지. customerId = customers.id(카카오 계정). */
export function decideWelcome(cfg: WelcomePointConfig, customerId: string, h: PaidHistory, nowMs: number): WelcomeDecision {
  const id = String(customerId || "").trim();
  if (!id) return null;
  if (h.paidCount <= 0) {
    if (!cfg.first.on || cfg.first.amount <= 0) return null;
    return { kind: "first", amount: cfg.first.amount, sourceKey: `welcome_first:${id}` };
  }
  if (!cfg.back.on || cfg.back.amount <= 0 || !h.lastPaidAt) return null;
  const last = Date.parse(h.lastPaidAt);
  if (!Number.isFinite(last)) return null;
  if (nowMs - last < cfg.back.days * 86400000) return null;
  const key = String(h.lastPaidKey || h.lastPaidAt).replace(/[^0-9A-Za-z_:.-]/g, "").slice(0, 80);
  return { kind: "back", amount: cfg.back.amount, sourceKey: `welcome_back:${id}:${key}` };
}

/** 한국 시간 오늘 0시(ISO, UTC) */
export function kstDayStartIso(nowMs: number): string {
  const kst = new Date(nowMs + 9 * 3600000);
  const startKst = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  return new Date(startKst - 9 * 3600000).toISOString();
}

/** 말풍선 설명 3줄 — 화면·테스트 공용 */
export function welcomeHelpLines(kind: WelcomeKind, amount: number, watchSec: number): { title: string; lines: string[] } {
  const amt = `${Math.max(0, Math.floor(amount)).toLocaleString("ko-KR")}P`;
  return {
    title: kind === "first" ? "처음 오신 분께 드리는 선물이에요" : "오랜만에 오신 분께 드리는 선물이에요",
    lines: [
      watchSec > 0 ? `방송을 ${watchSec}초 이상 보시면 ${amt}를 드려요` : `${amt}를 드려요`,
      "주문서 제출할 때 바로 쓸 수 있어요",
      kind === "first" ? "한 분께 한 번만 드려요" : "오랜만에 오실 때마다 한 번씩 드려요",
    ],
  };
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

/** source_key 에서 선물 종류·회원 id */
export function parseWelcomeSourceKey(key: unknown): { kind: WelcomeKind; customerId: string } | null {
  const m = /^welcome_(first|back):([^:]+)/.exec(String(key ?? ""));
  return m ? { kind: m[1] as WelcomeKind, customerId: m[2] } : null;
}
