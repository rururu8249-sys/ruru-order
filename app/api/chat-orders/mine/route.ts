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
    const phone = String(request.nextUrl.searchParams.get("phone") || "").replace(/\D/g, "");
    if ((!nick || nick.length < 2) && phone.length < 10) return NextResponse.json({ ok: true, enabled: false, rows: [] });
    const sb = sbAdmin();
    const { data: st } = await sb.from("settings").select("value").eq("key", SETTING_CUSTOMER_UI_ENABLED).limit(1).maybeSingle();
    if (String((st as Record<string, unknown> | null)?.value ?? "") !== "true") {
      return NextResponse.json({ ok: true, enabled: false, rows: [] });
    }
    // [5단계] 인증(채널ID 연결) 고객은 채널ID로 확정 매칭 — 유튜브 이름이 바뀌어도, 닉 표기가 달라도 잡힌다.
    let verifiedChannel = "";
    if (phone.length >= 10) {
      const { data: cust } = await sb.from("customers")
        .select("youtube_channel_id").eq("customer_phone", phone)
        .not("youtube_channel_id", "is", null).limit(1).maybeSingle();
      verifiedChannel = String((cust as Record<string, unknown> | null)?.youtube_channel_id ?? "");
    }
    const since = new Date(Date.now() - FRESH_HOURS * 60 * 60 * 1000).toISOString();
    const { data } = await sb
      .from("chat_orders")
      .select("id, display_name, channel_id, parsed_product_id, parsed_product_name, parsed_variant, parsed_qty, parsed_items, claimed_at, published_at")
      .eq("parse_status", "parsed")
      .gte("published_at", since)
      .order("id", { ascending: false })
      .limit(200);
    const rows: Record<string, unknown>[] = [];
    let changedName = ""; // 채널ID로는 본인인데 채팅 이름 ≠ 사이트 닉네임 → 유튜브 이름을 바꾼 것
    for (const r of (data || []) as Record<string, unknown>[]) {
      if (r.claimed_at) continue;                              // 이미 담아간 것(표시용)은 숨김
      const byChannel = verifiedChannel && String(r.channel_id ?? "") === verifiedChannel; // 인증 고객: 채널ID 확정
      const byNick = nick.length >= 2 && sqz(r.display_name) === nick;                     // 미인증: 닉 정규화 정확일치
      if (!byChannel && !byNick) continue;
      if (byChannel && !byNick && !changedName) changedName = String(r.display_name ?? "").trim();
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
    return NextResponse.json({ ok: true, enabled: true, rows, nameChanged: changedName || null });
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
    const { data } = await sb.from("chat_orders").select("id, display_name, channel_id, claimed_at").in("id", ids);
    const mine = ((data || []) as Record<string, unknown>[])
      .filter((r) => !r.claimed_at && sqz(r.display_name) === nick)
      .map((r) => Number(r.id));
    if (mine.length > 0) {
      await sb.from("chat_orders")
        .update({ claimed_at: new Date().toISOString(), claimed_by: String(body.nick ?? "").slice(0, 60) })
        .in("id", mine);
    }
    // [선점 이어받기] 담아간 채팅의 표시용 선점 해제 — 이제 본인 장바구니 홀드가 대신 잡는다(이중 잠김 방지)
    try {
      const keys = ((data || []) as Record<string, unknown>[])
        .filter((r) => mine.includes(Number(r.id)))
        .map((r) => `chat_${String(r.channel_id ?? "").trim()}_${r.id}`);
      if (keys.length > 0) await sb.from("cart_reservations").delete().in("session_key", keys);
    } catch { /* 해제 실패해도 TTL로 자동 만료됨 */ }
    // [사장님 확정 방식 2026-08-14] 닉네임이 확인된 채팅이 주문서에 담긴 순간 = 본인 확인 완료.
    //   그 채팅의 채널ID를 고객에 1회 자동 저장 → 이후 유튜브 이름이 바뀌어도 채널ID로 평생 매칭.
    //   (인증번호 채팅 없이. youtube_nickname 컬럼은 무접촉 — 신규 컬럼에만 쓴다.)
    try {
      const phone = String(body.phone ?? "").replace(/\D/g, "");
      const chRow = ((data || []) as Record<string, unknown>[]).find((r) => sqz(r.display_name) === nick && String(r.channel_id ?? "").trim());
      const ch = String((chRow as Record<string, unknown> | undefined)?.channel_id ?? "").trim();
      if (phone.length >= 10 && ch) {
        const { data: cust } = await sb.from("customers")
          .select("youtube_channel_id").eq("customer_phone", phone).limit(1).maybeSingle();
        if (cust && !String((cust as Record<string, unknown>).youtube_channel_id ?? "").trim()) {
          await sb.from("customers")
            .update({ youtube_channel_id: ch, handle_verified_at: new Date().toISOString() })
            .eq("customer_phone", phone);
        }
      }
    } catch { /* 자동 학습 실패는 담기 흐름에 영향 없음 */ }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
