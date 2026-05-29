import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { assertValidCustomerPointPhone, formatCustomerPointMoney } from "@/lib/customerPoints";

export const dynamic = "force-dynamic";

type PointGiftRow = {
  id: string;
  customer_phone: string;
  amount: number | null;
  balance_after: number | null;
  reason: string | null;
  created_at: string | null;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function getSupabasePointGiftClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    "";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function cleanId(value: unknown): string {
  return String(value || "").trim();
}

function readGiftAmount(row: Pick<PointGiftRow, "amount">): number {
  const amount = Math.floor(Number(row.amount || 0));

  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  return amount;
}

function readBalanceAfter(row: Pick<PointGiftRow, "balance_after">): number {
  const balanceAfter = Math.floor(Number(row.balance_after || 0));

  if (!Number.isFinite(balanceAfter) || balanceAfter < 0) {
    return 0;
  }

  return balanceAfter;
}

function toGiftPayload(row: PointGiftRow) {
  const amount = readGiftAmount(row);
  const balanceAfter = readBalanceAfter(row);

  return {
    id: row.id,
    amount,
    amount_text: formatCustomerPointMoney(amount),
    balance_after: balanceAfter,
    balance_after_text: formatCustomerPointMoney(balanceAfter),
    reason: String(row.reason || "").trim(),
    created_at: row.created_at,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = assertValidCustomerPointPhone(searchParams.get("phone") || searchParams.get("customer_phone"));

    const supabase = getSupabasePointGiftClient();

    const { data, error } = await supabase
      .from("customer_point_ledger")
      .select("id, customer_phone, amount, balance_after, reason, created_at")
      .eq("customer_phone", phone)
      .eq("customer_visible", true)
      .is("customer_seen_at", null)
      .gt("amount", 0)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(error.message || "포인트 선물 조회 실패");
    }

    const gifts = Array.isArray(data) ? (data as PointGiftRow[]).map(toGiftPayload).filter((gift) => gift.amount > 0) : [];

    return NextResponse.json({
      ok: true,
      gift: gifts[0] || null,
      has_gift: gifts.length > 0,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "포인트 선물 조회 실패", 400);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const phone = assertValidCustomerPointPhone((body as any)?.phone || (body as any)?.customer_phone);
    const giftId = cleanId((body as any)?.gift_id || (body as any)?.id);

    if (!giftId) {
      return jsonError("확인할 포인트 알림을 찾을 수 없습니다.", 400);
    }

    const supabase = getSupabasePointGiftClient();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("customer_point_ledger")
      .update({ customer_seen_at: now })
      .eq("id", giftId)
      .eq("customer_phone", phone)
      .eq("customer_visible", true)
      .is("customer_seen_at", null)
      .gt("amount", 0)
      .select("id, customer_seen_at")
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "포인트 알림 확인 실패");
    }

    return NextResponse.json({
      ok: true,
      seen: Boolean(data),
      customer_seen_at: data?.customer_seen_at || now,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "포인트 알림 확인 실패", 400);
  }
}
