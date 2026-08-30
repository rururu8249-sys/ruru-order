import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { assertValidCustomerPointPhone } from "@/lib/customerPoints";
import { registeredProductPriceMode, registeredProductSubmittedPriceValid } from "@/lib/registeredProductPricePolicy";
import { buildYoutubeOrderAnnouncementMessages } from "@/lib/orderYoutubeAnnouncement";
import { koreanPhoneVariants } from "@/lib/order/phone";
import {
  canonicalCustomerDetailProductName,
  customerDetailInputEnabled,
} from "@/lib/customerDetailProductName";

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
  // [2026-08-11 담기 선착순] 본인 선점 식별용 세션키 (없으면 전화번호 기준 — 구버전 호환)
  cart_session_key?: string;
  cartSessionKey?: string;
  kakao_id?: string;
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

// [3단 옵션] 재고 키에 "세부상품 / 색상"으로 합쳐 저장한다(app/order/page.tsx ORDER_AXIS_JOIN 과 반드시 동일).
const SUBMIT_AXIS_JOIN = " / ";

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

// [2026-08-11] "직접입력" 서버 강제 검증.
//   설정(settings.direct_input_enabled)이 false 인데 등록상품이 아닌 항목(product_id 없음)이 오면 거부한다.
//   왜 필요한가: 이 설정은 그동안 손님 화면의 버튼을 숨기는 "표시 전용"이라, 아래 경로로는 그대로 접수됐다.
//     ① DB가 느려 손님 화면이 설정을 못 읽으면 기본 ON 으로 동작 (8/10 23:25 장애 때 실제 발생)
//     ② 임시주문서(localStorage)에 직접입력 항목이 담긴 채 나중에 제출
//     ③ 설정을 끄기 전에 열어둔 탭은 계속 예전(ON) 상태
//   ⚠️ 설정 조회가 실패하면 반드시 "허용"으로 통과시킨다 — DB 일시 오류로 주문 전체가 막히는 사고 방지.
//   ⚠️ 돈/재고/포인트 RPC는 일절 건드리지 않고, 주문 RPC 호출 전에 차단만 한다.
async function assertDirectInputAllowed(supabase: any, orderRows: AnyRow[]): Promise<void> {
  // 등록상품이 아닌(=직접입력) 항목이 하나라도 있는지 먼저 본다. 없으면 설정 조회조차 안 한다.
  const directRows = orderRows.filter((row) => {
    const pid = text(row?.product_id);
    return !pid || !/^[0-9]+$/.test(pid);
  });
  if (directRows.length === 0) return;

  const { data, error } = await supabase
    .from("settings")
    .select("key, value")
    .eq("key", "direct_input_enabled")
    .maybeSingle();

  if (error) {
    console.warn("직접입력 검증: 설정 조회 실패(주문은 진행):", error?.message);
    return; // 조회 실패 → 허용(주문을 막지 않는다)
  }

  const raw = String((data as AnyRow | null)?.value ?? "").trim().toLowerCase();
  if (raw !== "false") return; // 설정이 없거나 true → 기존과 동일하게 허용

  const names = directRows
    .map((row) => text(row?.product_name))
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");

  throw new Error(
    `지금은 상품을 직접 입력해서 주문할 수 없어요.${names ? `\n(${names})` : ""}\n상품 목록에서 선택해 주세요.`,
  );
}

