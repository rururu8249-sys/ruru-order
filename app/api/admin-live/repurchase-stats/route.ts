// [2026-09-05 단골 리포트 1단계] 재구매율·구매주기 통계 API — 읽기 전용(아무것도 수정하지 않음).
//   관리자 세션 필수. 단골 리포트 화면의 데이터 소스이자, 복귀 포인트 기준일 확정용 실측.
//   고객 식별: kakao_id 우선, 없으면 전화번호(숫자만). 구매 1건 = order_group_id 1개(같은 날은 1회로 합침).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase 관리자 환경변수가 설정되지 않았습니다.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

const digits = (v: unknown) => String(v ?? "").replace(/[^0-9]/g, "");

export async function GET(request: NextRequest) {
  try {
    const adminSession = await verifyAdminSessionFromRequest(request);
    if (!adminSession) {
      return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });
    }
    const supabase = getSupabaseAdminClient();
    // 세그먼트 기준일 — 실측 구매주기(중앙값 8일·90% 45일)에 맞춰 기본 45일, 30~180 사이만 허용
    const lapsedDaysParam = Number(request.nextUrl.searchParams.get("days") || 45);
    const lapsedDaysCut = Number.isFinite(lapsedDaysParam) ? Math.min(180, Math.max(14, Math.round(lapsedDaysParam))) : 45;

    // 상태 컬럼 자동 감지 — 테이블 실물 기준(추정 금지)
    const { data: probe, error: probeError } = await supabase.from("orders").select("*").limit(1);
    if (probeError) throw new Error(probeError.message);
    const allCols = Object.keys((probe || [])[0] || {});
    const statusCols = allCols.filter((c) => /status/i.test(c));
    const want = ["id", "created_at", "customer_phone", "kakao_id", "youtube_nickname", "order_group_id"];
    const selectCols = Array.from(new Set([...want.filter((c) => allCols.includes(c)), ...statusCols])).join(",");

    type Row = Record<string, unknown>;
    const rows: Row[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("orders")
        .select(selectCols)
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      rows.push(...((data || []) as unknown as Row[]));
      if (!data || data.length < pageSize) break;
      if (rows.length > 200000) break; // 안전 상한
    }

    const isCanceled = (o: Row) => statusCols.some((c) => /cancel|취소/i.test(String(o[c] ?? "")));

    // 고객별 구매일(같은 날 합침)
    const buyDays = new Map<string, Set<string>>();
    const nickOf = new Map<string, string>();
    const phoneOf = new Map<string, string>();
    let canceledRows = 0;
    for (const o of rows) {
      if (isCanceled(o)) { canceledRows++; continue; }
      const cust = String(o.kakao_id || "").trim() || digits(o.customer_phone);
      if (!cust) continue;
      const t = new Date(String(o.created_at)).getTime();
      if (!Number.isFinite(t)) continue;
      if (!buyDays.has(cust)) buyDays.set(cust, new Set());
      buyDays.get(cust)!.add(new Date(t).toISOString().slice(0, 10));
      const nick = String(o.youtube_nickname || "").trim();
      if (nick) nickOf.set(cust, nick);
      const ph = digits(o.customer_phone);
      if (ph) phoneOf.set(cust, ph);
    }

    const counts = { one: 0, two: 0, threeToFive: 0, sixPlus: 0 };
    const gaps: number[] = [];
    const lapsed: Record<string, { all: number; repeat: number }> = {
      "30": { all: 0, repeat: 0 }, "60": { all: 0, repeat: 0 }, "90": { all: 0, repeat: 0 }, "180": { all: 0, repeat: 0 },
    };
    const monthly = new Map<string, { nw: number; rp: number }>();
    const now = Date.now();
    const top: Array<{ nick: string; n: number; last: string }> = [];
    // 카드 4장 세그먼트: 🌱새손님(1회·90일 미만) / 💖단골(2회+·기준일 미만) / 🚨떠나려는 단골(2회+·기준일↑) / 💤떠난 손님(1회·90일↑)
    const segments = { fresh: 0, loyal: 0, atRisk: 0, gone: 0 };
    const atRiskList: Array<{ phone: string; nick: string; buys: number; lastBuy: string; daysSince: number }> = [];
    for (const [cust, set] of buyDays) {
      const dates = Array.from(set).sort();
      const n = dates.length;
      if (n === 1) counts.one++; else if (n === 2) counts.two++; else if (n <= 5) counts.threeToFive++; else counts.sixPlus++;
      for (let i = 1; i < n; i++) gaps.push(Math.round((+new Date(dates[i]) - +new Date(dates[i - 1])) / 86400000));
      const since = Math.floor((now - +new Date(dates[n - 1])) / 86400000);
      for (const d of ["30", "60", "90", "180"]) {
        if (since >= Number(d)) { lapsed[d].all++; if (n >= 2) lapsed[d].repeat++; }
      }
      dates.forEach((day, i) => {
        const m = day.slice(0, 7);
        if (!monthly.has(m)) monthly.set(m, { nw: 0, rp: 0 });
        monthly.get(m)![i === 0 ? "nw" : "rp"]++;
      });
      top.push({ nick: nickOf.get(cust) || `${cust.slice(0, 4)}…`, n, last: dates[n - 1] });
      if (n === 1) { if (since >= 90) segments.gone++; else segments.fresh++; }
      else if (since >= lapsedDaysCut) {
        segments.atRisk++;
        const phoneDigits = phoneOf.get(cust) || (/^[0-9]{9,}$/.test(cust) ? cust : "");
        if (phoneDigits) {
          atRiskList.push({ phone: phoneDigits, nick: nickOf.get(cust) || phoneDigits.slice(-4), buys: n, lastBuy: dates[n - 1], daysSince: since });
        }
      } else segments.loyal++;
    }
    atRiskList.sort((a, b) => b.buys - a.buys || a.daysSince - b.daysSince);

    // [재지급 잠금] 최근 30일 안에 "복귀" 사유 포인트를 이미 받은 번호 — 명단에 표시해 이중 지급을 막는다(읽기 전용)
    const recentComebackPhones: string[] = [];
    try {
      const sinceIso = new Date(now - 30 * 86400000).toISOString();
      const { data: recent } = await supabase
        .from("customer_point_ledger")
        .select("customer_phone, created_at, reason")
        .gte("created_at", sinceIso)
        .ilike("reason", "%복귀%")
        .limit(2000);
      for (const r of (recent || []) as Array<Record<string, unknown>>) {
        const ph = digits(r.customer_phone);
        if (ph) recentComebackPhones.push(ph);
      }
    } catch { /* 잠금 표시는 보조 — 실패해도 통계는 정상 */ }
    gaps.sort((a, b) => a - b);
    const q = (p: number) => (gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))] : 0);
    top.sort((a, b) => b.n - a.n);

    const totalCustomers = buyDays.size;
    const repeaters = totalCustomers - counts.one;
    return NextResponse.json({
      ok: true,
      orderRows: rows.length,
      canceledRows,
      statusCols,
      totalCustomers,
      repeaters,
      repurchaseRatePct: totalCustomers ? Math.round((repeaters / totalCustomers) * 1000) / 10 : 0,
      counts,
      gapDays: { samples: gaps.length, p25: q(0.25), median: q(0.5), p75: q(0.75), p90: q(0.9) },
      lapsed,
      lapsedDaysCut,
      segments,
      atRiskList: atRiskList.slice(0, 500),
      recentComebackPhones: Array.from(new Set(recentComebackPhones)),
      monthly: Array.from(monthly.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({ month: m, new: v.nw, repeat: v.rp })),
      topCustomers: top.slice(0, 15),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
