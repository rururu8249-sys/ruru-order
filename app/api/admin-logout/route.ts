// app/api/admin-logout/route.ts
// 새 파일 생성
// 위치: /Users/ruru/Desktop/ruru-order-app/app/api/admin-logout/route.ts
// 목적: 관리자 보안 쿠키 삭제
// 현재 관리자 화면에 버튼을 붙이지는 않았지만, 추후 관리자 로그아웃 버튼 연결용으로 사용 가능

import { NextRequest, NextResponse } from "next/server";

const ADMIN_COOKIE_NAME = "ruru_admin_session";

const clearCookie = (response: NextResponse) => {
  response.cookies.set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
};

export async function POST() {
  return clearCookie(
    NextResponse.json({
      ok: true,
    })
  );
}

export async function GET(request: NextRequest) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/admin-login";
  loginUrl.search = "";

  return clearCookie(NextResponse.redirect(loginUrl));
}