// [2026-08-11] 등록상품 "금액 후려치기" 서버 강제 검증.
//   왜 필요한가: 주문 저장 RPC(inventory_auto_deduct_rpc.sql 443~448행)는 금액을 손님이 보낸 값 그대로 쓴다.
//   products.price 를 조회하지 않으므로, 55,000원 상품을 1,000원으로 제출해도 그대로 접수되고 재고는 정상 차감된다.
//   게다가 final_amount 가 1,000원이 되어 Bankda 자동입금확인이 1,000원 입금을 "정상"으로 매칭해 출고까지 간다.
//   ⚠️ 설계 원칙 — "정상 주문을 잘못 막는 것"이 더 큰 사고다. 그래서:
//     ① 카탈로그 가격의 절반(MIN_PRICE_RATIO) 미만만 거부. 높은 금액은 통과.
//        왜 "절반"인가: 실제 운영 주문 2,255건을 이 규칙으로 되돌려본 결과, 카탈로그보다 낮은 주문은
//        전부 사장님이 관리자에서 금액을 고친 건(0원 선물·특가·랜덤박스)이었고 최저 비율은 50.8%였다.
//        "카탈로그보다 1원이라도 낮으면 차단"으로 하면 방송 중 가격을 올리는 순간 이미 담아둔 손님이
//        전부 막혀 더 큰 사고가 난다. 절반 기준이면 정상 운영은 절대 안 막히고 1원·1,000원 후려치기만 잡힌다.
//     ② 기대가격이 0이면 검증하지 않음 → 「가격 비움=손님 직접입력」 상품·무료나눔 기존 동작 유지.
//     ③ 조회 실패 시 무조건 통과 → DB 일시 오류로 주문 전체가 막히는 사고 방지.
//     ④ 직접입력(product_id 없음)은 대상 아님 → 기존 정책 유지(차단은 assertDirectInputAllowed 담당).
//     ⑤ 삭제된 상품도 products 행은 남으므로 통과 → 임시주문서에 옛 상품이 남은 손님 보호.
//   ⚠️ 돈/재고/포인트 RPC는 일절 건드리지 않고, 주문 RPC 호출 전에 차단만 한다.
function readSubmitNoteObject(value: unknown): AnyRow | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as AnyRow) : null;
    } catch {
      return null;
    }
  }
  return typeof value === "object" ? (value as AnyRow) : null;
}

// 조합형 추가금. 손님 화면 comboPlusOfOrderProduct(app/order/page.tsx 932행)와 동일 규칙:
//   ① color 값과 정확히 일치하는 키 우선  ② [3단] "세부상품 / 색상" 이면 앞부분(세부상품)으로 조회
// 못 찾으면 0 → 기대가격이 낮아져 "통과" 방향으로만 틀린다(정상 주문을 막지 않음).
function submitComboSurcharge(productNote: unknown, color: string): number {
  const note = readSubmitNoteObject(productNote);
  if (!note || note.combo_mode !== true) return 0;
  const pricingRaw = note.option_pricing;
  if (!pricingRaw || typeof pricingRaw !== "object" || Array.isArray(pricingRaw)) return 0;
  const pricing: Record<string, number> = {};
  for (const key of Object.keys(pricingRaw as AnyRow)) {
    pricing[String(key).trim()] = Math.max(0, Math.floor(Number((pricingRaw as AnyRow)[key]) || 0));
  }
  const key = String(color ?? "").trim();
  if (Object.prototype.hasOwnProperty.call(pricing, key)) return pricing[key];
  const at = key.indexOf(SUBMIT_AXIS_JOIN);
  if (at >= 0) {
    const detailKey = key.slice(0, at).trim();
    return Math.max(0, Math.floor(Number(pricing[detailKey] || 0)));
  }
  return 0;
}

const MIN_PRICE_RATIO = 0.5; // 카탈로그 가격 대비 허용 하한(0.5 = 절반). 실측 근거는 위 주석 참고.

