"use client";

// components/admin-live/AdminLiveCustomersPanel.tsx
// 목적: 실시간 관리자 고객관리 화면
// 주의: 1차는 조회/화면 구성 전용. 고객 차단 저장, 메모 저장, 주문/입금/배송/정산 로직 없음.

import { useEffect, useMemo, useState } from "react";
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
  is_blocked?: boolean | null;
  block_reason?: string | null;
  customer_memo?: string | null;
  last_order_at?: string | null;
  created_at?: string | null;
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
    return <span className="rounded-lg bg-red-100 px-2 py-1 text-xs font-black text-red-700">{CUSTOMER_TERMS.blocked}</span>;
  }

  if (customer.manualNeededCount > 0 || customer.unpaidCount > 0) {
    return <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-black text-amber-700">관리필요</span>;
  }

  return <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">{CUSTOMER_TERMS.normal}</span>;
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
    <div className="min-h-[142px] rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`flex items-center gap-2 text-[12px] font-black text-slate-500 ${labelClassName}`}>
        {icon ? <span className="text-[15px]">{icon}</span> : null}
        <span>{label}</span>
      </div>

      <div
        className={`mt-2 break-keep text-[32px] font-black leading-[1.12] tracking-[-0.055em] text-slate-950 ${valueClassName}`}
      >
        {value}
      </div>

      <div className={`mt-2 break-keep text-[12px] font-bold leading-relaxed text-slate-400 ${subClassName}`}>
        {sub}
      </div>
    </div>
  );
}

