// [2026-11-12] 방송 시청 선물 포인트 설정 — 관리자만. 비공개 저장소에 저장(손님 쓰기 불가).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { kstDayStartIso, parseWelcomePointConfig } from "@/lib/welcomePoint";
import { grantedTodayCount, listWelcomeRecipients, readWelcomeConfig, summarizeWelcome, writeWelcomeConfig } from "@/lib/welcomePointServer";

export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !key) throw new Error("Supabase 환경변수가 없어요");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(req: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(req))) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요해요" }, { status: 401 });
  try {
    const sb = admin();
    // 선물 받은 사람 목록(페이지) — 읽기만. 첫 페이지에서만 최근 30일 요약을 같이 계산.
    if (req.nextUrl.searchParams.get("list") === "1") {
      const size = [10, 20, 50].includes(Number(req.nextUrl.searchParams.get("size"))) ? Number(req.nextUrl.searchParams.get("size")) : 20;
      const page = Math.max(1, Math.min(10000, Math.floor(Number(req.nextUrl.searchParams.get("page")) || 1)));
      const [list, summary] = await Promise.all([
        listWelcomeRecipients(sb, page, size),
        page === 1 ? summarizeWelcome(sb, Date.now()).catch(() => null) : Promise.resolve(null),
      ]);
      return NextResponse.json({ ok: true, page, size, total: list.total, rows: list.rows, summary });
    }
    const config = await readWelcomeConfig(sb, true);
    const today = await grantedTodayCount(sb, kstDayStartIso(Date.now())).catch(() => null);
    return NextResponse.json({ ok: true, config, today });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "읽기 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(req))) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요해요" }, { status: 401 });
  try {
    const body = await req.json().catch(() => null);
    const config = await writeWelcomeConfig(admin(), parseWelcomePointConfig(body?.config));
    return NextResponse.json({ ok: true, config });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "저장 실패" }, { status: 500 });
  }
}
