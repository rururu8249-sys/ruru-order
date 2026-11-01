// app/api/admin-live/subscribe-verify/route.ts
// [2026-11-01] 관리자 — 구독 인증 목록(캡처 보기) · 인증 취소/되살리기. 관리자만(미들웨어 + 여기서 한 번 더).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { SUBSCRIBE_PROOF_BUCKET } from "@/lib/subscribeFreeShipServer";

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
    const { data, error } = await supabase
      .from("subscribe_verifications")
      .select("id,kakao_id,customer_phone,youtube_nickname,status,reason,ai_note,image_path,created_at,canceled_at")
      .order("created_at", { ascending: false })
      .limit(100);
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
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "조회 실패", rows: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const body = (await request.json().catch(() => null)) as { action?: string; id?: number } | null;
    const id = Number(body?.id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ ok: false, message: "잘못된 요청" }, { status: 400 });
    const supabase = db();
    if (body?.action === "cancel") {
      const { error } = await supabase.from("subscribe_verifications").update({ status: "canceled", canceled_at: new Date().toISOString() }).eq("id", id).eq("status", "verified");
      if (error) throw error;
    } else if (body?.action === "approve") {
      // 불합격·취소된 건을 사장님이 직접 통과
      const { error } = await supabase.from("subscribe_verifications").update({ status: "verified", canceled_at: null }).eq("id", id);
      if (error) throw error;
    } else {
      return NextResponse.json({ ok: false, message: "잘못된 요청" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "저장 실패" }, { status: 500 });
  }
}
