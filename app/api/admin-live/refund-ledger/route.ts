// [2026-09-26] 교환·환불 장부 API — 1단계. verifyAdminSession + service_role 전용.
//   ⚠️ 돈 무접촉: 포인트/주문/정산 라우트·RPC 를 호출하지 않는다. refund_ledger «기록»만 읽고 쓴다.
//   보안: 목록은 계좌 뒷4자리만. 전체 계좌번호는 단건(GET ?id=) 열 때만, 그것도 done_at+30일 지나면 가림.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";
import {
  computeAmountFinal,
  normalizeAdjustments,
  accountLast4,
  digitsOnly,
  shouldHideAccountNumber,
  isValidStage,
  isValidKind,
  isValidMethod,
  REFUND_STAGES,
} from "@/lib/refundLedger";

const LIST_LIMIT_MAX = 500;

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase 관리자 환경변수가 설정되지 않았습니다.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function text(v: unknown, max = 2000): string {
  return String(v ?? "").trim().slice(0, max);
}

type Row = Record<string, unknown>;

// 목록·엑셀용: 전체 계좌번호를 빼고 뒷4자리만.
function toListRow(row: Row) {
  const { account_number, ...rest } = row;
  return { ...rest, account_last4: accountLast4(account_number) };
}

// 단건(처리 창)용: 전체 계좌번호 포함. 단 done_at+30일 지나면 가린다(지연 마스킹).
function toDetailRow(row: Row, now: number) {
  const hide = shouldHideAccountNumber(row.done_at, now);
  return {
    ...row,
    account_number: hide ? "" : text(row.account_number, 40),
    account_last4: accountLast4(row.account_number),
    account_hidden: hide,
  };
}

// 저장 payload 구성(생성·수정 공용). amount_final 은 서버가 재계산. 계좌는 숫자만.
function buildWritePayload(body: Row) {
  const adjustments = normalizeAdjustments(body.adjustments);
  const amountBase = Math.max(0, Math.round(Number(body.amount_base)) || 0);
  const payload: Row = {
    amount_base: amountBase,
    adjustments,
    amount_final: computeAmountFinal(amountBase, adjustments),
  };
  if (body.kind !== undefined) payload.kind = isValidKind(body.kind) ? body.kind : "반품";
  if (body.stage !== undefined) payload.stage = isValidStage(body.stage) ? body.stage : "접수";
  if (body.method !== undefined) payload.method = isValidMethod(body.method) ? body.method : "없음";
  if (body.reason !== undefined) payload.reason = text(body.reason);
  if (body.next_action !== undefined) payload.next_action = text(body.next_action, 500);
  if (body.exchange_option !== undefined) payload.exchange_option = text(body.exchange_option, 500);
  if (body.reship_tracking !== undefined) payload.reship_tracking = text(body.reship_tracking, 120);
  if (body.bank !== undefined) payload.bank = text(body.bank, 60);
  if (body.account_number !== undefined) payload.account_number = digitsOnly(body.account_number).slice(0, 30);
  if (body.account_holder !== undefined) payload.account_holder = text(body.account_holder, 60);
  if (body.memo !== undefined) payload.memo = text(body.memo, 4000);
  if (body.product_snapshot !== undefined && Array.isArray(body.product_snapshot)) payload.product_snapshot = body.product_snapshot;
  // 식별/연결 필드(생성 시)
  for (const k of ["admin_task_id", "order_group_id", "order_lookup_code", "customer_phone", "kakao_id", "nickname", "customer_name"]) {
    if (body[k] !== undefined) payload[k] = k === "customer_phone" ? digitsOnly(body[k]) : text(body[k], 200);
  }
  return payload;
}

