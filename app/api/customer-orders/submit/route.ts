import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { assertValidCustomerPointPhone } from "@/lib/customerPoints";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

type OrderSubmitPayload = {
  orderRows?: AnyRow[];
  point_use_amount?: number;
  pointUseAmount?: number;
  customer_phone?: string;
  customerPhone?: string;
  youtube_nickname?: string;
  youtubeNickname?: string;
  customer_name?: string;
  customerName?: string;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function getSupabaseOrderSubmitClient() {
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

function toWon(value: unknown): number {
  const amount = Math.floor(Number(value || 0));

  if (!Number.isFinite(amount) || amount < 0) {
    return 0;
  }

  return amount;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function firstOrderValue(orderRows: AnyRow[], key: string): unknown {
  return orderRows[0]?.[key];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as OrderSubmitPayload | null;

    if (!body || typeof body !== "object") {
      return jsonError("주문 요청 내용이 올바르지 않습니다.");
    }

    const orderRows = Array.isArray(body.orderRows) ? body.orderRows : [];

    if (orderRows.length === 0) {
      return jsonError("주문 상품이 없습니다.");
    }

    const phone = assertValidCustomerPointPhone(
      body.customer_phone ||
        body.customerPhone ||
        firstOrderValue(orderRows, "customer_phone") ||
        firstOrderValue(orderRows, "phone")
    );

    const pointUseAmount = toWon(body.point_use_amount ?? body.pointUseAmount ?? 0);
    const youtubeNickname = text(
      body.youtube_nickname ||
        body.youtubeNickname ||
        firstOrderValue(orderRows, "youtube_nickname")
    );
    const customerName = text(
      body.customer_name ||
        body.customerName ||
        firstOrderValue(orderRows, "customer_name")
    );

    const supabase = getSupabaseOrderSubmitClient();

    const { data, error } = await supabase.rpc("submit_customer_order_with_points", {
      p_order_rows: orderRows,
      p_point_use_amount: pointUseAmount,
      p_customer_phone: phone,
      p_youtube_nickname: youtubeNickname,
      p_customer_name: customerName,
    });

    if (error) {
      throw new Error(error.message || "주문 저장 실패");
    }

    if (!data || typeof data !== "object") {
      return NextResponse.json({
        ok: true,
        result: data,
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "주문 저장 실패", 400);
  }
}
