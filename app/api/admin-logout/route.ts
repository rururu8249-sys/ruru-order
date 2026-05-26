import { NextRequest, NextResponse } from "next/server";
import { clearAdminSessionCookie } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST() {
  return clearAdminSessionCookie(
    NextResponse.json({
      ok: true,
    }),
  );
}

export async function GET(request: NextRequest) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/admin-login";
  loginUrl.search = "";

  return clearAdminSessionCookie(NextResponse.redirect(loginUrl));
}
