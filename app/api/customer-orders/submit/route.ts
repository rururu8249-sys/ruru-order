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

const submitNumberValue = (value: unknown, fallback = 0) => {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/,/g, ""))
        : Number(value ?? fallback);

  return Number.isFinite(numeric) ? numeric : fallback;
};

const readSubmitSettingNumber = async (
  supabase: any,
  key: string,
  fallback: number,
) => {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) return fallback;

  return submitNumberValue(data?.value, fallback);
};

const normalizeOrderRowsForSubmitSettings = async (
  supabase: any,
  orderRows: AnyRow[],
) => {
  const defaultShippingFee = Math.max(
    0,
    await readSubmitSettingNumber(supabase, "default_shipping_fee", 4000),
  );
  const remoteAreaShippingFee = Math.max(
    0,
    await readSubmitSettingNumber(supabase, "remote_area_shipping_fee", 6000),
  );

  if (defaultShippingFee !== 0 || remoteAreaShippingFee !== 0) {
    return {
      orderRows,
      defaultShippingFee,
      remoteAreaShippingFee,
      normalizedCount: 0,
    };
  }

  let normalizedCount = 0;

  const normalizedRows = orderRows.map((row) => {
    const shippingFee = submitNumberValue(row?.shipping_fee, 0);
    const adjustedShippingFee = submitNumberValue(row?.adjusted_shipping_fee, shippingFee);

    if (shippingFee <= 0 && adjustedShippingFee <= 0) return row;

    normalizedCount += 1;

    const qty = Math.max(1, Math.round(submitNumberValue(row?.qty, 1)));
    const unitProductPrice = submitNumberValue(row?.adjusted_product_price ?? row?.product_price, 0);
    const productAmount = Math.max(0, unitProductPrice * qty);
    const paymentMethod = String(row?.payment_method || "");
    const customerCardRate = submitNumberValue(row?.customer_card_extra_rate_applied, 0);
    const actualCardRate = submitNumberValue(row?.actual_card_fee_rate_applied, 0);
    const cardExtra = paymentMethod === "카드결제"
      ? Math.round(productAmount * (customerCardRate / 100))
      : 0;
    const actualCardFee = paymentMethod === "카드결제"
      ? Math.round(productAmount * (actualCardRate / 100))
      : 0;
    const nextTotal = productAmount + cardExtra;

    const nextRow: AnyRow = {
      ...row,
      shipping_fee: 0,
      adjusted_shipping_fee: 0,
      original_shipping_fee: row?.original_shipping_fee ?? shippingFee,
      vat_amount: cardExtra,
      total_price: nextTotal,
      adjusted_total_price: nextTotal,
      final_amount: nextTotal,
    };

    if ("final_shipping_fee" in row) {
      nextRow.final_shipping_fee = 0;
    }

    if ("actual_card_fee_amount" in row) {
      nextRow.actual_card_fee_amount = actualCardFee;
    }

    if ("point_original_amount" in row && submitNumberValue(row?.point_used_amount, 0) <= 0) {
      nextRow.point_original_amount = nextTotal;
    }

    if ("combine_shipping_memo" in row) {
      nextRow.combine_shipping_memo = row?.combine_shipping_memo || "배송비 0원 설정 서버 보정";
    }

    return nextRow;
  });

  return {
    orderRows: normalizedRows,
    defaultShippingFee,
    remoteAreaShippingFee,
    normalizedCount,
  };
};


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
    const normalizedSubmit = await normalizeOrderRowsForSubmitSettings(supabase, orderRows);

    const { data, error } = await supabase.rpc("submit_customer_order_with_points", {
      p_order_rows: normalizedSubmit.orderRows,
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
