// app/api/admin-live/cart-holds/route.ts
// [2026-07-13 사장님 지침] 담김 현황(장바구니 선점) 관리자 API.
//   - GET: 유효(미만료) 예약 전부 + 상품명 매핑 반환. 전화번호가 포함되므로 관리자 인증 필수
//     (catalog-write와 동일하게 verifyAdminSessionFromRequest).
//   - POST { action: "clear", sessionKey }: 특정 세션의 선점 강제 해제.
//   ⚠️ cart_reservations(표시용 예약)만 읽고 지움 — 진짜 재고 차감/복구·주문·돈 로직 무접촉.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL 없음");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 없음");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: { message: "관리자 인증이 필요합니다." } }, { status: 401 });
  }
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("cart_reservations")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true })
      .limit(2000);
    if (error) return NextResponse.json({ ok: false, error: { message: error.message } }, { status: 500 });

    const rows = (data || []) as Record<string, unknown>[];
    // [2026-07-16 버그수정] products에 name 컬럼이 없어 select가 통째로 에러 → 전부 "상품"으로 나오던 문제.
    //   실제 존재하는 컬럼(id, product_name)만 조회하고, 에러도 삼키지 않고 응답에 실어 보낸다.
    const ids = Array.from(new Set(rows.map((r) => String(r.product_id ?? "")).filter(Boolean)));
    const names: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: prods, error: prodErr } = await supabase.from("products").select("id, product_name").in("id", ids);
      if (prodErr) return NextResponse.json({ ok: false, error: { message: "상품명 조회 실패: " + prodErr.message } }, { status: 500 });
      for (const p of (prods || []) as Record<string, unknown>[]) {
        names[String(p.id)] = String(p.product_name ?? "").trim();
      }
    }

    // [2026-07-16 사장님 지침] 닉네임(이름) 표시 — 예약엔 전화번호만 저장되므로,
    //   같은 전화번호의 주문 이력에서 닉네임/이름을 찾아 붙인다(읽기 전용). 주문 이력 없으면 빈 값.
    const phones = Array.from(new Set(rows.map((r) => String(r.customer_phone ?? "")).filter(Boolean)));
    const who: Record<string, { nickname: string; name: string }> = {};
    if (phones.length > 0) {
      const { data: ords } = await supabase.from("orders").select("*").in("customer_phone", phones).limit(500);
      for (const o of (ords || []) as Record<string, unknown>[]) {
        const ph = String(o.customer_phone ?? "").trim();
        if (!ph) continue;
        const nickname = String((o.youtube_nickname as string) || (o.nickname as string) || "").trim();
        const name = String((o.customer_name as string) || (o.name as string) || "").trim();
        const prev = who[ph] || { nickname: "", name: "" };
        who[ph] = { nickname: prev.nickname || nickname, name: prev.name || name };
      }
    }

    const holds = rows.map((r) => {
      const ph = String(r.customer_phone ?? "");
      return {
        sessionKey: String(r.session_key ?? ""),
        phone: ph,
        nickname: who[ph]?.nickname || "",
        name: who[ph]?.name || "",
        productId: String(r.product_id ?? ""),
        productName: names[String(r.product_id ?? "")] || "상품",
        color: String(r.color ?? ""),
        size: String(r.size ?? ""),
        qty: Number(r.qty) || 0,
        expiresAt: String(r.expires_at ?? ""),
        createdAt: String(r.created_at ?? ""),
      };
    });

    return NextResponse.json({ ok: true, holds });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { message: String(e?.message ?? e) } }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: { message: "관리자 인증이 필요합니다." } }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({} as any));
    const action = String(body?.action || "").trim();
    const sessionKey = String(body?.sessionKey || "").trim();
    if (action !== "clear") return NextResponse.json({ ok: false, error: { message: "알 수 없는 action" } }, { status: 400 });
    if (!sessionKey) return NextResponse.json({ ok: false, error: { message: "sessionKey 없음" } }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("cart_reservations").delete().eq("session_key", sessionKey);
    if (error) return NextResponse.json({ ok: false, error: { message: error.message } }, { status: 500 });

    return NextResponse.json({ ok: true, cleared: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: { message: String(e?.message ?? e) } }, { status: 500 });
  }
}
