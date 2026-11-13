// lib/autoTestOrder.ts
// [2026-11-13 사장님 「라이브 중 자동 테스트 주문」] 순수 함수 — 닉네임 만들기·상품/옵션 고르기·주문 줄 만들기.
//   주문 줄 모양은 손님 화면(app/order/page.tsx submitOrder)과 같다. 실제 저장은 손님과 같은 주소
//   (/api/cart-reservations → /api/customer-orders/submit)로 보낸다 — 가짜 주문 저장 경로 없음.
//   재고 무제한 상품만 고른다(사장님 선택 — 테스트 주문이 실제 재고를 안 건드리게).
import { isOptionManuallySoldOut } from "@/lib/productOptionAvailability";
import { customerDetailInputEnabled } from "@/lib/customerDetailProductName";
import { assignRowShippingFees, hasOverseasBadge, resolveShippingGroup, shippingFeeByGroup, type ShippingFeeSettings, type ShippingGroup } from "@/lib/shippingGroups";

export const AUTO_TEST_KEY = "auto_test_order_v1";
export const AUTO_TEST_REASON = "자동 테스트";
/** 자동 테스트 전용 회원 — 가짜 카카오 번호·집전화 모양 번호(알림톡·문자는 휴대폰만 가서 안 감) */
export const AUTO_TEST_KAKAO_ID = "990000000077";
export const AUTO_TEST_PHONE = "0200000077";
export const AUTO_TEST_NAME = "자동테스트";
/** 테스트 채팅의 표식(채팅 글 avatar_url 자리) — 화면은 닉네임 첫 글자 동그라미로 그림 */
export const AUTO_TEST_AVATAR = "autotest";
/** 테스트 글·주문에 「TEST」 표시를 보는 사람(채팅 관리자 말고 따로) — 사장님 지정 부계정 관리자 김현아(문성) */
export const AUTO_TEST_VIEWER_PHONES = ["01083388860"];
export const AUTO_TEST_MIN_GAP_MS = 5 * 60_000;
export const AUTO_TEST_MAX_GAP_MS = 10 * 60_000;

/** 자동 테스트 주문 줄인지 — 서버 방식(사유 「자동 테스트」) 또는 화면 방식(테스트 회원 번호로 낸 운영자 테스트 주문) */
export function isAutoTestRow(r: { is_test_order?: unknown; test_order_reason?: unknown; operator_test_phone?: unknown }): boolean {
  if (r.is_test_order !== true) return false;
  return String(r.test_order_reason ?? "") === AUTO_TEST_REASON || String(r.operator_test_phone ?? "").replace(/\D/g, "") === AUTO_TEST_PHONE;
}

export type AutoTestLast = { at: number; ok: boolean; message: string; orderCode?: string; nickname?: string };
export type AutoTestState = { enabled: boolean; chatEnabled: boolean; nextRunAt: number | null; lockUntil: number; last: AutoTestLast | null; screenSeenAt: number };
export const AUTO_TEST_DEFAULT: AutoTestState = { enabled: false, chatEnabled: false, nextRunAt: null, lockUntil: 0, last: null, screenSeenAt: 0 };
/** 관리자 화면(화면 테스트)이 이 시간 안에 신호를 보냈으면 서버 방식은 쉬고 화면이 맡는다 */
export const SCREEN_HOST_FRESH_MS = 90_000;

export function parseAutoTestState(raw: unknown): AutoTestState {
  let v: unknown = raw;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  if (!v || typeof v !== "object") return { ...AUTO_TEST_DEFAULT };
  const o = v as Record<string, unknown>;
  const num = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const last = o.last && typeof o.last === "object" ? (o.last as AutoTestLast) : null;
  return {
    enabled: o.enabled === true,
    chatEnabled: o.chatEnabled === true,
    nextRunAt: o.nextRunAt == null ? null : num(o.nextRunAt) || null,
    lockUntil: num(o.lockUntil),
    last,
    screenSeenAt: num(o.screenSeenAt),
  };
}

export function randomGapMs(rand = Math.random): number {
  return AUTO_TEST_MIN_GAP_MS + Math.floor(rand() * (AUTO_TEST_MAX_GAP_MS - AUTO_TEST_MIN_GAP_MS + 1));
}

const pick = <T,>(list: T[], rand = Math.random): T => list[Math.floor(rand() * list.length)];

