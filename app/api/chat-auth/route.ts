// app/api/chat-auth/route.ts
// [2026-08-14 5단계] 채팅 계정 연결(인증코드 → 채널ID) — 발급 / 상태조회.
// 흐름: 사이트에서 코드 발급(POST) → 손님이 유튜브 채팅에 "인증 1234" 전송 →
//       파이프라인이 감지해 그 메시지의 channel_id를 customers.youtube_channel_id(신규 컬럼)에 저장 →
//       이후 채팅주문은 채널ID로 확정 매칭(유튜브 이름이 바뀌어도 유지).
// ⚠️ youtube_nickname(자동입금매칭 키)은 절대 안 쓴다. 쓰는 컬럼은 신규 3개뿐. 돈/재고/주문 무접촉.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL 없음");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 없음");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const cleanPhone = (v: unknown) => String(v ?? "").replace(/\D/g, "");

// POST { phone } → 인증코드 발급 (유효 30분, 활성 코드 있으면 재사용 — 스팸 재발급 방지)
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const phone = cleanPhone(body.phone);
    if (phone.length < 9) return NextResponse.json({ ok: false, error: "전화번호가 필요합니다." }, { status: 400 });
    const sb = sbAdmin();
    const nowIso = new Date().toISOString();
    const { data: exist } = await sb.from("chat_auth_codes")
      .select("code, expires_at").eq("customer_phone", phone).is("used_at", null).gt("expires_at", nowIso)
      .order("id", { ascending: false }).limit(1).maybeSingle();
    if (exist) {
      return NextResponse.json({ ok: true, code: (exist as Record<string, unknown>).code, expiresAt: (exist as Record<string, unknown>).expires_at });
    }
    // 4자리 코드 — "활성 코드끼리만" 안 겹치면 된다 (만료/사용된 과거 코드와는 겹쳐도 무방)
    let code = "";
    for (let i = 0; i < 10; i++) {
      const c = String(Math.floor(1000 + Math.random() * 9000));
      const { data: dup } = await sb.from("chat_auth_codes")
        .select("id").eq("code", c).is("used_at", null).gt("expires_at", nowIso).limit(1);
      if (!dup || dup.length === 0) { code = c; break; }
    }
    if (!code) return NextResponse.json({ ok: false, error: "코드 생성 실패 — 잠시 후 다시 시도해주세요." }, { status: 500 });
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await sb.from("chat_auth_codes").insert({ code, customer_phone: phone, expires_at: expiresAt });
    return NextResponse.json({ ok: true, code, expiresAt });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// GET ?phone= → { verified, code?, expiresAt? } — 사이트가 폴링해 "연결 완료"를 감지한다
export async function GET(request: NextRequest) {
  try {
    const phone = cleanPhone(request.nextUrl.searchParams.get("phone"));
    if (phone.length < 9) return NextResponse.json({ ok: true, verified: false });
    const sb = sbAdmin();
    const { data: cust } = await sb.from("customers")
      .select("youtube_channel_id").eq("customer_phone", phone)
      .not("youtube_channel_id", "is", null).limit(1).maybeSingle();
    if (String((cust as Record<string, unknown> | null)?.youtube_channel_id ?? "")) {
      return NextResponse.json({ ok: true, verified: true });
    }
    const { data: pending } = await sb.from("chat_auth_codes")
      .select("code, expires_at").eq("customer_phone", phone).is("used_at", null).gt("expires_at", new Date().toISOString())
      .order("id", { ascending: false }).limit(1).maybeSingle();
    return NextResponse.json({
      ok: true, verified: false,
      code: (pending as Record<string, unknown> | null)?.code ?? null,
      expiresAt: (pending as Record<string, unknown> | null)?.expires_at ?? null,
    });
  } catch {
    return NextResponse.json({ ok: true, verified: false });
  }
}
