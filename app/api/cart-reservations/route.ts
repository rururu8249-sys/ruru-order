// app/api/cart-reservations/route.ts
// 주문서 담기 재고 홀드(예약) — 표시용 선점 전용. 진짜 재고 차감/복구는 기존 제출 RPC가 단일 소유.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildCartHoldSnapshotItem } from "@/lib/cartHoldDetail";
import { CART_SEQ_NEW, cartClearNeedsNotice, cartItemClearedBy, normCartOpt, type CartClearMark, type CartIdentity } from "@/lib/cartClearMarks";
import { sweepExpiredCartHolds } from "@/lib/cartHoldSweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOLD_MINUTES_DEFAULT = 15;
const HOLD_MINUTES_MIN = 10;
const HOLD_MINUTES_MAX = 43200;
const MAX_ITEMS = 40;
const MAX_QTY = 99;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL 없음");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 없음");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function getHoldMinutes(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<number> {
  try {
    const { data } = await supabase.from("settings").select("value").eq("key", "cart_hold_minutes").maybeSingle();
    const n = Math.round(Number((data as any)?.value));
    if (!Number.isFinite(n) || n <= 0) return HOLD_MINUTES_DEFAULT;
    return Math.min(HOLD_MINUTES_MAX, Math.max(HOLD_MINUTES_MIN, n));
  } catch {
    return HOLD_MINUTES_DEFAULT;
  }
}

const normOpt = (v: unknown) => {
  const t = String(v ?? "").trim();
  return t === "없음" ? "" : t;
};
const cleanSessionKey = (v: unknown) => {
  const t = String(v ?? "").trim();
  return !t || t.length < 6 || t.length > 80 ? "" : t;
};

async function currentBankOverride(supabase: ReturnType<typeof getSupabaseAdmin>, sessionKey: string) {
  const nowIso = new Date().toISOString();
  const { data: holdRows } = await supabase
    .from("cart_reservations")
    .select("created_at,expires_at")
    .eq("session_key", sessionKey)
    .gt("expires_at", nowIso)
    .limit(MAX_ITEMS);
  const holds = (holdRows || []) as Array<Record<string, unknown>>;
  if (holds.length === 0) return null;
  const cartStartedAtMs = Math.min(...holds.map((row) => new Date(String(row.created_at ?? "")).getTime()).filter(Number.isFinite));
  const cartExpiresAtMs = Math.max(...holds.map((row) => new Date(String(row.expires_at ?? "")).getTime()).filter(Number.isFinite));
  if (!Number.isFinite(cartStartedAtMs) || !Number.isFinite(cartExpiresAtMs)) return null;
  const { data: rows } = await supabase
    .from("cart_bank_account_overrides")
    .select("id,cart_started_at,cart_expires_at,account_id,bank_name,bank_account,bank_holder,assigned_at")
    .eq("session_key", sessionKey)
    .eq("status", "active")
    .gt("cart_expires_at", nowIso)
    .order("assigned_at", { ascending: false })
    .limit(5);
  const data = ((rows || []) as Array<Record<string, unknown>>).find((row) => {
    const started = new Date(String(row.cart_started_at ?? "")).getTime();
    const expires = new Date(String(row.cart_expires_at ?? "")).getTime();
    return Number.isFinite(started) && Number.isFinite(expires) && started <= cartStartedAtMs && expires > Date.now();
  });
  if (!data) return null;
  if (cartExpiresAtMs > new Date(String(data.cart_expires_at ?? "")).getTime()) {
    await supabase.from("cart_bank_account_overrides").update({ cart_expires_at: new Date(cartExpiresAtMs).toISOString() }).eq("id", data.id).eq("status", "active");
  }
  return {
    id: String((data as any).account_id || ""),
    bankName: String((data as any).bank_name || ""),
    bankAccount: String((data as any).bank_account || ""),
    bankHolder: String((data as any).bank_holder || ""),
  };
}

async function cancelActiveBankOverrides(supabase: ReturnType<typeof getSupabaseAdmin>, sessionKey: string) {
  await supabase
    .from("cart_bank_account_overrides")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("session_key", sessionKey)
    .eq("status", "active");
}

// [㉛] 비움 기록(cart_clear_marks) — 표시용 선점 전용. 테이블이 없거나 읽기 실패면 null(기존 동작 그대로).
const MARK_LOOKBACK_DAYS = 31; // 손님 임시 장바구니 7일·선점 최대 30일보다 길게
async function readCartMarks(supabase: ReturnType<typeof getSupabaseAdmin>, who: CartIdentity): Promise<CartClearMark[] | null> {
  const q = (v: string) => `"${v.replace(/["\\]/g, "")}"`; // PostgREST or 필터 값 따옴표(쉼표·괄호 안전)
  const ors = [`session_key.eq.${q(who.sessionKey)}`];
  if (who.kakaoId) ors.push(`kakao_id.eq.${q(who.kakaoId)}`);
  if (who.phone) ors.push(`customer_phone.eq.${q(who.phone)}`);
  const since = new Date(Date.now() - MARK_LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("cart_clear_marks")
    .select("seq,reason,session_key,kakao_id,customer_phone,product_id,color,size")
    .or(ors.join(","))
    .gte("created_at", since)
    .order("seq", { ascending: false })
    .limit(500);
  if (error) return null;
  return (data || []) as CartClearMark[];
}
async function readCurrentCartSeq(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<number | null> {
  const { data, error } = await supabase.from("cart_clear_marks").select("seq").order("seq", { ascending: false }).limit(1);
  if (error) return null;
  return Number((data as Array<{ seq?: unknown }> | null)?.[0]?.seq) || 0;
}
// 만료 줄 정리 — 동기화마다 돌면 과하므로 서버 인스턴스당 1분에 한 번만(cron 이 5분마다 따로 돈다).
let lastSweepAt = 0;
async function sweepExpiredThrottled(supabase: ReturnType<typeof getSupabaseAdmin>) {
  if (Date.now() - lastSweepAt < 60_000) return;
  lastSweepAt = Date.now();
  try { await sweepExpiredCartHolds(supabase); } catch { /* 정리 실패해도 동기화는 정상 */ }
}
async function insertCartMarks(supabase: ReturnType<typeof getSupabaseAdmin>, rows: Array<Record<string, unknown>>): Promise<number> {
  if (rows.length === 0) return 0;
  const { data, error } = await supabase.from("cart_clear_marks").insert(rows).select("seq");
  if (error) return 0;
  return Math.max(0, ...((data || []) as Array<{ seq?: unknown }>).map((r) => Number(r.seq) || 0));
}

export async function GET(request: NextRequest) {
  try {
    const idsParam = String(request.nextUrl.searchParams.get("ids") || "").trim();
    const exclude = cleanSessionKey(request.nextUrl.searchParams.get("exclude"));
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
    if (ids.length === 0) return NextResponse.json({ ok: true, byProduct: {}, byVariant: {} });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("cart_reservations")
      .select("session_key, product_id, color, size, qty, expires_at")
      .in("product_id", ids)
      .gt("expires_at", new Date().toISOString())
      .limit(5000);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const byProduct: Record<string, number> = {};
    const byVariant: Record<string, number> = {};
    // [2026-09-20] 「지금 N명이 담는 중」 배지용 — 상품별 «사람 수»(세션 수).
    //   byProduct 는 수량 합계라 한 사람이 3개 담아도 3이 된다. 사람 수는 따로 세야 정확하다.
    //   같은 조회 결과를 한 번 더 훑는 것뿐이라 DB 비용은 늘지 않는다.
    const peopleSet: Record<string, Set<string>> = {};
    for (const row of data || []) {
      if (exclude && String((row as any).session_key) === exclude) continue;
      const pid = String((row as any).product_id);
      const qty = Math.max(0, Math.min(MAX_QTY, Number((row as any).qty) || 0));
      if (!pid || qty <= 0) continue;
      byProduct[pid] = (byProduct[pid] || 0) + qty;
      const vKey = `${pid}|${normOpt((row as any).color)}|${normOpt((row as any).size)}`;
      byVariant[vKey] = (byVariant[vKey] || 0) + qty;
      (peopleSet[pid] ||= new Set()).add(String((row as any).session_key || ""));
    }
    const byProductPeople: Record<string, number> = {};
    for (const [pid, set] of Object.entries(peopleSet)) byProductPeople[pid] = set.size;
    return NextResponse.json({ ok: true, byProduct, byVariant, byProductPeople });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const action = String(body?.action || "").trim();
    const sessionKey = cleanSessionKey(body?.sessionKey);
    if (!sessionKey) return NextResponse.json({ ok: false, error: "sessionKey 없음" }, { status: 400 });

    const supabase = getSupabaseAdmin();
    if (action === "clear") {
      const { error: delError } = await supabase.from("cart_reservations").delete().eq("session_key", sessionKey);
      if (delError) return NextResponse.json({ ok: false, error: delError.message }, { status: 500 });
      await cancelActiveBankOverrides(supabase, sessionKey);
      return NextResponse.json({ ok: true, cleared: true });
    }
    if (action !== "sync") return NextResponse.json({ ok: false, error: "알 수 없는 action" }, { status: 400 });

    const phone = String(body?.phone ?? "").replace(/[^0-9]/g, "").slice(0, 20) || null;
    const nickname = String(body?.nickname ?? "").trim().slice(0, 40) || null;
    const customerName = String(body?.customerName ?? "").trim().slice(0, 40) || null;
    const kakaoId = String(body?.kakaoId ?? "").trim().replace(/[^0-9]/g, "").slice(0, 80) || null;
    const rawItems = Array.isArray(body?.items) ? body.items.slice(0, MAX_ITEMS) : [];
    const who: CartIdentity = { sessionKey, kakaoId, phone };
    let items = rawItems
      .map((it: any) => buildCartHoldSnapshotItem({
        productId: it?.productId,
        productName: it?.productName,
        color: it?.color,
        size: it?.size,
        qty: it?.qty,
        unitPrice: it?.unitPrice,
      }))
      .filter((r: ReturnType<typeof buildCartHoldSnapshotItem>) => r.productId && r.qty > 0);
    // [㉛] 줄마다 «담은 번호» — 손님 화면이 담을 때 붙인 cart_clear_marks seq(없으면 0 = 옛 장바구니).
    const seqByKey = new Map<string, number>();
    for (const it of rawItems) {
      const key = `${String(it?.productId ?? "").trim()}|${normCartOpt(it?.color)}|${normCartOpt(it?.size)}`;
      const raw = Number(it?.cartSeq);
      // -1(CART_SEQ_NEW) = 이 화면에서 방금 담아 아직 번호 전 → 거절 대상 아님. 없음·0 = 옛 장바구니.
      const n = raw === CART_SEQ_NEW ? CART_SEQ_NEW : Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0));
      const prev = seqByKey.get(key);
      // 같은 옵션이 여러 줄이면 더 오래된 쪽 기준(보수적). 「새로 담음(-1)」은 번호 있는 줄이 있으면 그 번호를 따른다.
      seqByKey.set(key, prev === undefined ? n : prev === CART_SEQ_NEW ? n : n === CART_SEQ_NEW ? prev : Math.min(prev, n));
    }
    const keyOf = (r: { productId: string; color: string; size: string }) => `${r.productId}|${normCartOpt(r.color)}|${normCartOpt(r.size)}`;

    // [㉛] 예전 3분 회수 지시(settings.cart_revoke_*)는 영구 비움 기록으로 한 번 옮기고 지운다(배포 전 비우기 호환).
    try {
      const rk = `cart_revoke_${sessionKey}`.slice(0, 250);
      const { data: rv } = await supabase.from("settings").select("value").eq("key", rk).limit(1).maybeSingle();
      if (rv) {
        const { data: oldRows } = await supabase.from("cart_reservations").select("kakao_id,customer_phone").eq("session_key", sessionKey).limit(1);
        const inserted = await insertCartMarks(supabase, [{
          reason: "admin_clear", session_key: sessionKey,
          kakao_id: String((oldRows as any)?.[0]?.kakao_id || kakaoId || "").trim() || null,
          customer_phone: String((oldRows as any)?.[0]?.customer_phone || phone || "").replace(/[^0-9]/g, "") || null,
        }]);
        if (inserted > 0) await supabase.from("settings").delete().eq("key", rk);
      }
    } catch { /* 옮기기 실패 시 아래 기존 회수 처리로 */ }

    // [㉛] 만료 줄 서버 정리(손님이 안 와도 지워지게 — cron 과 별도로 동기화 때도 1분에 한 번)
    await sweepExpiredThrottled(supabase);

    // [㉛] 비움 기록 거절 — 관리자 비우기·만료·제출 뒤 옛 줄은 상품 상태와 무관하게 «무조건» 거절.
    //   선점 함수(claim_cart_hold) 부르기 전에 걸러낸다(함수 무변경).
    const marks = await readCartMarks(supabase, who).catch(() => null);
    const clearedResults: Array<Record<string, unknown>> = [];
    let clearedSeq = 0; // 안내(관리자 비우기·만료)가 필요한 거절의 가장 큰 기록 번호
    if (marks && marks.length > 0) {
      items = items.filter((r: ReturnType<typeof buildCartHoldSnapshotItem>) => {
        const hit = cartItemClearedBy({ productId: r.productId, color: r.color, size: r.size, cartSeq: seqByKey.get(keyOf(r)) ?? 0 }, marks, who);
        if (!hit) return true;
        const notice = cartClearNeedsNotice(hit.reason);
        if (notice) clearedSeq = Math.max(clearedSeq, hit.seq);
        // expired:true 는 예전 손님 화면(배포 전 열린 탭)도 품절 안내 없이 줄을 빼게 하려는 호환 표시.
        clearedResults.push({ productId: r.productId, color: r.color, size: r.size, requested: r.qty, ok: false, cleared: true, expired: true, silent: !notice, clearedSeq: hit.seq, available: 0 });
        return false;
      });
    }
    try {
      const rk = `cart_revoke_${sessionKey}`.slice(0, 250);
      const { data: rv } = await supabase.from("settings").select("value").eq("key", rk).limit(1).maybeSingle();
      if (rv) {
        // [2026-09-28] 회수 지시는 3분간 유지 — 동시 sync/재접속이 옛 장바구니를 되살리지 못하게.
        const revokedAt = new Date(String((rv as any).value || "")).getTime();
        const withinGrace = Number.isFinite(revokedAt) && Date.now() - revokedAt < 3 * 60_000;
        if (!withinGrace) await supabase.from("settings").delete().eq("key", rk);
        await supabase.from("cart_reservations").delete().eq("session_key", sessionKey);
        await cancelActiveBankOverrides(supabase, sessionKey);
        return NextResponse.json({ ok: true, revoked: true });
      }
    } catch { /* 확인 실패 시 평소처럼 sync */ }

    const holdMinutes = await getHoldMinutes(supabase);
    const { data, error } = await supabase.rpc("claim_cart_hold", {
      p_session_key: sessionKey,
      p_phone: phone,
      p_nickname: nickname,
      p_customer_name: customerName,
      p_items: items,
      p_hold_minutes: holdMinutes,
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // [㉛] 만료된 줄은 그 상품·옵션만 영구 비움 기록 — 다른 탭이 옛 줄을 다시 보내도 처음 담은 시각이 리셋되지 않게.
    const rpcResults = Array.isArray((data as any)?.results) ? ((data as any).results as Array<Record<string, unknown>>) : [];
    const expiredRows = rpcResults.filter((r) => r && r.ok === false && r.expired === true);
    if (marks && expiredRows.length > 0) {
      const inserted = await insertCartMarks(supabase, expiredRows.map((r) => ({
        reason: "expired", session_key: sessionKey, kakao_id: kakaoId, customer_phone: phone,
        product_id: String(r.productId ?? ""), color: normCartOpt(r.color), size: normCartOpt(r.size),
      })));
      clearedSeq = Math.max(clearedSeq, inserted);
    }

    if (kakaoId) {
      const { error: kakaoError } = await supabase.from("cart_reservations").update({ kakao_id: kakaoId }).eq("session_key", sessionKey);
      if (kakaoError) return NextResponse.json({ ok: false, error: kakaoError.message }, { status: 500 });
    }

    const bankAccountOverride = await currentBankOverride(supabase, sessionKey);
    if (items.length === 0) await cancelActiveBankOverrides(supabase, sessionKey);

    const allResults = [...rpcResults, ...clearedResults];
    return NextResponse.json({
      ok: true,
      reserved: items.length,
      holdMinutes,
      allOk: (data as any)?.allOk !== false && clearedResults.length === 0,
      results: allResults,
      bankAccountOverride,
      // [㉛] 손님 화면이 새로 담는 상품에 붙일 번호 · 이번에 거절을 일으킨 비움 기록 번호(안내 1번만 띄우는 기준)
      cartSeq: marks ? await readCurrentCartSeq(supabase) : null,
      clearedSeq: clearedSeq || null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