const KO_A = ["포근한", "반짝이는", "상큼한", "달콤한", "느긋한", "씩씩한", "말랑한", "보송한", "새콤한", "다정한", "산뜻한", "통통한"];
const KO_B = ["고양이", "토끼", "곰돌이", "다람쥐", "펭귄", "강아지", "여우", "판다", "햄찌", "오리", "수달", "부엉이"];
const EN_A = ["happy", "sunny", "lucky", "minty", "cozy", "sweet", "brave", "fluffy", "lovely", "shiny"];
const EN_B = ["cat", "bunny", "bear", "fox", "panda", "duck", "otter", "puppy", "lemon", "peach"];

/** 한글 또는 영어 닉네임 후보 n개(서로 다름) — 중복 확인은 서버가 DB 로 */
export function nicknameCandidates(n = 12, rand = Math.random): string[] {
  const out = new Set<string>();
  let guard = 0;
  while (out.size < n && guard < n * 10) {
    guard += 1;
    const digits = String(100 + Math.floor(rand() * 9900));
    out.add(rand() < 0.5 ? `${pick(KO_A, rand)}${pick(KO_B, rand)}${digits}` : `${pick(EN_A, rand)}_${pick(EN_B, rand)}${digits}`);
  }
  return [...out];
}

type Row = Record<string, unknown>;
export type AutoTestChoice = { productId: string; productName: string; color: string; size: string; unitPrice: number; group: ShippingGroup };

function note(row: Row): Row {
  const raw = row.product_note;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Row;
  if (typeof raw === "string") { try { const v = JSON.parse(raw); return v && typeof v === "object" ? (v as Row) : {}; } catch { return {}; } }
  return {};
}
const list = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((x) => String(x ?? "").trim()).filter(Boolean);
  if (typeof v === "string" && v.trim()) {
    try { const p = JSON.parse(v); if (Array.isArray(p)) return list(p); } catch { /* 쉼표 목록 */ }
    return v.split(",").map((x) => x.trim()).filter(Boolean);
  }
  return [];
};
const none = (v: string) => (v === "없음" ? "" : v);
const HIDDEN = new Set(["hidden", "숨김", "deleted"]);

/** 이 상품에서 손님이 고를 수 있는 (상품명·색상·사이즈·단가) 목록. 재고 관리 상품·특수 상품은 빈 목록(테스트 대상 아님). */
export function productChoices(row: Row, overseasFeeOn: boolean): AutoTestChoice[] {
  if ([row.status, row.product_status].some((v) => HIDDEN.has(String(v ?? "").trim())) || row.is_visible === false) return [];
  const n = note(row);
  if (n.stock_management_enabled === true || row.stock_management_enabled === true) return []; // 재고 무제한만
  const base = Math.floor(Number(row.price) || 0);
  if (base <= 0 || n.free_product === true || n.purchase_limit_enabled === true) return [];
  if (customerDetailInputEnabled(row.product_note) || String(n.custom_input_label ?? "").trim()) return [];
  const id = String(row.id ?? "").trim();
  if (!/^\d+$/.test(id)) return [];
  const group = resolveShippingGroup(row, overseasFeeOn && hasOverseasBadge(row));
  const out: AutoTestChoice[] = [];

  const brand = n.brand_group as Row | undefined;
  if (brand && brand.enabled === true) {
    const opts = (brand.detail_options && typeof brand.detail_options === "object" ? brand.detail_options : {}) as Record<string, Row>;
    const hidden = new Set(list(n.combo_hidden));
    const pricing = (n.option_pricing && typeof n.option_pricing === "object" ? n.option_pricing : {}) as Record<string, unknown>;
    for (const [detailRaw, opt] of Object.entries(opts)) {
      const detail = String(detailRaw).trim();
      if (!detail || hidden.has(detail) || !opt || typeof opt !== "object") continue;
      const variants = Array.isArray(opt.variants) && opt.variants.length
        ? (opt.variants as Row[]).map((v) => ({ color: none(String(v?.color ?? "").trim()), size: none(String(v?.size ?? "").trim()) }))
        : (list(opt.colors).length ? list(opt.colors) : [""]).flatMap((c) => (list(opt.sizes).length ? list(opt.sizes) : [""]).map((s) => ({ color: none(c), size: none(s) })));
      const price = base + Math.max(0, Math.floor(Number(pricing[detail]) || 0));
      for (const v of variants) {
        if (isOptionManuallySoldOut(n, v.color, v.size, detail)) continue;
        out.push({ productId: id, productName: detail, color: v.color || "없음", size: v.size, unitPrice: price, group });
      }
    }
    return out;
  }
  if (n.combo_mode === true || Array.isArray(n.option_axes)) return []; // 옛 조합형·3단은 이번 범위 밖

  const name = String(row.product_name ?? "").trim();
  if (!name) return [];
  const seen = new Set<string>();
  const add = (c: string, s: string) => {
    const k = `${c}|${s}`;
    if (seen.has(k) || isOptionManuallySoldOut(n, c, s)) return;
    seen.add(k);
    out.push({ productId: id, productName: name, color: c, size: s, unitPrice: base, group });
  };
  const variants = Array.isArray(n.stock_variants) ? (n.stock_variants as Row[]) : [];
  for (const v of variants) {
    const c = none(String(v?.color ?? "").trim()), s = none(String(v?.size ?? "").trim());
    if (c || s) add(c, s);
  }
  if (!out.length) {
    const colors = list(row.color_options ?? n.color_options).map(none).filter(Boolean);
    const sizes = list(row.size_options ?? n.size_options).map(none).filter(Boolean);
    for (const c of colors.length ? colors : [""]) for (const s of sizes.length ? sizes : [""]) add(c, s);
  }
  return out;
}

