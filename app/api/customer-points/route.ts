import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  assertValidCustomerPointPhone,
  formatCustomerPointMoney,
  readCurrentCustomerPoints,
  type CustomerPointBalanceRow,
} from "@/lib/customerPoints";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function getSupabaseReadClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    "";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = assertValidCustomerPointPhone(searchParams.get("phone") || searchParams.get("customer_phone"));

    const supabase = getSupabaseReadClient();

    const { data, error } = await supabase
      .from("customer_point_balances")
      .select("customer_phone, current_points, total_granted_points, total_used_points, total_canceled_points, total_adjusted_points, updated_at")
      .eq("customer_phone", phone)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "포인트 조회 실패");
    }

    const balance = (data || null) as CustomerPointBalanceRow | null;
    const currentPoints = readCurrentCustomerPoints(balance);

    return NextResponse.json({
      ok: true,
      current_points: currentPoints,
      current_points_text: formatCustomerPointMoney(currentPoints),
      has_balance: Boolean(balance),
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "포인트 조회 실패", 400);
  }
}
