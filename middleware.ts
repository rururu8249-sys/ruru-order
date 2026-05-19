// middleware.ts
// 새 파일 생성
// 위치: /Users/ruru/Desktop/ruru-order-app/middleware.ts
// 목적: /admin-v2 관리자 페이지 접근 전 비밀번호 로그인 여부 확인
// 주의: AdminV2Client.tsx 관리자 본체는 건드리지 않습니다.

import { NextRequest, NextResponse } from "next/server";

const ADMIN_COOKIE_NAME = "ruru_admin_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/admin-v2")) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const expectedToken = process.env.ADMIN_SESSION_TOKEN;

  if (expectedToken && sessionToken === expectedToken) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/admin-login";
  loginUrl.searchParams.set("next", pathname);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin-v2/:path*"],
};
