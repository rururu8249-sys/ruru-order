// [2026-09-25] 회원 목록 «현재 페이지 20명»분 추가정보(포인트 잔액 · 미해결 이슈 수)를 한 번에 묶어서 돌려준다.
//   회원 목록 패널이 쓰는 브라우저 supabase(anon)는 customer_point_balances / admin_tasks 가 RLS 로 막혀 0행이 온다.
//   → 여기서 service_role 로 읽어서 준다. 표시 전용(SELECT 만) — 돈/포인트 로직과 무관.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase 관리자 환경변수가 설정되지 않았습니다.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function digitsOnly(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

// 010-1234-5678 형태(저장 형식이 하이픈일 수도 있어 두 형식 모두로 조회한다)
function hyphenate(digits: string): string {
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}

export async function POST(request: NextRequest) {
  const adminSession = await verifyAdminSessionFromRequest(request);
  if (!adminSession) {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const rawPhones: unknown[] = Array.isArray(body?.phones) ? body.phones : [];
  const digits = Array.from(new Set(rawPhones.map(digitsOnly).filter((p) => p.length >= 8))).slice(0, 60);

  if (digits.length === 0) {
    return NextResponse.json({ ok: true, points: {}, openIssues: {} });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const forQuery = Array.from(new Set(digits.flatMap((p) => [p, hyphenate(p)]).filter(Boolean)));

    const [balRes, taskRes] = await Promise.all([
      supabase.from("customer_point_balances").select("customer_phone, current_points").in("customer_phone", forQuery),
      supabase.from("admin_tasks").select("customer_phone, status").eq("status", "open").in("customer_phone", forQuery),
    ]);

    const points: Record<string, number> = {};
    ((balRes.data as Array<{ customer_phone: unknown; current_points: unknown }>) || []).forEach((r) => {
      const p = digitsOnly(r.customer_phone);
      if (p) points[p] = Number(r.current_points) || 0;
    });

    const openIssues: Record<string, number> = {};
    ((taskRes.data as Array<{ customer_phone: unknown }>) || []).forEach((r) => {
      const p = digitsOnly(r.customer_phone);
      if (p) openIssues[p] = (openIssues[p] || 0) + 1;
    });

    return NextResponse.json({ ok: true, points, openIssues });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "추가정보 조회 실패", points: {}, openIssues: {} },
      { status: 500 },
    );
  }
}
