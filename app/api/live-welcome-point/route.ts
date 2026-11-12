// [2026-11-12] 방송 시청 선물 포인트 — 손님용.
//   GET  ?kakao=&phone=  → 이 손님이 받을 수 있는 선물(없으면 offer null)
//   POST {kakao_id, phone} → 조건 다시 확인 후 기존 포인트 지급 RPC(중복 방지 키)로 한 번만 지급
//   돈: 포인트 «지급»만(기존 RPC 그대로). 주문·입금·정산 무접촉(주문은 읽기만). 판단·지급 본체는 lib/welcomePointServer(테스트 대상).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { WELCOME_REASON, welcomeHelpLines } from "@/lib/welcomePoint";
import { claimWelcome, evaluateWelcome } from "@/lib/welcomePointServer";

export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !key) throw new Error("Supabase 환경변수가 없어요");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const { cfg, decision } = await evaluateWelcome(admin(), String(sp.get("kakao") || ""), String(sp.get("phone") || ""), Date.now());
    if (!decision) return NextResponse.json({ ok: true, offer: null }, { headers: NO_STORE });
    const help = welcomeHelpLines(decision.kind, decision.amount, cfg.watchSec);
    return NextResponse.json(
      { ok: true, offer: { kind: decision.kind, amount: decision.amount, watchSec: cfg.watchSec, label: WELCOME_REASON[decision.kind], help } },
      { headers: NO_STORE },
    );
  } catch {
    return NextResponse.json({ ok: true, offer: null }, { headers: NO_STORE }); // 모르면 안 보여 줌
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { kakao_id?: unknown; phone?: unknown } | null;
  try {
    const r = await claimWelcome(admin(), String(body?.kakao_id || ""), String(body?.phone || ""), Date.now());
    if (!r.ok) return NextResponse.json({ ok: false, message: r.message }, { status: r.status, headers: NO_STORE });
    return NextResponse.json(r, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ ok: false, message: "잠시 뒤 다시 시도해 주세요" }, { status: 503, headers: NO_STORE });
  }
}
