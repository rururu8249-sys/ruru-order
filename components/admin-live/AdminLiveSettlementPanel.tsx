"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { showAdminToast } from "@/lib/adminToast";
import AdminSettlementPanel from "@/components/admin-v2/settlement/AdminSettlementPanel";

type LooseRow = Record<string, any>;

type Props = {
  orders: LooseRow[];
};

type SettingSummary = {
  customerCardRate?: number;
  actualCardRate?: number;
  cardPaymentMinAmount?: number;
  defaultShippingFee?: number;
};

const SETTING_KEYS = [
  "customer_card_extra_rate",
  "actual_card_fee_rate",
  "card_payment_min_amount",
  "default_shipping_fee",
] as const;

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const text = clean(value).replace(/[^0-9.-]/g, "");
  const number = Number(text);

  return Number.isFinite(number) ? number : 0;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }

  return "";
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const number = toNumber(value);
    if (number > 0) return number;
  }

  return 0;
}

// 금액 선택용: 0을 정상값으로 인정하고, 진짜 빈칸(null/undefined/빈문자)만 건너뛴다.
// (firstNumber는 0을 "값 없음"으로 보고 버려서, 전액 포인트 결제(final_amount=0) 주문이
//  원금으로 둔갑하던 문제가 있어 별도 헬퍼로 분리. 값이 하나도 없으면 null 반환 → 호출부에서 ?? 로 폴백)
function firstPresentNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (String(value).trim() === "") continue;
    return toNumber(value);
  }

  return null;
}

function mapPaymentStatus(order: LooseRow) {
  const raw = firstText(
    order.order_manage_status,
    order.admin_order_status_v2,
    order.payment_status,
    order.deposit_status,
    order.status,
    order.paymentStatus,
  );

  if (/주문서취소|주문취소|취소|환불|cancel|refund/i.test(raw)) return raw || "주문서취소";
  if (/manual_paid|manual_match_done|수동입금확인/i.test(raw)) return "수동입금확인";
  if (/auto_paid|자동입금확인/i.test(raw)) return "자동입금확인";
  if (/card_paid|card_done|카드결제완료|카드완료/i.test(raw)) return "카드결제완료";
  if (/paid|confirmed|complete|입금확인|결제완료/i.test(raw)) return "입금확인";
  if (/manual_match_needed|입금확인 필요|수동확인/i.test(raw)) return "입금매칭 필요";
  if (/unpaid|미입금|card_unpaid|카드 미결제/i.test(raw)) return "입금대기";

  return raw || "주문확인전";
}

function mapPaymentMethod(order: LooseRow) {
  const raw = firstText(order.payment_method, order.paymentMethod, order.pay_method, order.paymentType);

  if (/카드|card/i.test(raw)) return "카드결제";
  if (/무통장|입금|bank/i.test(raw)) return "무통장입금";

  return raw || "무통장입금";
}

function normalizeLiveOrder(order: LooseRow, index: number) {
  const amount = firstPresentNumber(
    order.final_amount,
    order.finalAmount,
    order.adjusted_total_price,
    order.adjustedTotalPrice,
    order.total_price,
    order.totalPrice,
    order.total_amount,
    order.totalAmount,
    order.order_amount,
    order.orderAmount,
    order.payment_amount,
    order.paymentAmount,
    order.amount,
  ) ?? 0;

  const createdAt = firstText(
    order.created_at,
    order.createdAt,
    order.order_created_at,
    order.orderCreatedAt,
    order.submittedAt,
    order.date,
  );

  const shippingFee = firstNumber(
    order.shipping_fee,
    order.shippingFee,
    order.adjusted_shipping_fee,
    order.adjustedShippingFee,
  );

  return {
    ...order,
    id: firstText(order.id, order.order_id, order.orderId, order.groupId, order.order_lookup_code) || `admin-live-order-${index}`,
    order_id: firstText(order.order_id, order.orderId, order.id),
    order_lookup_code: firstText(order.order_lookup_code, order.orderLookupCode, order.orderNumber, order.groupId),
    created_at: createdAt,
    payment_method: mapPaymentMethod(order),
    payment_status: mapPaymentStatus(order),
    deposit_status: mapPaymentStatus(order),
    status: mapPaymentStatus(order),
    final_amount: firstPresentNumber(order.final_amount, order.finalAmount) ?? amount,
    adjusted_total_price: firstPresentNumber(order.adjusted_total_price, order.adjustedTotalPrice) ?? amount,
    total_price: firstPresentNumber(order.total_price, order.totalPrice) ?? amount,
    shipping_fee: shippingFee,
    adjusted_shipping_fee: shippingFee,
    refund_amount: firstNumber(order.refund_amount, order.refundAmount),
    actual_card_fee_rate_applied: firstNumber(order.actual_card_fee_rate_applied, order.actualCardFeeRateApplied),
    customer_card_extra_rate_applied: firstNumber(order.customer_card_extra_rate_applied, order.customerCardExtraRateApplied),
    product_name: firstText(order.product_name, order.productName, order.orderSummary, order.title),
    youtube_nickname: firstText(order.youtube_nickname, order.nickname, order.customerNickname),
    customer_name: firstText(order.customer_name, order.customerName, order.name),
    customer_phone: firstText(order.customer_phone, order.customerPhone, order.phone),
  };
}

