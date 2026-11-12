import { NextRequest, NextResponse } from "next/server";
import { computeWidgetFeatured, type WidgetFeaturedState } from "@/lib/widgetFeaturedServer";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
// 손님이 많아도 DB 는 방송마다 몇 초에 한 번만 읽게(서버 메모리 + 짧은 CDN 캐시).
const cache = new Map<string, { at: number; value: Promise<WidgetFeaturedState> }>();
const TTL_MS = 3000;
const FRESH_MS = 1000;
export async function GET(request: NextRequest) {
  const bc = request.nextUrl.searchParams.get("bc") || "";
  if (!uuid.test(bc)) return NextResponse.json({ ok: false }, { status: 400 });
  const now = Date.now();
  // 상품 바뀜 소식 직후 손님 화면은 fresh=1 로 물음 → 1초보다 오래된 기억은 버리고 다시 읽음(1초 안 여러 손님은 한 번만 읽음).
  const fresh = request.nextUrl.searchParams.get("fresh") === "1";
  let hit = cache.get(bc);
  if (!hit || now - hit.at > (fresh ? FRESH_MS : TTL_MS)) {
    hit = { at: now, value: computeWidgetFeatured(bc) };
    cache.set(bc, hit);
    hit.value.catch(() => { if (cache.get(bc) === hit) cache.delete(bc); });
  }
  try {
    const state = await hit.value;
    return NextResponse.json({ ok: true, ...state }, { headers: { "Cache-Control": fresh ? "no-store" : "public, s-maxage=2, stale-while-revalidate=5" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
