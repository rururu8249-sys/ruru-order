// [2026-11-27 사장님 「채팅으로 주문했다고 우기는 손님 — 대화 돌려보기」] 유튜브 채팅 기록 읽기 전용.
//   GET                      → 최근 방송 목록 + 방송마다 저장된 채팅 수
//   GET ?mode=chat&bc=&q=    → 채팅(닉네임 q 로 그 사람 말만 / q 없으면 그 방송 전체) + 그 닉네임 주문서
//   GET ?mode=around&bc=&at= → 그 글 앞뒤 3분 전체 채팅(대화 흐름)
//   GET ?mode=suspects&bc=   → 주문 같은 말 했는데 그 방송 주문서에 같은 닉네임이 없는 사람
//   읽기만(쓰기 0) · 관리자만(middleware + verifyAdminSession) · 돈·주문 무접촉.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { findSuspects, similarAuthors, YOUTUBE_CHAT_LOG_TABLE } from "@/lib/youtubeChatLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase 관리자 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const CHAT_COLS = "message_id,broadcast_id,channel_id,author_name,is_owner,is_bot,message,order_like,published_at";
const ORDER_COLS = "id,order_lookup_code,youtube_nickname,customer_name,kakao_id,customer_phone,product_name,color,size,qty,created_at,admin_order_status_v2,payment_method,broadcast_id";
const likeSafe = (q: string) => q.replace(/[\\%_,()*]/g, (c) => `\\${c}`);
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

async function fetchAll(q: () => any, max = 6000): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await q().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function broadcastWindow(sb: any, bc: string) {
  const { data } = await sb.from("broadcasts").select("id,public_title,started_at,ended_at,status").eq("id", bc).maybeSingle();
  if (!data) return null;
  const start = String(data.started_at || "");
  const end = String(data.ended_at || "") || new Date().toISOString();
  return { id: bc, title: String(data.public_title || ""), start, end, status: String(data.status || "") };
}

/** 그 방송 주문서(주문에 적힌 방송 또는 방송 시간 안) */
async function ordersOfBroadcast(sb: any, w: { id: string; start: string; end: string }, nick?: string) {
  const base = () => {
    let q = sb.from("orders").select(ORDER_COLS).neq("is_deleted", true);
    if (nick) q = q.ilike("youtube_nickname", `%${likeSafe(nick)}%`);
    return q;
  };
  const [a, b] = await Promise.all([
    fetchAll(() => base().eq("broadcast_id", w.id).order("id")),
    w.start ? fetchAll(() => base().gte("created_at", w.start).lte("created_at", w.end).order("id")) : Promise.resolve([]),
  ]);
  const map = new Map<string, any>();
  for (const r of [...a, ...b]) map.set(String(r.id), r);
  return [...map.values()];
}

function groupOrders(rows: any[]) {
  const g = new Map<string, any>();
  for (const r of rows.sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)))) {
    const code = String(r.order_lookup_code || `#${r.id}`);
    const cur = g.get(code) || { code, nickname: String(r.youtube_nickname || ""), name: String(r.customer_name || ""), createdAt: String(r.created_at || ""), status: String(r.admin_order_status_v2 || ""), payment: String(r.payment_method || ""), items: [] as string[] };
    const opt = [r.color, r.size].map((v: unknown) => String(v ?? "").trim()).filter((v: string) => v && v !== "없음").join("/");
    cur.items.push(`${String(r.product_name || "")}${opt ? ` ${opt}` : ""} ×${Number(r.qty) || 1}`);
    g.set(code, cur);
  }
  return [...g.values()];
}