async function assertRegisteredProductPrices(
  supabase: any,
  orderRows: AnyRow[],
): Promise<Map<string, AnyRow>> {
  const catalog = new Map<string, AnyRow>();

  const targets = orderRows
    .map((row) => ({ row, pid: text(row?.product_id) }))
    .filter((t) => t.pid && /^[0-9]+$/.test(t.pid));
  if (targets.length === 0) return catalog;

  const ids = Array.from(new Set(targets.map((t) => Number(t.pid))));

  const { data, error } = await supabase
    .from("products")
    .select("id, product_name, price, product_note, shipping_type, combine_shipping")
    .in("id", ids);

  if (error) {
    console.warn("상품 금액 검증: 조회 실패(주문은 진행):", error?.message);
    return catalog; // 조회 실패 → 허용(주문을 막지 않는다). 빈 카탈로그 = 배송그룹도 행 값으로 폴백.
  }

  for (const item of (data || []) as AnyRow[]) catalog.set(String(item?.id), item);

  for (const t of targets) {
    const product = catalog.get(t.pid);

    // 상품 행 자체가 없다 = 목록에 없는 번호를 직접 만들어 보낸 요청(정상 손님은 절대 발생 안 함)
    if (!product) {
      throw new Error(
        `주문하신 상품을 찾을 수 없어요.${text(t.row?.product_name) ? `\n(${text(t.row?.product_name)})` : ""}\n페이지를 새로고침한 뒤 상품 목록에서 다시 담아주세요.`,
      );
    }

    if (customerDetailInputEnabled(product?.product_note)) {
      const baseName = text(product?.product_name);
      const canonicalName = canonicalCustomerDetailProductName(baseName, t.row?.product_name);
      if (!canonicalName) {
        throw new Error(`${baseName || "상품"} 세부상품명을 입력해 주세요.`);
      }
      // 고객 자유입력은 주문표시용 product_name에만 합성한다.
      // product_id/color/size는 그대로 두므로 가격·재고·구매제한·선점 로직은 기존 경로를 그대로 사용한다.
      t.row.product_name = canonicalName;
    }

    const basePrice = Math.max(0, Math.floor(Number(product?.price) || 0));
    const surcharge = submitComboSurcharge(product?.product_note, text(t.row?.color));
    const expected = basePrice + surcharge;
    const rawUnit = t.row?.adjusted_product_price ?? t.row?.product_price;
    const unitPrice = Math.floor(Number(rawUnit) || 0);
    const note = readSubmitNoteObject(product?.product_note);
    const priceMode = registeredProductPriceMode(expected, note?.free_product === true);

    if (!registeredProductSubmittedPriceValid(priceMode, unitPrice, expected, MIN_PRICE_RATIO)) {
      const pname = text(product?.product_name) || text(t.row?.product_name) || "상품";
      if (priceMode === "free") throw new Error(`${pname}은(는) 무료나눔 상품이에요. 페이지를 새로고침한 뒤 다시 담아주세요.`);
      if (priceMode === "direct") throw new Error(`${pname} 상품 금액을 1원 이상 입력해 주세요.`);
      const minAllowed = Math.floor(expected * MIN_PRICE_RATIO);
      console.warn(
        `상품 금액 검증 차단: product_id=${t.pid} ${pname} 낸금액=${unitPrice} 카탈로그=${expected} 하한=${minAllowed}`,
      );
      throw new Error(
        `${pname} 금액이 맞지 않아요.\n상품 가격이 바뀌었을 수 있어요. 페이지를 새로고침한 뒤 다시 담아주세요.`,
      );
    }
  }

  return catalog; // 배송비 검증에서 배송그룹(일반/업체) 판정에 그대로 재사용 → 추가 조회 0회
}

// [2026-08-11] 배송비 안 내고 주문 넣는 것 차단.
//   주문 저장 RPC는 shipping_fee 도 손님이 보낸 값을 그대로 쓴다 → 0원으로 보내면 배송비를 안 낸다.
//   업체배송(vendor)과 일반배송(normal)은 그룹이 달라 각각 배송비가 붙는다 → 그룹 수만큼 받아야 한다.
//   ⚠️ 합배송(같은 주소로 이미 주문한 손님은 배송비 0원)이 정상이라 "0원 = 무조건 차단"으로 하면
//      재구매 손님이 전부 막히는 더 큰 사고가 난다. 그래서 합배송이 성립할 수 없는 경우만 막는다:
//      "같은 전화번호 + 같은 주소로 된 최근 90일 유효 주문이 하나도 없는데 배송비를 안 냈다" → 거부.
//   ⚠️ 합배송 판정(방송 단위/관리자 시간창/업체배송 그룹)은 서버에서 재현하지 않는다.
//      재현하다 틀리면 정상 주문이 막힌다. 대신 "이전 주문이 있으면 무조건 통과"로 관대하게 간다.
//      (실제 합배송 창은 그날·방송 단위라 90일은 매우 넉넉한 상한이다.)
//   ⚠️ 돈/재고/포인트 RPC는 일절 건드리지 않고, 주문 RPC 호출 전에 차단만 한다.

// 주소 비교 규칙 — 손님 화면 normalizeShippingAddressPart(app/order/page.tsx 2254행)와 동일.
function normalizeSubmitAddressPart(value: unknown, removeParentheses = false): string {
  let next = String(value || "");
  if (removeParentheses) next = next.replace(/\([^)]*\)/g, " ");
  return next.replace(/\s+/g, " ").replace(/[-‐-‒–—―]/g, "-").trim();
}

