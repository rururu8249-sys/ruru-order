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
// [2026-09-05 사장님 지시] 관리자 계정은 통계·명단에서 제외 (닉네임 기준, 공백 무시)
const ADMIN_NICKNAMES = new Set(["동실장", "루루동이", "루루실장"].map((n) => n.replace(/\s+/g, "")));
const isAdminNick = (nick: unknown) => ADMIN_NICKNAMES.has(String(nick ?? "").replace(/\s+/g, ""));

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
    const want = ["id", "created_at", "customer_phone", "kakao_id", "youtube_nickname", "order_group_id",
      "total_amount", "final_amount", "adjusted_total_price", "total_price",
      "shipping_fee", "adjusted_shipping_fee", "product_price", "adjusted_product_price", "qty", "product_name", "item_change_history",
      "zipcode", "address", "detail_address", "broadcast_id", "order_manage_status", "is_deleted"];
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

    // [2026-09-05 근본수정 · 실제 입금 주문만] 회원 상세와 동일하게 "입금된 주문"만 통계에 센다.
    //   입금 안 된 장난/테스트 주문(예: 865만원 미입금건)·취소·환불이 재구매율·금액을 오염시키던 문제.
    //   판정 기준은 검증된 lib/admin-v2 PAID_STATUS_VALUES + AdminLiveCustomersPanel.isPaid 와 동일.
    const payCols = statusCols.filter((c) => /order_manage_status|admin_order_status_v2|shipping_status/.test(c));
    const usedCols = payCols.length ? payCols : statusCols;
    const rowStatusText = (o: Row) => usedCols.map((c) => String(o[c] ?? "")).filter(Boolean).join(" ");
    const PAID_RE = /입금확인|자동입금확인|수동입금확인|카드결제완료|결제완료|출고대기|출고완료|킵|픽업/;
    const VOID_RE = /cancel|취소|환불|refund|테스트/i;
    // 실제 구매(입금완료) 주문 = 입금/출고 표시가 있고, 취소·환불·테스트가 아닌 것
    const isRealPurchase = (o: Row) => { const t = rowStatusText(o); return PAID_RE.test(t) && !VOID_RE.test(t); };
    const isCanceled = (o: Row) => !isRealPurchase(o); // 아래 로직 호환 — 입금 안 됐거나 취소/환불이면 제외

    // [2026-09-05 진단 전용 · 읽기 전용] ?inspect=<닉/전화 일부> → 그 사람 실제 주문 줄을 그대로 보여준다.
    //   865만원 같은 이상치가 왜 나오는지 데이터로 확인하기 위한 것. 아무 데이터도 바꾸지 않는다.
    const inspect = String(request.nextUrl.searchParams.get("inspect") || "").trim();
    // [2026-09-06 진단 전용 · 읽기 전용] ?addr=<주소 일부> → 전화/닉 무관하게 그 주소로 들어온 주문 줄 전부.
    //   (윤땡땡 9/4 0원: 문향로11 주소로 다른 번호/닉의 주문이 있었는지 확인용). 아무 데이터도 바꾸지 않는다.
    const inspectAddr = String(request.nextUrl.searchParams.get("addr") || "").replace(/\s+/g, "").toLowerCase();
    if (inspect || inspectAddr) {
      const q = inspect.toLowerCase();
      const inspectDigits = inspect.replace(/[^0-9]/g, "");
      const hit = rows.filter((o) => {
        if (inspectAddr) {
          const a = `${o.address || ""}${o.detail_address || ""}`.replace(/\s+/g, "").toLowerCase();
          return a.includes(inspectAddr);
        }
        const nk = String(o.youtube_nickname || "").toLowerCase();
        const ph = digits(o.customer_phone);
        // [2026-09-06] 한글만 넣으면 빈 digit 로 전체매칭되던 버그 수정: 숫자가 있을 때만 전화 비교
        return (q && nk.includes(q)) || (inspectDigits.length >= 4 && ph.includes(inspectDigits));
      }).slice(0, 200).map((o) => ({
        id: o.id,
        group: String(o.order_group_id || o.id),
        day: String(o.created_at || "").slice(0, 16),
        deleted: o.is_deleted === true,
        nick: o.youtube_nickname, phone: o.customer_phone, kakao: o.kakao_id || "",
        status: statusCols.map((c) => o[c]).filter(Boolean).join("|"),
        product: o.product_name, qty: o.qty,
        addr: [o.zipcode, o.address, o.detail_address].filter(Boolean).join(" "), broadcast: o.broadcast_id, payStatus: o.order_manage_status,
        amounts: { total_amount: o.total_amount, final_amount: o.final_amount, adjusted_total_price: o.adjusted_total_price, total_price: o.total_price,
          product_price: o.product_price, adjusted_product_price: o.adjusted_product_price, shipping_fee: o.shipping_fee, adjusted_shipping_fee: o.adjusted_shipping_fee },
        changeHistory: o.item_change_history,
      }));
      const byGroup = new Map<string, number>();
      for (const h of hit) byGroup.set(h.group, (byGroup.get(h.group) || 0) + 1);
      return NextResponse.json({ ok: true, inspect, rowCount: hit.length, groupCount: byGroup.size, rows: hit });
    }

    // 고객별 구매일(같은 날 합침)
    // [2026-09-05 근본수정 · 정체성 병합] 같은 사람이 「카카오 주문」과 「카카오 연결 전 전화 주문」으로
    //   고객 두 줄로 갈라져 명단에 두 번 나오고(sc·선가네 중복), 2회 구매자가 1회짜리 둘로 쪼개져
    //   재구매율까지 틀어졌다. 8/31 확정 원칙(정체성=카카오 계정)대로, 전화번호가 카카오 계정과
    //   한 번이라도 같이 등장했으면 그 전화의 모든 주문을 그 카카오 고객으로 합친다.
    const phoneToKakao = new Map<string, string>();
    for (const o of rows) {
      if (isCanceled(o)) continue;
      const k = String(o.kakao_id || "").trim();
      const p = digits(o.customer_phone);
      if (k && p && !phoneToKakao.has(p)) phoneToKakao.set(p, k);
    }
    const buyDays = new Map<string, Set<string>>();
    const nickOf = new Map<string, string>();
    const phoneOf = new Map<string, string>();
    const kakaoOf = new Map<string, string>(); // [2026-09-05] 명단 클릭→회원상세 연결용(카카오ID 우선)
    const spendOf = new Map<string, number>();
    const rowAmount = (o: Row) => {
      const v = Number(o.total_amount ?? o.final_amount ?? o.adjusted_total_price ?? o.total_price ?? 0);
      return Number.isFinite(v) && v > 0 ? v : 0;
    };
    let canceledRows = 0;
    for (const o of rows) {
      if (isCanceled(o)) { canceledRows++; continue; }
      const kakRaw = String(o.kakao_id || "").trim();
      const phRaw = digits(o.customer_phone);
      const cust = kakRaw || (phRaw ? phoneToKakao.get(phRaw) || phRaw : "");
      if (!cust) continue;
      const kakForCust = kakRaw || (phRaw ? phoneToKakao.get(phRaw) || "" : "");
      if (kakForCust) kakaoOf.set(cust, kakForCust);
      const t = new Date(String(o.created_at)).getTime();
      if (!Number.isFinite(t)) continue;
      if (!buyDays.has(cust)) buyDays.set(cust, new Set());
      buyDays.get(cust)!.add(new Date(t).toISOString().slice(0, 10));
      const nick = String(o.youtube_nickname || "").trim();
      if (nick) nickOf.set(cust, nick);
      const ph = digits(o.customer_phone);
      if (ph) phoneOf.set(cust, ph);
      spendOf.set(cust, (spendOf.get(cust) || 0) + rowAmount(o));
    }
    // 관리자 계정 제거 — 모든 통계·명단에서 빠진다
    for (const [cust] of Array.from(buyDays)) {
      if (isAdminNick(nickOf.get(cust))) { buyDays.delete(cust); spendOf.delete(cust); }
    }

    const counts = { one: 0, two: 0, threeToFive: 0, sixPlus: 0 };
    const gaps: number[] = [];
    const lapsed: Record<string, { all: number; repeat: number }> = {
      "30": { all: 0, repeat: 0 }, "60": { all: 0, repeat: 0 }, "90": { all: 0, repeat: 0 }, "180": { all: 0, repeat: 0 },
    };
    const monthly = new Map<string, { nw: number; rp: number }>();
    const now = Date.now();
    const top: Array<{ nick: string; n: number; last: string; spend: number; kakao: string; phone: string }> = [];
    // 카드 4장 세그먼트: 🌱새손님(1회·90일 미만) / 💖단골(2회+·기준일 미만) / 🚨떠나려는 단골(2회+·기준일↑) / 💤떠난 손님(1회·90일↑)
    const segments = { fresh: 0, loyal: 0, atRisk: 0, gone: 0 };
    type SegRow = { phone: string; kakao: string; nick: string; buys: number; lastBuy: string; daysSince: number; spend: number };
    const lists: Record<"fresh" | "loyal" | "atRisk" | "gone", SegRow[]> = { fresh: [], loyal: [], atRisk: [], gone: [] };
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
      top.push({ nick: nickOf.get(cust) || `${cust.slice(0, 4)}…`, n, last: dates[n - 1], spend: spendOf.get(cust) || 0, kakao: kakaoOf.get(cust) || "", phone: phoneOf.get(cust) || "" });
      const seg: "fresh" | "loyal" | "atRisk" | "gone" =
        n === 1 ? (since >= 90 ? "gone" : "fresh") : since >= lapsedDaysCut ? "atRisk" : "loyal";
      segments[seg]++;
      const phoneDigits = phoneOf.get(cust) || (/^[0-9]{9,}$/.test(cust) ? cust : "");
      if (phoneDigits) {
        lists[seg].push({ phone: phoneDigits, kakao: kakaoOf.get(cust) || "", nick: nickOf.get(cust) || phoneDigits.slice(-4), buys: n, lastBuy: dates[n - 1], daysSince: since, spend: spendOf.get(cust) || 0 });
      }
    }
    lists.atRisk.sort((a, b) => b.buys - a.buys || a.daysSince - b.daysSince);
    lists.loyal.sort((a, b) => b.spend - a.spend);
    lists.fresh.sort((a, b) => a.daysSince - b.daysSince);
    lists.gone.sort((a, b) => b.spend - a.spend);
    // 같은 전화번호가 두 줄 나오는 일이 절대 없게 — 명단·지급 안전핀
    const dedupeByPhone = (arr: SegRow[]) => {
      const seen = new Set<string>();
      return arr.filter((r) => { if (seen.has(r.phone)) return false; seen.add(r.phone); return true; });
    };
    lists.fresh = dedupeByPhone(lists.fresh);
    lists.loyal = dedupeByPhone(lists.loyal);
    lists.atRisk = dedupeByPhone(lists.atRisk);
    lists.gone = dedupeByPhone(lists.gone);

    // 방송주기 — 최근 30일 방송 횟수(방송 기록 실측, 읽기 전용)
    let broadcastCount30d = 0;
    try {
      const sinceIso30 = new Date(now - 30 * 86400000).toISOString();
      const { data: bc } = await supabase
        .from("broadcasts")
        .select("id, started_at, is_deleted")
        .gte("started_at", sinceIso30)
        .limit(1000);
      broadcastCount30d = (bc || []).filter((b: Record<string, unknown>) => !b.is_deleted).length;
    } catch { /* 보조 표시 — 실패해도 통계 정상 */ }

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
      broadcastCount30d,
      lists: {
        fresh: lists.fresh.slice(0, 500),
        loyal: lists.loyal.slice(0, 500),
        atRisk: lists.atRisk.slice(0, 500),
        gone: lists.gone.slice(0, 500),
      },
      atRiskList: lists.atRisk.slice(0, 500),
      recentComebackPhones: Array.from(new Set(recentComebackPhones)),
      monthly: Array.from(monthly.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({ month: m, new: v.nw, repeat: v.rp })),
      topCustomers: top.slice(0, 15),
      topSpenders: [...top].sort((a, b) => b.spend - a.spend).slice(0, 15),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