export type AutoTestPick = AutoTestChoice & { qty: number };

/** 상품(세부상품 포함) 1~3개를 서로 다르게 고르고 옵션·수량(1~3)도 랜덤 */
export function pickOrderLines(choices: AutoTestChoice[], rand = Math.random): AutoTestPick[] {
  const byProduct = new Map<string, AutoTestChoice[]>();
  for (const c of choices) {
    const k = `${c.productId}|${c.productName}`;
    byProduct.set(k, [...(byProduct.get(k) ?? []), c]);
  }
  const keys = [...byProduct.keys()];
  const want = Math.min(keys.length, 1 + Math.floor(rand() * 3));
  const chosen: AutoTestPick[] = [];
  const pool = [...keys];
  while (chosen.length < want && pool.length) {
    const k = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    const c = pick(byProduct.get(k)!, rand);
    chosen.push({ ...c, qty: 1 + Math.floor(rand() * 3) });
  }
  return chosen;
}

export type AutoTestSettings = { shipping: ShippingFeeSettings; customerCardRate: number; actualCardRate: number; cardMinAmount: number };

export type BuildInput = {
  lines: AutoTestPick[];
  paymentMethod: "무통장입금" | "카드결제";
  nickname: string;
  groupId: string;
  lookupCode: string;
  broadcast: { id: string; title: string; subtitle: string };
  settings: AutoTestSettings;
};

/** 손님 화면 submitOrder 와 같은 모양의 주문 줄(배송비는 갈래마다 첫 줄에 전액 — 합배송 할인 없이) */
export function buildOrderRows(input: BuildInput): Row[] {
  const { lines, paymentMethod, settings } = input;
  const card = paymentMethod === "카드결제";
  const fees = shippingFeeByGroup(settings.shipping, false);
  const rowShip = assignRowShippingFees(lines.map((l) => ({ group: l.group, chargeable: l.unitPrice > 0 })), { normal: false, vendor: false, vendor2: false, overseas: false }, fees);
  return lines.map((l, i) => {
    const itemTotal = l.unitPrice * l.qty;
    const ship = rowShip[i] || 0;
    const extra = card ? Math.round((itemTotal + ship) * (settings.customerCardRate / 100)) : 0;
    const label = [l.productName, [l.color, l.size].filter((x) => x && x !== "없음").join("/")].filter(Boolean).join(" ");
    return {
      order_group_id: input.groupId,
      order_lookup_code: input.lookupCode,
      broadcast_id: input.broadcast.id,
      broadcast_name: input.broadcast.title,
      broadcast_public_title: input.broadcast.title,
      broadcast_admin_subtitle: input.broadcast.subtitle,
      youtube_nickname: input.nickname,
      customer_name: AUTO_TEST_NAME,
      customer_phone: AUTO_TEST_PHONE,
      phone: AUTO_TEST_PHONE,
      zipcode: "00000",
      address: "자동 테스트 주소",
      detail_address: "자동 테스트",
      request_memo: "",
      product_id: l.productId,
      product_name: l.productName,
      color: l.color,
      size: l.size,
      qty: l.qty,
      product_price: l.unitPrice,
      shipping_fee: ship,
      total_price: itemTotal + ship + extra,
      adjusted_product_price: itemTotal,
      adjusted_shipping_fee: ship,
      adjusted_total_price: itemTotal + ship + extra,
      payment_method: paymentMethod,
      vat_amount: extra,
      customer_card_extra_rate_applied: card ? settings.customerCardRate : 0,
      actual_card_fee_rate_applied: card ? settings.actualCardRate : 0,
      order_status: "주문완료",
      admin_status: "관리자 확인 전",
      order_manage_status: "주문확인전",
      shipping_status: "합배송중",
      is_test_order: true,
      test_order_reason: AUTO_TEST_REASON,
      operator_test_phone: AUTO_TEST_PHONE,
      exclude_from_settlement: true,
      exclude_from_payment_match: true,
      exclude_from_shipping: true,
      exclude_from_picking: true,
      memo: label,
      special_note: "",
    };
  });
}

