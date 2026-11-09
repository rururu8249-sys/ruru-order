// app/api/admin-live/broadcast-flow/route.ts
// [2026-11-09] 판매분석 「방송 흐름」 — 한 방송의 1분 기록 + 「소개」 기록 + 주문을 합쳐 lib/broadcastFlow 로 계산. 관리자만·읽기만(SELECT).
//   주문 범위·제외 규칙 = 텔레그램 결산(lib/liveSummary)과 같음(방송 시작~종료 시각, 취소·테스트 제외, 결제완료 판정 그대로).
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { fetchOrders, groupOrders, MONTH_COLS } from "@/lib/liveSummary";
import { liveMetricsKey, parseSamples } from "@/lib/liveMetrics";
import { buildBroadcastFlow, type FlowIntro, type FlowOrder } from "@/lib/broadcastFlow";

export const maxDuration = 60;

function svc(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role 환경변수가 없습니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const present = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";

export async function GET(request: NextRequest) {
  try {
    const session = await verifyAdminSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "권한 없음" }, { status: 401 });
    const id = String(request.nextUrl.searchParams.get("broadcastId") || "").trim();
    if (!id) return NextResponse.json({ ok: false, error: "방송을 골라 주세요" }, { status: 400 });
    const sb = svc();

    const { data: b, error: bErr } = await sb.from("broadcasts").select("id,public_title,started_at,ended_at,status").eq("id", id).maybeSingle();
    if (bErr || !b) return NextResponse.json({ ok: false, error: "방송을 찾지 못했어요" }, { status: 404 });
    const bc = b as Record<string, unknown>;
    if (!bc.started_at) return NextResponse.json({ ok: false, error: "아직 시작 안 한 방송이에요" }, { status: 400 });
    const live = String(bc.status || "").toUpperCase() === "ON";
    const startIso = String(bc.started_at);
    const endIso = live || !bc.ended_at ? new Date().toISOString() : String(bc.ended_at);
    const startMs = Date.parse(startIso);
    const endMs = Date.parse(endIso);

    // 1분 기록
    const { data: ms } = await sb.from("settings").select("value").eq("key", liveMetricsKey(id)).maybeSingle();
    const samples = parseSamples((ms as Record<string, unknown> | null)?.value ?? "").filter((s) => { const t = Date.parse(s.t); return t >= startMs - 60_000 && t <= endMs; });

    // 「소개」 기록 — 시작 전 마지막 1건 + 방송 중
    const { data: before } = await sb.from("chat_current_product").select("product_id,product_name,detail_name,cleared,set_at").lt("set_at", startIso).order("set_at", { ascending: false }).limit(1);
    const { data: during } = await sb.from("chat_current_product").select("product_id,product_name,detail_name,cleared,set_at").gte("set_at", startIso).lte("set_at", endIso).order("set_at", { ascending: true }).limit(5000);
    const intros: FlowIntro[] = [...(before || []), ...(during || [])].map((r) => {
      const o = r as Record<string, unknown>;
      return { at: Date.parse(String(o.set_at)), productId: String(o.product_id ?? ""), productName: String(o.product_name ?? ""), detailName: String(o.detail_name ?? ""), cleared: o.cleared === true || !o.product_id };
    }).filter((x) => Number.isFinite(x.at)).sort((a, z) => a.at - z.at);
    // 시작 전 기록이 «소개 끝» 없이 하루 넘게 남은 거면 이번 방송 것 아님
    if (intros.length && intros[0].at < startMs && startMs - intros[0].at > 12 * 3600_000) intros.shift();

    // 주문
    const groups = groupOrders(await fetchOrders(sb, startIso, endIso, `${MONTH_COLS},product_id,kakao_id`)).filter((g) => !g.canceled && !g.isTest);
    const orders: FlowOrder[] = [];
    for (const g of groups) {
      for (const r of g.rows) {
        if (r.event_gift_winner_id) continue;
        const qty = num(r.qty) || 1;
        const goods = present(r.adjusted_product_price) ? num(r.adjusted_product_price) : num(r.product_price) * qty;
        orders.push({ at: Date.parse(String(r.created_at)), productId: String(r.product_id ?? ""), productName: String(r.product_name ?? "").trim(), qty, goods, paid: g.paid, buyer: g.who || `p:${g.phone}` });
      }
    }

    // 상품 이름(순환에 세부 이름 없는 상품용)
    const ids = new Set<string>();
    intros.forEach((i) => i.productId && ids.add(i.productId));
    samples.forEach((s) => s.r && s.r.m === "pick" && s.r.ids.forEach((x) => ids.add(x.p)));
    orders.forEach((o) => o.productId && ids.add(o.productId));
    const productNames: Record<string, string> = {};
    const idList = [...ids].filter(Boolean);
    for (let i = 0; i < idList.length; i += 200) {
      const { data } = await sb.from("products").select("id,product_name").in("id", idList.slice(i, i + 200));
      for (const p of (data || []) as Record<string, unknown>[]) productNames[String(p.id)] = String(p.product_name || "");
    }

    const flow = buildBroadcastFlow({ startMs, endMs, samples, intros, orders, productNames });
    return NextResponse.json({ ok: true, broadcast: { id, title: String(bc.public_title || "방송"), startedAt: startIso, endedAt: live ? "" : endIso, live }, samplesCount: samples.length, chart: samples.map((x) => ({ t: Date.parse(x.t), v: x.v, s: x.s })), flow });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
