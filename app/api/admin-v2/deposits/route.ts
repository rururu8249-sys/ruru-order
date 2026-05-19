// app/api/admin-v2/deposits/route.ts
// deposits 테이블을 서버 권한으로 조회해서 관리자 화면에 전달

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("deposits")
      .select("*")
      .order("id", { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message, deposits: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      count: data?.length || 0,
      deposits: data || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        deposits: [],
      },
      { status: 500 }
    );
  }
}
