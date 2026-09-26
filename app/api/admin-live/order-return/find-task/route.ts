// [2026-09-27] 주문상세 「반품 취소」용 — 이 주문의 «활성» order_return_flow 고객이슈 id 를 찾아준다(읽기 전용).
//   포인트/반품 되돌림은 기존 order-return/undo 가 taskId 로 수행한다. 이 라우트는 그 taskId 만 찾아줄 뿐,
//   어떤 돈·반품 기록도 바꾸지 않는다(admin_tasks SELECT 만). verifyAdminSession + service_role.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase 관리자 환경변수가 설정되지 않았습니다.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

const clean = (v: unknown) => String(v ?? "").trim();

export async function GET(request: NextRequest) {
  const adminSession = await verifyAdminSessionFromRequest(request);
  if (!adminSession) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });

  const orderCode = clean(new URL(request.url).searchParams.get("orderCode")).slice(0, 120);
  if (!orderCode) return NextResponse.json({ ok: true, taskId: "", count: 0 });

  try {
    const supabase = getSupabaseAdminClient();
    // undo 와 같은 링크(이슈 body 의 「주문번호: {code}」) + source=order_return_flow. 되돌림 가능 조건(활성)만.
    const { data, error } = await supabase
      .from("admin_tasks")
      .select("id, status, is_resolved, created_at")
      .eq("source", "order_return_flow")
      .ilike("body", `%주문번호: ${orderCode}%`)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });

    const active = ((data as Array<Record<string, unknown>>) || []).filter((t) => {
      const st = clean(t.status).toLowerCase();
      return st !== "deleted" && st !== "done" && t.is_resolved !== true;
    });
    return NextResponse.json({ ok: true, taskId: active[0] ? clean(active[0].id) : "", count: active.length });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "조회 실패" }, { status: 500 });
  }
}
