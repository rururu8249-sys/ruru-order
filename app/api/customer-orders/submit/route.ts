import { NextRequest, NextResponse, after } from "next/server";
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
  recipient_name?: string;
  recipient_phone?: string;
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

// 개인당 구매제한(상품관리 product_note.purchase_limit_enabled/qty) 서버 강제 검증.
// - 카톡 계정 = 전화번호(숫자만)로 1:1 연결되므로 전화번호 누적으로 집계(방송 무관, 끌 때까지 적용).
// - 등록상품(product_id 있음)만 대상. 직접입력(product_id 없음)은 제한 없음.
// - 취소/테스트 주문은 누적에서 제외.
// - 돈/재고/포인트 RPC는 일절 건드리지 않고, 주문 RPC 호출 전에 차단만 한다.
// - 조회 실패 시(라이브 중 일시 오류) 정상 주문을 막지 않음(재고 초과는 RPC가 별도로 방어).
async function assertPurchaseLimit(
  supabase: any,
  orderRows: AnyRow[],
  phone: string,
): Promise<void> {
  const requestedByProduct = new Map<string, number>();
  for (const row of orderRows) {
    const pid = text(row?.product_id);
    if (!pid || !/^[0-9]+$/.test(pid)) continue; // 직접입력 제외
    const qty = toWon(row?.qty);
    if (qty <= 0) continue;
    requestedByProduct.set(pid, (requestedByProduct.get(pid) || 0) + qty);
  }
  if (requestedByProduct.size === 0) return;

  const productIds = Array.from(requestedByProduct.keys()).map((id) => Number(id));
  const { data: products, error: productError } = await supabase
    .from("products")
    .select("id, product_name, name, product_note")
    .in("id", productIds);

  if (productError || !Array.isArray(products)) {
    console.warn("구매제한 검증: 상품 조회 실패(주문은 진행):", productError?.message);
    return;
  }

  for (const product of products) {
    const pid = text(product?.id);
    let note: any = null;
    try {
      note = typeof product?.product_note === "string" ? JSON.parse(product.product_note) : product?.product_note;
    } catch {
      note = null;
    }
    if (!note || note.purchase_limit_enabled !== true) continue;

    const limit = Math.floor(Number(note.purchase_limit_qty || 0));
    if (!Number.isFinite(limit) || limit <= 0) continue;

    const requested = requestedByProduct.get(pid) || 0;
    if (requested <= 0) continue;

    const { data: priorRows, error: priorError } = await supabase
      .from("orders")
      .select("qty, order_status, order_manage_status, is_test_order")
      .eq("customer_phone", phone)
      .eq("product_id", Number(pid));

    if (priorError) {
      console.warn("구매제한 검증: 기존주문 조회 실패(주문은 진행):", priorError.message);
      continue;
    }

    let already = 0;
    for (const r of priorRows || []) {
      if (r?.is_test_order === true) continue;
      const st = `${text(r?.order_status)} ${text(r?.order_manage_status)}`;
      if (st.includes("취소")) continue; // 취소건은 누적 제외
      already += toWon(r?.qty);
    }

    if (already + requested > limit) {
      const pname = text(product?.product_name) || text(product?.name) || "이 상품";
      const remain = Math.max(0, limit - already);
      throw new Error(
        already > 0
          ? `${pname}은(는) 1인당 ${limit}개까지만 구매할 수 있어요. 이미 ${already}개 구매하셨고 ${remain}개 더 담을 수 있어요.`
          : `${pname}은(는) 1인당 ${limit}개까지만 구매할 수 있어요. (현재 ${requested}개 담음)`,
      );
    }
  }
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

    // 개인당 구매제한 차단(돈/재고/포인트 RPC 무변경 — RPC 호출 전 검증만)
    await assertPurchaseLimit(supabase, orderRows, phone);

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

    // 받는사람(배송) 저장 — 주문 RPC 무변경. 제출 직후 order_group_id로만 보강.
    // 입금/정산/포인트와 무관(주문자 customer_name/phone은 그대로). 실패해도 주문은 성공 유지.
    const recipientName = text(body.recipient_name);
    const recipientPhone = text(body.recipient_phone);
    const recipientGroupId = text(firstOrderValue(orderRows, "order_group_id"));
    if (recipientGroupId && (recipientName || recipientPhone)) {
      const { error: recipientError } = await supabase
        .from("orders")
        .update({ recipient_name: recipientName || null, recipient_phone: recipientPhone || null })
        .eq("order_group_id", recipientGroupId);
      if (recipientError) {
        console.warn("받는사람 저장 실패(주문은 정상 저장됨):", recipientError.message);
      }
    }

    // 유튜브 라이브 채팅 자동 게시(자동알림 ON일 때만). 주문 저장 완료 후 응답과 별개로 실행 →
    //   - after()로 응답 보낸 뒤 실행하므로 주문 제출 속도/성공에 영향 0.
    //   - postLiveChatMessage는 throw하지 않고 notify OFF면 내부에서 스킵. 실패해도 주문과 무관.
    after(async () => {
      try {
        const rows = normalizedSubmit.orderRows;
        // 상품명 + 옵션(색상/사이즈). "없음" 계열은 옵션에서 제외(어댑터 표기와 동일).
        const labelOf = (r: AnyRow) => {
          const name = text(r?.product_name);
          const opts = [text(r?.color), text(r?.size)].filter((v) => v && v !== "없음").join("/");
          return opts ? `${name}(${opts})` : name;
        };
        const labels = rows.filter((r) => text(r?.product_name)).map(labelOf);
        // 2건까지는 전부 정확히 표시, 3건 이상이면 첫 상품 + "외 N건".
        const itemsSummary =
          labels.length === 0 ? "" : labels.length <= 2 ? labels.join(", ") : `${labels[0]} 외 ${labels.length - 1}건`;
        const amount = rows.reduce(
          (sum, r) => sum + toWon(r?.final_amount ?? r?.adjusted_total_price ?? r?.total_price),
          0,
        );
        const { buildOrderMessage, postLiveChatMessage } = await import("@/lib/youtube");
        const msg = await buildOrderMessage({
          nickname: youtubeNickname || customerName,
          itemsSummary,
          amount,
        });
        await postLiveChatMessage(msg);
      } catch {
        /* 유튜브 게시 실패는 주문과 완전히 무관하게 무시 */
      }
    });

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
