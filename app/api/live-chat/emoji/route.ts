// app/api/live-chat/emoji/route.ts
// [2026-11-10] 사이트 채팅 이모티콘(손님용) — GET ?kakao_id= → 켜진 이모티콘 목록(그림 주소·이름) + 이 손님이 쓸 수 있는지.
//   목록은 누구나(채팅에 그림을 그려야 하니까), 쓸 수 있는지는 서버가 판정(누적 구매·명단·최고 관리자). 쓰기 없음.
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/youtube";
import { canUseChatEmoji, readEmojiSetting } from "@/lib/liveChatEmojiServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sb = getServiceClient();
    const setting = await readEmojiSetting(sb);
    const items = setting.items.filter((e) => e.on).map((e) => ({ id: e.id, name: e.name, url: e.url, on: true, ...(Array.isArray(e.keywords) ? { keywords: e.keywords } : {}) }));
    const kakaoId = String(request.nextUrl.searchParams.get("kakao_id") ?? "").trim().slice(0, 64);
    const canUse = items.length > 0 && kakaoId ? await canUseChatEmoji(sb, kakaoId, setting).catch(() => false) : false;
    return NextResponse.json({ ok: true, items, canUse });
  } catch {
    return NextResponse.json({ ok: false, items: [], canUse: false }, { status: 500 });
  }
}
