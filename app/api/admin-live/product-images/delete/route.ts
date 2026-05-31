import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

const BUCKET_NAME = "product-images";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service role 환경변수가 없습니다.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(request: NextRequest) {
  const adminSession = await verifyAdminSessionFromRequest(request);

  if (!adminSession) {
    return jsonError("관리자 로그인이 필요합니다. /admin-login에서 다시 로그인 후 새로고침해주세요.", 401);
  }

  try {
    const body = await request.json();
    const paths = Array.isArray(body?.paths)
      ? body.paths
      : body?.path
        ? [body.path]
        : [];

    const safePaths = paths
      .map((item: unknown) => String(item || "").trim())
      .filter((item: string) => item.startsWith("products/"));

    if (!safePaths.length) {
      return jsonError("삭제할 이미지 경로가 없습니다.");
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase.storage.from(BUCKET_NAME).remove(safePaths);

    if (error) {
      return jsonError(error.message, 500);
    }

    return NextResponse.json({
      ok: true,
      deleted: safePaths,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return jsonError(message, 500);
  }
}
