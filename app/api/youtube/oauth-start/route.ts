import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { assertAdminRequest, adminAuthErrorMessage } from "@/lib/adminAuth";
import { YOUTUBE_AUTH_URL, YOUTUBE_OAUTH_SCOPE, getYoutubeClientId } from "@/lib/youtube";

export const runtime = "nodejs";

// 관리자가 이 주소로 접속하면 구글 로그인(봇 계정) 동의 화면으로 보냄.
// access_type=offline + prompt=consent 로 refresh token을 확실히 받는다.
export async function GET(request: NextRequest) {
  const auth = assertAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: adminAuthErrorMessage(auth) }, { status: 401 });
  }

  const clientId = getYoutubeClientId();
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "YOUTUBE_CLIENT_ID 환경변수가 없습니다." }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/youtube/oauth-callback`;
  const state = randomBytes(16).toString("hex");

  const url = new URL(YOUTUBE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", YOUTUBE_OAUTH_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url.toString());
  res.cookies.set("ruru_yt_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
