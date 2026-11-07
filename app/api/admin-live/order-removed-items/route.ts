// [2026-11-07] 주문상품을 지우기 «직전»에 그 줄 사본을 남기고(POST), 주문상세가 읽는다(GET).
//   ⚠️ orders 는 SELECT 만 한다. 주문·입금·정산·포인트·재고 어떤 값도 쓰지 않는다.
//   사본은 클라가 보낸 값이 아니라 서버가 orders 에서 직접 읽은 값(service_role).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !key) throw new Error("Supabase 관리자 환경변수가 설정되지 않았습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const clean = (v: unknown) => String(v ?? "").trim();
const SNAPSHOT_KEYS = [
  "product_name", "color", "size", "qty", "product_price", "adjusted_product_price", "vat_amount", "card_extra_amount",
  "total_price", "adjusted_total_price", "final_amount", "shipping_fee", "adjusted_shipping_fee", "point_used_amount",
  "product_id", "payment_method", "created_at",
] as const;

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  const u = new URL(request.url);
  const code = clean(u.searchParams.get("code"));
  const groupId = clean(u.searchParams.get("groupId"));
  if (!code && !groupId) return NextResponse.json({ ok: true, items: [] });
  try {
    let q = admin().from("order_removed_items").select("id, order_id, kind, snapshot, card_total_before, memo, removed_at, created_at").order("id", { ascending: true }).limit(50);
    q = code && groupId ? q.or(`order_lookup_code.eq.${code},order_group_id.eq.${groupId}`) : code ? q.eq("order_lookup_code", code) : q.eq("order_group_id", groupId);
    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, items: data || [] });
  } catch (e) {
    return NextResponse.json({ ok: false, message: String((e as Error)?.message || e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const rowId = Number(body.rowId);
  if (!Number.isFinite(rowId) || rowId <= 0) return NextResponse.json({ ok: false, message: "rowId 가 없어요." }, { status: 400 });
  const kind = clean(body.kind) === "card_repay" ? "card_repay" : "delete";
  const cardTotalBefore = Number(body.cardTotalBefore);
  try {
    const db = admin();
    const { data: row, error } = await db.from("orders").select("*").eq("id", rowId).maybeSingle();
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    if (!row) return NextResponse.json({ ok: false, message: "주문 줄을 찾지 못했어요." }, { status: 404 });
    const r = row as Record<string, unknown>;
    const snapshot: Record<string, unknown> = {};
    for (const k of SNAPSHOT_KEYS) if (r[k] !== undefined) snapshot[k] = r[k];
    const { data: saved, error: insErr } = await db
      .from("order_removed_items")
      .insert({
        order_id: rowId,
        order_group_id: clean(r.order_group_id) || null,
        order_lookup_code: clean(r.order_lookup_code) || null,
        kind,
        snapshot,
        card_total_before: Number.isFinite(cardTotalBefore) && cardTotalBefore > 0 ? cardTotalBefore : null,
        memo: clean(body.memo).slice(0, 200) || null,
        removed_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();
    if (insErr) return NextResponse.json({ ok: false, message: insErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: (saved as { id?: number } | null)?.id ?? null });
  } catch (e) {
    return NextResponse.json({ ok: false, message: String((e as Error)?.message || e) }, { status: 500 });
  }
}

// 삭제가 막혀서(마지막 상품 등) 줄이 그대로 남았을 때 방금 남긴 사본만 지운다.
export async function DELETE(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ ok: false, message: "id 가 없어요." }, { status: 400 });
  try {
    const { error } = await admin().from("order_removed_items").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, message: String((e as Error)?.message || e) }, { status: 500 });
  }
}
