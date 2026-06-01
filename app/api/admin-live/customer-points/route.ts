import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSessionFromRequest } from "@/lib/admin-auth";

import {
  assertValidCustomerPointPhone,
  buildCustomerPointBalancePayload,
  buildCustomerPointChange,
  buildCustomerPointLedgerPayload,
  formatCustomerPointMoney,
  normalizeCustomerPointAction,
  readCurrentCustomerPoints,
  sanitizeCustomerPointText,
  type CustomerPointBalanceRow,
} from "@/lib/customerPoints";

export const dynamic = "force-dynamic";

type ApiErrorResponse = {
  ok: false;
  message: string;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json<ApiErrorResponse>({ ok: false, message }, { status });
}

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    "";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase 관리자 환경변수가 설정되지 않았습니다.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;

async function assertAdminRequest(request: NextRequest) {
  const adminSession = await verifyAdminSessionFromRequest(request);

  if (!adminSession) {
    throw new Error("관리자 로그인이 필요합니다. /admin-login에서 다시 로그인 후 새로고침해주세요.");
  }
}

async function fetchPointBalance(supabase: SupabaseAdminClient, phone: string) {
  const { data, error } = await supabase
    .from("customer_point_balances")
    .select("*")
    .eq("customer_phone", phone)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "포인트 잔액 조회 실패");
  }

  return (data || null) as CustomerPointBalanceRow | null;
}

async function fetchPointLedger(supabase: SupabaseAdminClient, phone: string, limit = 30) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit || 30)));

  const { data, error } = await supabase
    .from("customer_point_ledger")
    .select("*")
    .eq("customer_phone", phone)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw new Error(error.message || "포인트 이력 조회 실패");
  }

  return data || [];
}

export async function GET(request: NextRequest) {
  try {
    await assertAdminRequest(request);

    const supabase = getSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const phone = assertValidCustomerPointPhone(searchParams.get("phone") || searchParams.get("customer_phone"));
    const limit = Number(searchParams.get("limit") || 30);

    const balance = await fetchPointBalance(supabase, phone);
    const ledger = await fetchPointLedger(supabase, phone, limit);
    const currentPoints = readCurrentCustomerPoints(balance);

    return NextResponse.json({
      ok: true,
      phone,
      current_points: currentPoints,
      current_points_text: formatCustomerPointMoney(currentPoints),
      balance: balance || {
        customer_phone: phone,
        current_points: 0,
        total_granted_points: 0,
        total_used_points: 0,
        total_canceled_points: 0,
        total_adjusted_points: 0,
      },
      ledger,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "포인트 조회 실패", 400);
  }
}

export async function POST(request: NextRequest) {
  let ledgerIdForRollback = "";

  try {
    await assertAdminRequest(request);

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return jsonError("요청 내용이 올바르지 않습니다.");
    }

    const supabase = getSupabaseAdminClient();
    const phone = assertValidCustomerPointPhone((body as any).phone || (body as any).customer_phone);
    const action = normalizeCustomerPointAction((body as any).action);
    const amount = (body as any).amount;
    const reason = sanitizeCustomerPointText((body as any).reason, 200);
    const adminMemo = sanitizeCustomerPointText((body as any).admin_memo || (body as any).adminMemo, 500);
    const youtubeNickname = sanitizeCustomerPointText((body as any).youtube_nickname || (body as any).youtubeNickname, 80);
    const customerName = sanitizeCustomerPointText((body as any).customer_name || (body as any).customerName, 80);

    if (!reason) {
      return jsonError(action === "grant" ? "지급 사유를 입력해주세요." : "차감 사유를 입력해주세요.");
    }

    const previousBalance = await fetchPointBalance(supabase, phone);
    const currentPoints = readCurrentCustomerPoints(previousBalance);
    const change = buildCustomerPointChange({
      action,
      amount,
      currentPoints,
    });

    ledgerIdForRollback = randomUUID();

    const ledgerPayload = buildCustomerPointLedgerPayload({
      id: ledgerIdForRollback,
      phone,
      youtubeNickname,
      customerName,
      change,
      reason,
      adminMemo,
      customerVisible: (body as any).customer_visible,
      createdBy: "admin",
    });

    const balancePayload = buildCustomerPointBalancePayload({
      phone,
      youtubeNickname,
      customerName,
      previousBalance,
      change,
      adminMemo,
    });

    const { error: ledgerError } = await supabase.from("customer_point_ledger").insert(ledgerPayload);

    if (ledgerError) {
      throw new Error(ledgerError.message || "포인트 이력 저장 실패");
    }

    const { data: savedBalance, error: balanceError } = await supabase
      .from("customer_point_balances")
      .upsert(balancePayload, { onConflict: "customer_phone" })
      .select("*")
      .single();

    if (balanceError) {
      await supabase.from("customer_point_ledger").delete().eq("id", ledgerIdForRollback);
      throw new Error(balanceError.message || "포인트 잔액 저장 실패");
    }

    return NextResponse.json({
      ok: true,
      message: change.action === "grant" ? "포인트 지급이 완료되었습니다." : "포인트 차감이 완료되었습니다.",
      phone,
      action: change.action,
      change_type: change.changeType,
      amount: change.signedAmount,
      requested_amount: change.requestedAmount,
      current_points_before: currentPoints,
      current_points_after: change.nextPoints,
      current_points_text: formatCustomerPointMoney(change.nextPoints),
      summary: `${change.action === "grant" ? "포인트 지급" : "포인트 차감"} ${formatCustomerPointMoney(
        change.requestedAmount
      )}`,
      balance: savedBalance,
      ledger_id: ledgerIdForRollback,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "포인트 처리 실패", 400);
  }
}
