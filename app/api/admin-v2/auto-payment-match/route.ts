// app/api/admin-v2/auto-payment-match/route.ts
// 목적: 저장된 deposits 기준으로 보수적 자동매칭 실행

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runAutoPaymentMatch } from "@/lib/admin-v2/autoPaymentMatch";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST() {
  try {
    const supabase = getSupabaseAdmin();
    const result = await runAutoPaymentMatch(supabase);

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
