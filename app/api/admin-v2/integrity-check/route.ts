// app/api/admin-v2/integrity-check/route.ts
// 목적: 돈/입금 데이터 정합성 점검 (읽기 전용 안전장치).
// 주의: SELECT만 한다. insert/update/delete 등 DB write는 절대 없다.
//       기존 매칭/입금/정산 로직은 건드리지 않고, orders/deposits를 읽어 메모리에서만 점검한다.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "";

const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

// 행수 캡(~1000) 방지: .range로 1000개씩 끝까지 전체를 가져온다. (deposits/route.ts와 동일 방식)
async function fetchAllRows(supabase: any, table: string, columns: string) {
  const pageSize = 1000;
  let from = 0;
  const all: AnyRow[] = [];
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null };
}

// 주문 표시금액: final_amount → adjusted_total_price → total_price 순.
function orderAmount(order: AnyRow): number {
  const raw = order.final_amount ?? order.adjusted_total_price ?? order.total_price;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function depositAmountNum(deposit: AnyRow): number {
  const n = Number(deposit.amount);
  return Number.isFinite(n) ? n : 0;
}

// ── [2026-07-25 사장님 전체점검] 점검4~8 추가 (전부 읽기 전용·메모리 계산) ──
// 기준선: 이미 확인·기록된 과거 건은 재알림 제외 → "새로 발생"만 감지.
//   근거: CLAUDE.md 2026-07-25 전체 시스템 점검 항목 (보류 27건·과거 5건·포인트 7명·시각누락 3건)
const LEGACY_FINAL_MISMATCH_IDS = new Set([2399, 2449, 2501, 2701, 2702]); // 구버전 포인트 미차감 흔적(결제완료)
const LEGACY_NO_CONFIRMED_AT_IDS = new Set([2524, 3116, 3117]); // 자동입금확인 시각 미기록(경미)
const LEGACY_POINT_MISMATCH_PHONES = new Set([
  "01053250754", "01031332008", "01055460494", "01029594911", "01084143596", "01027469355", "01089109823",
]); // 잔액<원장 7명 — 원인 추적 과제
const CANCEL_RESTORE_BASELINE_MS = new Date("2026-07-21T15:00:00Z").getTime(); // KST 7/22 00:00 — 이전 27건은 보류 결정

function parseNote(raw: unknown): AnyRow | null {
  if (raw && typeof raw === "object") return raw as AnyRow;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as AnyRow;
    } catch {
      return null;
    }
  }
  return null;
}

function isCanceledText(order: AnyRow): boolean {
  const s = cleanText(order.admin_order_status_v2) || cleanText(order.order_status);
  return /취소|환불/.test(s);
}

