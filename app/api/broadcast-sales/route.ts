// app/api/broadcast-sales/route.ts
// 목적: «지금 이 방송에서» 상품별로 몇 개나 주문됐는지 — 손님 화면의 실시간 인기 배지용.
//       사장님 요청: «해당 방송날짜 방송중에 판매량에 따라 그 방송 기준으로도
//                     실시간으로 막 배지가 바뀌고 달렸으면 (쇼핑몰 모드 포함)»
//
// 왜 «입금확인»이 아니라 «주문 접수» 기준인가 (중요)
//   방송 중에는 대부분이 아직 미입금이다. 입금확인만 세면 방송 내내 0으로 보인다.
//   그래서 이 숫자는 «몇 개나 주문됐나»이고, 배지 문구도 「방송 중 N개 주문」이라고 정확히 쓴다.
//   누적 판매 배지(🏆/📈)는 지금까지처럼 «입금확인» 기준 그대로다 — 두 숫자의 뜻이 섞이지 않는다.
//   취소·테스트·삭제 주문은 뺀다.
//
// 부하
//   · broadcast_id 로 좁힌 조회라 전체 스캔이 아니다(쇼핑몰 모드는 오늘 00시 이후).
//   · 손님이 여러 명이어도 CDN이 20초간 같은 응답을 돌려준다(s-maxage).
//     → 손님 수와 무관하게 DB 조회는 20초에 한 번꼴.
//
// 안전: 읽기 전용. 주문·입금·정산·배송 데이터를 바꾸지 않는다.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VOID_RE = /취소|환불|cancel|refund|테스트/i;
const PAGE = 1000;
const MAX_ROWS = 20000;

/** 한국시간 기준 오늘 00:00 을 ISO 로 (쇼핑몰 모드용) */
function kstTodayStartIso() {
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = nowKst.getUTCFullYear();
  const m = nowKst.getUTCMonth();
  const d = nowKst.getUTCDate();
  return new Date(Date.UTC(y, m, d, 0, 0, 0) - 9 * 60 * 60 * 1000).toISOString();
}

export async function GET(request: NextRequest) {
  const broadcastId = String(request.nextUrl.searchParams.get("b") || "").trim();
  const today = request.nextUrl.searchParams.get("today") === "1";

  if (!broadcastId && !today) {
    return NextResponse.json({ ok: false, message: "b 또는 today 가 필요합니다." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: false, message: "Supabase 환경변수 없음" }, { status: 500 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const sales: Record<string, number> = {};
  try {
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      let q = supabase
        .from("orders")
        .select("product_id, qty, order_status, order_manage_status, is_test_order, is_deleted")
        .not("product_id", "is", null)
        .range(from, from + PAGE - 1);

      q = broadcastId ? q.eq("broadcast_id", broadcastId) : q.gte("created_at", kstTodayStartIso());

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = data || [];

      for (const r of rows as Array<Record<string, unknown>>) {
        if (r.is_deleted === true) continue;
        if (r.is_test_order === true) continue;
        const st = `${String(r.order_status ?? "")} ${String(r.order_manage_status ?? "")}`;
        if (VOID_RE.test(st)) continue;
        const pid = String(r.product_id ?? "").trim();
        if (!pid) continue;
        const qty = Math.max(0, Math.floor(Number(r.qty) || 0));
        if (qty <= 0) continue;
        sales[pid] = (sales[pid] || 0) + qty;
      }

      if (rows.length < PAGE) break;
    }
  } catch (e) {
    // 실패해도 손님 화면은 배지만 안 뜨고 정상 동작한다.
    return NextResponse.json({ ok: false, message: String((e as Error)?.message || e) }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, scope: broadcastId ? "broadcast" : "today", sales },
    { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40" } },
  );
}
