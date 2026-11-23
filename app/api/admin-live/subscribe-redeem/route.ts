// app/api/admin-live/subscribe-redeem/route.ts
// [2026-11-23 사장님] 구독 인증이 어려운 손님에게 사장님이 배송비를 수동으로 0원 처리해 준 경우,
//   «구독 무료배송 1회 혜택을 이 주문으로 썼다»고 기록한다 → 나중에 캡처 인증을 해도 두 번째 무료배송은 안 된다.
//   돈 무접촉: 배송비·금액·상태는 안 바꾸고 subscribe_free_ship_redemptions 한 줄 + orders.subscribe_free_ship_at 표시만.
//   되돌리기(undo)는 «수동으로 기록한 것»(주문서 제출 때 자동 기록된 subscribe_promo_redemption=true 가 아닌 것)만.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
  if (!url || !key) throw new Error("Supabase 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type OrderRow = { id: number; order_group_id: string | null; kakao_id: string | null; youtube_nickname: string | null; is_test_order: boolean | null; is_deleted: boolean | null; subscribe_promo_redemption: boolean | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function redeemSubscribeForOrder(supabase: any, rowIds: number[], action: "redeem" | "undo") {
  const ids = rowIds.filter((n) => Number.isFinite(n) && n > 0).slice(0, 200);
  if (ids.length === 0) return { ok: false, status: 400, message: "주문 줄이 없어요." };
  const { data, error } = await supabase.from("orders").select("id,order_group_id,kakao_id,youtube_nickname,is_test_order,is_deleted,subscribe_promo_redemption").in("id", ids);
  if (error) return { ok: false, status: 500, message: error.message };
  const rows = (data || []) as OrderRow[];
  if (rows.length === 0) return { ok: false, status: 404, message: "주문을 찾지 못했어요." };
  const groupIds = Array.from(new Set(rows.map((r) => String(r.order_group_id || "").trim()).filter(Boolean)));
  if (groupIds.length !== 1) return { ok: false, status: 400, message: "주문서 하나만 처리할 수 있어요." };
  const groupId = groupIds[0];
  if (rows.some((r) => r.is_test_order === true)) return { ok: false, status: 400, message: "테스트 주문은 기록하지 않아요." };
  let kakaoId = String(rows.find((r) => String(r.kakao_id || "").trim())?.kakao_id || "").trim();
  if (!kakaoId) {
    // [2026-11-24 실측 아로새로맘 7462] 주문 줄 kakao_id 가 빈 문자열인 경우가 있음(관리자 수정 경로) → 회원 표에서 전화번호로 찾는다
    const { data: more } = await supabase.from("orders").select("customer_phone").eq("order_group_id", groupId).limit(50);
    const phones = Array.from(new Set(((more || []) as Array<{ customer_phone?: string | null }>).map((r) => String(r.customer_phone || "").replace(/[^0-9]/g, "")).filter((p) => p.length >= 9)));
    if (phones.length > 0) {
      const dashed = phones.map((p) => (p.length === 11 ? `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}` : p));
      const { data: cust } = await supabase.from("customers").select("kakao_id").in("customer_phone", Array.from(new Set([...phones, ...dashed]))).limit(5);
      kakaoId = String(((cust || []) as Array<{ kakao_id?: string | null }>).find((c) => String(c.kakao_id || "").trim())?.kakao_id || "").trim();
    }
  }
  if (!kakaoId) return { ok: false, status: 400, message: "카톡 로그인 기록이 없는 손님이라 1회 사용 기록은 못 남겨요." };

  if (action === "undo") {
    if (rows.some((r) => r.subscribe_promo_redemption === true)) {
      return { ok: false, status: 400, message: "손님이 직접 인증해 받은 혜택이라 되돌릴 수 없어요." };
    }
    const { error: delError } = await supabase.from("subscribe_free_ship_redemptions").delete().eq("kakao_id", kakaoId).eq("order_group_id", groupId);
    if (delError) return { ok: false, status: 500, message: delError.message };
    const { error: clearError } = await supabase.from("orders").update({ subscribe_free_ship_at: null }).eq("order_group_id", groupId).eq("subscribe_promo_redemption", false);
    if (clearError) return { ok: false, status: 500, message: clearError.message };
    return { ok: true, status: 200, message: "구독 무배 사용 기록을 지웠어요." };
  }

  const { data: existing, error: exError } = await supabase.from("subscribe_free_ship_redemptions").select("order_group_id").eq("kakao_id", kakaoId).maybeSingle();
  if (exError) return { ok: false, status: 500, message: exError.message };
  if (existing) {
    const same = String(existing.order_group_id) === groupId;
    return { ok: same, status: same ? 200 : 409, already: true, message: same ? "이미 이 주문으로 기록돼 있어요." : "이 손님은 다른 주문에서 이미 구독 무배 혜택을 썼어요. 두 번째 무료배송은 원래 안 돼요." };
  }
  const { error: insError } = await supabase.from("subscribe_free_ship_redemptions").insert({ kakao_id: kakaoId, order_group_id: groupId });
  if (insError) return { ok: false, status: 500, message: insError.message };
  const { error: markError } = await supabase.from("orders").update({ subscribe_free_ship_at: new Date().toISOString() }).eq("order_group_id", groupId).is("subscribe_free_ship_at", null);
  if (markError) return { ok: false, status: 500, message: markError.message };
  return { ok: true, status: 200, message: "구독 무배 1회 사용으로 기록했어요. 이 손님은 캡처 인증을 해도 무료배송이 또 되지 않아요." };
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const body = (await request.json().catch(() => null)) as { rowIds?: unknown; action?: unknown } | null;
    const rowIds = Array.isArray(body?.rowIds) ? body!.rowIds.map((v) => Number(v)) : [];
    const action = body?.action === "undo" ? "undo" : "redeem";
    const result = await redeemSubscribeForOrder(db(), rowIds, action);
    return NextResponse.json({ ok: result.ok, message: result.message, already: (result as { already?: boolean }).already === true }, { status: result.status });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "저장 실패" }, { status: 500 });
  }
}
