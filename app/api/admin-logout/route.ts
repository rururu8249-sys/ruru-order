import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE_NAME, getAdminSessionClearCookieOptions } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

function createLogoutResponse() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, "", getAdminSessionClearCookieOptions());
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST() {
  return createLogoutResponse();
}

export async function GET() {
  return createLogoutResponse();
}