export async function GET() {
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { ok: false, message: "Supabase 환경변수가 없습니다." },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    const ORDER_COLUMNS =
      "id, order_lookup_code, youtube_nickname, customer_name, final_amount, adjusted_total_price, total_price, admin_order_status_v2, order_group_id, is_deleted, is_test_order, deposit_confirmed_at, created_at, order_status, product_id, product_name, color, size, qty, product_price, adjusted_product_price, shipping_fee, adjusted_shipping_fee, vat_amount, point_used_amount, inventory_deduction_status, inventory_restore_status";
    const DEPOSIT_COLUMNS =
      "id, depositor_name, amount, deposited_time, match_order_group_id, match_customer_id, match_status, confirmed_at, created_at";

    const [ordersResult, depositsResult, productsResult, variantsResult, balancesResult, ledgerResult] = await Promise.all([
      fetchAllRows(supabase, "orders", ORDER_COLUMNS),
      fetchAllRows(supabase, "deposits", DEPOSIT_COLUMNS),
      fetchAllRows(supabase, "products", "id, product_name, status, stock, is_soldout, product_note"),
      fetchAllRows(supabase, "product_inventory_variants", "product_id, stock"),
      fetchAllRows(supabase, "customer_point_balances", "customer_phone, youtube_nickname, customer_name, current_points"),
      fetchAllRows(supabase, "customer_point_ledger", "customer_phone, amount"),
    ]);

    if (ordersResult.error) {
      return NextResponse.json(
        { ok: false, message: "orders 조회 실패", detail: ordersResult.error.message },
        { status: 500 },
      );
    }

    if (depositsResult.error) {
      return NextResponse.json(
        { ok: false, message: "deposits 조회 실패", detail: depositsResult.error.message },
        { status: 500 },
      );
    }
    // 점검4~8용 조회 실패는 해당 점검만 스킵(입금 점검 1~3은 그대로 동작)
    const productsAll: AnyRow[] = productsResult.error ? [] : (productsResult.data || []);
    const variantsAll: AnyRow[] = variantsResult.error ? [] : (variantsResult.data || []);
    const balancesAll: AnyRow[] = balancesResult.error ? [] : (balancesResult.data || []);
    const ledgerAll: AnyRow[] = ledgerResult.error ? [] : (ledgerResult.data || []);

    const allOrders: AnyRow[] = ordersResult.data || [];
    const allDeposits: AnyRow[] = depositsResult.data || [];

    // 대상 주문: 삭제(true) 아님 + 테스트 주문(true) 아님.
    const orders = allOrders.filter(
      (order) => order.is_deleted !== true && order.is_test_order !== true,
    );

    // ── 점검1) 자동입금확인인데 연결 입금 없음 ──────────────────────────────
    // 자동입금확인 주문의 order_group_id를, match_order_group_id로 가진 deposit이 하나도 없는 경우.
    const matchedGroupIds = new Set<string>();
    for (const deposit of allDeposits) {
      const gid = cleanText(deposit.match_order_group_id);
      if (gid) matchedGroupIds.add(gid);
    }

    const check1Items = orders
      .filter((order) => cleanText(order.admin_order_status_v2) === "자동입금확인")
      .filter((order) => {
        const gid = cleanText(order.order_group_id);
        return !gid || !matchedGroupIds.has(gid);
      })
      .map((order) => ({
        order_id: order.id,
        order_lookup_code: order.order_lookup_code ?? null,
        nickname: order.youtube_nickname ?? null,
        amount: orderAmount(order),
        created_at: order.created_at ?? null,
      }));

    // ── 점검2) 한 주문그룹에 2건 이상 deposit 연결 ─────────────────────────
    // (의미 명확화) match_order_group_id 기준으로 묶어, 연결된 deposit이 2건 이상인 주문그룹.
    const depositsByGroup = new Map<string, AnyRow[]>();
    for (const deposit of allDeposits) {
      const gid = cleanText(deposit.match_order_group_id);
      if (!gid) continue;
      const prev = depositsByGroup.get(gid) ?? [];
      prev.push(deposit);
      depositsByGroup.set(gid, prev);
    }

    const check2Items = Array.from(depositsByGroup.entries())
      .filter(([, deps]) => deps.length >= 2)
      .map(([gid, deps]) => {
        const times = deps
          .map((d) => d.deposited_time)
          .filter(Boolean)
          .sort();
        return {
          order_group_id: gid,
          deposit_ids: deps.map((d) => d.id),
          total_deposit_amount: deps.reduce((sum, d) => sum + depositAmountNum(d), 0),
          latest_deposited_time: times.length ? times[times.length - 1] : null,
        };
      });

    // ── 점검3) 중복 입금내역 (depositor_name + amount + deposited_time 동일) ──
    const depositsByKey = new Map<string, AnyRow[]>();
    for (const deposit of allDeposits) {
      const key = [
        cleanText(deposit.depositor_name),
        cleanText(deposit.amount),
        cleanText(deposit.deposited_time),
      ].join("__");
      const prev = depositsByKey.get(key) ?? [];
      prev.push(deposit);
      depositsByKey.set(key, prev);
    }

    const check3Items = Array.from(depositsByKey.values())
      .filter((deps) => deps.length >= 2)
      .map((deps) => ({
        depositor_name: deps[0].depositor_name ?? null,
        amount: depositAmountNum(deps[0]),
        deposited_time: deps[0].deposited_time ?? null,
        deposit_ids: deps.map((d) => d.id),
      }));

    // ── 점검4) 취소인데 재고 미복구 (기준선 이후 신규만) ─────────────────────
    const productById = new Map<string, AnyRow>();
    for (const p of productsAll) {
      if (cleanText(p.status) !== "deleted") productById.set(String(p.id), p);
    }
    const check4Items = orders
      .filter((o) => {
        const ded = cleanText(o.inventory_deduction_status);
        const res = cleanText(o.inventory_restore_status);
        if (!ded.startsWith("deducted") || res.startsWith("restored")) return false;
        if (!isCanceledText(o)) return false;
        const t = o.created_at ? new Date(o.created_at).getTime() : NaN;
        if (!Number.isFinite(t) || t < CANCEL_RESTORE_BASELINE_MS) return false;
        const p = productById.get(String(o.product_id ?? ""));
        if (!p) return false;
        const note = parseNote(p.product_note);
        return note?.stock_management_enabled === true;
      })
      .map((o) => ({
        order_id: o.id,
        label: `${o.youtube_nickname || o.customer_name || "-"} / ${o.product_name || "-"} ${[o.color, o.size].filter((v) => v && v !== "없음").join("/")} ×${o.qty || 1}`,
        created_at: o.created_at ?? null,
      }));

    // ── 점검5) 재고 3중 장부 불일치(노트 vs 옵션테이블 vs 총재고) + 음수 ──────
    const varSumByPid = new Map<string, { sum: number; min: number }>();
    for (const v of variantsAll) {
      const pid = String(v.product_id ?? "");
      const cur = varSumByPid.get(pid) || { sum: 0, min: 0 };
      const s = Number(v.stock || 0);
      cur.sum += s;
      cur.min = Math.min(cur.min, s);
      varSumByPid.set(pid, cur);
    }
    const check5Items: Array<{ label: string; created_at: null }> = [];
    for (const [pid, p] of productById) {
      const note = parseNote(p.product_note);
      if (note?.stock_management_enabled !== true) continue;
      const sv = note?.stock_variants;
      if (!Array.isArray(sv) || sv.length === 0) continue;
      const noteSum = sv.reduce((s: number, v: AnyRow) => s + (Number(v?.stock) || 0), 0);
      const vs = varSumByPid.get(pid) || { sum: -999, min: 0 };
      const stockCol = Number(p.stock ?? -999);
      if (noteSum !== vs.sum || noteSum !== stockCol || vs.min < 0) {
        check5Items.push({ label: `${p.product_name} — 노트${noteSum} / 테이블${vs.sum} / 총${stockCol}${vs.min < 0 ? " / ⚠️음수재고" : ""}`, created_at: null });
      }
    }

    // ── 점검6) 금액 공식(최근 30일·취소 제외): 총액=상품+배송+수수료, 최종=총액−포인트 ──
    const THIRTY_MS = 30 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const check6Items = orders
      .filter((o) => {
        const t = o.created_at ? new Date(o.created_at).getTime() : NaN;
        if (!Number.isFinite(t) || nowMs - t > THIRTY_MS) return false;
        if (isCanceledText(o)) return false;
        const qty = Math.max(1, Number(o.qty || 1));
        const productAmt = Number(o.adjusted_product_price ?? (Number(o.product_price || 0) * qty)) || 0;
        const ship = Number(o.adjusted_shipping_fee ?? o.shipping_fee ?? 0) || 0;
        const vat = Number(o.vat_amount || 0) || 0;
        const total = Number(o.adjusted_total_price ?? o.total_price ?? 0) || 0;
        if (total !== productAmt + ship + vat) return true;
        if (o.final_amount !== null && o.final_amount !== undefined && !LEGACY_FINAL_MISMATCH_IDS.has(Number(o.id))) {
          const point = Number(o.point_used_amount || 0) || 0;
          if (Number(o.final_amount) !== Math.max(0, total - point)) return true;
        }
        return false;
      })
      .map((o) => ({
        order_id: o.id,
        label: `주문 ${o.id} ${o.youtube_nickname || o.customer_name || "-"} — 총액/최종금액 공식 불일치`,
        created_at: o.created_at ?? null,
      }));

    // ── 점검7) 포인트 잔액 vs 원장합 불일치 + 음수 잔액 (알려진 7명 제외) ─────
    const ledgerSumByPhone = new Map<string, number>();
    for (const l of ledgerAll) {
      const phone = cleanText(l.customer_phone);
      if (!phone) continue;
      ledgerSumByPhone.set(phone, (ledgerSumByPhone.get(phone) || 0) + (Number(l.amount) || 0));
    }
    const check7Items = balancesAll
      .filter((b) => {
        const phone = cleanText(b.customer_phone);
        const bal = Number(b.current_points || 0);
        if (bal < 0) return true; // 음수 잔액은 예외 없이 알림
        if (LEGACY_POINT_MISMATCH_PHONES.has(phone)) return false;
        return bal !== (ledgerSumByPhone.get(phone) || 0);
      })
      .map((b) => ({
        label: `${b.youtube_nickname || b.customer_name || b.customer_phone} — 잔액 ${Number(b.current_points || 0).toLocaleString("ko-KR")} / 이력합 ${(ledgerSumByPhone.get(cleanText(b.customer_phone)) || 0).toLocaleString("ko-KR")}`,
        created_at: null,
      }));

    // ── 점검8) 입금확인류인데 확인시각 없음(최근 30일, 알려진 3건 제외) ────────
    const check8Items = orders
      .filter((o) => {
        if (LEGACY_NO_CONFIRMED_AT_IDS.has(Number(o.id))) return false;
        const t = o.created_at ? new Date(o.created_at).getTime() : NaN;
        if (!Number.isFinite(t) || nowMs - t > THIRTY_MS) return false;
        const s = cleanText(o.admin_order_status_v2) || cleanText(o.order_status);
        return /입금확인/.test(s) && !o.deposit_confirmed_at;
      })
      .map((o) => ({
        order_id: o.id,
        label: `주문 ${o.id} ${o.youtube_nickname || o.customer_name || "-"} — ${cleanText(o.admin_order_status_v2) || cleanText(o.order_status)}인데 확인시각 없음`,
        created_at: o.created_at ?? null,
      }));

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      summary: {
        check1_auto_paid_no_deposit: check1Items.length,
        check2_group_multi_deposit: check2Items.length,
        check3_duplicate_deposit: check3Items.length,
        check4_cancel_not_restored: check4Items.length,
        check5_stock_ledger_mismatch: check5Items.length,
        check6_amount_formula: check6Items.length,
        check7_point_mismatch: check7Items.length,
        check8_paid_no_timestamp: check8Items.length,
      },
      check1: { count: check1Items.length, items: check1Items },
      check2: { count: check2Items.length, items: check2Items },
      check3: { count: check3Items.length, items: check3Items },
      check4: { count: check4Items.length, items: check4Items },
      check5: { count: check5Items.length, items: check5Items },
      check6: { count: check6Items.length, items: check6Items },
      check7: { count: check7Items.length, items: check7Items },
      check8: { count: check8Items.length, items: check8Items },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "정합성 점검 실패",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
