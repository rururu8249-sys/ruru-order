"use client";

// 목적: 미션(공동목표) 달성 시 "포인트가 아닌 선물"을 대상 구매자의 최근 주문서에 0원 행으로 얹는다.
//   → 송장 출력 / 물건챙기기 / 주문상세 / 고객 주문조회에 그대로 노출되어 선물을 빠뜨리지 않게 함.
//
// 설계(추정 금지 — 기존 useLiveOrderItemAdd.addDirectItem 경로를 그대로 복제하되 단가만 0원 허용):
//   - addDirectItem 은 `unitPrice <= 0` 을 막는 가드가 있어(127행) 선물(0원)에 쓸 수 없다.
//     그 가드는 일반 상품 추가를 지키는 장치라 **건드리지 않고**, 선물 전용 함수를 따로 둔다.
//   - product_id = null (직접입력) → 재고 차감 로직을 타지 않음.
//   - 단가 0원 → 상품금액 0, 배송비 0, 카드 vat = round(0 × 수수료율) = 0, final_amount 0.
//     → 주문 총금액(행들의 final_amount 합) 불변 → 입금 자동매칭 기대금액 안 깨짐.
//   - 그룹 공유필드(주문자/받는사람/주소/상태/방송/제외플래그)는 기준 행에서 복사 → 그룹 일관.
//   - 대상: 결제완료(PAID_STATUS_VALUES) + 비취소 + 비테스트 주문 중 **가장 최근 주문서 1개**.
//   - 중복 방지 기준: "같은 주문서(order_group_id)에 같은 선물명 행이 이미 있으면 건너뜀".
//     (날짜/포인트 기록과 무관. allowDup=true 면 검사 안 함 → 같은 주문서에 또 넣을 수 있음)
//
// 돈/입금/정산/배송비/포인트/재고 로직은 한 줄도 건드리지 않는다(0원 행 INSERT만).

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { PAID_STATUS_VALUES } from "@/lib/admin-v2/statusDisplay";

const PAID = new Set(PAID_STATUS_VALUES);

export const GIFT_PREFIX = "🎁 ";

// 선물 행 상품명 — 접두사로 일반 상품과 구분(실수로 재고 처리하는 것 방지)
export const giftLabelOf = (giftName: string) => `${GIFT_PREFIX}${String(giftName ?? "").trim()}`;

export type GiftAddResult = {
  success: { phone: string; nickname: string }[];
  skipped: { phone: string; nickname: string; reason: string }[];
  failed: { phone: string; nickname: string; reason: string }[];
};

type Row = Record<string, unknown>;

const isPaidRow = (r: Row) =>
  PAID.has(String(r.admin_order_status_v2 || "").trim()) || PAID.has(String(r.order_manage_status || "").trim());

const onlyDigits = (v: unknown) => String(v ?? "").replace(/[^0-9]/g, "");

// addDirectItem 과 동일한 그룹 공유 컬럼(주문일 포함 → 주문일이 '오늘'로 튀지 않음)
const SHARED_KEYS = [
  "created_at",
  "order_group_id",
  "order_lookup_code",
  "broadcast_id",
  "broadcast_name",
  "broadcast_public_title",
  "broadcast_admin_subtitle",
  "youtube_nickname",
  "customer_name",
  "customer_phone",
  "phone",
  "recipient_name",
  "recipient_phone",
  "zipcode",
  "address",
  "detail_address",
  "request_memo",
  "payment_method",
  "customer_card_extra_rate_applied",
  "actual_card_fee_rate_applied",
  "order_status",
  "admin_status",
  "order_manage_status",
  "admin_order_status_v2",
  "shipping_status",
  "is_test_order",
  "test_order_reason",
  "operator_test_phone",
  "exclude_from_settlement",
  "exclude_from_payment_match",
  "exclude_from_shipping",
  "exclude_from_picking",
  "customer_id",
];

