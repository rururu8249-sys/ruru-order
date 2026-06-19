"use client";

// components/admin-live/AdminLiveCustomersPanel.tsx
// 목적: 실시간 관리자 고객관리 화면
// 주의: 1차는 조회/화면 구성 전용. 고객 차단 저장, 메모 저장, 주문/입금/배송/정산 로직 없음.

import { useEffect, useMemo, useState } from "react";
import { useBulkPointGrant, type BulkGrantResult } from "./useBulkPointGrant";

// 일괄지급 사유 프리셋(고객에게 보이는 문구). "직접입력" 선택 시 직접 작성.
const BULK_POINT_REASON_PRESETS = ["방송 이벤트 당첨", "단골 감사", "리뷰 감사", "오지급 보정", "직접입력"];
import { supabase } from "@/lib/supabase";
import type { LiveOrder } from "./types";
import AdminLiveCustomerIssueRail from "./AdminLiveCustomerIssueRail";
import AdminLivePhoneBlockPanel from "./AdminLivePhoneBlockPanel";
import AdminLiveCustomerBlockReasonModal from "./AdminLiveCustomerBlockReasonModal";
import AdminLiveCustomerPointPanel from "./AdminLiveCustomerPointPanel";
import { CUSTOMER_TERMS } from "./adminLiveCustomerTerms";

type Props = {
  orders: LiveOrder[];
  onClose?: () => void;
};

type LooseLiveOrder = LiveOrder & Record<string, any>;

type CustomerSummary = {
  key: string;
  nickname: string;
  name: string;
  phone: string;
  address: string;
  orderCount: number;
  totalAmount: number;
  paidCount: number;
  unpaidCount: number;
  manualNeededCount: number;
  latestOrderAt: string;
  blocked: boolean;
  blockReason: string;
  orders: LooseLiveOrder[];
};

type CustomerProfile = {
  id?: string | number | null;
  youtube_nickname?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  zipcode?: string | null;
  address?: string | null;
  detail_address?: string | null;
  shipping_addresses?: Array<{ name?: string; phone?: string; address?: string; detailAddress?: string; zipcode?: string; isDefault?: boolean }> | null;
  is_blocked?: boolean | null;
  block_reason?: string | null;
  customer_memo?: string | null;
  last_order_at?: string | null;
  created_at?: string | null;
  kakao_id?: string | null;
  kakao_nickname?: string | null;
  kakao_profile_image?: string | null;
  first_login_at?: string | null;
  last_login_at?: string | null;
  customer_history?: Array<{ field: string; old_value: string; new_value: string; changed_at: string }> | null;
};

type SortMode = "latest" | "amount" | "orders" | "nickname";
type StatusFilter = "all" | "normal" | "blocked" | "attention";

type BlockOverride = {
  blocked: boolean;
  reason: string;
};

type BlockModalTarget = CustomerSummary;

type DirectPhoneBlock = {
  phone: string;
  reason: string;
  created_at?: string;
  updated_at?: string;
};

type BlockedCustomerListItem =
  | {
      type: "phone";
      key: string;
      block: DirectPhoneBlock;
    }
  | {
      type: "customer";
      key: string;
      customer: CustomerSummary;
    };

const CUSTOMER_PAGE_SIZE = 20;
const DETAIL_ORDER_PAGE_SIZE = 6;

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function digitsOnly(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

function readFirst(row: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = clean(row[key]);
    if (value) return value;
  }

  return "";
}

function formatPhone(value: unknown) {
  const digits = digitsOnly(value);

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return clean(value) || "-";
}

function orderPhone(order: LooseLiveOrder) {
  return readFirst(order, ["phone", "customerPhone", "customer_phone", "buyer_phone", "mobile", "tel"]);
}

function orderNickname(order: LooseLiveOrder) {
  return readFirst(order, ["nickname", "youtubeNickname", "youtube_nickname", "customerNickname", "customer_nickname"]) || "-";
}

function orderName(order: LooseLiveOrder) {
  return readFirst(order, ["name", "customerName", "customer_name", "buyer_name"]) || "-";
}

function orderBaseAddress(order: LooseLiveOrder) {
  return readFirst(order, [
    "address",
    "customerAddress",
    "customer_address",
    "shipping_address",
    "receiver_address",
    "delivery_address",
    "road_address",
    "base_address",
  ]);
}

function orderDetailAddress(order: LooseLiveOrder) {
  return readFirst(order, [
    "detail_address",
    "address_detail",
    "customer_detail_address",
    "detailAddress",
    "shipping_detail_address",
    "receiver_detail_address",
  ]);
}

function orderFullAddress(order: LooseLiveOrder) {
  const base = orderBaseAddress(order);
  const detail = orderDetailAddress(order);

  return [base, detail].filter(Boolean).join(" ").trim();
}

function parseDateCandidate(value: unknown) {
  const raw = clean(value);
  if (!raw) return "";

  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString();
}

function orderCreatedRawValue(order: LooseLiveOrder) {
  return (
    readFirst(order, [
      "created_at",
      "createdAt",
      "order_date",
      "orderDate",
      "submitted_at",
      "submittedAtRaw",
      "createdDate",
      "rawCreatedAt",
    ]) ||
    readFirst(order, [
      "deposit_confirmed_at",
      "depositConfirmedAt",
      "paid_at",
      "paidAtRaw",
    ])
  );
}

function orderSubmittedTimeValue(order: LooseLiveOrder) {
  return readFirst(order, ["submittedAt", "paidAt"]);
}

function weekdayKo(date: Date) {
  return ["일", "월", "화", "수", "목", "금", "토"][date.getDay()] || "";
}

function formatOrderDateTime(value: unknown, fallbackTime = "") {
  const raw = clean(value);

  if (!raw) return fallbackTime || "-";

  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return fallbackTime || raw || "-";
  }

  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const day = weekdayKo(date);

  return `${yyyy}.${mm}.${dd}(${day}) ${hh}:${mi}`;
}

function orderCreatedLabel(order: LooseLiveOrder) {
  const rawDate = orderCreatedRawValue(order);
  const fallbackTime = orderSubmittedTimeValue(order);

  return formatOrderDateTime(rawDate, fallbackTime);
}

function orderCreatedSortValue(order: LooseLiveOrder) {
  return parseDateCandidate(orderCreatedRawValue(order)) || orderSubmittedTimeValue(order);
}

function orderAmount(order: LooseLiveOrder) {
  const direct = Number(order.totalAmount ?? order.total_amount ?? order.final_amount ?? order.adjusted_total_price ?? order.total_price ?? 0);

  if (Number.isFinite(direct) && direct > 0) return direct;

  return Number(order.productAmount || 0) + Number(order.shippingFee || 0);
}

function orderSummary(order: LooseLiveOrder) {
  return clean(order.orderSummary) || clean(order.memo) || clean(order.product_name) || clean(order.productName) || "주문내역 없음";
}

function orderRawStatusText(order: LooseLiveOrder) {
  return clean(order.paymentStatus || order.payment_status || order.order_manage_status || order.admin_order_status_v2);
}

function formatAdminPaymentStatus(value: unknown) {
  const status = clean(value);
  const lower = status.toLowerCase();

  if (!status) return "";

  if (/canceled|cancelled|주문서취소|주문취소|취소/.test(lower)) return "주문서취소";
  if (/manual_match_needed|입금확인 필요|입금매칭 필요|수동확인/.test(lower)) return "입금매칭 필요";
  if (/manual_paid|수동입금확인/.test(lower)) return "수동입금확인";
  if (/auto_paid|자동입금확인/.test(lower)) return "자동입금확인";
  if (/card_paid|카드결제완료|카드완료/.test(lower)) return "카드결제완료";
  if (/card_unpaid|카드 미결제|카드미결제/.test(lower)) return "카드 미결제";
  if (/unpaid|미입금|입금대기|결제대기/.test(lower)) return "입금대기";
  if (/paid|입금확인|결제완료/.test(lower)) return "입금확인";

  return status;
}

