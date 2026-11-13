import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/youtube";
import { chatRoleOfKakao } from "@/lib/liveChatServer";
import { loadChatCommandProducts } from "@/lib/liveChatProductCommandServer";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const bc = request.nextUrl.searchParams.get("bc") || "";
  if (!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(bc)) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    const sb = getServiceClient();
    const role = await chatRoleOfKakao(sb, request.nextUrl.searchParams.get("kakao_id") || "");
    if (!role.isManager) return NextResponse.json({ ok: false, message: "관리자만 상품을 선택할 수 있어요." }, { status: 403 });
    const items = await loadChatCommandProducts(sb, bc);
    return NextResponse.json({ ok: true, items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false, message: "상품을 불러오지 못했어요. 다시 시도해 주세요." }, { status: 503 });
  }
}
