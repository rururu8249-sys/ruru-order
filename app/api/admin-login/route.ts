// app/api/admin-login/route.ts
// 새 파일 생성
// 위치: /Users/ruru/Desktop/ruru-order-app/app/api/admin-login/route.ts
// 목적: 관리자 비밀번호 확인 후 보안 쿠키 저장
// 주의: 비밀번호는 코드에 직접 적지 않고 .env.local / Vercel Environment Variables에 저장합니다.

import { NextRequest, NextResponse } from "next/server";

const ADMIN_COOKIE_NAME = "ruru_admin_session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const inputPassword = String(body?.password || "");

    const adminPassword = process.env.ADMIN_PASSWORD;
    const sessionToken = process.env.ADMIN_SESSION_TOKEN;

    if (!adminPassword || !sessionToken) {
      return NextResponse.json(
        {
          ok: false,
          message: "관리자 보안 환경변수가 설정되지 않았습니다.",
        },
        { status: 500 }
      );
    }

    if (inputPassword !== adminPassword) {
      return NextResponse.json(
        {
          ok: false,
          message: "비밀번호가 올바르지 않습니다.",
        },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      ok: true,
    });

    response.cookies.set(ADMIN_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return response;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "로그인 처리 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
