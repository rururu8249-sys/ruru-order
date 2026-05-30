import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

const ADMIN_PAGE_PREFIXES = ["/admin", "/admin-live", "/admin-v2"];
const ADMIN_API_PREFIXES = ["/api/admin-live", "/api/admin-v2", "/api/bankda"];

function startsWithPath(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

function isAdminPage(pathname: string) {
  return ADMIN_PAGE_PREFIXES.some((prefix) => startsWithPath(pathname, prefix));
}

function isAdminApi(pathname: string) {
  return ADMIN_API_PREFIXES.some((prefix) => startsWithPath(pathname, prefix));
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const shouldProtectPage = isAdminPage(pathname);
  const shouldProtectApi = isAdminApi(pathname);

  if (!shouldProtectPage && !shouldProtectApi) {
    return NextResponse.next();
  }

  const session = await verifyAdminSessionFromRequest(request);

  if (session) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  if (shouldProtectApi) {
    return NextResponse.json(
      { ok: false, message: "관리자 로그인이 필요합니다." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const loginUrl = new URL("/admin-login", request.url);
  loginUrl.searchParams.set("next", pathname + request.nextUrl.search);

  const response = NextResponse.redirect(loginUrl);
  response.headers.set("Cache-Control", "no-store");

  return response;
}

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/admin-live",
    "/admin-live/:path*",
    "/admin-v2",
    "/admin-v2/:path*",
    "/api/admin-live/:path*",
    "/api/admin-v2/:path*",
    "/api/bankda/:path*",
  ],
};
