// app/api/chat-orders/mine/route.ts
// [2026-08-14 4단계] 손님 본인 채팅 가주문 조회 + "담음" 표시 — 표시 전용 API.
//   설계 v1 안전규칙:
//   - 대기열을 소진하지 않는다(엉뚱한 사람이 집어도 진짜 주인이 자기 주문을 볼 수 있게). claimed_*는 표시용.
//   - 자동으로 담지 않는다 — 손님이 배너에서 눌러야 담긴다(담기는 손님 화면의 기존 담기 함수 재사용).
//   - 재고·주문·제출·돈 로직 무접촉. cart-reservations 패턴(서비스키, best-effort)을 따른다.
//   - 설정 chat_order_customer_ui_enabled(기본 off)가 아니면 항상 빈 결과 → 손님 화면 무변화.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTING_CUSTOMER_UI_ENABLED = "chat_order_customer_ui_enabled";

function sbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL 없음");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 없음");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// 닉네임 비교용 정규화 — 파서의 sqz와 동일 기준(@ 제거 + 특수문자 제거 + 소문자). 정확일치만 인정.
const sqz = (v: unknown) => String(v ?? "").toLowerCase().replace(/^@/, "").replace(/[^a-z0-9가-힣]/g, "");

const FRESH_HOURS = 12; // 이 시간 안의 채팅만 배너 후보 (방송 1회 분량이면 충분)

export async function GET(request: NextRequest) {
  try {
    const nick = sqz(request.nextUrl.searchParams.get("nick") || "");
    if (!nick || nick.length < 2) return NextResponse.json({ ok: true, enabled: false, rows: [] });
    const sb = sbAdmin();
    const { data: st } = await sb.from("settings").select("value").eq("key", SETTING_CUSTOMER_UI_ENABLED).limit(1).maybeSingle();
    if (String((st as Record<string, unknown> | null)?.value ?? "") !== "true") {
      return NextResponse.json({ ok: true, enabled: false, rows: [] });
    }
    const since = new Date(Date.now() - FRESH_HOURS * 60 * 60 * 1000).toISOString();
    const { data } = await sb
      .from("chat_orders")
      .select("id, display_name, parsed_product_id, parsed_product_name, parsed_variant, parsed_qty, parsed_items, claimed_at, published_at")
      .eq("parse_status", "parsed")
      .gte("published_at", since)
      .order("id", { ascending: false })
      .limit(200);
    const rows: Record<string, unknown>[] = [];
    for (const r of (data || []) as Record<string, unknown>[]) {
      if (r.claimed_at) continue;                              // 이미 담아간 것(표시용)은 숨김
      if (sqz(r.display_name) !== nick) continue;              // 본인 채팅만 (정규화 정확일치)
      if (!r.parsed_product_id) continue;
      let items: unknown[] = [];
      try { const p = r.parsed_items ? JSON.parse(String(r.parsed_items)) : []; if (Array.isArray(p)) items = p; } catch { /* 없으면 빈 배열 */ }
      rows.push({
        id: r.id,
        product_id: String(r.parsed_product_id),
        product_name: String(r.parsed_product_name ?? ""),
        variant: r.parsed_variant ?? null,
        qty: Math.max(1, Number(r.parsed_qty || 1)),
        items,
      });
      if (rows.length >= 5) break;                             // 배너는 최대 5건
    }
    return NextResponse.json({ ok: true, enabled: true, rows });
  } catch {
    // 표시 전용 — 실패는 조용히 빈 결과(주문 흐름 무영향)
    return NextResponse.json({ ok: true, enabled: false, rows: [] });
  }
}

// POST { ids:[..], nick } — "담음" 표시. 본인 닉과 일치하는 행만 표시(남의 배너를 못 끔).
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const ids = Array.isArray(body.ids)
      ? body.ids.map((v) => Number(v)).filter((n) => Number.isFinite(n)).slice(0, 10)
      : [];
    const nick = sqz(body.nick);
    if (ids.length === 0 || !nick) return NextResponse.json({ ok: true });
    const sb = sbAdmin();
    const { data } = await sb.from("chat_orders").select("id, display_name, claimed_at").in("id", ids);
    const mine = ((data || []) as Record<string, unknown>[])
      .filter((r) => !r.claimed_at && sqz(r.display_name) === nick)
      .map((r) => Number(r.id));
    if (mine.length > 0) {
      await sb.from("chat_orders")
        .update({ claimed_at: new Date().toISOString(), claimed_by: String(body.nick ?? "").slice(0, 60) })
        .in("id", mine);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
