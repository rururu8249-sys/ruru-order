// app/api/admin-live/subscribe-verify/route.ts
// [2026-11-01] 관리자 — 구독 인증 목록(캡처 보기) · 인증 취소/되살리기. 관리자만(미들웨어 + 여기서 한 번 더).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { SUBSCRIBE_PROOF_BUCKET, resolveSubscribeBenefitWindow } from "@/lib/subscribeFreeShipServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
  if (!url || !key) throw new Error("Supabase 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const supabase = db();
    const url = new URL(request.url);
    const page = Math.min(100000, Math.max(0, Number.parseInt(url.searchParams.get("page") || "0", 10) || 0));
    const limit = 10;
    const filter = String(url.searchParams.get("filter") || "all");
    const q = String(url.searchParams.get("q") || "").slice(0, 60).replace(/[^0-9A-Za-z가-힣#_\- ]/g, "").trim();
    const statuses = ["verified", "rejected", "canceled"] as const;
    const countResults = await Promise.all(statuses.map((status) => supabase.from("subscribe_verifications")
      .select("id", { count: "exact", head: true }).eq("status", status)));
    const counts = {
      verified: countResults[0].count || 0,
      rejected: countResults[1].count || 0,
      canceled: countResults[2].count || 0,
      all: countResults.reduce((sum, item) => sum + (item.count || 0), 0),
    };
    let listQuery = supabase
      .from("subscribe_verifications")
      .select("id,kakao_id,customer_phone,youtube_nickname,status,reason,ai_note,image_path,created_at,canceled_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);
    if (statuses.includes(filter as (typeof statuses)[number])) listQuery = listQuery.eq("status", filter);
    if (q) listQuery = listQuery.or(`youtube_nickname.ilike.%${q}%,customer_phone.ilike.%${q}%`);
    const { data, error, count: total } = await listQuery;
    if (error) return NextResponse.json({ ok: false, message: error.message, rows: [] }, { status: 200 });
    // 이 손님이 구독 무배로 낸 주문서 수(orders.subscribe_free_ship_at — 칸이 없으면 0)
    const kakaoIds = Array.from(new Set((data || []).map((r) => String(r.kakao_id || "")).filter(Boolean)));
    const orderCount = new Map<string, number>();
    if (kakaoIds.length) {
      const { data: od, error: oe } = await supabase
        .from("orders")
        .select("kakao_id, order_group_id")
        .in("kakao_id", kakaoIds)
        .not("subscribe_free_ship_at", "is", null)
        .limit(5000);
      if (!oe) {
        const seen = new Set<string>();
        for (const o of od || []) {
          const key = `${o.kakao_id}|${o.order_group_id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          orderCount.set(String(o.kakao_id), (orderCount.get(String(o.kakao_id)) || 0) + 1);
        }
      }
    }
    const rows = await Promise.all(
      (data || []).map(async (row) => {
        let imageUrl = "";
        if (row.image_path) {
          const { data: signed } = await supabase.storage.from(SUBSCRIBE_PROOF_BUCKET).createSignedUrl(row.image_path, 3600);
          imageUrl = signed?.signedUrl || "";
        }
        const phone = String(row.customer_phone || "");
        return { ...row, image_path: undefined, customer_phone: phone ? `${phone.slice(0, 3)}-****-${phone.slice(-4)}` : "", imageUrl, orderCount: row.status === "verified" ? orderCount.get(String(row.kakao_id)) || 0 : 0 };
      }),
    );
    return NextResponse.json({ ok: true, rows, total: total || 0, counts });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "조회 실패", rows: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const body = (await request.json().catch(() => null)) as { action?: string; id?: number; phone?: string } | null;
    const supabase = db();
    // [2026-11-23 사장님] 캡처를 카톡으로 보낸 손님 — 전화번호로 찾아 사장님이 직접 인증(캡처 올리기 없이).
    //   이미 혜택을 쓴 손님(redemptions)·이미 인증된 손님은 새로 만들지 않는다. 돈 무접촉(인증 줄 한 개만).
    if (body?.action === "manual") {
      const digits = String(body?.phone || "").replace(/[^0-9]/g, "");
      if (digits.length < 9) return NextResponse.json({ ok: false, message: "전화번호를 숫자로 적어 주세요." }, { status: 400 });
      const dashed = digits.length === 11 ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}` : digits;
      const { data: found, error: findError } = await supabase.from("customers").select("id,kakao_id,customer_phone,youtube_nickname,customer_name")
        .in("customer_phone", Array.from(new Set([digits, dashed]))).limit(5);
      if (findError) throw findError;
      const customer = (found || []).find((c: { kakao_id?: string | null }) => String(c.kakao_id || "").trim());
      if (!customer) return NextResponse.json({ ok: false, message: "그 번호로 가입한(카톡 로그인) 회원이 없어요." }, { status: 404 });
      const kakaoId = String(customer.kakao_id).trim();
      const { data: used } = await supabase.from("subscribe_free_ship_redemptions").select("kakao_id").eq("kakao_id", kakaoId).maybeSingle();
      if (used) return NextResponse.json({ ok: false, message: `${customer.youtube_nickname || customer.customer_name || "이 손님"}님은 이미 구독 무배 혜택을 썼어요(1회).` }, { status: 409 });
      const { data: already } = await supabase.from("subscribe_verifications").select("id").eq("kakao_id", kakaoId).eq("status", "verified").limit(1);
      if (already?.length) return NextResponse.json({ ok: true, already: true, message: `${customer.youtube_nickname || customer.customer_name || "이 손님"}님은 이미 인증돼 있어요. 새로고침 후 주문하면 배송비가 빠져요.` });
      const benefitWindow = await resolveSubscribeBenefitWindow(supabase);
      const { error: insError } = await supabase.from("subscribe_verifications").insert({
        kakao_id: kakaoId, customer_phone: digits.slice(0, 11), youtube_nickname: customer.youtube_nickname || null,
        channel_name: null, status: "verified", reason: null, ai_note: "사장님 직접 인증(카톡 캡처 확인)", image_path: null, image_hash: null,
        benefit_window_start_at: benefitWindow.startAt, benefit_window_end_at: benefitWindow.endAt, benefit_broadcast_id: benefitWindow.broadcastId,
      });
      if (insError) throw insError;
      return NextResponse.json({ ok: true, message: `${customer.youtube_nickname || customer.customer_name || "손님"}님 인증 처리했어요. 손님이 새로고침 후 이 방송(오늘) 안에 주문하면 배송비가 빠져요.` });
    }
    const id = Number(body?.id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ ok: false, message: "잘못된 요청" }, { status: 400 });
    if (body?.action === "cancel") {
      const { error } = await supabase.from("subscribe_verifications").update({ status: "canceled", canceled_at: new Date().toISOString() }).eq("id", id).eq("status", "verified");
      if (error) throw error;
    } else if (body?.action === "approve") {
      // 불합격·취소된 건을 사장님이 직접 통과
      const benefitWindow = await resolveSubscribeBenefitWindow(supabase);
      const { error } = await supabase.from("subscribe_verifications").update({
        status: "verified", canceled_at: null,
        benefit_window_start_at: benefitWindow.startAt,
        benefit_window_end_at: benefitWindow.endAt,
        benefit_broadcast_id: benefitWindow.broadcastId,
      }).eq("id", id);
      if (error) throw error;
    } else {
      return NextResponse.json({ ok: false, message: "잘못된 요청" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "저장 실패" }, { status: 500 });
  }
}