function submitAddressSignature(zipcode: unknown, address: unknown, detail: unknown): string {
  return [
    normalizeSubmitAddressPart(zipcode),
    normalizeSubmitAddressPart(address, true),
    normalizeSubmitAddressPart(detail),
  ]
    .filter(Boolean)
    .join("|");
}

// 취소/환불 판정 — 손님 화면 isCanceledOrderForCombineShipping(1426행)과 동일 정규식.
function isCanceledForSubmitShipping(status: unknown): boolean {
  return /주문서취소|주문취소|취소|환불|cancel|refund/.test(String(status || "").trim().toLowerCase());
}

// 배송그룹 판정 — 손님 화면 resolveShippingGroupFromValue(app/order/page.tsx 173행)와 동일 규칙.
//   상품 정보(products)가 있으면 그걸 기준으로 본다. 손님이 보낸 shipping_type 을 위조해
//   "업체배송 아님"으로 속여 배송비 한 그룹분을 빼는 걸 막기 위함.
function resolveSubmitShippingGroup(value: unknown): "normal" | "vendor" {
  const record = (value || {}) as AnyRow;
  const shippingType = String(record.shipping_type ?? record.delivery_type ?? "").trim().toLowerCase();
  const combineShipping = String(record.combine_shipping ?? "").trim().toUpperCase();
  if (shippingType.includes("vendor") || shippingType.includes("업체") || combineShipping === "N") {
    return "vendor";
  }
  return "normal";
}

async function assertShippingFeeNotSkipped(
  supabase: any,
  orderRows: AnyRow[],
  phone: string,
  catalog: Map<string, AnyRow>,
): Promise<void> {
  // 배송비를 물릴 대상이 있는지 — 손님 화면 getChargeableShippingItems(1420행)와 동일 기준
  const chargeable = orderRows.filter(
    (row) =>
      text(row?.product_name) &&
      submitNumberValue(row?.qty, 0) > 0 &&
      submitNumberValue(row?.product_price, 0) > 0,
  );
  if (chargeable.length === 0) return; // 무료나눔·0원만 담긴 주문 → 원래 배송비 0원

  const baseShippingFee = Math.max(
    0,
    await readSubmitSettingNumber(supabase, "default_shipping_fee", 4000),
  );
  if (baseShippingFee <= 0) return; // 사장님이 무료배송 운영 중 → 검증 안 함

  const paidShipping = orderRows.reduce((sum, row) => {
    const fee = submitNumberValue(row?.adjusted_shipping_fee ?? row?.shipping_fee, 0);
    return sum + Math.max(0, fee);
  }, 0);

  // 배송그룹(일반/업체)은 각각 배송비가 붙는다. 상품 정보 우선, 없으면(직접입력) 행 값으로 폴백.
  const groups = new Set<string>();
  for (const row of chargeable) {
    const pid = text(row?.product_id);
    const product = pid ? catalog.get(pid) : undefined;
    groups.add(resolveSubmitShippingGroup(product ?? row));
  }
  const expectedShipping = baseShippingFee * Math.max(1, groups.size);

  // 합배송이면 한 그룹분이 빠질 수 있으므로, 여기서는 "전액 냈으면 바로 통과"만 본다.
  //   (정상 주문 대부분이 여기서 끝 → 이전 주문 조회 0회 = 방송 중 DB 부하 증가 없음)
  if (paidShipping >= expectedShipping) return;

  // 여기까지 왔다 = 배송비를 안 냈거나 모자람. 합배송이 성립할 수 있는지만 본다.
  const signature = submitAddressSignature(
    firstOrderValue(orderRows, "zipcode"),
    firstOrderValue(orderRows, "address"),
    firstOrderValue(orderRows, "detail_address"),
  );

  // ⚠️ 기간 제한을 두지 않는다.
  //   처음엔 90일로 잡았다가 허점을 찾음: 관리자 합배송 시간설정(combine_shipping_start_at/end_at)은
  //   상한이 없어서 사장님이 90일보다 긴 구간으로 잡을 수 있다(lib/admin-v2/combineShipping.ts).
  //   그러면 손님 화면은 합배송으로 0원을 보내는데 서버는 이전 주문을 못 찾아 "정상 주문을 막는" 사고가 난다.
  //   기간을 아예 안 보면 그 사고가 원천적으로 사라지고, 그래도 막아야 할 것은 그대로 막힌다:
  //   "이 주소로 주문이 처음인 손님"은 손님 화면이 배송비를 100% 부과하므로(1448~1450행) 0원일 수가 없다.
  // orders.customer_phone 은 하이픈 있는 값과 없는 값이 섞여 저장돼 있어 둘 다로 조회한다
  //   (손님 화면 checkAlreadyPaidShippingGroups 2404행과 동일).
  // [2026-08-31] 예전 식은 010(11자리) 기준으로만 하이픈을 만들어
  //   10자리(0264906376→026-4906-376)·9자리 번호가 틀린 형태가 됐다.
  //   → 이전 주문을 못 찾아 합배송 손님이 "배송비가 빠져 있어요"로 부당하게 막혔다.
  //   koreanPhoneVariants 는 숫자/옛 하이픈/새 하이픈을 모두 만든다(같은 번호의 표기들뿐이라 안전).
  const digits = phone.replace(/[^0-9]/g, "").slice(0, 11);
  const phoneValues = Array.from(new Set([phone, ...koreanPhoneVariants(digits)].filter(Boolean)));

  const { data, error } = await supabase
    .from("orders")
    .select("id, order_manage_status, zipcode, address, detail_address")
    .in("customer_phone", phoneValues)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    console.warn("배송비 검증: 이전 주문 조회 실패(주문은 진행):", error?.message);
    return; // 조회 실패 → 허용(주문을 막지 않는다)
  }

  const hasSameAddressOrder = (data || []).some((row: AnyRow) => {
    if (isCanceledForSubmitShipping(row?.order_manage_status)) return false;
    const sig = submitAddressSignature(row?.zipcode, row?.address, row?.detail_address);
    return Boolean(sig) && sig === signature;
  });

  // 이전 주문이 하나라도 있으면 합배송으로 한 그룹분이 빠졌을 수 있다 → 무조건 통과(재구매 손님 보호).
  //   합배송 판정(관리자 시간설정 > 방송 단위 > 업체배송 그룹)은 손님 화면이 그대로 담당하고
  //   여기서는 재현하지 않는다. 재현하다 틀리면 정상 주문이 막히는 더 큰 사고가 난다.
  if (hasSameAddressOrder) return;

  // 여기까지 = 같은 주소 이전 주문이 아예 없다 = 합배송이 성립할 수 없다
  //   → 배송그룹 수만큼 전액을 냈어야 한다. 그런데 안 냈다.
  console.warn(
    `배송비 검증 차단: phone=${digits.slice(-4)} 낸배송비=${paidShipping} 필요=${expectedShipping}(${baseShippingFee}×${groups.size}그룹) 같은주소_이전주문=없음`,
  );
  throw new Error(
    "배송비가 빠져 있어요.\n페이지를 새로고침한 뒤 다시 주문해 주세요.",
  );
}