export function useLiveOrderGiftAdd() {
  const [running, setRunning] = useState(false);

  /**
   * 대상 전화번호들의 "가장 최근 결제완료 주문서"에 0원 선물 행을 1줄씩 추가.
   * @param buyers  [{ phone, nickname }]
   * @param giftName 선물 이름(예: "수면양말")
   * @param allowDup true면 같은 주문서에 같은 선물이 있어도 또 추가
   */
  const addGiftToBuyers = async (
    buyers: { phone: string; nickname: string }[],
    giftName: string,
    allowDup: boolean
  ): Promise<GiftAddResult> => {
    const out: GiftAddResult = { success: [], skipped: [], failed: [] };
    const label = giftLabelOf(giftName);
    if (!giftName.trim()) return out;

    const phones = [...new Set(buyers.map((b) => onlyDigits(b.phone)).filter(Boolean))];
    if (phones.length === 0) return out;
    const nickOf = new Map(buyers.map((b) => [onlyDigits(b.phone), b.nickname]));

    setRunning(true);
    try {
      // 1) 대상들의 주문 행을 최소 컬럼으로 조회(최근 순) — 100개씩 나눠서
      const rows: Row[] = [];
      for (let i = 0; i < phones.length; i += 100) {
        const chunk = phones.slice(i, i + 100);
        const { data, error } = await supabase
          .from("orders")
          .select(
            "id,order_group_id,customer_phone,created_at,product_name,admin_order_status_v2,order_manage_status,is_test_order"
          )
          .in("customer_phone", chunk)
          .order("created_at", { ascending: false })
          .limit(2000);
        if (error) {
          chunk.forEach((p) => out.failed.push({ phone: p, nickname: nickOf.get(p) || p, reason: error.message }));
          continue;
        }
        rows.push(...((data || []) as Row[]));
      }

      // 2) 전화번호별 "가장 최근 결제완료 주문서(order_group_id)" 확정
      for (const phone of phones) {
        const nickname = nickOf.get(phone) || phone;
        const mine = rows.filter((r) => onlyDigits(r.customer_phone) === phone && r.is_test_order !== true);
        const latestPaid = mine.find((r) => isPaidRow(r)); // 이미 created_at desc 정렬
        if (!latestPaid) {
          out.skipped.push({ phone, nickname, reason: "결제완료 주문서 없음" });
          continue;
        }
        const groupId = String(latestPaid.order_group_id ?? "");
        const groupRows = groupId
          ? mine.filter((r) => String(r.order_group_id ?? "") === groupId)
          : [latestPaid];

        // 3) 중복 검사 — 같은 주문서에 같은 선물명이 이미 있으면 건너뜀
        if (!allowDup && groupRows.some((r) => String(r.product_name ?? "").trim() === label)) {
          out.skipped.push({ phone, nickname, reason: "이미 이 주문서에 같은 선물 있음" });
          continue;
        }

        // 4) 기준 행(가장 먼저 만들어진 행) 전체 조회 → 그룹 공유필드 복사
        const baseId = groupRows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b)[0];
        const { data: baseRow, error: baseErr } = await supabase.from("orders").select("*").eq("id", baseId).single();
        if (baseErr || !baseRow) {
          out.failed.push({ phone, nickname, reason: baseErr?.message || "기준 주문 행 조회 실패" });
          continue;
        }

        const base = baseRow as Row;
        const payload: Record<string, unknown> = {};
        SHARED_KEYS.forEach((k) => {
          if (k in base) payload[k] = base[k];
        });

        // 선물 행: 전부 0원 (총금액·입금매칭·정산 불변)
        payload.product_id = null;
        payload.product_name = label;
        payload.color = null;
        payload.size = null;
        payload.qty = 1;
        payload.product_price = 0;
        payload.adjusted_product_price = 0;
        payload.shipping_fee = 0;
        payload.adjusted_shipping_fee = 0;
        payload.vat_amount = 0; // 카드결제여도 0원 × 수수료율 = 0
        payload.total_price = 0;
        payload.adjusted_total_price = 0;
        payload.final_amount = 0;
        payload.memo = `${label} x1 (미션 목표달성 선물)`;
        if ("actual_card_fee_amount" in base) payload.actual_card_fee_amount = 0;
        if ("point_used_amount" in base) payload.point_used_amount = 0;
        if ("point_original_amount" in base) payload.point_original_amount = 0;

        const { error: insErr } = await supabase.from("orders").insert(payload);
        if (insErr) {
          out.failed.push({ phone, nickname, reason: insErr.message });
          continue;
        }
        out.success.push({ phone, nickname });
      }
      return out;
    } finally {
      setRunning(false);
    }
  };

  return { running, addGiftToBuyers };
}