export async function GET(request: NextRequest) {
  const adminSession = await verifyAdminSessionFromRequest(request);
  if (!adminSession) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });

  const now = Date.now();
  const url = new URL(request.url);
  const id = text(url.searchParams.get("id"), 60);

  try {
    const supabase = getSupabaseAdminClient();

    // ── 단건(처리 창): 전체 계좌번호 포함 ──
    if (id) {
      const { data, error } = await supabase.from("refund_ledger").select("*").eq("id", id).maybeSingle();
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
      if (!data) return NextResponse.json({ ok: false, message: "장부 항목을 찾을 수 없습니다." }, { status: 404 });
      return NextResponse.json({ ok: true, item: toDetailRow(data as Row, now) });
    }

    // ── 고객이슈용 묶음 조회: admin_task_id IN (…) → 뒷4자리만. 줄마다 개별 조회 금지 대응. ──
    const taskIdsRaw = text(url.searchParams.get("taskIds"), 4000);
    if (taskIdsRaw) {
      const ids = Array.from(new Set(taskIdsRaw.split(",").map((s) => s.trim()).filter(Boolean))).slice(0, 60);
      if (ids.length === 0) return NextResponse.json({ ok: true, items: [] });
      const { data, error } = await supabase.from("refund_ledger").select("*").in("admin_task_id", ids);
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, items: ((data as Row[]) || []).map(toListRow) });
    }

    // ── 목록: 계좌 뒷4자리만 + 단계별 건수 ──
    const stage = text(url.searchParams.get("stage"), 20);
    const kind = text(url.searchParams.get("kind"), 20);
    const q = text(url.searchParams.get("q"), 100).toLowerCase();
    const from = text(url.searchParams.get("from"), 40);
    const to = text(url.searchParams.get("to"), 40);
    const limit = Math.min(LIST_LIMIT_MAX, Math.max(1, Number(url.searchParams.get("limit")) || 200));

    // 단계 무관 base set (단계 탭 건수는 전체 기준) — 기간/구분만 서버 필터
    let query = supabase.from("refund_ledger").select("*").order("created_at", { ascending: false }).limit(LIST_LIMIT_MAX);
    if (kind && isValidKind(kind)) query = query.eq("kind", kind);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);
    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });

    let rows = (data as Row[]) || [];
    // 검색(닉네임·이름·전화·주문번호) — 클라 부하 줄이려 서버에서 필터
    if (q) {
      rows = rows.filter((r) =>
        [r.nickname, r.customer_name, r.customer_phone, r.order_lookup_code, r.reason]
          .map((v) => String(v ?? "").toLowerCase())
          .some((s) => s.includes(q)),
      );
    }
    // 단계별 건수(단계 필터 적용 전)
    const counts: Record<string, number> = {};
    for (const s of REFUND_STAGES) counts[s] = 0;
    rows.forEach((r) => {
      const s = String(r.stage ?? "");
      if (counts[s] !== undefined) counts[s] += 1;
    });
    const total = rows.length;
    // 단계 필터 적용 후 limit
    const filtered = stage && isValidStage(stage) ? rows.filter((r) => String(r.stage) === stage) : rows;
    const items = filtered.slice(0, limit).map(toListRow);

    return NextResponse.json({ ok: true, items, counts, total, returned: items.length });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "장부 조회 실패" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const adminSession = await verifyAdminSessionFromRequest(request);
  if (!adminSession) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Row | null;
  if (!body) return NextResponse.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });

  try {
    const supabase = getSupabaseAdminClient();
    const payload = buildWritePayload(body);
    const { data, error } = await supabase.from("refund_ledger").insert(payload).select("*").single();
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: toDetailRow(data as Row, Date.now()) });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "장부 생성 실패" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const adminSession = await verifyAdminSessionFromRequest(request);
  if (!adminSession) return NextResponse.json({ ok: false, message: "관리자 로그인이 필요합니다." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Row | null;
  const id = text(body?.id, 60);
  if (!body || !id) return NextResponse.json({ ok: false, message: "수정할 항목 id가 없습니다." }, { status: 400 });

  try {
    const supabase = getSupabaseAdminClient();
    const payload = buildWritePayload(body);
    // 상태 전이 시각 기록(값이 명시적으로 왔을 때만) — 돈은 안 움직이고 «시각»만 남긴다.
    if (body.mark_transferred === true) payload.transferred_at = new Date().toISOString();
    if (body.mark_done === true) {
      payload.done_at = new Date().toISOString();
      if (body.stage === undefined) payload.stage = "완료";
    }
    const { data, error } = await supabase.from("refund_ledger").update(payload).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: toDetailRow(data as Row, Date.now()) });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "장부 수정 실패" }, { status: 500 });
  }
}