// 개인당 구매제한(상품관리 product_note.purchase_limit_enabled/qty) 서버 강제 검증.
// - ★ 고객 식별 = 카카오 계정(kakao_id). 전화번호는 폴백일 뿐이다.
//   전화번호로만 누적하면 번호를 바꾸는 순간 제한이 리셋돼 우회가 가능했다(2026-07-09 수정).
//   kakao_id 가 있으면 [kakao_id 일치] 또는 [kakao_id 없는 옛 주문 + 현재 전화번호] 를 누적한다.
//   (번호 변경 시 DB 트리거가 옛 주문에 kakao_id 를 찍어주므로 과거 구매분도 계속 잡힌다.)
// - 등록상품(product_id 있음)만 대상. 직접입력(product_id 없음)은 제한 없음.
// - 취소/테스트 주문은 누적에서 제외.
// - 돈/재고/포인트 RPC는 일절 건드리지 않고, 주문 RPC 호출 전에 차단만 한다.
// - 조회 실패 시(라이브 중 일시 오류) 정상 주문을 막지 않음(재고 초과는 RPC가 별도로 방어).
async function assertPurchaseLimit(
  supabase: any,
  orderRows: AnyRow[],
  phone: string,
  kakaoId = "",
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

    // 누적 대상 조회: 카톡 계정 우선(번호 바꿔도 이어짐), 없으면 전화번호 폴백.
    const safeKakaoId = String(kakaoId || "").replace(/[^0-9A-Za-z_-]/g, "");
    const safePhone = String(phone || "").replace(/[^0-9]/g, "");
    let priorQuery = supabase
      .from("orders")
      .select("qty, order_status, order_manage_status, is_test_order")
      .eq("product_id", Number(pid));

    if (safeKakaoId && safePhone) {
      // kakao_id 일치 OR (kakao_id 없는 옛 주문 + 현재 전화번호)
      // [2026-08-31] 하이픈으로 저장된 옛 주문도 구매수량에 합산되도록 모든 표기로 찾는다.
      //   (범위를 넓히면 제한이 "더 정확히" 걸릴 뿐, 느슨해지는 방향이 아니다)
      const limitPhoneValues = koreanPhoneVariants(safePhone);
      priorQuery = priorQuery.or(
        `kakao_id.eq.${safeKakaoId},and(kakao_id.is.null,customer_phone.in.(${limitPhoneValues.join(",")}))`
      );
    } else if (safeKakaoId) {
      priorQuery = priorQuery.eq("kakao_id", safeKakaoId);
    } else {
      priorQuery = priorQuery.in("customer_phone", koreanPhoneVariants(safePhone));
    }

    const { data: priorRows, error: priorError } = await priorQuery;

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
    //   카톡 계정(kakao_id) 기준 누적 → 전화번호 바꿔도 제한 우회 불가
    await assertDirectInputAllowed(supabase, orderRows);
    const productCatalog = await assertRegisteredProductPrices(supabase, orderRows);
    await assertShippingFeeNotSkipped(supabase, orderRows, phone, productCatalog);
    await assertPurchaseLimit(supabase, orderRows, phone, text(body.kakao_id));

    const normalizedSubmit = await normalizeOrderRowsForSubmitSettings(supabase, orderRows);

    // [2026-08-11 담기 선착순] 세션키 전달 — RPC가 "남의 선점 못 뺏기" 검증 + 제출 성공 시 본인 선점 해제
    const cartSessionKey = (() => {
      const t = String(body.cart_session_key ?? body.cartSessionKey ?? "").trim();
      return t.length >= 6 && t.length <= 80 ? t : null;
    })();

    const { data, error } = await supabase.rpc("submit_customer_order_with_points", {
      p_order_rows: normalizedSubmit.orderRows,
      p_point_use_amount: pointUseAmount,
      p_customer_phone: phone,
      p_youtube_nickname: youtubeNickname,
      p_customer_name: customerName,
      p_session_key: cartSessionKey,
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

    // 카카오 정체성 스탬프 — 안 바뀌는 kakao_id를 주문에 찍어, 이후 전화/이름 수정돼도 고객 조회가 안 깨지게.
    //   받는사람 저장과 동일하게 RPC 무변경 + order_group_id로만 보강. 입금/정산/포인트 무관. 실패해도 주문은 성공 유지.
    const kakaoId = text(body.kakao_id);
    if (recipientGroupId && kakaoId) {
      const { error: kakaoError } = await supabase
        .from("orders")
        .update({ kakao_id: kakaoId })
        .eq("order_group_id", recipientGroupId);
      if (kakaoError) {
        console.warn("kakao_id 저장 실패(주문은 정상 저장됨):", kakaoError.message);
      }
    }

    // 유튜브 라이브 채팅 자동 게시(자동알림 ON일 때만). 주문 저장 완료 후 응답과 별개로 실행 →
    //   - after()로 응답 보낸 뒤 실행하므로 주문 제출 속도/성공에 영향 0.
    //   - postLiveChatMessage는 throw하지 않고 notify OFF면 내부에서 스킵. 실패해도 주문과 무관.
    after(async () => {
      try {
        const rows = normalizedSubmit.orderRows;
        // YouTube 실시간 채팅은 메시지당 200자 제한. 180자로 여유를 두고 분할한다.
        // 모든 상품/옵션/색상/사이즈/수량/상품별 금액을 생략 없이 보낸다("외 N개" 축약 금지).
        const messages = buildYoutubeOrderAnnouncementMessages({
          nickname: youtubeNickname || customerName,
          rows,
          maxChars: 180,
        });
        const { postLiveChatMessage } = await import("@/lib/youtube");
        for (let i = 0; i < messages.length; i += 1) {
          await postLiveChatMessage(messages[i]);
          if (i < messages.length - 1) await new Promise((resolve) => setTimeout(resolve, 3000));
        }
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
