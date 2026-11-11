import { NextRequest, NextResponse } from "next/server";
import { computeWidgetFeatured, type WidgetFeaturedState } from "@/lib/widgetFeaturedServer";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
// 손님이 많아도 DB 는 방송마다 몇 초에 한 번만 읽게(서버 메모리 + 짧은 CDN 캐시).
const cache = new Map<string, { at: number; value: Promise<WidgetFeaturedState> }>();
const TTL_MS = 3000;
export async function GET(request: NextRequest) {
  const bc = request.nextUrl.searchParams.get("bc") || "";
  if (!uuid.test(bc)) return NextResponse.json({ ok: false }, { status: 400 });
  const now = Date.now();
  let hit = cache.get(bc);
  if (!hit || now - hit.at > TTL_MS) {
    hit = { at: now, value: computeWidgetFeatured(bc) };
    cache.set(bc, hit);
    hit.value.catch(() => { if (cache.get(bc) === hit) cache.delete(bc); });
  }
  try {
    const state = await hit.value;
    return NextResponse.json({ ok: true, ...state }, { headers: { "Cache-Control": "public, s-maxage=2, stale-while-revalidate=5" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
