// app/api/chat-orders/parse/route.ts
// [2026-08-14] 읽어둔 채팅 파싱 1회 실행 + 파싱 대상 상품 목록 조회. 관리자 인증 필수.
//   POST { reparseAll?: boolean, limit?: number } → 파싱 실행
//   GET                                          → 현재 파싱 기준 상품 목록(「지금 이거」 선택용)
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import { parsePendingChatOrders } from "@/lib/chatOrderPipeline";
import { loadParseProducts, loadAllParseProducts } from "@/lib/chatOrderProducts";
import { parseChatOrder } from "@/lib/chatOrderParser";
import { getCurrentProductAt } from "@/lib/chatCurrentProduct";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL 없음");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 없음");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: { message: "관리자 인증이 필요합니다." } }, { status: 401 });
  try {
    const loaded = await loadParseProducts(sbAdmin());
    return NextResponse.json({ ok: true, ...loaded });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: { message: msg } }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await verifyAdminSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: { message: "관리자 인증이 필요합니다." } }, { status: 401 });
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    // 자가진단: 상품 목록에서 "손님이 칠 법한 문장"을 자동 생성해 전부 판정한다.
    //   새 상품 등록 후 이름 충돌이 없는지 버튼 한 번으로 확인하는 용도. DB 무변경.
    if (body.selfCheck === true) {
      const sb = sbAdmin();
      const loaded = body.scope === "all" ? await loadAllParseProducts(sb) : await loadParseProducts(sb);
      const sqz = (v: string) => v.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
      type Case = { text: string; expectName: string; expectVariant: string | null };
      const cases: Case[] = [];
      for (const p of loaded.products) {
        cases.push({ text: `${p.name} 주세요`, expectName: p.name, expectVariant: null });
        for (const v of p.variants || []) cases.push({ text: `${v} 주세요`, expectName: p.name, expectVariant: v });
      }
      let full = 0, prod = 0, wrong = 0, safe = 0;
      const bad: { text: string; expected: string; got: string }[] = [];
      for (const c of cases.slice(0, 2000)) {
        const r = parseChatOrder(c.text, loaded.products, null);
        const nameOK = r.productName && sqz(r.productName) === sqz(c.expectName);
        const varOK = c.expectVariant && r.variantName && sqz(r.variantName) === sqz(c.expectVariant);
        if (r.status !== "parsed") safe += 1;
        else if (varOK || (nameOK && !c.expectVariant)) full += 1;
        else if (nameOK) prod += 1;
        else {
          wrong += 1;
          if (bad.length < 50) bad.push({
            text: c.text, expected: c.expectName + (c.expectVariant ? ` / ${c.expectVariant}` : ""),
            got: (r.productName || "-") + (r.variantName ? ` / ${r.variantName}` : ""),
          });
        }
      }
      return NextResponse.json({
        ok: true, selfCheck: true,
        total: Math.min(cases.length, 2000), full, prod, wrong, safe, bad,
        productCount: loaded.products.length, source: loaded.source,
      });
    }

    // 미리보기: 문장을 그대로 판정만 해본다. DB에 쓰지 않는다(읽기 전용).
    //   방송 전에 "이렇게 치면 잡히나?" 를 확인하는 용도.
    if (Array.isArray(body.preview)) {
      const sb = sbAdmin();
      // scope:"all" 이면 전체 상품(의류·잡화 포함)으로 판정 — 시뮬레이션 전용, DB 무변경
      const loaded = body.scope === "all" ? await loadAllParseProducts(sb) : await loadParseProducts(sb);
      const cur = await getCurrentProductAt(sb, new Date().toISOString());
      const lines = (body.preview as unknown[]).slice(0, 800).map((v) => String(v ?? ""));
      const rows = lines.map((line) => {
        const r = parseChatOrder(line, loaded.products, cur?.productId ?? null);
        return {
          text: line, status: r.status, product: r.productName, variant: r.variantName,
          qty: r.qty, matchedBy: r.matchedBy, options: r.optionTokens,
          candidates: r.candidates, reason: r.reason,
        };
      });
      return NextResponse.json({
        ok: true, preview: true, rows,
        productCount: loaded.products.length,
        source: loaded.source,
        current: cur?.productName ?? null,
      });
    }

    const result = await parsePendingChatOrders(sbAdmin(), {
      reparseAll: body.reparseAll === true,
      limit: Number(body.limit ?? 200) || 200,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: { message: msg } }, { status: 500 });
  }
}
