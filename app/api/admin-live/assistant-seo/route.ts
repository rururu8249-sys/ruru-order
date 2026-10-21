// [2026-10-22 AI 비서 6단계] 유튜브 방송 SEO — 읽기 전용. 돈·주문·방송 상태 무접촉.
//   GET ?broadcastId=        : 최근 방송 목록(없으면) / 그 방송의 상품·챕터·SEO(제목 3·설명·태그)
//   상품 = broadcast_products(+products 이름·가격·분류), 챕터 = chat_current_product 「소개」 기록(방송 시작~종료).
//   AI 에는 채널·방송 제목·날짜·상품명·가격·분류·사장님 메모만 보낸다(손님 정보 없음). AI 실패 시 규칙 문구.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { callGeminiJson } from "@/lib/geminiJson";
import { buildChapters, chaptersText, kstDateLabel, parseSeoJson, seoByRule, seoPrompt, type SeoProduct } from "@/lib/broadcastSeo";

const DEFAULT_CHANNEL = "루루동이 LIVE";

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase 관리자 환경변수가 설정되지 않았습니다.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function productCategory(p: Record<string, unknown>): string {
  try {
    const note = typeof p.product_note === "string" ? JSON.parse(p.product_note) : (p.product_note as Record<string, unknown>) || {};
    return String(note?.category || "").trim();
  } catch {
    return "";
  }
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSessionFromRequest(request))) {
    return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  const url = new URL(request.url);
  const broadcastId = String(url.searchParams.get("broadcastId") || "").trim();
  const extra = String(url.searchParams.get("extra") || "").trim().slice(0, 300);
  const channel = String(url.searchParams.get("channel") || "").trim().slice(0, 40) || DEFAULT_CHANNEL;

  try {
    const db = getSupabaseAdminClient();
    if (!broadcastId) {
      const { data, error } = await db
        .from("broadcasts")
        .select("id, public_title, started_at, ended_at, status")
        .neq("is_deleted", true)
        .order("started_at", { ascending: false })
        .limit(12);
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, broadcasts: (data || []).map((b) => ({ id: String(b.id), title: b.public_title || "제목 없음", startedAt: b.started_at, endedAt: b.ended_at, status: b.status })) });
    }

    const [bc, bp] = await Promise.all([
      db.from("broadcasts").select("id, public_title, started_at, ended_at, youtube_live_url").eq("id", broadcastId).maybeSingle(),
      db.from("broadcast_products").select("product_id, sort_order, products(id, product_name, price, product_note)").eq("broadcast_id", broadcastId),
    ]);
    if (bc.error || !bc.data) return NextResponse.json({ ok: false, message: "방송을 찾지 못했어요." }, { status: 404 });
    if (bp.error) return NextResponse.json({ ok: false, message: bp.error.message }, { status: 500 });
    const b = bc.data as { id: unknown; public_title: string | null; started_at: string; ended_at: string | null; youtube_live_url: string | null };

    const products: SeoProduct[] = ((bp.data || []) as Record<string, unknown>[])
      .sort((x, y) => Number(x.sort_order ?? 0) - Number(y.sort_order ?? 0))
      .map((row) => (row.products as Record<string, unknown>) || null)
      .filter(Boolean)
      .map((p) => ({ name: String(p!.product_name || "").trim(), price: Number(p!.price) || 0, category: productCategory(p!) }))
      .filter((p) => p.name);

    // 챕터: 방송 시작~종료(종료 없으면 지금) 사이 「소개」 기록
    const endIso = b.ended_at || new Date().toISOString();
    const { data: ccp } = await db
      .from("chat_current_product")
      .select("set_at, product_name, detail_name, cleared")
      .gte("set_at", b.started_at)
      .lte("set_at", endIso)
      .order("set_at", { ascending: true })
      .limit(500);
    const chapters = buildChapters(b.started_at, b.ended_at, (ccp || []) as { set_at: string; product_name: string | null; detail_name?: string | null; cleared?: boolean | null }[]);

    const title = b.public_title || "라이브 판매";
    const dateLabel = kstDateLabel(b.started_at);
    const ai = await callGeminiJson(seoPrompt({ channel, title, dateLabel, products, extra }), { timeoutMs: 15000, maxTokens: 2500 });
    const parsed = ai.text ? parseSeoJson(ai.text) : null;
    const seo = parsed || seoByRule({ channel, title, dateLabel, products });
    const chapterBlock = chapters.length >= 3 ? `\n\n타임라인\n${chaptersText(chapters)}` : "";

    return NextResponse.json({
      ok: true,
      via: parsed ? "ai" : "rule",
      ai: ai.note,
      broadcast: { id: String(b.id), title, dateLabel, startedAt: b.started_at, endedAt: b.ended_at, youtubeUrl: b.youtube_live_url || "" },
      productCount: products.length,
      products: products.slice(0, 60),
      chapters,
      chaptersText: chaptersText(chapters),
      titles: seo.titles,
      description: seo.description + chapterBlock,
      tags: seo.tags,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "SEO 만들기 실패" }, { status: 500 });
  }
}
