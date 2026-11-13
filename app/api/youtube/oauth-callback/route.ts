import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { exchangeCodeForRefreshToken, saveRefreshToken } from "@/lib/youtube";

export const runtime = "nodejs";

// 구글이 인증 후 이 주소로 돌려보냄. 코드를 refresh token으로 교환해 서버 전용 테이블에 저장.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const back = (ok: boolean, msg: string) =>
    NextResponse.redirect(`${origin}/admin-live?panel=settings&yt=${ok ? "connected" : "error"}&msg=${encodeURIComponent(msg)}`);

  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return back(false, "관리자 로그인이 필요합니다. /admin-login 후 다시 시도하세요.");

  const err = url.searchParams.get("error");
  if (err) return back(false, "구글 인증 취소/오류: " + err);

  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const cookieState = request.cookies.get("ruru_yt_oauth_state")?.value || "";
  if (!code) return back(false, "인증 코드가 없습니다.");
  if (!state || state !== cookieState) return back(false, "보안 검증 실패(state 불일치). 다시 시도하세요.");

  try {
    const redirectUri = `${origin}/api/youtube/oauth-callback`;
    const refreshToken = await exchangeCodeForRefreshToken(code, redirectUri);
    await saveRefreshToken(refreshToken);
    const res = back(true, "유튜브 연결 완료");
    res.cookies.set("ruru_yt_oauth_state", "", { path: "/", maxAge: 0 });
    return res;
  } catch (e: any) {
    return back(false, String(e?.message || e));
  }
}
