// app/api/cron/cart-holds-sweep/route.ts
// [㉛ 2026-10-17] 만료된 장바구니 선점 정리 — 손님이 다시 접속하지 않아도 «서버가» 지운다(5분마다).
//   만료 기준 = 처음 담은 시각 + 유지시간(settings.cart_hold_minutes, claim_cart_hold 가 expires_at 에 넣음).
//   하는 일: lib/cartHoldSweep — 만료 줄마다 비움 기록(cart_clear_marks, expired) 후 cart_reservations 에서 삭제.
//   표시용 선점 전용 — 주문·재고·금액·입금·포인트 무관. 인증은 product-sales-stats cron 과 같은 방식.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sweepExpiredCartHolds } from "@/lib/cartHoldSweep";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function providedSecret(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  return (bearer || request.headers.get("x-cron-secret") || request.nextUrl.searchParams.get("secret") || "").trim();
}

function authorized(request: NextRequest) {
  if ((request.headers.get("user-agent") || "").includes("vercel-cron/1.0")) return true;
  const secrets = [String(process.env.CRON_SECRET || "").trim()].filter(Boolean);
  const given = providedSecret(request);
  return Boolean(given && secrets.includes(given));
}

async function run(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, message: "인증 실패" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: false, message: "Supabase 환경변수 없음" }, { status: 500 });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  // 한 번에 500줄씩, 최대 10번(5,000줄)까지 — 밀린 만료 줄도 한 번에 비운다.
  let deleted = 0, marked = 0;
  for (let round = 0; round < 10; round += 1) {
    const result = await sweepExpiredCartHolds(supabase);
    deleted += result.deleted;
    marked += result.marked;
    if (result.error) return NextResponse.json({ ok: false, deleted, marked, message: result.error }, { status: 500 });
    if (result.deleted === 0) break;
  }
  return NextResponse.json({ ok: true, deleted, marked });
}

export async function GET(request: NextRequest) { return run(request); }
export async function POST(request: NextRequest) { return run(request); }