function readSettingNumber(rows: LooseRow[], key: string, fallback: number) {
  const row = rows.find((item) => clean(item.key) === key);
  const value = toNumber(row?.value);

  return value > 0 || String(row?.value ?? "").trim() === "0" ? value : fallback;
}

export default function AdminLiveSettlementPanel({ orders }: Props) {
  const [deposits, setDeposits] = useState<LooseRow[]>([]);
  const [broadcasts, setBroadcasts] = useState<LooseRow[]>([]);
  const [settings, setSettings] = useState<LooseRow[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadSettlementMeta() {
      setLoadingMeta(true);

      try {
        const [depositsResult, broadcastsResult, settingsResult] = await Promise.all([
          supabase.from("deposits").select("*").order("created_at", { ascending: false }).limit(500),
          supabase.from("broadcasts").select("*").order("started_at", { ascending: false }).limit(120),
          supabase.from("settings").select("key,value").in("key", [...SETTING_KEYS]),
        ]);

        if (!alive) return;

        if (depositsResult.error) {
          showAdminToast("정산 입금내역 불러오기 실패\n\n" + depositsResult.error.message, "error");
        } else {
          setDeposits((depositsResult.data || []) as LooseRow[]);
        }

        if (broadcastsResult.error) {
          showAdminToast("정산 방송리스트 불러오기 실패\n\n" + broadcastsResult.error.message, "error");
        } else {
          setBroadcasts((broadcastsResult.data || []) as LooseRow[]);
        }

        if (settingsResult.error) {
          showAdminToast("정산 설정값 불러오기 실패\n\n" + settingsResult.error.message, "error");
        } else {
          setSettings((settingsResult.data || []) as LooseRow[]);
        }
      } finally {
        if (alive) setLoadingMeta(false);
      }
    }

    loadSettlementMeta();

    return () => {
      alive = false;
    };
  }, []);

  const settlementOrders = useMemo(() => {
    return Array.isArray(orders)
      ? orders.filter((order: any) => order?.excludeFromSettlement !== true && order?.exclude_from_settlement !== true).map(normalizeLiveOrder)
      : [];
  }, [orders]);

  const settingsSummary: SettingSummary = useMemo(() => {
    return {
      customerCardRate: readSettingNumber(settings, "customer_card_extra_rate", 10),
      actualCardRate: readSettingNumber(settings, "actual_card_fee_rate", 7),
      cardPaymentMinAmount: readSettingNumber(settings, "card_payment_min_amount", 100000),
      defaultShippingFee: readSettingNumber(settings, "default_shipping_fee", 4000),
    };
  }, [settings]);

  return (
    <section className="grid gap-4">
      <div className="rounded-[28px] border border-rose-line bg-rose-soft px-5 py-4 text-sm font-bold leading-6 text-blue-800">
        /admin-live 정산통계는 전체 주문을 불러온 뒤, 이 화면의 기간/방송리스트/결제수단 필터 기준으로 계산합니다. 방송메뉴와 같은 금액을 보려면 같은 방송·날짜 기준으로 맞춰 확인해주세요. 주문 상태, 입금 상태, 배송비, 환불 로직은 변경하지 않고 조회·계산·표시만 합니다.
        {loadingMeta ? <span className="ml-2 text-rose-deep">정산 기준값 불러오는 중...</span> : null}
      </div>

      <AdminSettlementPanel
        orders={settlementOrders}
        deposits={deposits}
        broadcasts={broadcasts}
        settingsSummary={settingsSummary}
      />
    </section>
  );
}