function orderStatusText(order: LooseLiveOrder) {
  return formatAdminPaymentStatus(orderRawStatusText(order));
}

function isPaid(order: LooseLiveOrder) {
  const status = orderRawStatusText(order);

  if (/manual_match_needed|입금확인 필요|입금매칭 필요|수동확인|unpaid|미입금|입금대기|결제대기|card_unpaid|카드 미결제/i.test(status)) {
    return false;
  }

  return /paid|입금확인|자동입금확인|수동입금확인|카드결제완료|결제완료/i.test(status);
}

function isManualNeeded(order: LooseLiveOrder) {
  const status = orderRawStatusText(order);
  return /manual_match_needed|입금확인 필요|입금매칭 필요|수동확인/i.test(status);
}

function isUnpaid(order: LooseLiveOrder) {
  const status = orderRawStatusText(order);
  return /unpaid|미입금|입금대기|결제대기|카드 미결제|card_unpaid/i.test(status) || isManualNeeded(order);
}

function isBlockedOrder(order: LooseLiveOrder) {
  return Boolean(
    order.is_blocked ||
      order.blocked ||
      order.customer_blocked ||
      clean(order.block_reason) ||
      clean(order.customer_block_reason)
  );
}

function blockReason(order: LooseLiveOrder) {
  return clean(order.block_reason) || clean(order.customer_block_reason);
}

function buildCustomerKey(order: LooseLiveOrder) {
  const phone = digitsOnly(orderPhone(order));
  if (phone) return `phone:${phone}`;

  const nickname = orderNickname(order);
  const name = orderName(order);

  return `name:${nickname}:${name}`;
}

function customerProfileFullAddress(profile: CustomerProfile) {
  return [clean(profile.zipcode), clean(profile.address), clean(profile.detail_address)].filter(Boolean).join(" ").trim();
}

function customerProfileKey(profile: CustomerProfile) {
  const phone = digitsOnly(profile.customer_phone);
  if (phone) return `phone:${phone}`;

  return `profile:${clean(profile.id) || clean(profile.customer_name) || clean(profile.youtube_nickname) || "unknown"}`;
}

function statusBadge(customer: CustomerSummary) {
  if (customer.blocked) {
    return <span className="rounded-lg bg-danger-bg px-2 py-1 text-xs font-black text-danger-tx">{CUSTOMER_TERMS.blocked}</span>;
  }

  if (customer.manualNeededCount > 0 || customer.unpaidCount > 0) {
    return <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-black text-warn-tx">관리필요</span>;
  }

  return <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-ok-tx">{CUSTOMER_TERMS.normal}</span>;
}

function SummaryCard({
  icon = "",
  label,
  value,
  sub,
  valueClassName = "",
  labelClassName = "",
  subClassName = "",
}: {
  icon?: string;
  label: string;
  value: string;
  sub: string;
  valueClassName?: string;
  labelClassName?: string;
  subClassName?: string;
}) {
  return (
    <div className="min-h-[142px] rounded-[22px] border border-line bg-surface p-4 shadow-sm">
      <div className={`flex items-center gap-2 text-[12px] font-black text-ink-soft ${labelClassName}`}>
        {icon ? <span className="text-[15px]">{icon}</span> : null}
        <span>{label}</span>
      </div>

      <div
        className={`mt-2 break-keep text-[32px] font-black leading-[1.12] tracking-[-0.055em] text-ink ${valueClassName}`}
      >
        {value}
      </div>

      <div className={`mt-2 break-keep text-[12px] font-bold leading-relaxed text-ink-mute ${subClassName}`}>
        {sub}
      </div>
    </div>
  );
}

