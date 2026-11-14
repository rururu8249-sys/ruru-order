// app/api/cron/welcome-expire/route.ts
// [2026-11-14 사장님] 방송 시청 선물 포인트 — 지급 30일 지나 안 쓴 만큼 자동 소멸(하루 한 번, 한국 새벽 4시).
//   계산·차감은 lib/welcomeExpire(기존 포인트 RPC deduct 만). 인증은 cart-holds-sweep 과 같은 방식.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runWelcomeExpiry } from "@/lib/welcomeExpire";

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
  const r = await runWelcomeExpiry(supabase);
  if (r.error) return NextResponse.json({ ok: false, ...r }, { status: 500 });
  return NextResponse.json({ ok: true, ...r });
}

export async function GET(request: NextRequest) { return run(request); }
export async function POST(request: NextRequest) { return run(request); }
