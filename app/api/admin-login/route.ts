import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  ADMIN_SESSION_REMEMBER_MAX_AGE_SECONDS,
  createAdminSession,
  getAdminSessionCookieOptions,
  isAdminAuthConfigured,
  verifyAdminCredentials,
} from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: any = null;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "로그인 요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (!isAdminAuthConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        message: "관리자 로그인 환경변수가 설정되지 않았습니다. Vercel 환경변수 RURU_ADMIN_ID, RURU_ADMIN_PASSWORD, ADMIN_SESSION_SECRET을 확인해주세요.",
      },
      { status: 500 },
    );
  }

  const loginId = String(body?.loginId ?? body?.username ?? body?.id ?? "").trim();
  const password = String(body?.password ?? "");
  const remember = Boolean(body?.remember);

  if (!loginId || !password) {
    return NextResponse.json({ ok: false, message: "아이디와 비밀번호를 입력해주세요." }, { status: 400 });
  }

  const result = await verifyAdminCredentials(loginId, password);

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const maxAge = remember ? ADMIN_SESSION_REMEMBER_MAX_AGE_SECONDS : ADMIN_SESSION_MAX_AGE_SECONDS;
  const token = await createAdminSession(loginId, maxAge);
  const response = NextResponse.json({ ok: true });

  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, token, getAdminSessionCookieOptions(maxAge));
  response.headers.set("Cache-Control", "no-store");

  return response;
}
