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
    // [자동완성] suggest=루루 → 최근 12시간 채팅에 등장한 이름 중 일치 후보 (공개 채팅에 이미 노출된 이름만)
    const suggestQ = sqz(request.nextUrl.searchParams.get("suggest") || "");
    if (suggestQ) {
      const sbS = sbAdmin();
      const { data: stS } = await sbS.from("settings").select("value").eq("key", SETTING_CUSTOMER_UI_ENABLED).limit(1).maybeSingle();
      if (String((stS as Record<string, unknown> | null)?.value ?? "") !== "true") return NextResponse.json({ ok: true, names: [] });
      const sinceS = new Date(Date.now() - FRESH_HOURS * 60 * 60 * 1000).toISOString();
      const { data: nm } = await sbS.from("chat_orders").select("display_name")
        .gte("published_at", sinceS).order("id", { ascending: false }).limit(500);
      // 친 글자로 "시작하는" 이름을 앞에, 그다음 포함 매치 — 최근 채팅 순. 최대 8개.
      const pre = new Map<string, string>();
      const inc = new Map<string, string>();
      for (const r of (nm || []) as Record<string, unknown>[]) {
        const d = String(r.display_name ?? "").trim().replace(/^@/, "");
        if (!d) continue;
        const key = sqz(d);
        if (pre.has(key) || inc.has(key)) continue;
        if (key.startsWith(suggestQ)) pre.set(key, d);
        else if (key.includes(suggestQ)) inc.set(key, d);
        if (pre.size >= 8) break;
      }
      const names = [...pre.values(), ...inc.values()].slice(0, 8);
      return NextResponse.json({ ok: true, names });
    }
    const nick = sqz(request.nextUrl.searchParams.get("nick") || "");
    const phone = String(request.nextUrl.searchParams.get("phone") || "").replace(/\D/g, "");
    const showAll = request.nextUrl.searchParams.get("all") === "1"; // 손님이 직접 「찾기」 — 담음 처리된 것도 포함(방송 전체 복구)
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
    let claimedMine = 0; // 이미 담아간(회수 포함) 본인 기록 수 — 연결 손님의 찾기 노출 판단용
    for (const r of (data || []) as Record<string, unknown>[]) {
      if (!showAll && r.claimed_at) {
        // 자동담김은 새 주문만 — 단, 본인 것(채널/닉 일치)이면 "되찾을 기록"으로 센다
        const mineClaimed = (verifiedChannel && String(r.channel_id ?? "") === verifiedChannel) || (nick.length >= 2 && sqz(r.display_name) === nick);
        if (mineClaimed) claimedMine += 1;
        continue;
      }
      // 직접 찾기(all=1)는 "고른 이름의 주문만" — 채널 매칭은 자동담김 전용 (본인 옛 주문이 딸려오는 혼동 방지)
      const byChannel = !showAll && verifiedChannel && String(r.channel_id ?? "") === verifiedChannel;
      const byNick = nick.length >= 2 && sqz(r.display_name) === nick;                     // 미인증: 닉 정규화 정확일치
      if (!byChannel && !byNick) continue;
      if (byChannel && !byNick && !changedName) changedName = String(r.display_name ?? "").trim();
      if (!r.parsed_product_id) continue;
      let items: unknown[] = [];
      try { const p = r.parsed_items ? JSON.parse(String(r.parsed_items)) : []; if (Array.isArray(p)) items = p; } catch { /* 없으면 빈 배열 */ }
      rows.push({
        _ch: String(r.channel_id ?? "").trim(),
        id: r.id,
        product_id: String(r.parsed_product_id),
        product_name: String(r.parsed_product_name ?? ""),
        variant: r.parsed_variant ?? null,
        qty: Math.max(1, Number(r.parsed_qty || 1)),
        items,
      });
      if (rows.length >= (showAll ? 12 : 5)) break;            // 직접 찾기는 넉넉히
    }
    // [가로채기 방지] 이미 "다른 회원"에 연결된 채널의 채팅은 닉네임 입력으로 못 가져간다.
    //   연결된 단골의 주문은 본인(채널 일치)에게만 보인다. 돈은 어차피 각자 결제라 무관 — 이건 표시 보호.
    if (rows.length > 0) {
      const chs = Array.from(new Set(rows.map((r) => String(r._ch ?? "")).filter(Boolean)));
      if (chs.length > 0) {
        const { data: owners } = await sb.from("customers")
          .select("youtube_channel_id, customer_phone").in("youtube_channel_id", chs);
        const foreign = new Set(((owners || []) as Record<string, unknown>[])
          .filter((o) => String(o.customer_phone ?? "") !== phone)
          .map((o) => String(o.youtube_channel_id ?? "")));
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (foreign.has(String(rows[i]._ch ?? ""))) rows.splice(i, 1);
        }
      }
      for (const r of rows) delete r._ch;
    }
    // 찾기 노출: 미연결 손님 = 항상 / 연결 손님 = 되찾을 기록 있을 때만 (사장님 확정 2026-08-14)
    const showFind = !verifiedChannel || claimedMine > 0;
    return NextResponse.json({ ok: true, enabled: true, rows, nameChanged: changedName || null, showFind });
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
