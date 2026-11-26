// app/api/cron/product-sales-stats/route.ts
// 목적: 상품 판매 통계(누적판매·최근30일·재구매·판매순위)를 주기적으로 다시 집계한다.
//       손님 상품카드의 자동 배지(🏆/📈/🔁/HOT/💖루루픽)가 «알아서» 최신이 되게 하는 유일한 경로.
//
// 왜 필요했나
//   사장님 질문: «실시간으로 알아서 등록된 상품에 배지가 바껴? 새로고침 하면?»
//   → 재고·담김 기반 배지(🔥N개남음·HOT담김)는 새로고침이면 즉시 바뀌지만,
//     판매 기록 기반 배지는 집계 함수를 돌려야만 바뀐다. 사람이 매번 SQL을 돌릴 수는 없다.
//
// 안전
//   · 하는 일은 refresh_product_sales_stats() 호출 하나. 계산은 전부 DB 안에서 끝난다.
//   · 그 함수는 products 의 집계 컬럼만 쓰고 orders 는 읽기만 한다.
//     주문·입금·정산·배송 데이터를 바꾸지 않는다.
//   · 실패해도 배지가 «예전 숫자»로 남을 뿐 화면이 깨지지 않는다.
//   · 인증은 기존 bankda-sync cron 과 같은 방식(Vercel Cron UA 또는 CRON_SECRET).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function providedSecret(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  return (bearer || request.headers.get("x-cron-secret") || request.nextUrl.searchParams.get("secret") || "").trim();
}

function authorized(request: NextRequest) {
  // Vercel Cron 공식 호출은 user-agent 에 vercel-cron/1.0 을 넣는다(bankda-sync 와 동일 판정).
  if ((request.headers.get("user-agent") || "").includes("vercel-cron/1.0")) return true;
  const secrets = [String(process.env.CRON_SECRET || "").trim()].filter(Boolean);
  const given = providedSecret(request);
  return Boolean(given && secrets.includes(given));
}

async function run(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, message: "인증 실패" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: false, message: "Supabase 환경변수 없음" }, { status: 500 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const startedAt = Date.now();

  // [2026-11-26 DB 바쁨 줄이기] 한 번에 약 15초 걸리는 집계라, 지난 65분 동안 새 주문·입금확인이 없으면 건너뜀.
  // 취소·30일 창 이동도 반영되게 6시간마다(한국 0·6·12·18시)는 무조건 돌림. 수동 호출(?force=1)도 늘 돌림.
  const kstHour = (new Date().getUTCHours() + 9) % 24;
  const forced = request.nextUrl.searchParams.get("force") === "1" || kstHour % 6 === 0;
  if (!forced) {
    const since = new Date(Date.now() - 65 * 60 * 1000).toISOString();
    const [created, paid] = await Promise.all([
      supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", since),
      supabase.from("orders").select("id", { count: "exact", head: true }).gte("deposit_confirmed_at", since),
    ]);
    // 확인 자체가 실패하면 예전처럼 돌림(배지가 멈추지 않게).
    if (!created.error && !paid.error && (created.count ?? 0) === 0 && (paid.count ?? 0) === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: "지난 65분 새 주문·입금확인 없음" });
    }
  }
  const { data, error } = await supabase.rpc("refresh_product_sales_stats");

  if (error) {
    // 함수가 아직 없으면(=SQL 미실행) 여기서 조용히 알려준다. 화면에는 영향 없음.
    console.warn("[product-sales-stats] 집계 실패:", error.message);
    return NextResponse.json({ ok: false, message: error.message, hint: "supabase/sql/stats 의 1·2단계 SQL 실행 여부 확인" }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    ok: true,
    ms: Date.now() - startedAt,
    updatedProducts: row?.updated_products ?? null,
    sumQty: row?.sum_qty ?? null,
    sumRepeat: row?.sum_repeat ?? null,
    ranked: row?.ranked ?? null,
  });
}

export async function GET(request: NextRequest) { return run(request); }
export async function POST(request: NextRequest) { return run(request); }
