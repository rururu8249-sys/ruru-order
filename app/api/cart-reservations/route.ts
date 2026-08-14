// app/api/cart-reservations/route.ts
// 주문서 담기 재고 홀드(예약) — 담는 즉시 다른 고객 화면에 차감 반영, 15분 자동 만료.
// ⚠️ 진짜 재고 차감/복구는 기존 주문제출 RPC·취소 복구가 단일 소유(여기서 절대 안 건드림).
//    이 API는 cart_reservations 테이블만 읽고 쓰는 "표시용 선점" 전용.
//    실패해도 주문 흐름에 영향 없음(클라이언트가 전부 best-effort 호출).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// [2026-07-13 사장님 지침] 홀드 유지시간을 설정(settings.cart_hold_minutes)에서 읽는다.
//   관리자 설정 > 주문서 탭에서 분/시간/일 단위로 자유 조정. 하한 10분(하트비트 주기보다 짧아져
//   담자마자 풀리는 사고 방지), 상한 30일. 읽기 실패/미설정 시 기본 15분 — 주문 흐름 영향 없음.
const HOLD_MINUTES_DEFAULT = 15;
const HOLD_MINUTES_MIN = 10;
const HOLD_MINUTES_MAX = 43200; // 30일
const MAX_ITEMS = 40; // 한 주문서 최대 예약 줄수(남용 방지)
const MAX_QTY = 99;

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

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL 없음");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 없음");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const normOpt = (v: unknown) => {
  const t = String(v ?? "").trim();
  return t === "없음" ? "" : t;
};

const cleanSessionKey = (v: unknown) => {
  const t = String(v ?? "").trim();
  if (!t || t.length < 6 || t.length > 80) return "";
  return t;
};

// GET ?ids=1,2,3&exclude=sessionKey → 유효(미만료) 예약 합계
// 응답: { ok, byProduct: { [productId]: qty합 }, byVariant: { "productId|color|size": qty합 } }
export async function GET(request: NextRequest) {
  try {
    const idsParam = String(request.nextUrl.searchParams.get("ids") || "").trim();
    const exclude = cleanSessionKey(request.nextUrl.searchParams.get("exclude"));
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
    if (ids.length === 0) return NextResponse.json({ ok: true, byProduct: {}, byVariant: {} });

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("cart_reservations")
      .select("session_key, product_id, color, size, qty, expires_at")
      .in("product_id", ids)
      .gt("expires_at", new Date().toISOString())
      .limit(5000);
    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const byProduct: Record<string, number> = {};
    const byVariant: Record<string, number> = {};
    for (const row of data || []) {
      if (exclude && String((row as any).session_key) === exclude) continue; // 본인 예약은 제외(본인 화면은 담긴 수량으로 이미 반영)
      const pid = String((row as any).product_id);
      const qty = Math.max(0, Math.min(MAX_QTY, Number((row as any).qty) || 0));
      if (!pid || qty <= 0) continue;
      byProduct[pid] = (byProduct[pid] || 0) + qty;
      const vKey = `${pid}|${normOpt((row as any).color)}|${normOpt((row as any).size)}`;
      byVariant[vKey] = (byVariant[vKey] || 0) + qty;
    }
    return NextResponse.json({ ok: true, byProduct, byVariant });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}

// POST { action: "sync"|"clear", sessionKey, phone?, items?: [{productId,color,size,qty}] }
// sync = 그 세션의 예약을 현재 주문서 내용으로 통째로 교체(멱등) + 만료 연장
// clear = 그 세션 예약 전부 해제
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const action = String(body?.action || "").trim();
    const sessionKey = cleanSessionKey(body?.sessionKey);
    if (!sessionKey) return NextResponse.json({ ok: false, error: "sessionKey 없음" }, { status: 400 });

    const supabase = getSupabaseAdmin();

    if (action === "clear") {
      // 해제는 기존 방식 유지(검증 불필요)
      const { error: delError } = await supabase.from("cart_reservations").delete().eq("session_key", sessionKey);
      if (delError) return NextResponse.json({ ok: false, error: delError.message }, { status: 500 });
      return NextResponse.json({ ok: true, cleared: true });
    }
    if (action !== "sync") return NextResponse.json({ ok: false, error: "알 수 없는 action" }, { status: 400 });

    // [2026-08-11 담기 선착순] 무조건 기록 → 서버 원자 검증(claim_cart_hold RPC)으로 교체.
    //   같은 상품 동시 담기는 DB 행잠금이 도착 순서대로 직렬화 → 먼저 도착한 담기가 임자.
    //   부족하면 그 옵션만 거부(results에 ok:false + available). 재고 숫자는 불변(실차감=제출 RPC).
    const phone = String(body?.phone ?? "").replace(/[^0-9]/g, "").slice(0, 20) || null;
    const nickname = String(body?.nickname ?? "").trim().slice(0, 40) || null;
    const customerName = String(body?.customerName ?? "").trim().slice(0, 40) || null;
    const rawItems = Array.isArray(body?.items) ? body.items.slice(0, MAX_ITEMS) : [];
    const items = rawItems
      .map((it: any) => ({
        productId: String(it?.productId ?? "").trim().slice(0, 80),
        color: normOpt(it?.color).slice(0, 60),
        size: normOpt(it?.size).slice(0, 60),
        qty: Math.max(0, Math.min(MAX_QTY, Number(it?.qty) || 0)),
      }))
      .filter((r: any) => r.productId && r.qty > 0);
    // [2026-08-14] 관리자 회수 지시 확인 — 있으면 이번 sync를 막고 손님 폰이 장바구니를 비우게 한다(1회성).
    try {
      const rk = `cart_revoke_${sessionKey}`.slice(0, 250);
      const { data: rv } = await supabase.from("settings").select("value").eq("key", rk).limit(1).maybeSingle();
      if (rv) {
        await supabase.from("settings").delete().eq("key", rk);
        await supabase.from("cart_reservations").delete().eq("session_key", sessionKey);
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

    return NextResponse.json({
      ok: true,
      reserved: items.length,
      holdMinutes,
      allOk: (data as any)?.allOk !== false,
      results: (data as any)?.results ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