/** 카드는 택배비 포함 최소 금액 이상일 때만(손님 화면과 같은 규칙) — 모자라면 무통장으로 */
export function choosePayment(lines: AutoTestPick[], settings: AutoTestSettings, rand = Math.random): "무통장입금" | "카드결제" {
  if (rand() < 0.5) return "무통장입금";
  const fees = shippingFeeByGroup(settings.shipping, false);
  const ship = [...new Set(lines.map((l) => l.group))].reduce((s, g) => s + fees[g], 0);
  const goods = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  return goods + ship >= settings.cardMinAmount ? "카드결제" : "무통장입금";
}

/** 저장된 주문 줄이 보낸 줄과 맞는지(닉네임·상품·옵션·수량·결제·테스트 표시) — 틀린 곳 목록 */
export function verifySavedRows(sent: Row[], saved: Row[]): string[] {
  const problems: string[] = [];
  if (saved.length !== sent.length) problems.push(`저장된 줄 ${saved.length}개 (보낸 줄 ${sent.length}개)`);
  const key = (r: Row) => `${String(r.product_id ?? "")}|${String(r.product_name ?? "").trim()}|${none(String(r.color ?? "").trim())}|${none(String(r.size ?? "").trim())}|${Number(r.qty) || 0}`;
  const savedKeys = saved.map(key);
  for (const r of sent) if (!savedKeys.includes(key(r))) problems.push(`없는 줄: ${String(r.product_name)} ${String(r.color)}/${String(r.size)} ×${String(r.qty)}`);
  for (const r of saved) {
    if (String(r.youtube_nickname ?? "") !== String(sent[0]?.youtube_nickname ?? "")) problems.push(`닉네임 다름: ${String(r.youtube_nickname)}`);
    if (String(r.payment_method ?? "") !== String(sent[0]?.payment_method ?? "")) problems.push(`결제 방식 다름: ${String(r.payment_method)}`);
    if (r.is_test_order !== true) problems.push("테스트 표시 없음");
  }
  return [...new Set(problems)];
}

/** [2026-11-13 사장님] 테스트할 상품 고르는 기준
 *  - 11/6 이후 주문이 1건이라도 있었던 상품(세부상품 이름 기준)만
 *  - 다이슨은 주문이 적어도 포함
 *  - 샘플할인 상품은 제외 */
export const AUTO_TEST_ORDERED_SINCE = "2026-11-06T00:00:00+09:00";
export const AUTO_TEST_ALWAYS_INCLUDE = ["다이슨"];
export const AUTO_TEST_EXCLUDE = ["샘플할인"];

export function filterTestChoices(choices: AutoTestChoice[], orderedNames: Set<string>): AutoTestChoice[] {
  const norm = (v: string) => v.replace(/\s+/g, "").toLowerCase();
  const ordered = new Set([...orderedNames].map(norm));
  return choices.filter((c) => {
    const n = c.productName;
    if (AUTO_TEST_EXCLUDE.some((w) => n.includes(w))) return false;
    if (AUTO_TEST_ALWAYS_INCLUDE.some((w) => n.includes(w))) return true;
    return ordered.has(norm(n));
  });
}
