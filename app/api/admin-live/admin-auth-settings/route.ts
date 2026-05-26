import { NextRequest, NextResponse } from "next/server";
import {
  adminAuthErrorMessage,
  assertAdminRequest,
  getCurrentAdminAuthStatus,
  updateAdminCredentials,
} from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = assertAdminRequest(request);

  if (!auth.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: adminAuthErrorMessage(auth),
      },
      { status: 401 },
    );
  }

  const status = await getCurrentAdminAuthStatus();

  return NextResponse.json({
    ok: true,
    username: status.username,
    usingCustomCredentials: status.usingCustomCredentials,
    updatedAt: status.updatedAt,
  });
}

export async function POST(request: NextRequest) {
  const auth = assertAdminRequest(request);

  if (!auth.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: adminAuthErrorMessage(auth),
      },
      { status: 401 },
    );
  }

  try {
    const body = await request.json().catch(() => null);

    const currentUsername = String(body?.currentUsername || "");
    const currentPassword = String(body?.currentPassword || "");
    const nextUsername = String(body?.nextUsername || "");
    const nextPassword = String(body?.nextPassword || "");
    const nextPasswordConfirm = String(body?.nextPasswordConfirm || "");

    if (nextPassword !== nextPasswordConfirm) {
      return NextResponse.json(
        {
          ok: false,
          message: "새 비밀번호와 새 비밀번호 확인이 일치하지 않습니다.",
        },
        { status: 400 },
      );
    }

    const result = await updateAdminCredentials({
      currentUsername,
      currentPassword,
      nextUsername,
      nextPassword,
    });

    return NextResponse.json({
      ok: true,
      username: result.username,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "관리자 보안 설정 저장 중 오류가 발생했습니다.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 400 },
    );
  }
}
