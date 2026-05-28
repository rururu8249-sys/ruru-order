import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  EMPTY_OPERATOR_TEST_ACCOUNT_FLAGS,
  normalizeOperatorTestPhone,
  operatorTestFlagsFromRow,
  type OperatorTestAccountRow,
} from "@/lib/customerTestAccounts";

export const dynamic = "force-dynamic";

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
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const phone = normalizeOperatorTestPhone(searchParams.get("phone"));

  if (phone.length < 10) {
    return NextResponse.json({
      ok: true,
      phone,
      ...EMPTY_OPERATOR_TEST_ACCOUNT_FLAGS,
    });
  }

  try {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from("operator_test_accounts")
      .select(
        "customer_phone, display_label, is_active, allow_point_test, allow_amount_test, exclude_from_settlement, exclude_from_payment_match, exclude_from_shipping, exclude_from_picking"
      )
      .eq("customer_phone", phone)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      const message = String(error.message || "");

      if (message.includes("operator_test_accounts") || message.includes("does not exist")) {
        return NextResponse.json({
          ok: true,
          phone,
          table_ready: false,
          ...EMPTY_OPERATOR_TEST_ACCOUNT_FLAGS,
        });
      }

      throw new Error(message || "운영자 테스트 계정 조회 실패");
    }

    const flags = operatorTestFlagsFromRow((data || null) as OperatorTestAccountRow | null);

    return NextResponse.json({
      ok: true,
      phone,
      table_ready: true,
      ...flags,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        phone,
        message: error instanceof Error ? error.message : "운영자 테스트 계정 조회 실패",
        ...EMPTY_OPERATOR_TEST_ACCOUNT_FLAGS,
      },
      { status: 200 }
    );
  }
}