function CustomerDetailDrawer({
  customer,
  page,
  setPage,
  onClose,
  onBlockAction,
  blockSaving,
}: {
  customer: CustomerSummary | null;
  page: number;
  setPage: (value: number) => void;
  onClose: () => void;
  onBlockAction: (customer: CustomerSummary) => void | Promise<void>;
  blockSaving: boolean;
}) {
  if (!customer) return null;

  const totalPages = Math.max(1, Math.ceil(customer.orders.length / DETAIL_ORDER_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const visibleOrders = customer.orders.slice((safePage - 1) * DETAIL_ORDER_PAGE_SIZE, safePage * DETAIL_ORDER_PAGE_SIZE);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30">
      <aside className="h-full w-full max-w-[680px] overflow-y-auto bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="text-[11px] font-black tracking-[0.18em] text-rose-deep">CUSTOMER DETAIL</div>
            <h2 className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950">{customer.nickname}</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {customer.name} · {formatPhone(customer.phone)}
            </p>
            <p className="mt-2 max-w-[520px] break-keep text-[13px] font-bold leading-5 text-slate-500">
              📍 {customer.address || "주소 정보 없음"}
            </p>
          </div>

          <div className="flex shrink-0 items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600 hover:bg-slate-50"
            >
              닫기
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <SummaryCard
            icon="👤"
            label={CUSTOMER_TERMS.customerStatus}
            value={customer.blocked ? CUSTOMER_TERMS.blocked : CUSTOMER_TERMS.normal}
            sub={customer.blockReason || "차단 정보 없음"}
            valueClassName="whitespace-nowrap text-[17px] leading-tight"
          />
          <SummaryCard
            icon="🧾"
            label={CUSTOMER_TERMS.orderCount}
            value={`${customer.orderCount.toLocaleString("ko-KR")}건`}
            sub="주문+회원 기준"
            valueClassName="whitespace-nowrap text-[18px] leading-tight"
          />
          <SummaryCard
            icon="💳"
            label={CUSTOMER_TERMS.totalOrderAmount}
            value={money(customer.totalAmount)}
            sub="취소/정산 제외 전 표시합"
            valueClassName="whitespace-nowrap text-[22px]"
          />
          <SummaryCard
            icon="🕒"
            label={CUSTOMER_TERMS.latestOrder}
            value={customer.orderCount > 0 ? formatOrderDateTime(customer.latestOrderAt) : "주문 전 회원"}
            sub={customer.orderCount > 0 ? "가장 최근 주문" : "카톡 로그인/회원등록 고객"}
            valueClassName="text-[13px] leading-[1.25] tracking-[-0.02em]"
            subClassName="text-[12px]"
          />
        </div>

        <section className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-[17px] font-black text-slate-950">📦 {CUSTOMER_TERMS.orderHistory}</h3>
              <p className="mt-1 text-[12px] font-bold text-slate-400">닉네임 클릭 상세에서 고객의 전체 주문을 페이지별로 확인합니다.</p>
            </div>

            <div className="text-xs font-black text-slate-500">
              {safePage} / {totalPages}
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead className="bg-slate-50 text-xs font-black text-slate-500">
                <tr>
                  <th className="w-[178px] px-3 py-3 text-left">주문일시</th>
                  <th className="px-3 py-3 text-left">주문내역</th>
                  <th className="w-[112px] px-3 py-3 text-right">금액</th>
                  <th className="w-[108px] px-3 py-3 text-center">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleOrders.map((order, index) => (
                  <tr key={`${order.id || index}-${orderCreatedLabel(order)}`} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-bold text-slate-600">{orderCreatedLabel(order)}</td>
                    <td className="truncate px-3 py-3 font-bold text-slate-800" title={orderSummary(order)}>
                      {orderSummary(order)}
                    </td>
                    <td className="px-3 py-3 text-right font-black text-slate-950">{money(orderAmount(order))}</td>
                    <td className="px-3 py-3 text-center">
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">
                        {orderStatusText(order) || "-"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, safePage - 1))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-500"
            >
              이전
            </button>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-500"
            >
              다음
            </button>
          </div>
        </section>

        <AdminLiveCustomerPointPanel customer={customer} />

        <section className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-base font-black text-slate-950">📝 {CUSTOMER_TERMS.customerIssue}</h3>
            <p className="mt-2 text-sm font-bold leading-relaxed text-slate-500">
              미해결 이슈 연결은 오른쪽 고객이슈 패널에서 먼저 확인합니다. 고객별 자동 연결은 2차에서 customer_id/전화번호 기준으로 붙입니다.
            </p>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-950">🚫 차단 관리</h3>
                <p className="mt-2 text-sm font-bold leading-relaxed text-slate-500">
                  현재 고객의 차단 상태와 사유를 확인하고, 필요 시 바로 차단/차단해제합니다.
                </p>
              </div>

              <button
                type="button"
                onClick={() => onBlockAction(customer)}
                disabled={blockSaving}
                className={`shrink-0 rounded-xl px-4 py-2 text-xs font-black disabled:opacity-50 ${
                  customer.blocked
                    ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    : "bg-red-600 text-white hover:bg-red-700"
                }`}
              >
                {customer.blocked ? CUSTOMER_TERMS.unblock : CUSTOMER_TERMS.block}
              </button>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold leading-5 text-slate-500">
              {customer.blocked ? customer.blockReason || "차단사유 없음" : "현재 차단되지 않은 고객입니다."}
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}

export default function AdminLiveCustomersPanel({ orders, onClose }: Props) {
  const [custTab, setCustTab] = useState<"members" | "issues">("members");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [page, setPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);
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
          "id, youtube_nickname, customer_name, customer_phone, zipcode, address, detail_address, is_blocked, block_reason, customer_memo, last_order_at, created_at"
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
  }, [customers, keyword, sortMode, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / CUSTOMER_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const visibleCustomers = filteredCustomers.slice((safePage - 1) * CUSTOMER_PAGE_SIZE, safePage * CUSTOMER_PAGE_SIZE);

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
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-slate-950/40 overflow-y-auto py-8 px-4" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="w-full max-w-[780px] rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-rose-line px-5 py-3">
          <span className="text-[15px] font-black text-slate-950">👥 고객·이슈</span>
          <button type="button" onClick={() => onClose?.()} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
        </div>
        <div className="p-5 space-y-5">
      <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-black tracking-[0.18em] text-rose-deep">CUSTOMER MANAGEMENT</div>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.05em] text-slate-950">{CUSTOMER_TERMS.pageTitle}</h1>
            <p className="mt-2 text-sm font-bold text-slate-500">
              {CUSTOMER_TERMS.pageSubTitle} · 1차는 조회/상세 확인 전용입니다.
            </p>
          </div>

          <div className="rounded-full bg-rose-soft px-4 py-2 text-xs font-black text-rose-deep">
            차단 저장 연결
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard icon="👥" label="전체 고객" value={`${customers.length.toLocaleString("ko-KR")}명`} sub="주문+회원 기준" />
          <SummaryCard icon="✅" label="정상 고객" value={`${normalCustomers.length.toLocaleString("ko-KR")}명`} sub="차단 제외" />
          <button
            type="button"
            onClick={() => {
              setBlockedCustomerKeywordDraft("");
              setBlockedCustomerKeyword("");
              setBlockedCustomerPage(1);
              setShowBlockedCustomers(true);
            }}
            className="text-left"
            title="차단 고객 목록 보기"
          >
            <SummaryCard
              icon="⛔"
              label="차단 관리"
              value={`${blockedTotalCount.toLocaleString("ko-KR")}건`}
              sub={
                standalonePhoneBlocks.length > 0
                  ? `고객차단 ${blockedCustomers.length.toLocaleString("ko-KR")}명 · 전화번호차단 ${standalonePhoneBlocks.length.toLocaleString("ko-KR")}건`
                  : `고객차단 ${blockedCustomers.length.toLocaleString("ko-KR")}명`
              }
            />
          </button>
          <SummaryCard icon="⚠️" label="관리필요 고객" value={`${attentionCustomers.length.toLocaleString("ko-KR")}명`} sub="입금대기 / 입금매칭 필요" />
        </div>
      </div>

      <AdminLivePhoneBlockPanel onSaved={applyBlockResult} />

      <div className="flex gap-2 border-b border-rose-line">
        <button type="button" onClick={() => setCustTab("members")} className={`px-4 py-2 text-sm font-black rounded-t-lg ${custTab === "members" ? "bg-rose-deep text-white" : "text-slate-500 hover:text-rose-deep"}`}>회원 목록</button>
        <button type="button" onClick={() => setCustTab("issues")} className={`px-4 py-2 text-sm font-black rounded-t-lg ${custTab === "issues" ? "bg-rose-deep text-white" : "text-slate-500 hover:text-rose-deep"}`}>고객 이슈</button>
      </div>

      <div className={custTab === "members" ? "" : "hidden"}>
        <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-2 lg:grid-cols-[180px_180px_180px_1fr]">
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as StatusFilter);
                setPage(1);
              }}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-black text-slate-700"
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
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-black text-slate-700"
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
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-black text-slate-600 hover:bg-slate-50"
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
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-black text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-slate-950">고객 목록</h2>
            <div className="text-xs font-black text-slate-400">
              표시 {visibleCustomers.length.toLocaleString("ko-KR")}명 / 검색결과 {filteredCustomers.length.toLocaleString("ko-KR")}명
            </div>
          </div>

            <div className="mt-3 flex flex-col gap-1.5">
              {visibleCustomers.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">표시할 고객이 없습니다.</div>
              ) : (
                visibleCustomers.map((customer) => {
                  const initial = (customer.nickname || customer.name || "?").trim().charAt(0);
                  return (
                    <div
                      key={customer.key}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${customer.blocked ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200 bg-white hover:border-rose-line hover:bg-rose-soft/30"}`}
                    >
                      <button
                        type="button"
                        onClick={() => openDetail(customer)}
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${customer.blocked ? "bg-slate-200 text-slate-400" : "bg-rose-soft text-rose-deep"}`}
                      >
                        {initial}
                      </button>
                      <button type="button" onClick={() => openDetail(customer)} className="min-w-0 flex-1 text-left">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-black text-slate-900">{customer.nickname || "—"}</span>
                          {customer.name ? <span className="shrink-0 text-xs text-slate-400">· {customer.name}</span> : null}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-slate-400">
                          누적 {customer.orderCount}건 · {money(customer.totalAmount)}원
                          {customer.phone ? ` · ${formatPhone(customer.phone)}` : ""}
                        </div>
                      </button>
                      {customer.blocked ? (
                        <span className="shrink-0 rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-black text-red-500">차단</span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleCustomerBlockButton(customer)}
                        className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-black transition-colors ${customer.blocked ? "border border-slate-200 text-slate-500 hover:bg-slate-100" : "text-red-500 hover:bg-red-50"}`}
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
            <div className="text-xs font-black text-slate-500">
              총 {filteredCustomers.length.toLocaleString("ko-KR")}명
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, safePage - 1))}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-500"
              >
                이전
              </button>
              <div className="rounded-xl bg-rose-deep px-3 py-2 text-sm font-black text-white">
                {safePage} / {totalPages}
              </div>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-500"
              >
                다음
              </button>
            </div>
          </div>
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
          <div className="max-h-[84vh] w-full max-w-[720px] overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="text-[11px] font-black tracking-[0.18em] text-red-500">BLOCKED CUSTOMERS</div>
                <h2 className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950">
                  차단 고객 목록 {blockedTotalCount.toLocaleString("ko-KR")}명
                </h2>
                <p className="mt-1 text-sm font-bold text-slate-500">
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
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600 hover:bg-slate-50"
              >
                닫기
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3">
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
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-50"
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
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-600 hover:bg-slate-50"
                >
                  초기화
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-black text-slate-400">
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
                    className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs font-black text-slate-600"
                  >
                    <option value={10}>10개 보기</option>
                    <option value={20}>20개 보기</option>
                    <option value={50}>50개 보기</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => setBlockedCustomerPage(Math.max(1, safeBlockedCustomerPage - 1))}
                    disabled={safeBlockedCustomerPage <= 1}
                    className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-40"
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
                    className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    다음
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {blockedTotalCount === 0 ? (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-8 text-center text-sm font-black text-slate-400">
                  차단 고객이 없습니다.
                </div>
              ) : filteredBlockedTotalCount === 0 ? (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-8 text-center text-sm font-black text-slate-400">
                  검색 결과가 없습니다.
                </div>
              ) : (
                <>
                  {visibleStandalonePhoneBlocks.map((block) => (
                    <div
                      key={`phone-block-${digitsOnly(block.phone)}`}
                      className="rounded-2xl border border-red-100 bg-red-50/60 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-base font-black text-slate-950">전화번호 전용 차단</div>
                          <div className="mt-1 text-sm font-bold text-slate-600">
                            {formatPhone(block.phone)}
                          </div>
                          <div className="mt-2 rounded-xl bg-white px-3 py-2 text-xs font-bold leading-5 text-red-700">
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
                    className="rounded-2xl border border-red-100 bg-red-50/60 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-base font-black text-slate-950">{customer.nickname}</div>
                        <div className="mt-1 text-sm font-bold text-slate-600">
                          {customer.name} · {formatPhone(customer.phone)}
                        </div>
                        <div className="mt-2 break-keep text-xs font-bold leading-5 text-slate-500">
                          📍 {customer.address || "주소 정보 없음"}
                        </div>
                        <div className="mt-2 rounded-xl bg-white px-3 py-2 text-xs font-bold leading-5 text-red-700">
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
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
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
        page={detailPage}
        setPage={setDetailPage}
        onClose={() => setSelectedCustomer(null)}
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
