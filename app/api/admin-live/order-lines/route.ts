// [2026-09-26] 교환·환불 처리 창「돌려받을 상품」용 — 주문번호(order_lookup_code) 묶음으로 주문 줄을 «읽기»만.
//   ⚠️ orders 를 SELECT 만 한다. 주문/입금/정산/포인트 어떤 값도 쓰지 않는다.
//   줄 금액은 기존 정식 함수 submitRowLineTotal(=adjusted_product_price 줄합계 규칙) 그대로 재사용.
//   Nano 사양 대응: 행마다 쿼리 금지 → codes 를 .in() 으로 한 번에.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { submitRowLineTotal, submitRowQty } from "@/lib/submitRowPrice";
import { resolveOrderItemPhoto } from "@/lib/orderItemPhoto";

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase 관리자 환경변수가 설정되지 않았습니다.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

const clean = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export async function GET(request: NextRequest) {
  const adminSession = await verifyAdminSessionFromRequest(request);
  if (!adminSession) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });

  const url = new URL(request.url);
  const codes = Array.from(new Set(clean(url.searchParams.get("codes")).split(",").map((s) => s.trim()).filter(Boolean))).slice(0, 60);
  if (codes.length === 0) return NextResponse.json({ ok: true, byCode: {} });

  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_lookup_code, product_id, product_name, color, size, qty, product_price, adjusted_product_price, shipping_fee, point_used_amount, created_at, is_deleted")
      .in("order_lookup_code", codes);
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });

    const rows = ((data as Array<Record<string, unknown>>) || []).filter((r) => r.is_deleted !== true);

    // 상품 사진 — 목록 행과 «같은» 규칙(resolveOrderItemPhoto)으로. image_url 만 보면
    //   색상별/세부상품 사진만 있는 상품(예: Lime RURU-MTFV6WC7)이 빈칸이 된다.
    //   전체 상품 행을 받아 상품명·색상까지 넘겨 사진을 고른다. 실패해도 무시(사진만 빠짐).
    const productById = new Map<string, Record<string, unknown>>();
    const productIds = Array.from(new Set(rows.map((r) => clean(r.product_id)).filter(Boolean)));
    if (productIds.length > 0) {
      try {
        const { data: prods } = await supabase.from("products").select("*").in("id", productIds);
        for (const p of (prods as Array<Record<string, unknown>>) || []) {
          if (clean(p.id)) productById.set(clean(p.id), p);
        }
      } catch { /* 사진 조회 실패는 무시 */ }
    }

    const byCode: Record<string, { lines: Array<Record<string, unknown>>; shippingFee: number; pointUsed: number; orderDate: string }> = {};
    for (const r of rows) {
      const code = clean(r.order_lookup_code);
      if (!code) continue;
      const entry = byCode[code] || (byCode[code] = { lines: [], shippingFee: 0, pointUsed: 0, orderDate: "" });
      const created = clean(r.created_at);
      if (created && (!entry.orderDate || created < entry.orderDate)) entry.orderDate = created; // 주문일 = 가장 이른 줄
      const qty = submitRowQty(r);
      const lineTotal = submitRowLineTotal(r);
      const unit = qty > 0 ? Math.floor(lineTotal / qty) : lineTotal;
      const productRow = productById.get(clean(r.product_id));
      const photo = productRow
        ? resolveOrderItemPhoto(productRow, { productName: clean(r.product_name), color: clean(r.color) }).url
        : "";
      entry.lines.push({
        id: clean(r.id),
        product_id: clean(r.product_id),
        product_name: clean(r.product_name) || "상품",
        color: clean(r.color),
        size: clean(r.size),
        qty,
        unit,
        lineTotal,
        photo,
      });
      entry.shippingFee = Math.max(entry.shippingFee, Math.max(0, Math.round(num(r.shipping_fee))));
      entry.pointUsed += Math.max(0, Math.round(num(r.point_used_amount)));
    }

    return NextResponse.json({ ok: true, byCode });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "주문 줄 조회 실패" }, { status: 500 });
  }
}
