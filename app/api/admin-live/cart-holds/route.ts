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

    // [2026-07-17 사장님 지침 v2] 기본은 "현재 방송에 진열된 상품"의 담김만 표시.
    //   ※ 처음엔 방송 시작 시각(created_at) 기준으로 걸렀으나 실패 — 고객 장바구니에 남아 있던
    //     옛 상품도 재접속 시 예약이 통째로 갱신되며 created_at이 새로 찍혀 시간으로는 못 거름.
    //   → 활성 방송의 broadcast_products에 연결된 product_id 집합으로 필터(상품 기준).
    //   ?scope=all 이면 기존대로 전부 표시(팝업 토글). 방송 OFF면 전체 표시(쇼핑몰 모드).
    //   활성 방송 탐지는 대시보드/미션과 동일 패턴(status 대소문자 무시 + 삭제 제외). 읽기 전용.
    const scopeAll = new URL(request.url).searchParams.get("scope") === "all";
    let broadcastTitle = "";
    let allowedProductIds: Set<string> | null = null;
    if (!scopeAll) {
      const { data: bcs } = await supabase
        .from("broadcasts")
        .select("id,public_title,started_at,status,is_deleted")
        .order("started_at", { ascending: false })
        .limit(20);
      const active = ((bcs || []) as Record<string, unknown>[]).find(
        (b) => b.is_deleted !== true && String(b.status || "").toUpperCase() === "ON"
      );
      if (active && active.id) {
        broadcastTitle = String(active.public_title ?? "").trim();
        const { data: bps } = await supabase
          .from("broadcast_products")
          .select("product_id, is_visible")
          .eq("broadcast_id", active.id)
          .limit(500);
        allowedProductIds = new Set(
          ((bps || []) as Record<string, unknown>[])
            .filter((b) => b.is_visible !== false)
            .map((b) => String(b.product_id ?? ""))
            .filter(Boolean)
        );
      }
    }

    const { data, error } = await supabase
      .from("cart_reservations")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true })
      .limit(2000);
    if (error) return NextResponse.json({ ok: false, error: { message: error.message } }, { status: 500 });

    let rows = (data || []) as Record<string, unknown>[];
    if (allowedProductIds) {
      rows = rows.filter((r) => allowedProductIds!.has(String(r.product_id ?? "")));
    }
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

      // [2026-07-16] 2차 폴백: customers(카톡 가입 정보) — 주문 이력 없는 신규 고객도
      //   가입/닉네임 입력 시점 값이 있음. customer_phone이 하이픈 유무 섞여 저장돼 있어
      //   두 형식 모두로 조회(주문페이지와 동일 패턴), 매칭 키는 숫자만으로 정규화.
      const hyph = (d: string) =>
        d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d;
      const phoneVariants = Array.from(new Set(phones.flatMap((p) => [p, hyph(p)])));
      const { data: custs } = await supabase
        .from("customers")
        .select("customer_phone, youtube_nickname, customer_name")
        .in("customer_phone", phoneVariants)
        .limit(500);
      for (const c of (custs || []) as Record<string, unknown>[]) {
        const ph = String(c.customer_phone ?? "").replace(/[^0-9]/g, "");
        if (!ph) continue;
        const prev = who[ph] || { nickname: "", name: "" };
        who[ph] = {
          nickname: prev.nickname || String(c.youtube_nickname ?? "").trim(),
          name: prev.name || String(c.customer_name ?? "").trim(),
        };
      }
    }

    const holds = rows.map((r) => {
      const ph = String(r.customer_phone ?? "");
      // [2026-07-16] 예약에 저장된 닉네임/이름 우선(담는 시점 입력값 — 첫 구매 고객도 표시됨),
      //   없으면(컬럼 추가 전 옛 예약) 주문 이력 매칭 폴백.
      return {
        sessionKey: String(r.session_key ?? ""),
        phone: ph,
        nickname: String(r.nickname ?? "").trim() || who[ph]?.nickname || "",
        name: String(r.customer_name ?? "").trim() || who[ph]?.name || "",
        productId: String(r.product_id ?? ""),
        productName: names[String(r.product_id ?? "")] || "상품",
        color: String(r.color ?? ""),
        size: String(r.size ?? ""),
        qty: Number(r.qty) || 0,
        expiresAt: String(r.expires_at ?? ""),
        createdAt: String(r.created_at ?? ""),
      };
    });

    return NextResponse.json({
      ok: true,
      holds,
      scope: allowedProductIds ? "broadcast" : "all",
      broadcastTitle,
    });
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
