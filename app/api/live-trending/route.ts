// app/api/live-trending/route.ts
// 목적: 「급상승」 배지를 «오늘(또는 이번 방송)» 기준으로도 붙이기 위한 판단 전용 API.
//
// 왜 필요했나 — 사장님
//   «우리는 방송을 하루 하니까 하루 기준이 빡세면 안 되잖아?
//     토탈통계 + 하루기준 짬뽕해도 되고... 고객이 혹할 수 있게끔»
//   최근 30일 집계만 보면 «오늘 처음 올린 상품»은 영영 「급상승」이 안 붙는다.
//   방송마다 상품이 바뀌는 우리 장사 리듬과 안 맞는다.
//
// ⚠️ 숫자는 절대 내보내지 않는다 (중요)
//   사장님 지적: «관리자만 알 수 있는 게 왜 고객 페이지에 떡하니 표시되는데?»
//   그래서 이 API는 «몇 개 팔렸는지»를 주지 않고 «배지 대상 상품 id 목록»만 준다.
//   손님 브라우저로는 매출 규모를 알 수 있는 값이 아예 나가지 않는다.
//
// 기준
//   방송 ON  : 지금 방송(broadcast_id)에서 1개 이상 주문된 상품
//   방송 OFF : 한국시간 오늘 00시 이후 1개 이상 주문된 상품
//   «주문 접수» 기준(방송 중엔 대부분 미입금이라 입금확인만 세면 0이 된다).
//   취소·환불·테스트·삭제 주문은 뺀다.
//
// 부하: broadcast_id(또는 오늘)로 좁힌 조회 + CDN 캐시. 손님이 몇 명이든 그 시간에 한 번만 조회된다.
// 안전: 읽기 전용. 주문·입금·정산·배송 데이터를 바꾸지 않는다.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VOID_RE = /취소|환불|cancel|refund|테스트/i;
const PAGE = 1000;
const MAX_ROWS = 20000;
/** 「급상승」으로 볼 최소 주문 수량. 오늘 1개라도 나갔으면 «지금 움직이는 상품»이 맞다. */
const TODAY_MIN_QTY = 1;

/** 한국시간 기준 오늘 00:00 을 ISO 로 */
function kstTodayStartIso() {
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate()) - 9 * 60 * 60 * 1000).toISOString();
}

export async function GET(request: NextRequest) {
  const broadcastId = String(request.nextUrl.searchParams.get("b") || "").trim();
  const today = request.nextUrl.searchParams.get("today") === "1";
  if (!broadcastId && !today) {
    return NextResponse.json({ ok: false, message: "b 또는 today 가 필요합니다." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, message: "Supabase 환경변수 없음" }, { status: 500 });

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const qtyByProduct: Record<string, number> = {};

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
      const rows = (data || []) as Array<Record<string, unknown>>;

      for (const r of rows) {
        if (r.is_deleted === true || r.is_test_order === true) continue;
        if (VOID_RE.test(`${String(r.order_status ?? "")} ${String(r.order_manage_status ?? "")}`)) continue;
        const pid = String(r.product_id ?? "").trim();
        const qty = Math.max(0, Math.floor(Number(r.qty) || 0));
        if (!pid || qty <= 0) continue;
        qtyByProduct[pid] = (qtyByProduct[pid] || 0) + qty;
      }
      if (rows.length < PAGE) break;
    }
  } catch (e) {
    // 실패해도 손님 화면은 「급상승」만 안 뜨고 정상 동작한다.
    return NextResponse.json({ ok: false, message: String((e as Error)?.message || e) }, { status: 500 });
  }

  // 여기서 «수량»을 버리고 id 목록만 남긴다 — 밖으로 숫자가 나가지 않는 지점.
  const ids = Object.entries(qtyByProduct)
    .filter(([, qty]) => qty >= TODAY_MIN_QTY)
    .map(([pid]) => pid);

  return NextResponse.json(
    { ok: true, scope: broadcastId ? "broadcast" : "today", ids },
    { headers: { "Cache-Control": `public, s-maxage=${broadcastId ? 10 : 30}, stale-while-revalidate=60` } },
  );
}
