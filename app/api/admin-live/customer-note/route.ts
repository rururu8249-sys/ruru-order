// app/api/admin-live/customer-note/route.ts
// [2026-08-30 사장님 요청] "일반 쇼핑몰처럼 쪽지 알림"
//
//   기존 알림(checkout_reminder)은 문구가 고정이라 하고 싶은 말을 못 보냈다.
//   이 API 는 사장님이 직접 쓴 쪽지를 특정 손님에게 보낸다.
//
//   왜 사이트 안 쪽지인가 (웹푸시 대신)
//     · 카카오톡 인앱 브라우저는 웹푸시를 지원하지 않는다 (카카오 공식 답변)
//     · 아이폰은 홈화면에 추가한 사람만 웹푸시를 받는다
//     · 알림 권한은 손님이 눌러야만 허용되고, 한 번 차단하면 다시 못 묻는다
//   → 사이트 안 쪽지는 이 제약이 하나도 없다. 접속만 하면 누구나 본다.
//
// 주문·금액·입금·정산·배송·포인트 무접촉. customer_site_alerts 에만 쓴다.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase 관리자 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const digits = (v: unknown) => {
  const d = String(v ?? "").replace(/[^0-9]/g, "");
  return d.length >= 10 && d.length <= 11 ? d : "";
};

export async function POST(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const phone = digits(body.phone);
    const sessionKey = text(body.sessionKey, 80);
    const title = text(body.title, 60) || "📩 루루동이 알림";
    const message = text(body.message, 500);
    const hours = Math.min(72, Math.max(1, Math.floor(Number(body.hours) || 12)));

    if (!phone && sessionKey.length < 6) {
      return NextResponse.json({ ok: false, message: "받는 손님을 찾지 못했습니다(전화번호 또는 세션키 필요)." }, { status: 400 });
    }
    if (!message) return NextResponse.json({ ok: false, message: "보낼 내용을 적어주세요." }, { status: 400 });

    const sb = admin();
    const nowMs = Date.now();

    const { data, error } = await sb
      .from("customer_site_alerts")
      .insert({
        // 전화번호가 있으면 그걸 기준으로 — 기기를 바꿔도 그 손님이면 받는다.
        target_session_key: sessionKey || `phone:${phone}`,
        customer_phone: phone || null,
        kind: "admin_note",
        title,
        message,
        is_active: true,
        expires_at: new Date(nowMs + hours * 60 * 60 * 1000).toISOString(),
        sent_by: String((session as Record<string, unknown>)?.username || "admin").slice(0, 80),
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ ok: false, message: "쪽지 저장 실패: " + error.message }, { status: 500 });

    return NextResponse.json({ ok: true, id: (data as Record<string, unknown>)?.id, hours });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
