import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

const ADMIN_PAGE_PREFIXES = ["/admin", "/admin-live", "/admin-v2"];
const ADMIN_API_PREFIXES = ["/api/admin-live", "/api/admin-v2", "/api/bankda"];

const INTERNAL_CRON_API_PATHS = [
  "/api/bankda/sync-and-auto-match",
  "/api/bankda/sync-deposits",
  "/api/admin-v2/auto-payment-match/run",
];

function startsWithPath(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

function isAdminPage(pathname: string) {
  return ADMIN_PAGE_PREFIXES.some((prefix) => startsWithPath(pathname, prefix));
}

function isAdminApi(pathname: string) {
  return ADMIN_API_PREFIXES.some((prefix) => startsWithPath(pathname, prefix));
}

function isInternalCronApi(pathname: string) {
  return INTERNAL_CRON_API_PATHS.includes(pathname);
}

function getBearerToken(value: string) {
  return value.startsWith("Bearer ") ? value.slice("Bearer ".length).trim() : "";
}

function isAuthorizedInternalCronRequest(request: NextRequest) {
  const providedSecret =
    request.headers.get("x-ruru-internal-cron") ||
    getBearerToken(request.headers.get("authorization") || "");

  const allowedSecrets = [
    String(process.env.CRON_SECRET || "").trim(),
    String(process.env.BANKDA_CRON_SECRET || "").trim(),
  ].filter(Boolean);

  return Boolean(providedSecret && allowedSecrets.includes(providedSecret));
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const shouldProtectPage = isAdminPage(pathname);
  const shouldProtectApi = isAdminApi(pathname);

  if (!shouldProtectPage && !shouldProtectApi) {
    return NextResponse.next();
  }

  if (
    shouldProtectApi &&
    isInternalCronApi(pathname) &&
    isAuthorizedInternalCronRequest(request)
  ) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    return response;
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
