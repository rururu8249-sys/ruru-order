// app/api/cart-reservations/route.ts
// 주문서 담기 재고 홀드(예약) — 표시용 선점 전용. 진짜 재고 차감/복구는 기존 제출 RPC가 단일 소유.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildCartHoldSnapshotItem } from "@/lib/cartHoldDetail";

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
    for (const row of data || []) {
      if (exclude && String((row as any).session_key) === exclude) continue;
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
      return NextResponse.json({ ok: true, cleared: true });
    }
    if (action !== "sync") return NextResponse.json({ ok: false, error: "알 수 없는 action" }, { status: 400 });

    const phone = String(body?.phone ?? "").replace(/[^0-9]/g, "").slice(0, 20) || null;
    const nickname = String(body?.nickname ?? "").trim().slice(0, 40) || null;
    const customerName = String(body?.customerName ?? "").trim().slice(0, 40) || null;
    const rawItems = Array.isArray(body?.items) ? body.items.slice(0, MAX_ITEMS) : [];
    const items = rawItems
      .map((it: any) => buildCartHoldSnapshotItem({
        productId: it?.productId,
        productName: it?.productName,
        color: it?.color,
        size: it?.size,
        qty: it?.qty,
        unitPrice: it?.unitPrice,
      }))
      .filter((r: ReturnType<typeof buildCartHoldSnapshotItem>) => r.productId && r.qty > 0);

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