function CustomerDetailDrawer({
  customer,
  profile,
  page,
  setPage,
  onClose,
  onBlockAction,
  blockSaving,
}: {
  customer: CustomerSummary | null;
  profile?: CustomerProfile | null;
  page: number;
  setPage: (value: number) => void;
  onClose: () => void;
  onBlockAction: (customer: CustomerSummary) => void | Promise<void>;
  blockSaving: boolean;
}) {
  const [avatarZoom, setAvatarZoom] = useState(false);

  if (!customer) return null;

  const totalPages = Math.max(1, Math.ceil(customer.orders.length / DETAIL_ORDER_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const visibleOrders = customer.orders.slice((safePage - 1) * DETAIL_ORDER_PAGE_SIZE, safePage * DETAIL_ORDER_PAGE_SIZE);

  const statusBadge = (text: string) => {
    const t = String(text || "");
    if (/입금확인|결제완료/.test(t)) return { background: "var(--color-ok-bg)", color: "var(--color-ok-tx)" };
    if (/배송|출고/.test(t)) return { background: "var(--color-info-bg)", color: "var(--color-info-tx)" };
    if (/대기|미입금|필요/.test(t)) return { background: "var(--color-warn-bg)", color: "var(--color-warn-tx)" };
    return { background: "var(--color-surface-3)", color: "var(--color-ink-soft)" };
  };
  const avatarChar = (customer.nickname || customer.name || "?").trim().charAt(0) || "?";

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.45)", padding: "24px 16px" }}
    >
      {avatarZoom && clean(profile?.kakao_profile_image) ? (
        <div
          onClick={() => setAvatarZoom(false)}
          style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.78)", padding: "24px", cursor: "zoom-out" }}
        >
          <img
            src={clean(profile?.kakao_profile_image)}
            alt={customer.nickname || customer.name || "프로필"}
            style={{ maxWidth: "min(440px, 90vw)", maxHeight: "80vh", borderRadius: "16px", objectFit: "contain", boxShadow: "0 24px 70px rgba(0,0,0,0.5)" }}
          />
        </div>
      ) : null}
      <section
        role="dialog"
        aria-modal="true"
        style={{ width: "100%", maxWidth: "540px", maxHeight: "90vh", overflowY: "auto", borderRadius: "20px", border: "1px solid var(--color-rose-line)", background: "var(--color-surface)", boxShadow: "0 24px 70px rgba(15,23,42,0.28)" }}
      >
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--color-line)", padding: "14px 18px" }}>
          <span style={{ fontSize: "15px", fontWeight: 800, color: "var(--color-ink)" }}>👤 회원 상세</span>
          <button type="button" onClick={onClose} style={{ marginLeft: "auto", width: "27px", height: "27px", border: "none", background: "none", color: "var(--color-ink-mute)", fontSize: "18px", cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: "16px 18px 18px" }}>
          {/* 프로필 */}
          <div style={{ display: "flex", gap: "13px", marginBottom: "14px" }}>
            {clean(profile?.kakao_profile_image) ? (
              <img
                src={clean(profile?.kakao_profile_image)}
                alt={customer.nickname || customer.name || "프로필"}
                onClick={() => setAvatarZoom(true)}
                style={{ width: "54px", height: "54px", flexShrink: 0, borderRadius: "50%", objectFit: "cover", background: "var(--color-rose-soft)", cursor: "zoom-in" }}
              />
            ) : (
              <span style={{ width: "54px", height: "54px", flexShrink: 0, borderRadius: "50%", background: "var(--color-rose-soft)", color: "var(--color-rose-deep)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: 800 }}>{avatarChar}</span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "15px", fontWeight: 800, color: "var(--color-ink)", marginBottom: "3px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                {customer.nickname}
                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-ink-mute)" }}>· {customer.name || "-"}</span>
                {customer.blocked ? (
                  <span style={{ fontSize: "10px", fontWeight: 800, color: "var(--color-danger-tx)", background: "var(--color-danger-bg)", borderRadius: "6px", padding: "2px 7px" }}>차단</span>
                ) : null}
              </div>
              <div style={{ fontSize: "11px", color: "var(--color-ink-mute)", lineHeight: 1.8 }}>
                📞 {formatPhone(customer.phone) || "-"}<br />
                📍 {customer.address || "주소 정보 없음"}<br />
                🕒 {customer.orderCount > 0 ? formatOrderDateTime(customer.latestOrderAt) : "주문 전 회원"}
                {profile?.kakao_nickname ? <><br />💬 카카오: {profile.kakao_nickname}</> : null}
                {profile?.first_login_at ? <><br />📅 최초 로그인: {formatOrderDateTime(profile.first_login_at)}</> : null}
                {profile?.last_login_at ? <><br />🕒 최근 로그인: {formatOrderDateTime(profile.last_login_at)}</> : null}
              </div>
            </div>
          </div>

          {/* 등록 배송지 (고객이 등록한 customers.shipping_addresses 배열 — 읽기 전용) */}
          {Array.isArray(profile?.shipping_addresses) && profile.shipping_addresses.length > 0 ? (
            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--color-ink)", marginBottom: "8px" }}>📦 등록 배송지 ({profile.shipping_addresses.length}건)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {[...profile.shipping_addresses]
                  .sort((a, b) => (b?.isDefault ? 1 : 0) - (a?.isDefault ? 1 : 0))
                  .map((addr, index) => {
                    const fullAddr = [
                      clean(addr?.zipcode) ? `(${clean(addr?.zipcode)})` : "",
                      clean(addr?.address),
                      clean(addr?.detailAddress),
                    ].filter(Boolean).join(" ");
                    return (
                      <div key={`${clean(addr?.name)}-${index}`} style={{ border: "1px solid var(--color-line)", borderRadius: "9px", padding: "8px 11px", background: addr?.isDefault ? "var(--color-surface-2)" : "#fff" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                          <span style={{ fontSize: "12px", fontWeight: 800, color: "var(--color-ink)" }}>{clean(addr?.name) || "이름 없음"}</span>
                          {clean(addr?.phone) ? <span style={{ fontSize: "11px", color: "var(--color-ink-mute)" }}>{formatPhone(clean(addr?.phone))}</span> : null}
                          {addr?.isDefault ? <span style={{ marginLeft: "auto", fontSize: "10px", fontWeight: 800, color: "#fff", background: "var(--color-rose-deep)", borderRadius: "6px", padding: "2px 7px" }}>기본</span> : null}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--color-ink-soft)" }}>{fullAddr || "주소 없음"}</div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : null}

          {/* 3 스탯 */}
          <div style={{ display: "flex", gap: "7px", marginBottom: "14px" }}>
            <div style={{ flex: 1, background: "var(--color-surface-2)", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--color-ink-mute)" }}>누적 주문</div>
              <div style={{ marginTop: "3px", fontSize: "16px", fontWeight: 800, color: "var(--color-ink)" }}>{customer.orderCount.toLocaleString("ko-KR")}건</div>
            </div>
            <div style={{ flex: 1, background: "var(--color-surface-2)", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--color-ink-mute)" }}>누적 결제</div>
              <div style={{ marginTop: "3px", fontSize: "16px", fontWeight: 800, color: "var(--color-ink)" }}>{money(customer.totalAmount)}</div>
            </div>
            <div style={{ flex: 1, background: "var(--color-surface-2)", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--color-ink-mute)" }}>미입금</div>
              <div style={{ marginTop: "3px", fontSize: "16px", fontWeight: 800, color: customer.unpaidCount > 0 ? "var(--color-warn-tx)" : "#222" }}>{customer.unpaidCount.toLocaleString("ko-KR")}건</div>
            </div>
          </div>

          {/* 주문 이력 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 800, color: "var(--color-ink)" }}>주문 이력</span>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-ink-mute)" }}>{safePage} / {totalPages}</span>
          </div>
          {visibleOrders.length === 0 ? (
            <div style={{ textAlign: "center", padding: "18px 0", fontSize: "12px", color: "var(--color-ink-mute)" }}>주문 내역이 없습니다.</div>
          ) : (
            visibleOrders.map((order, index) => {
              const badge = statusBadge(orderStatusText(order));
              return (
                <div key={`${order.id || index}-${orderCreatedLabel(order)}`} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0", borderBottom: "1px solid var(--color-surface-2)" }}>
                  <span style={{ width: "92px", flexShrink: 0, fontSize: "11px", color: "var(--color-ink-mute)" }}>{orderCreatedLabel(order)}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "12px", color: "var(--color-ink-soft)" }} title={orderSummary(order)}>{orderSummary(order)}</span>
                  <b style={{ fontSize: "12px", color: "var(--color-ink)" }}>{money(orderAmount(order))}</b>
                  <span style={{ flexShrink: 0, fontSize: "10px", fontWeight: 800, borderRadius: "6px", padding: "3px 7px", ...badge }}>{orderStatusText(order) || "-"}</span>
                </div>
              );
            })
          )}
          {totalPages > 1 ? (
            <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "12px" }}>
              <button type="button" onClick={() => setPage(Math.max(1, safePage - 1))} style={{ border: "1px solid var(--color-line)", borderRadius: "8px", background: "var(--color-surface)", padding: "5px 12px", fontSize: "11px", fontWeight: 800, color: "var(--color-ink-soft)", cursor: "pointer" }}>이전</button>
              <button type="button" onClick={() => setPage(Math.min(totalPages, safePage + 1))} style={{ border: "1px solid var(--color-line)", borderRadius: "8px", background: "var(--color-surface)", padding: "5px 12px", fontSize: "11px", fontWeight: 800, color: "var(--color-ink-soft)", cursor: "pointer" }}>다음</button>
            </div>
          ) : null}

          {/* 포인트 (기존 패널 유지 — 보유포인트 표시 + 🪙 지급) */}
          <div style={{ marginTop: "14px" }}>
            <AdminLiveCustomerPointPanel customer={customer} />
          </div>

          {/* 정보 변경 이력 */}
          {profile?.customer_history && profile.customer_history.length > 0 ? (
            <div style={{ marginTop: "16px" }}>
              <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--color-ink)", marginBottom: "8px" }}>정보 변경 이력</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {[...profile.customer_history]
                  .sort((a, b) => String(b.changed_at).localeCompare(String(a.changed_at)))
                  .map((h, index) => (
                    <div key={`${h.field}-${h.changed_at}-${index}`} style={{ border: "1px solid var(--color-line)", borderRadius: "9px", padding: "8px 11px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 800, color: "var(--color-ink-soft)" }}>{h.field}</span>
                        <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--color-ink-mute)" }}>{formatOrderDateTime(h.changed_at)}</span>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--color-ink-soft)" }}>
                        <span style={{ color: "var(--color-ink-mute)" }}>{h.old_value || "(없음)"}</span>
                        <span style={{ margin: "0 5px", color: "var(--color-ink-mute)", fontWeight: 800 }}>→</span>
                        <span style={{ color: "var(--color-ink)", fontWeight: 700 }}>{h.new_value || "(없음)"}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}

          {/* 푸터: 차단 / 닫기 */}
          <div style={{ display: "flex", alignItems: "center", marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--color-line)" }}>
            <button
              type="button"
              onClick={() => onBlockAction(customer)}
              disabled={blockSaving}
              style={{ border: "1px solid", borderColor: customer.blocked ? "var(--color-rose-line)" : "var(--color-rose-line)", borderRadius: "8px", background: customer.blocked ? "#fff" : "var(--color-danger-bg)", padding: "8px 12px", fontSize: "11px", fontWeight: 800, color: customer.blocked ? "#555" : "var(--color-danger-tx)", cursor: blockSaving ? "wait" : "pointer", opacity: blockSaving ? 0.5 : 1 }}
            >
              {customer.blocked ? `✅ ${CUSTOMER_TERMS.unblock}` : `🚫 ${CUSTOMER_TERMS.block}`}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ marginLeft: "auto", borderRadius: "8px", border: "none", background: "var(--color-rose-deep)", padding: "8px 18px", fontSize: "12px", fontWeight: 800, color: "#fff", cursor: "pointer" }}
            >
              닫기
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function AdminLiveCustomersPanel({ orders, onClose }: Props) {
  const [custTab, setCustTab] = useState<"members" | "issues">("members");
  const [phoneBlockOpen, setPhoneBlockOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [page, setPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<CustomerProfile | null>(null);
  const [detailPage, setDetailPage] = useState(1);
  const [blockOverrides, setBlockOverrides] = useState<Record<string, BlockOverride>>({});
  const [blockModalTarget, setBlockModalTarget] = useState<BlockModalTarget | null>(null);
  const [blockSaving, setBlockSaving] = useState(false);
  const [blockErrorMessage, setBlockErrorMessage] = useState("");
  const [blockStatusMessage, setBlockStatusMessage] = useState("");
  const [showBlockedCustomers, setShowBlockedCustomers] = useState(false);
  const [blockedCustomerKeywordDraft, setBlockedCustomerKeywordDraft] = useState("");
  const [blockedCustomerKeyword, setBlockedCustomerKeyword] = useState("");
  const [blockedCustomerPageSize, setBlockedCustomerPageSize] = useState(10);
  const [blockedCustomerPage, setBlockedCustomerPage] = useState(1);
  const [directPhoneBlocks, setDirectPhoneBlocks] = useState<DirectPhoneBlock[]>([]);
  const [customerProfiles, setCustomerProfiles] = useState<CustomerProfile[]>([]);

  // 주문 있는 고객만 — 기본 OFF(모든 고객 표시: 아직 주문 안 한 가망고객도 보임). 구매자만 보고 싶을 때만 켜는 선택 토글.
  const [buyersOnly, setBuyersOnly] = useState(false);
  // 일괄 포인트지급 — 선택(전화번호 숫자 기준) + 모달
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkAmount, setBulkAmount] = useState("");
  const [bulkReasonPreset, setBulkReasonPreset] = useState(BULK_POINT_REASON_PRESETS[0]);
  const [bulkReasonCustom, setBulkReasonCustom] = useState("");
  const [bulkMemo, setBulkMemo] = useState("");
  const [bulkVisible, setBulkVisible] = useState(true);
  const [bulkResult, setBulkResult] = useState<BulkGrantResult | null>(null);
  const { running: bulkRunning, grant: bulkGrant } = useBulkPointGrant();

  useEffect(() => {
    let alive = true;

    const loadDirectPhoneBlocks = async () => {
      try {
        const response = await fetch("/api/admin-live/customer-block", {
          method: "GET",
          cache: "no-store",
        });

        const payload = await response.json().catch(() => null);

        if (!alive || !payload?.ok || !Array.isArray(payload.blocks)) return;

        setDirectPhoneBlocks(
          payload.blocks
            .filter((block: any) => digitsOnly(block?.phone))
            .map((block: any) => ({
              phone: digitsOnly(block.phone),
              reason: clean(block.reason),
              created_at: clean(block.created_at),
              updated_at: clean(block.updated_at),
            }))
        );
      } catch {
        if (alive) setDirectPhoneBlocks([]);
      }
    };

    loadDirectPhoneBlocks();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const loadCustomerProfiles = async () => {
      const { data, error } = await supabase
        .from("customers")
        .select(
          "id, youtube_nickname, customer_name, customer_phone, zipcode, address, detail_address, shipping_addresses, is_blocked, block_reason, customer_memo, last_order_at, created_at, kakao_id, kakao_nickname, kakao_profile_image, first_login_at, last_login_at, customer_history"
        )
        .order("created_at", { ascending: false })
        .limit(1000);

      if (!alive) return;

      if (error) {
        console.warn("[admin-live] customers 테이블 불러오기 실패", error.message);
        setCustomerProfiles([]);
        return;
      }

      setCustomerProfiles(((data || []) as CustomerProfile[]).filter((profile) => digitsOnly(profile.customer_phone) || clean(profile.customer_name) || clean(profile.youtube_nickname)));
    };

    void loadCustomerProfiles();

    return () => {
      alive = false;
    };
  }, []);

  const customers = useMemo<CustomerSummary[]>(() => {
    const map = new Map<string, CustomerSummary>();
    const directPhoneBlockMap = new Map(
      directPhoneBlocks.map((block) => [digitsOnly(block.phone), block.reason] as const).filter(([phone]) => Boolean(phone))
    );

    (orders as LooseLiveOrder[]).forEach((order) => {
      const key = buildCustomerKey(order);
      const current = map.get(key);
      const amount = orderAmount(order);
      const latestOrderAt = orderCreatedSortValue(order);
      const phoneKey = digitsOnly(orderPhone(order));
      const override = phoneKey ? blockOverrides[phoneKey] : undefined;
      const directBlockReason = phoneKey ? directPhoneBlockMap.get(phoneKey) : undefined;
      const orderBlocked = override ? override.blocked : Boolean(directBlockReason) || isBlockedOrder(order);
      const orderBlockReason = override ? override.reason : directBlockReason || blockReason(order);

      if (!current) {
        map.set(key, {
          key,
          nickname: orderNickname(order),
          name: orderName(order),
          phone: orderPhone(order),
          address: orderFullAddress(order),
          orderCount: 1,
          totalAmount: amount,
          paidCount: isPaid(order) ? 1 : 0,
          unpaidCount: isUnpaid(order) ? 1 : 0,
          manualNeededCount: isManualNeeded(order) ? 1 : 0,
          latestOrderAt,
          blocked: orderBlocked,
          blockReason: orderBlockReason,
          orders: [order],
        });

        return;
      }

      current.orderCount += 1;
      current.totalAmount += amount;
      current.paidCount += isPaid(order) ? 1 : 0;
      current.unpaidCount += isUnpaid(order) ? 1 : 0;
      current.manualNeededCount += isManualNeeded(order) ? 1 : 0;
      current.blocked = current.blocked || orderBlocked;
      current.blockReason = current.blockReason || orderBlockReason;
      current.orders.push(order);

      if (!current.address) {
        current.address = orderFullAddress(order);
      }

      if (!current.latestOrderAt || latestOrderAt > current.latestOrderAt) {
        current.latestOrderAt = latestOrderAt;
      }
    });

    customerProfiles.forEach((profile) => {
      const key = customerProfileKey(profile);
      const phoneKey = digitsOnly(profile.customer_phone);
      const current = map.get(key);
      const override = phoneKey ? blockOverrides[phoneKey] : undefined;
      const directBlockReason = phoneKey ? directPhoneBlockMap.get(phoneKey) : undefined;
      const profileBlocked = override ? override.blocked : Boolean(directBlockReason);
      const profileBlockReason = profileBlocked ? override?.reason || directBlockReason || clean(profile.block_reason) : "";
      const profileAddress = customerProfileFullAddress(profile);
      const profileLatestAt = clean(profile.last_order_at) || clean(profile.created_at);

      if (current) {
        if (clean(profile.youtube_nickname)) {
          current.nickname = clean(profile.youtube_nickname);
        } else if (!current.nickname || current.nickname === "-") {
          current.nickname = "닉네임 미입력";
        }

        if (clean(profile.customer_name)) {
          current.name = clean(profile.customer_name);
        } else if (!current.name || current.name === "-") {
          current.name = "이름 없음";
        }

        if (clean(profile.customer_phone)) {
          current.phone = clean(profile.customer_phone);
        }

        if (profileAddress) {
          current.address = profileAddress;
        }

        current.blocked = current.blocked || profileBlocked;
        current.blockReason = current.blockReason || profileBlockReason;

        if (!current.latestOrderAt && profileLatestAt) {
          current.latestOrderAt = profileLatestAt;
        }

        return;
      }

      map.set(key, {
        key,
        nickname: clean(profile.youtube_nickname) || "닉네임 미입력",
        name: clean(profile.customer_name) || "이름 없음",
        phone: clean(profile.customer_phone),
        address: profileAddress,
        orderCount: 0,
        totalAmount: 0,
        paidCount: 0,
        unpaidCount: 0,
        manualNeededCount: 0,
        latestOrderAt: profileLatestAt,
        blocked: profileBlocked,
        blockReason: profileBlockReason,
        orders: [],
      });
    });

    return Array.from(map.values());
  }, [blockOverrides, customerProfiles, directPhoneBlocks, orders]);

  const filteredCustomers = useMemo(() => {
    const searchText = keyword.replace(/\s+/g, "").toLowerCase();

    return customers
      .filter((customer) => {
        const haystack = [
          customer.nickname,
          customer.name,
          customer.phone,
          formatPhone(customer.phone),
          customer.address,
        ]
          .join(" ")
          .replace(/\s+/g, "")
          .toLowerCase();

        if (searchText && !haystack.includes(searchText)) return false;
        // 주문 있는 고객만(기본 ON) — 테스트·0건 계정 숨김. 검색에도 적용(끄면 0건/테스트도 보임).
        if (buyersOnly && customer.orderCount <= 0) return false;
        if (statusFilter === "normal") return !customer.blocked;
        if (statusFilter === "blocked") return customer.blocked;
        if (statusFilter === "attention") return customer.manualNeededCount > 0 || customer.unpaidCount > 0;

        return true;
      })
      .sort((a, b) => {
        if (sortMode === "amount") return b.totalAmount - a.totalAmount;
        if (sortMode === "orders") return b.orderCount - a.orderCount;
        if (sortMode === "nickname") return a.nickname.localeCompare(b.nickname, "ko");
        return b.latestOrderAt.localeCompare(a.latestOrderAt);
      });
  }, [customers, keyword, sortMode, statusFilter, buyersOnly]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / CUSTOMER_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const visibleCustomers = filteredCustomers.slice((safePage - 1) * CUSTOMER_PAGE_SIZE, safePage * CUSTOMER_PAGE_SIZE);

  // ── 일괄 포인트지급: 선택 헬퍼 ──
  const pageSelectablePhones = visibleCustomers.map((c) => digitsOnly(c.phone)).filter(Boolean);
  const allPageSelected = pageSelectablePhones.length > 0 && pageSelectablePhones.every((p) => selectedPhones.has(p));

  const toggleSelectPhone = (phone: string) => {
    const key = digitsOnly(phone);
    if (!key) return;
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleSelectAllPage = () => {
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageSelectablePhones.forEach((p) => next.delete(p));
      else pageSelectablePhones.forEach((p) => next.add(p));
      return next;
    });
  };
  const clearSelection = () => setSelectedPhones(new Set());
  // 선택된 회원(이름 표시용) — 전화번호 기준
  const selectedCustomersList = customers.filter((c) => selectedPhones.has(digitsOnly(c.phone)));

  const openBulk = () => {
    setBulkAmount("");
    setBulkReasonPreset(BULK_POINT_REASON_PRESETS[0]);
    setBulkReasonCustom("");
    setBulkMemo("");
    setBulkVisible(true);
    setBulkResult(null);
    setBulkOpen(true);
  };

  const submitBulkGrant = async () => {
    const amount = Number(String(bulkAmount).replace(/[^\d]/g, "")) || 0;
    if (amount <= 0) return;
    const reason = bulkReasonPreset === "직접입력" ? bulkReasonCustom.trim() : bulkReasonPreset;
    if (!reason) return;
    const byPhone = new Map(customers.map((c) => [digitsOnly(c.phone), c]));
    const targets = Array.from(selectedPhones)
      .map((p) => {
        const c = byPhone.get(p);
        return c ? { phone: p, label: c.nickname || c.name || p } : null;
      })
      .filter((t): t is { phone: string; label: string } => Boolean(t));
    if (targets.length === 0) return;
    const result = await bulkGrant(targets, {
      amount,
      reason,
      adminMemo: bulkMemo.trim(),
      customerVisible: bulkVisible,
    });
    setBulkResult(result);
    if (result.success > 0) clearSelection();
  };

  const normalCustomers = customers.filter((customer) => !customer.blocked);
  const blockedCustomers = customers.filter((customer) => customer.blocked);
  const customerPhoneKeys = new Set(customers.map((customer) => digitsOnly(customer.phone)).filter(Boolean));
  const standalonePhoneBlocks = directPhoneBlocks.filter((block) => {
    const phoneKey = digitsOnly(block.phone);

    return phoneKey && !customerPhoneKeys.has(phoneKey);
  });
  const blockedTotalCount = blockedCustomers.length + standalonePhoneBlocks.length;
  const filteredBlockedCustomers = blockedCustomers.filter((customer) => {
    const searchText = blockedCustomerKeyword.replace(/\s+/g, "").toLowerCase();

    if (!searchText) return true;

    return [
      customer.nickname,
      customer.name,
      customer.phone,
      formatPhone(customer.phone),
      customer.address,
      customer.blockReason,
    ]
      .join(" ")
      .replace(/\s+/g, "")
      .toLowerCase()
      .includes(searchText);
  });
  const filteredStandalonePhoneBlocks = standalonePhoneBlocks.filter((block) => {
    const searchText = blockedCustomerKeyword.replace(/\s+/g, "").toLowerCase();

    if (!searchText) return true;

    return [
      block.phone,
      formatPhone(block.phone),
      block.reason,
    ]
      .join(" ")
      .replace(/\s+/g, "")
      .toLowerCase()
      .includes(searchText);
  });
  const filteredBlockedTotalCount = filteredBlockedCustomers.length + filteredStandalonePhoneBlocks.length;
  const blockedCustomerRows: BlockedCustomerListItem[] = [
    ...filteredStandalonePhoneBlocks.map((block) => ({
      type: "phone" as const,
      key: `phone-block-${digitsOnly(block.phone)}`,
      block,
    })),
    ...filteredBlockedCustomers.map((customer) => ({
      type: "customer" as const,
      key: `customer-${customer.key}`,
      customer,
    })),
  ];
  const blockedCustomerTotalPages = Math.max(1, Math.ceil(blockedCustomerRows.length / blockedCustomerPageSize));
  const safeBlockedCustomerPage = Math.min(Math.max(1, blockedCustomerPage), blockedCustomerTotalPages);
  const visibleBlockedCustomerRows = blockedCustomerRows.slice(
    (safeBlockedCustomerPage - 1) * blockedCustomerPageSize,
    safeBlockedCustomerPage * blockedCustomerPageSize
  );
  const visibleStandalonePhoneBlocks = visibleBlockedCustomerRows.flatMap((item) =>
    item.type === "phone" ? [item.block] : []
  );
  const visibleBlockedCustomers = visibleBlockedCustomerRows.flatMap((item) =>
    item.type === "customer" ? [item.customer] : []
  );
  const attentionCustomers = customers.filter((customer) => customer.manualNeededCount > 0 || customer.unpaidCount > 0);

  const openDetail = (customer: CustomerSummary) => {
    setSelectedCustomer(customer);
    setDetailPage(1);
    // customers 프로필을 전화번호(숫자) 기준으로 매칭
    const phoneKey = digitsOnly(customer.phone);
    const profile = phoneKey
      ? customerProfiles.find((p) => digitsOnly(p.customer_phone) === phoneKey) || null
      : null;
    setSelectedProfile(profile);
  };

  const applyBlockResult = (result: { phone: string; blocked: boolean; reason: string }) => {
    const phoneKey = digitsOnly(result.phone);
    if (!phoneKey) return;

    setBlockOverrides((current) => ({
      ...current,
      [phoneKey]: {
        blocked: result.blocked,
        reason: result.reason,
      },
    }));

    setSelectedCustomer((current) => {
      if (!current || digitsOnly(current.phone) !== phoneKey) return current;

      return {
        ...current,
        blocked: result.blocked,
        blockReason: result.reason,
      };
    });

    setDirectPhoneBlocks((current) => {
      const rest = current.filter((block) => digitsOnly(block.phone) !== phoneKey);

      if (!result.blocked) return rest;

      const hasCustomer = customers.some((customer) => digitsOnly(customer.phone) === phoneKey);

      if (hasCustomer) return rest;

      return [
        {
          phone: phoneKey,
          reason: result.reason,
          updated_at: new Date().toISOString(),
        },
        ...rest,
      ];
    });
  };

  const requestCustomerBlock = async (customer: CustomerSummary, blocked: boolean, reason: string) => {
    const phoneKey = digitsOnly(customer.phone);

    setBlockErrorMessage("");
    setBlockStatusMessage("");

    if (!phoneKey) {
      setBlockErrorMessage("전화번호가 없어 차단 처리할 수 없습니다.");
      return false;
    }

    if (blocked && !reason.trim()) {
      setBlockErrorMessage("차단사유를 입력해주세요.");
      return false;
    }

    setBlockSaving(true);

    try {
      const response = await fetch("/api/admin-live/customer-block", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone: phoneKey,
          blocked,
          reason: blocked ? reason.trim() : "",
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "차단 처리 실패");
      }

      applyBlockResult({
        phone: phoneKey,
        blocked,
        reason: blocked ? reason.trim() : "",
      });

      setBlockStatusMessage(`${customer.nickname} 고객을 ${blocked ? "차단" : "차단해제"}했습니다.`);
      return true;
    } catch (error) {
      setBlockErrorMessage(error instanceof Error ? error.message : "차단 처리 실패");
      return false;
    } finally {
      setBlockSaving(false);
    }
  };

  const handleCustomerBlockButton = async (customer: CustomerSummary) => {
    setBlockErrorMessage("");
    setBlockStatusMessage("");

    if (customer.blocked) {
      await requestCustomerBlock(customer, false, "");
      return;
    }

    setBlockModalTarget(customer);
  };

  const submitCustomerBlockReason = async (reason: string) => {
    if (!blockModalTarget) return;

    const ok = await requestCustomerBlock(blockModalTarget, true, reason);

    if (ok) {
      setBlockModalTarget(null);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="flex h-[88vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-rose-line px-5 py-3 shrink-0">
          <span className="text-[15px] font-black text-ink">👥 고객·이슈</span>
          <button type="button" onClick={() => onClose?.()} className="text-ink-mute hover:text-ink text-lg leading-none">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-rose-soft/40 px-4 py-2.5 text-[12px] font-black text-ink-soft">
            <span>전체 <span className="text-ink">{customers.length.toLocaleString("ko-KR")}</span></span>
            <span className="text-ink-mute">·</span>
            <span>정상 <span className="text-ok-tx">{normalCustomers.length.toLocaleString("ko-KR")}</span></span>
            <span className="text-ink-mute">·</span>
            <button
              type="button"
              onClick={() => {
                setBlockedCustomerKeywordDraft("");
                setBlockedCustomerKeyword("");
                setBlockedCustomerPage(1);
                setShowBlockedCustomers(true);
              }}
              className="hover:underline"
            >
              차단 <span className="text-red-500">{blockedTotalCount.toLocaleString("ko-KR")}</span>
            </button>
            <span className="text-ink-mute">·</span>
            <span>관리필요 <span className="text-amber-600">{attentionCustomers.length.toLocaleString("ko-KR")}</span></span>
          </div>

      <div className="rounded-xl border border-danger-tx bg-danger-bg/50">
        <button
          type="button"
          onClick={() => setPhoneBlockOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-[12px] font-black text-red-500"
        >
          <span>⛔ 전화번호 직접 차단</span>
          <span className="text-base leading-none">{phoneBlockOpen ? "−" : "+"}</span>
        </button>
        {phoneBlockOpen ? (
          <div className="px-2 pb-2">
            <AdminLivePhoneBlockPanel onSaved={applyBlockResult} />
          </div>
        ) : null}
      </div>

      <div className="flex gap-2 border-b border-rose-line">
        <button type="button" onClick={() => setCustTab("members")} className={`px-4 py-2 text-sm font-black rounded-t-lg ${custTab === "members" ? "bg-rose-deep text-white" : "text-ink-soft hover:text-rose-deep"}`}>회원 목록</button>
        <button type="button" onClick={() => setCustTab("issues")} className={`px-4 py-2 text-sm font-black rounded-t-lg ${custTab === "issues" ? "bg-rose-deep text-white" : "text-ink-soft hover:text-rose-deep"}`}>고객 이슈</button>
      </div>

      <div className={custTab === "members" ? "" : "hidden"}>
        <div className="rounded-[28px] border border-line bg-surface p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as StatusFilter);
                setPage(1);
              }}
              className="h-11 rounded-xl border border-line bg-surface px-3 text-[13px] font-black text-ink"
            >
              <option value="all">고객상태: 전체</option>
              <option value="normal">정상</option>
              <option value="blocked">차단</option>
              <option value="attention">관리필요</option>
            </select>

            <select
              value={sortMode}
              onChange={(event) => {
                setSortMode(event.target.value as SortMode);
                setPage(1);
              }}
              className="h-11 rounded-xl border border-line bg-surface px-3 text-[13px] font-black text-ink"
            >
              <option value="latest">최근주문순</option>
              <option value="amount">누적구매금액순</option>
              <option value="orders">주문수순</option>
              <option value="nickname">닉네임순</option>
            </select>

            <button
              type="button"
              onClick={() => {
                setKeyword("");
                setStatusFilter("all");
                setSortMode("latest");
                setPage(1);
              }}
              className="h-11 rounded-xl border border-line bg-surface px-3 text-[13px] font-black text-ink-soft hover:bg-surface-2"
            >
              초기화
            </button>

            <input
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value);
                setPage(1);
              }}
              placeholder="닉네임 / 이름 / 전화번호 검색"
              className="h-11 rounded-xl border border-line bg-surface px-3 text-[13px] font-black text-ink outline-none focus:border-info-tx focus:ring-4 focus:ring-info-bg"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-ink">고객 목록</h2>
              <button
                type="button"
                onClick={() => { setBuyersOnly((v) => !v); setPage(1); }}
                className={`rounded-full px-3 py-1 text-[11px] font-black transition ${buyersOnly ? "bg-rose-deep text-white" : "border border-line bg-surface text-ink-soft"}`}
              >
                {buyersOnly ? "주문 있는 고객만 ✓" : "주문 있는 고객만"}
              </button>
            </div>
            <div className="text-xs font-black text-ink-mute">
              표시 {visibleCustomers.length.toLocaleString("ko-KR")}명 / 검색결과 {filteredCustomers.length.toLocaleString("ko-KR")}명
            </div>
          </div>

          {/* 선택 / 일괄 포인트지급 바 */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
            <label className="flex items-center gap-2 text-[12px] font-black text-ink-soft">
              <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAllPage} className="h-4 w-4 accent-rose-deep" />
              이 페이지 전체선택
            </label>
            <div className="flex items-center gap-2">
              {selectedPhones.size > 0 ? (
                <button type="button" onClick={clearSelection} className="text-[11px] font-black text-ink-mute hover:text-ink">선택해제</button>
              ) : null}
              <button
                type="button"
                disabled={selectedPhones.size === 0}
                onClick={openBulk}
                className="rounded-lg bg-rose-deep px-3 py-1.5 text-[12px] font-black text-white disabled:opacity-40"
              >
                🪙 선택 {selectedPhones.size}명 일괄 포인트지급
              </button>
            </div>
          </div>

            <div className="mt-3 flex flex-col gap-1.5">
              {visibleCustomers.length === 0 ? (
                <div className="py-10 text-center text-sm text-ink-mute">표시할 고객이 없습니다.</div>
              ) : (
                visibleCustomers.map((customer) => {
                  const initial = (customer.nickname || customer.name || "?").trim().charAt(0);
                  return (
                    <div
                      key={customer.key}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${customer.blocked ? "border-line bg-surface-2 opacity-60" : "border-line bg-surface hover:border-rose-line hover:bg-rose-soft/30"}`}
                    >
                      {digitsOnly(customer.phone) ? (
                        <input
                          type="checkbox"
                          checked={selectedPhones.has(digitsOnly(customer.phone))}
                          onChange={() => toggleSelectPhone(customer.phone)}
                          className="h-4 w-4 shrink-0 accent-rose-deep"
                          title="일괄지급 선택"
                        />
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}
                      <button
                        type="button"
                        onClick={() => openDetail(customer)}
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${customer.blocked ? "bg-surface-3 text-ink-mute" : "bg-rose-soft text-rose-deep"}`}
                      >
                        {initial}
                      </button>
                      <button type="button" onClick={() => openDetail(customer)} className="min-w-0 flex-1 text-left">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-black text-ink">{customer.nickname || "—"}</span>
                          {customer.name ? <span className="shrink-0 text-xs text-ink-mute">· {customer.name}</span> : null}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-ink-mute">
                          누적 {customer.orderCount}건 · {money(customer.totalAmount)}원
                          {customer.phone ? ` · ${formatPhone(customer.phone)}` : ""}
                        </div>
                      </button>
                      {customer.blocked ? (
                        <span className="shrink-0 rounded-md bg-danger-bg px-2 py-0.5 text-[11px] font-black text-red-500">차단</span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleCustomerBlockButton(customer)}
                        className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-black transition-colors ${customer.blocked ? "border border-line text-ink-soft hover:bg-surface-2" : "text-red-500 hover:bg-danger-bg"}`}
                      >
                        {customer.blocked ? CUSTOMER_TERMS.unblock : CUSTOMER_TERMS.block}
                      </button>
                      <button type="button" onClick={() => openDetail(customer)} className="shrink-0 text-[11px] font-black text-rose-deep">상세 ›</button>
                    </div>
                  );
                })
              )}
            </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs font-black text-ink-soft">
              총 {filteredCustomers.length.toLocaleString("ko-KR")}명
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, safePage - 1))}
                className="rounded-xl border border-line px-3 py-2 text-sm font-black text-ink-soft"
              >
                이전
              </button>
              <div className="rounded-xl bg-rose-deep px-3 py-2 text-sm font-black text-white">
                {safePage} / {totalPages}
              </div>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                className="rounded-xl border border-line px-3 py-2 text-sm font-black text-ink-soft"
              >
                다음
              </button>
            </div>
          </div>

          {/* 일괄 포인트지급 모달 */}
          {bulkOpen ? (
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={() => !bulkRunning && setBulkOpen(false)}>
              <div className="w-[min(460px,94vw)] rounded-2xl bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="mb-1 text-[16px] font-black text-ink">🪙 포인트 일괄지급</div>
                <div className="mb-2 text-xs font-bold text-ink-soft">선택한 {selectedPhones.size}명에게 같은 금액을 지급합니다.</div>

                {/* 받는 사람 목록 */}
                {selectedCustomersList.length > 0 && !bulkResult ? (
                  <div className="mb-3 max-h-24 overflow-y-auto rounded-xl border border-line bg-surface-2 p-2">
                    <div className="flex flex-wrap gap-1">
                      {selectedCustomersList.map((c) => (
                        <span key={c.key} className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-1 text-[11px] font-black text-ink ring-1 ring-line">
                          {c.nickname || c.name || formatPhone(c.phone)}
                          <button type="button" onClick={() => toggleSelectPhone(c.phone)} className="leading-none text-ink-mute hover:text-red-500" title="선택 해제">✕</button>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {!bulkResult ? (
                  <>
                    <label className="block">
                      <span className="text-xs font-black text-ink-soft">1인당 지급 포인트</span>
                      <input value={bulkAmount} onChange={(e) => setBulkAmount(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="예: 5000"
                        className="mt-1 h-11 w-full rounded-xl border border-line px-3 text-base font-black outline-none focus:border-rose-deep" />
                    </label>

                    <label className="mt-3 block">
                      <span className="text-xs font-black text-ink-soft">지급 사유 (고객에게 보임)</span>
                      <select value={bulkReasonPreset} onChange={(e) => setBulkReasonPreset(e.target.value)}
                        className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm font-black outline-none focus:border-rose-deep">
                        {BULK_POINT_REASON_PRESETS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </label>
                    {bulkReasonPreset === "직접입력" ? (
                      <input value={bulkReasonCustom} onChange={(e) => setBulkReasonCustom(e.target.value)} placeholder="사유 직접 입력"
                        className="mt-2 h-11 w-full rounded-xl border border-line px-3 text-sm font-bold outline-none focus:border-rose-deep" />
                    ) : null}

                    <label className="mt-3 block">
                      <span className="text-xs font-black text-ink-soft">내부 메모 (관리자만, 선택)</span>
                      <input value={bulkMemo} onChange={(e) => setBulkMemo(e.target.value)} placeholder="관리자만 참고할 내용"
                        className="mt-1 h-11 w-full rounded-xl border border-line px-3 text-sm font-bold outline-none focus:border-rose-deep" />
                    </label>

                    <label className="mt-3 flex items-center gap-2 rounded-xl bg-rose-soft/40 px-3 py-2 text-[12px] font-black text-rose-deep">
                      <input type="checkbox" checked={bulkVisible} onChange={(e) => setBulkVisible(e.target.checked)} className="h-4 w-4 accent-rose-deep" />
                      고객 화면 포인트 알림에 표시
                    </label>

                    <div className="mt-3 rounded-xl border border-line bg-warn-bg px-3 py-2 text-[11px] font-bold leading-5 text-warn-tx">
                      {selectedPhones.size}명 × {(Number(bulkAmount.replace(/[^\d]/g, "")) || 0).toLocaleString("ko-KR")}P = 합계 {((Number(bulkAmount.replace(/[^\d]/g, "")) || 0) * selectedPhones.size).toLocaleString("ko-KR")}P 지급(회수 아님).
                    </div>

                    <div className="mt-4 flex justify-end gap-2">
                      <button type="button" onClick={() => setBulkOpen(false)} disabled={bulkRunning} className="rounded-xl border border-line px-4 py-2.5 text-sm font-black text-ink-soft disabled:opacity-50">취소</button>
                      <button type="button" onClick={submitBulkGrant} disabled={bulkRunning || (Number(bulkAmount.replace(/[^\d]/g, "")) || 0) <= 0}
                        className="rounded-xl bg-rose-deep px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">
                        {bulkRunning ? "지급 중..." : `${selectedPhones.size}명에게 지급`}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-xl border border-line bg-ok-bg px-3 py-3 text-sm font-black text-ok-tx">
                      ✅ {bulkResult.success}명 지급 완료{bulkResult.failed.length > 0 ? ` · ❌ ${bulkResult.failed.length}명 실패` : ""}
                    </div>
                    {bulkResult.failed.length > 0 ? (
                      <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-danger-tx bg-danger-bg p-2 text-[11px] font-bold leading-5 text-danger-tx">
                        {bulkResult.failed.map((f, i) => <div key={i}>{f.label}: {f.reason}</div>)}
                      </div>
                    ) : null}
                    <div className="mt-4 flex justify-end">
                      <button type="button" onClick={() => { setBulkOpen(false); setBulkResult(null); }} className="rounded-xl bg-rose-deep px-5 py-2.5 text-sm font-black text-white">닫기</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>
        </div>

        <div className={custTab === "issues" ? "" : "hidden"}>
        <AdminLiveCustomerIssueRail
          customerOptions={customers.map((customer) => ({
            key: customer.key,
            nickname: customer.nickname,
            name: customer.name,
            phone: customer.phone,
          }))}
        />
      </div>

      {showBlockedCustomers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
          <div className="max-h-[84vh] w-full max-w-[720px] overflow-y-auto rounded-[28px] border border-line bg-surface p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
              <div>
                <div className="text-[11px] font-black tracking-[0.18em] text-red-500">BLOCKED CUSTOMERS</div>
                <h2 className="mt-1 text-2xl font-black tracking-[-0.04em] text-ink">
                  차단 고객 목록 {blockedTotalCount.toLocaleString("ko-KR")}명
                </h2>
                <p className="mt-1 text-sm font-bold text-ink-soft">
                  현재 주문 데이터와 차단 저장 결과 기준으로 표시합니다.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowBlockedCustomers(false);
                  setBlockedCustomerKeywordDraft("");
                  setBlockedCustomerKeyword("");
                  setBlockedCustomerPage(1);
                }}
                className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-black text-ink-soft hover:bg-surface-2"
              >
                닫기
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-3">
              <div className="grid gap-2 md:grid-cols-[1fr_96px_96px]">
                <input
                  value={blockedCustomerKeywordDraft}
                  onChange={(event) => setBlockedCustomerKeywordDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      setBlockedCustomerKeyword(blockedCustomerKeywordDraft);
                      setBlockedCustomerPage(1);
                    }
                  }}
                  placeholder="닉네임 / 이름 / 전화번호 / 주소 / 차단사유 검색"
                  className="h-11 rounded-xl border border-line bg-surface px-3 text-sm font-black text-ink outline-none focus:border-red-400 focus:ring-4 focus:ring-red-50"
                />

                <button
                  type="button"
                  onClick={() => {
                    setBlockedCustomerKeyword(blockedCustomerKeywordDraft);
                    setBlockedCustomerPage(1);
                  }}
                  className="h-11 rounded-xl bg-slate-900 px-3 text-sm font-black text-white hover:bg-slate-700"
                >
                  검색
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setBlockedCustomerKeywordDraft("");
                    setBlockedCustomerKeyword("");
                    setBlockedCustomerPage(1);
                  }}
                  className="h-11 rounded-xl border border-line bg-surface px-3 text-sm font-black text-ink-soft hover:bg-surface-2"
                >
                  초기화
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-black text-ink-mute">
                  현재페이지 {visibleBlockedCustomerRows.length.toLocaleString("ko-KR")}명 · 검색결과{" "}
                  {filteredBlockedTotalCount.toLocaleString("ko-KR")}명 / 전체 {blockedTotalCount.toLocaleString("ko-KR")}명
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={blockedCustomerPageSize}
                    onChange={(event) => {
                      setBlockedCustomerPageSize(Number(event.target.value));
                      setBlockedCustomerPage(1);
                    }}
                    className="h-9 rounded-xl border border-line bg-surface px-2 text-xs font-black text-ink-soft"
                  >
                    <option value={10}>10개 보기</option>
                    <option value={20}>20개 보기</option>
                    <option value={50}>50개 보기</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => setBlockedCustomerPage(Math.max(1, safeBlockedCustomerPage - 1))}
                    disabled={safeBlockedCustomerPage <= 1}
                    className="h-9 rounded-xl border border-line bg-surface px-3 text-xs font-black text-ink-soft hover:bg-surface-2 disabled:opacity-40"
                  >
                    이전
                  </button>

                  <div className="h-9 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white">
                    {safeBlockedCustomerPage} / {blockedCustomerTotalPages}
                  </div>

                  <button
                    type="button"
                    onClick={() => setBlockedCustomerPage(Math.min(blockedCustomerTotalPages, safeBlockedCustomerPage + 1))}
                    disabled={safeBlockedCustomerPage >= blockedCustomerTotalPages}
                    className="h-9 rounded-xl border border-line bg-surface px-3 text-xs font-black text-ink-soft hover:bg-surface-2 disabled:opacity-40"
                  >
                    다음
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {blockedTotalCount === 0 ? (
                <div className="rounded-2xl border border-line bg-surface-2 px-4 py-8 text-center text-sm font-black text-ink-mute">
                  차단 고객이 없습니다.
                </div>
              ) : filteredBlockedTotalCount === 0 ? (
                <div className="rounded-2xl border border-line bg-surface-2 px-4 py-8 text-center text-sm font-black text-ink-mute">
                  검색 결과가 없습니다.
                </div>
              ) : (
                <>
                  {visibleStandalonePhoneBlocks.map((block) => (
                    <div
                      key={`phone-block-${digitsOnly(block.phone)}`}
                      className="rounded-2xl border border-danger-tx bg-danger-bg/60 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-base font-black text-ink">전화번호 전용 차단</div>
                          <div className="mt-1 text-sm font-bold text-ink-soft">
                            {formatPhone(block.phone)}
                          </div>
                          <div className="mt-2 rounded-xl bg-surface px-3 py-2 text-xs font-bold leading-5 text-danger-tx">
                            {block.reason || "차단사유 없음"}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            handleCustomerBlockButton({
                              key: `phone-block-${digitsOnly(block.phone)}`,
                              nickname: "전화번호 전용",
                              name: "-",
                              phone: block.phone,
                              address: "",
                              orderCount: 0,
                              totalAmount: 0,
                              paidCount: 0,
                              unpaidCount: 0,
                              manualNeededCount: 0,
                              latestOrderAt: "",
                              blocked: true,
                              blockReason: block.reason,
                              orders: [],
                            })
                          }
                          disabled={blockSaving}
                          className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white hover:bg-slate-700 disabled:opacity-50"
                        >
                          차단해제
                        </button>
                      </div>
                    </div>
                  ))}

                  {visibleBlockedCustomers.map((customer) => (
                  <div
                    key={`blocked-${customer.key}`}
                    className="rounded-2xl border border-danger-tx bg-danger-bg/60 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-base font-black text-ink">{customer.nickname}</div>
                        <div className="mt-1 text-sm font-bold text-ink-soft">
                          {customer.name} · {formatPhone(customer.phone)}
                        </div>
                        <div className="mt-2 break-keep text-xs font-bold leading-5 text-ink-soft">
                          📍 {customer.address || "주소 정보 없음"}
                        </div>
                        <div className="mt-2 rounded-xl bg-surface px-3 py-2 text-xs font-bold leading-5 text-danger-tx">
                          {customer.blockReason || "차단사유 없음"}
                        </div>
                      </div>

                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCustomer(customer);
                            setDetailPage(1);
                            setShowBlockedCustomers(false);
                          }}
                          className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-black text-ink hover:bg-surface-2"
                        >
                          상세
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCustomerBlockButton(customer)}
                          disabled={blockSaving}
                          className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white hover:bg-slate-700 disabled:opacity-50"
                        >
                          차단해제
                        </button>
                      </div>
                    </div>
                  </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <CustomerDetailDrawer
        customer={selectedCustomer}
        profile={selectedProfile}
        page={detailPage}
        setPage={setDetailPage}
        onClose={() => { setSelectedCustomer(null); setSelectedProfile(null); }}
        onBlockAction={handleCustomerBlockButton}
        blockSaving={blockSaving}
      />

      <AdminLiveCustomerBlockReasonModal
        open={Boolean(blockModalTarget)}
        nickname={blockModalTarget?.nickname || ""}
        name={blockModalTarget?.name || ""}
        phone={blockModalTarget?.phone || ""}
        defaultReason={blockModalTarget?.blockReason || ""}
        saving={blockSaving}
        errorMessage={blockErrorMessage}
        onClose={() => {
          if (!blockSaving) {
            setBlockModalTarget(null);
            setBlockErrorMessage("");
          }
        }}
        onSubmit={submitCustomerBlockReason}
      />
        </div>
      </div>
    </div>
  );
}
