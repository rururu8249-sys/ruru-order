import { NextRequest, NextResponse } from "next/server";
import { setAdminSessionCookie, verifyAdminLogin } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const username = String(body?.username || "");
    const password = String(body?.password || "");
    const remember = Boolean(body?.remember);

    const ok = await verifyAdminLogin(username, password);

    if (!ok) {
      return NextResponse.json(
        {
          ok: false,
          message: "아이디 또는 비밀번호가 올바르지 않습니다.",
        },
        { status: 401 },
      );
    }

    const response = NextResponse.json({
      ok: true,
    });

    setAdminSessionCookie(response, remember);

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "로그인 처리 중 오류가 발생했습니다.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 },
    );
  }
}