export async function GET(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const sp = new URL(request.url).searchParams;
    const mode = String(sp.get("mode") || "broadcasts");
    const bc = String(sp.get("bc") || "").trim();
    const sb = admin();

    if (mode === "broadcasts") {
      const { data } = await sb.from("broadcasts").select("id,public_title,started_at,ended_at,status,is_deleted")
        .not("started_at", "is", null).order("started_at", { ascending: false }).limit(30);
      const list = (data || []).filter((b: any) => b.is_deleted !== true);
      const counts = await Promise.all(list.map(async (b: any) => {
        const { count } = await sb.from(YOUTUBE_CHAT_LOG_TABLE).select("id", { count: "exact", head: true }).eq("broadcast_id", b.id);
        return Number(count) || 0;
      }));
      return NextResponse.json({
        ok: true,
        broadcasts: list.map((b: any, i: number) => ({ id: b.id, title: String(b.public_title || ""), startedAt: b.started_at, endedAt: b.ended_at, live: b.status === "ON", chatCount: counts[i] })),
      });
    }

    if (bc && !isUuid(bc)) return NextResponse.json({ ok: false, message: "방송 번호가 이상해요." }, { status: 400 });

    if (mode === "chat") {
      const q = String(sp.get("q") || "").trim().replace(/^@+/, "").slice(0, 40);
      if (!bc && !q) return NextResponse.json({ ok: false, message: "방송이나 닉네임을 골라 주세요." }, { status: 400 });
      const rows = await fetchAll(() => {
        let x = sb.from(YOUTUBE_CHAT_LOG_TABLE).select(CHAT_COLS);
        if (bc) x = x.eq("broadcast_id", bc);
        if (q) x = x.ilike("author_name", `%${likeSafe(q)}%`);
        return x.order("published_at", { ascending: true });
      }, q ? 3000 : 6000);
      // 주문서는 oq(처음 연 주문 닉네임)가 있으면 그걸로 — 비슷한 닉네임 칩을 눌러도 원래 주문서가 남게
      const oq = String(sp.get("oq") || "").trim().replace(/^@+/, "").slice(0, 40) || q;
      let orders: any[] = [];
      if (oq) {
        if (bc) {
          const w = await broadcastWindow(sb, bc);
          orders = w ? groupOrders(await ordersOfBroadcast(sb, w, oq)) : [];
        } else {
          const { data } = await sb.from("orders").select(ORDER_COLS).neq("is_deleted", true)
            .ilike("youtube_nickname", `%${likeSafe(oq)}%`).order("created_at", { ascending: false }).limit(300);
          orders = groupOrders(data || []).reverse();
        }
      }
      // [2026-11-28] 비슷한 닉네임(그 방송) — 주문서 닉네임과 유튜브 닉네임이 조금 달라도 찾게
      let similar: ReturnType<typeof similarAuthors> = [];
      if (bc && q) {
        const all = await fetchAll(() => sb.from(YOUTUBE_CHAT_LOG_TABLE).select("author_name,is_owner,is_bot").eq("broadcast_id", bc).order("published_at", { ascending: true }), 6000);
        const cnt = new Map<string, number>();
        for (const r of all) if (!r.is_owner && !r.is_bot && r.author_name) cnt.set(String(r.author_name), (cnt.get(String(r.author_name)) || 0) + 1);
        similar = similarAuthors(q, [...cnt].map(([author, count]) => ({ author, count })));
      }
      // 방송 이름표(목록 30개 밖 옛 방송도 이름이 나오게)
      const bcIds = [...new Set(rows.map((m: any) => String(m.broadcast_id || "")).filter(Boolean))].slice(0, 200);
      const broadcasts: Record<string, { title: string; startedAt: string | null }> = {};
      if (bcIds.length) {
        const { data: bs } = await sb.from("broadcasts").select("id,public_title,started_at").in("id", bcIds);
        for (const b of bs || []) broadcasts[String(b.id)] = { title: String(b.public_title || ""), startedAt: b.started_at || null };
      }
      return NextResponse.json({ ok: true, messages: rows, orders, broadcasts, similar, truncated: rows.length >= (q ? 3000 : 6000) });
    }

    if (mode === "around") {
      const at = Date.parse(String(sp.get("at") || ""));
      if (!bc || !Number.isFinite(at)) return NextResponse.json({ ok: false, message: "방송·시각이 필요해요." }, { status: 400 });
      const { data, error } = await sb.from(YOUTUBE_CHAT_LOG_TABLE).select(CHAT_COLS).eq("broadcast_id", bc)
        .gte("published_at", new Date(at - 180_000).toISOString()).lte("published_at", new Date(at + 180_000).toISOString())
        .order("published_at", { ascending: true }).limit(500);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, messages: data || [] });
    }

    if (mode === "suspects") {
      if (!bc) return NextResponse.json({ ok: false, message: "방송을 골라 주세요." }, { status: 400 });
      const w = await broadcastWindow(sb, bc);
      if (!w) return NextResponse.json({ ok: false, message: "방송을 못 찾았어요." }, { status: 404 });
      const msgs = await fetchAll(() => sb.from(YOUTUBE_CHAT_LOG_TABLE).select(CHAT_COLS).eq("broadcast_id", bc).eq("order_like", true).order("published_at", { ascending: true }));
      const orderRows = await ordersOfBroadcast(sb, w);
      const orderNicks = [...new Set(orderRows.map((r: any) => String(r.youtube_nickname || "")).filter(Boolean))];
      // 채널로 이어진 회원(채팅 인증한 손님)이 이 방송에 주문했으면 확실히 같은 사람
      const channels = [...new Set(msgs.map((m: any) => String(m.channel_id || "")).filter(Boolean))].slice(0, 500);
      let orderChannelIds: string[] = [];
      if (channels.length) {
        const { data: cs } = await sb.from("customers").select("youtube_channel_id,kakao_id,customer_phone").in("youtube_channel_id", channels);
        const kakao = new Set(orderRows.map((r: any) => String(r.kakao_id || "")).filter(Boolean));
        const phones = new Set(orderRows.map((r: any) => String(r.customer_phone || "").replace(/\D/g, "")).filter(Boolean));
        orderChannelIds = (cs || []).filter((c: any) => kakao.has(String(c.kakao_id || "")) || phones.has(String(c.customer_phone || "").replace(/\D/g, ""))).map((c: any) => String(c.youtube_channel_id));
      }
      const suspects = findSuspects({ messages: msgs, orderNicks, orderChannelIds });
      return NextResponse.json({ ok: true, suspects, orderLikeCount: msgs.length, orderCount: groupOrders(orderRows).length });
    }

    return NextResponse.json({ ok: false, message: "알 수 없는 요청" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, message: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
