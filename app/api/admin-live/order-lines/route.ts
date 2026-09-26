// [2026-09-26] 교환·환불 처리 창「돌려받을 상품」용 — 주문번호(order_lookup_code) 묶음으로 주문 줄을 «읽기»만.
//   ⚠️ orders 를 SELECT 만 한다. 주문/입금/정산/포인트 어떤 값도 쓰지 않는다.
//   줄 금액은 기존 정식 함수 submitRowLineTotal(=adjusted_product_price 줄합계 규칙) 그대로 재사용.
//   Nano 사양 대응: 행마다 쿼리 금지 → codes 를 .in() 으로 한 번에.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { submitRowLineTotal, submitRowQty } from "@/lib/submitRowPrice";
import { resolveOrderItemPhoto } from "@/lib/orderItemPhoto";
import { shippingAddressKey } from "@/lib/shippingAddressKey";
import { koreanPhoneVariants } from "@/lib/order/phone";
import { isCombinedShipmentPeer } from "@/lib/refundLedger";

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
      .select("id, order_lookup_code, product_id, product_name, color, size, qty, product_price, adjusted_product_price, shipping_fee, point_used_amount, created_at, payment_method, card_extra_amount, vat_amount, adjusted_total_price, total_price, final_amount, combine_shipping_memo, address, detail_address, kakao_id, customer_phone, broadcast_id, is_deleted")
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

    type Entry = { lines: Array<Record<string, unknown>>; shippingFee: number; pointUsed: number; orderDate: string; paymentMethod: string; cardExtra: number; cardTotal: number; combined: boolean; combinedWith: string };
    const byCode: Record<string, Entry> = {};
    // 합배송 판정용 코드별 메타(첫 줄 기준) — 같은 손님/주소/방송/날짜 비교에 쓴다.
    const meta: Record<string, { addr: string; kakao: string; phones: string[]; broadcast: string; day: string }> = {};
    for (const r of rows) {
      const code = clean(r.order_lookup_code);
      if (!code) continue;
      const entry = byCode[code] || (byCode[code] = { lines: [], shippingFee: 0, pointUsed: 0, orderDate: "", paymentMethod: "", cardExtra: 0, cardTotal: 0, combined: false, combinedWith: "" });
      if (!meta[code]) {
        meta[code] = {
          addr: shippingAddressKey(r.address, r.detail_address),
          kakao: clean(r.kakao_id),
          phones: koreanPhoneVariants(clean(r.customer_phone)),
          broadcast: clean(r.broadcast_id),
          day: clean(r.created_at).slice(0, 10),
        };
      }
      const created = clean(r.created_at);
      if (created && (!entry.orderDate || created < entry.orderDate)) entry.orderDate = created; // 주문일 = 가장 이른 줄
      // 결제방법·카드추가금·카드총액 — 주문상세와 같은 필드. 줄마다 저장되므로 합산(카드추가금=vat_amount).
      if (!entry.paymentMethod) entry.paymentMethod = clean(r.payment_method);
      entry.cardExtra += Math.max(0, Math.round(num(r.card_extra_amount ?? r.vat_amount)));
      entry.cardTotal += Math.max(0, Math.round(num(r.adjusted_total_price ?? r.total_price ?? r.final_amount)));
      if (clean(r.combine_shipping_memo)) entry.combined = true; // 합배송 흔적 → 배송비 공유 신호
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

    // ── [7차 보완] 합배송 판정 — 같은 손님(kakao_id/전화)의 다른 주문 중 같은 주소키 + 같은 방송(또는 같은 날)이
    //   있으면 «합배송»(배송비 낸 쪽/빠진 쪽 모두). 손님별 다른 주문은 묶음 1회 조회(행마다 요청 금지).
    const kakaos = new Set<string>();
    const phones = new Set<string>();
    for (const c of Object.keys(meta)) { if (meta[c].kakao) kakaos.add(meta[c].kakao); meta[c].phones.forEach((p) => p && phones.add(p)); }
    if (kakaos.size > 0 || phones.size > 0) {
      const ors: string[] = [];
      if (kakaos.size > 0) ors.push(`kakao_id.in.(${Array.from(kakaos).join(",")})`);
      if (phones.size > 0) ors.push(`customer_phone.in.(${Array.from(phones).join(",")})`);
      try {
        const { data: od } = await supabase
          .from("orders")
          .select("order_lookup_code, address, detail_address, kakao_id, customer_phone, broadcast_id, created_at, is_deleted")
          .or(ors.join(","))
          .limit(500);
        const others = ((od as Array<Record<string, unknown>>) || []).filter((o) => o.is_deleted !== true);
        for (const code of Object.keys(byCode)) {
          const m = meta[code];
          if (!m || !m.addr) continue;
          const hit = others.find((o) => isCombinedShipmentPeer(
            { code, addr: m.addr, kakao: m.kakao, phones: m.phones, broadcast: m.broadcast, day: m.day },
            { code: clean(o.order_lookup_code), addr: shippingAddressKey(o.address, o.detail_address), kakao: clean(o.kakao_id), phone: clean(o.customer_phone), broadcast: clean(o.broadcast_id), day: clean(o.created_at).slice(0, 10) },
          ));
          if (hit) { byCode[code].combined = true; byCode[code].combinedWith = clean(hit.order_lookup_code); }
        }
      } catch { /* 합배송 조회 실패는 무시 — combine_shipping_memo 신호만으로도 동작 */ }
    }

    return NextResponse.json({ ok: true, byCode });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "주문 줄 조회 실패" }, { status: 500 });
  }
}
