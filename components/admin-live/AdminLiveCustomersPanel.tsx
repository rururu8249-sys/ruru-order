"use client";

// components/admin-live/AdminLiveCustomersPanel.tsx
// 목적: 실시간 관리자 고객관리 화면
// 주의: 1차는 조회/화면 구성 전용. 고객 차단 저장, 메모 저장, 주문/입금/배송/정산 로직 없음.

import { useMemo, useState } from "react";
import type { LiveOrder } from "./types";
import AdminLiveCustomerIssueRail from "./AdminLiveCustomerIssueRail";
import { CUSTOMER_TERMS } from "./adminLiveCustomerTerms";

type Props = {
  orders: LiveOrder[];
};

type LooseLiveOrder = LiveOrder & Record<string, any>;

type CustomerSummary = {
  key: string;
  nickname: string;
  name: string;
  phone: string;
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

type SortMode = "latest" | "amount" | "orders" | "nickname";
type StatusFilter = "all" | "normal" | "blocked" | "attention";

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

function orderCreatedLabel(order: LooseLiveOrder) {
  return (
    readFirst(order, ["submittedAt", "createdAt", "created_at", "orderDate", "order_date"]) ||
    readFirst(order, ["paidAt", "depositConfirmedAt", "deposit_confirmed_at"]) ||
    "-"
  );
}

function orderAmount(order: LooseLiveOrder) {
  const direct = Number(order.totalAmount ?? order.total_amount ?? order.final_amount ?? order.adjusted_total_price ?? order.total_price ?? 0);

  if (Number.isFinite(direct) && direct > 0) return direct;

  return Number(order.productAmount || 0) + Number(order.shippingFee || 0);
}

function orderSummary(order: LooseLiveOrder) {
  return clean(order.orderSummary) || clean(order.memo) || clean(order.product_name) || clean(order.productName) || "주문내역 없음";
}

function orderStatusText(order: LooseLiveOrder) {
  return clean(order.paymentStatus || order.payment_status || order.order_manage_status || order.admin_order_status_v2);
}

function isPaid(order: LooseLiveOrder) {
  const status = orderStatusText(order);
  return /paid|입금확인|자동입금확인|수동입금확인|카드결제완료|결제완료/i.test(status);
}

function isManualNeeded(order: LooseLiveOrder) {
  const status = orderStatusText(order);
  return /manual_match_needed|입금확인 필요|수동확인/i.test(status);
}

function isUnpaid(order: LooseLiveOrder) {
  const status = orderStatusText(order);
  return /unpaid|미입금|카드 미결제|card_unpaid/i.test(status) || isManualNeeded(order);
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

function statusBadge(customer: CustomerSummary) {
  if (customer.blocked) {
    return <span className="rounded-lg bg-red-100 px-2 py-1 text-xs font-black text-red-700">{CUSTOMER_TERMS.blocked}</span>;
  }

  if (customer.manualNeededCount > 0 || customer.unpaidCount > 0) {
    return <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-black text-amber-700">관리필요</span>;
  }

  return <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">{CUSTOMER_TERMS.normal}</span>;
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-[12px] font-black text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-black tracking-[-0.05em] text-slate-950">{value}</div>
      <div className="mt-2 text-[12px] font-bold text-slate-400">{sub}</div>
    </div>
  );
}

function CustomerDetailDrawer({
  customer,
  page,
  setPage,
  onClose,
}: {
  customer: CustomerSummary | null;
  page: number;
  setPage: (value: number) => void;
  onClose: () => void;
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
            <div className="text-[11px] font-black tracking-[0.18em] text-blue-500">CUSTOMER DETAIL</div>
            <h2 className="mt-1 text-3xl font-black tracking-[-0.05em] text-slate-950">{customer.nickname}</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {customer.name} · {formatPhone(customer.phone)}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600 hover:bg-slate-50"
          >
            닫기
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryCard label={CUSTOMER_TERMS.customerStatus} value={customer.blocked ? CUSTOMER_TERMS.blocked : CUSTOMER_TERMS.normal} sub={customer.blockReason || "차단 정보 없음"} />
          <SummaryCard label={CUSTOMER_TERMS.orderCount} value={`${customer.orderCount.toLocaleString("ko-KR")}건`} sub="현재 주문 데이터 기준" />
          <SummaryCard label={CUSTOMER_TERMS.totalOrderAmount} value={money(customer.totalAmount)} sub="취소/정산 제외 전 표시합" />
          <SummaryCard label={CUSTOMER_TERMS.latestOrder} value={customer.latestOrderAt || "-"} sub="가장 최근 주문" />
        </div>

        <section className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-black text-slate-950">{CUSTOMER_TERMS.orderHistory}</h3>
              <p className="mt-1 text-xs font-bold text-slate-400">닉네임 클릭 상세에서 고객의 전체 주문을 페이지별로 확인합니다.</p>
            </div>

            <div className="text-xs font-black text-slate-500">
              {safePage} / {totalPages}
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead className="bg-slate-50 text-xs font-black text-slate-500">
                <tr>
                  <th className="w-[118px] px-3 py-3 text-left">주문일시</th>
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

        <section className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-base font-black text-slate-950">{CUSTOMER_TERMS.customerIssue}</h3>
            <p className="mt-2 text-sm font-bold leading-relaxed text-slate-500">
              미해결 이슈 연결은 오른쪽 고객이슈 패널에서 먼저 확인합니다. 고객별 자동 연결은 2차에서 customer_id/전화번호 기준으로 붙입니다.
            </p>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-base font-black text-slate-950">차단 관리</h3>
            <p className="mt-2 text-sm font-bold leading-relaxed text-slate-500">
              현재는 조회 전용입니다. 차단/차단해제 저장은 DB 필드와 이력 테이블 확인 후 연결합니다.
            </p>
          </div>
        </section>
      </aside>
    </div>
  );
}

export default function AdminLiveCustomersPanel({ orders }: Props) {
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [page, setPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);
  const [detailPage, setDetailPage] = useState(1);

  const customers = useMemo<CustomerSummary[]>(() => {
    const map = new Map<string, CustomerSummary>();

    (orders as LooseLiveOrder[]).forEach((order) => {
      const key = buildCustomerKey(order);
      const current = map.get(key);
      const amount = orderAmount(order);
      const latestOrderAt = orderCreatedLabel(order);

      if (!current) {
        map.set(key, {
          key,
          nickname: orderNickname(order),
          name: orderName(order),
          phone: orderPhone(order),
          orderCount: 1,
          totalAmount: amount,
          paidCount: isPaid(order) ? 1 : 0,
          unpaidCount: isUnpaid(order) ? 1 : 0,
          manualNeededCount: isManualNeeded(order) ? 1 : 0,
          latestOrderAt,
          blocked: isBlockedOrder(order),
          blockReason: blockReason(order),
          orders: [order],
        });

        return;
      }

      current.orderCount += 1;
      current.totalAmount += amount;
      current.paidCount += isPaid(order) ? 1 : 0;
      current.unpaidCount += isUnpaid(order) ? 1 : 0;
      current.manualNeededCount += isManualNeeded(order) ? 1 : 0;
      current.blocked = current.blocked || isBlockedOrder(order);
      current.blockReason = current.blockReason || blockReason(order);
      current.orders.push(order);

      if (!current.latestOrderAt || latestOrderAt > current.latestOrderAt) {
        current.latestOrderAt = latestOrderAt;
      }
    });

    return Array.from(map.values());
  }, [orders]);

  const filteredCustomers = useMemo(() => {
    const searchText = keyword.replace(/\s+/g, "").toLowerCase();

    return customers
      .filter((customer) => {
        const haystack = [
          customer.nickname,
          customer.name,
          customer.phone,
          formatPhone(customer.phone),
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
  const attentionCustomers = customers.filter((customer) => customer.manualNeededCount > 0 || customer.unpaidCount > 0);

  const openDetail = (customer: CustomerSummary) => {
    setSelectedCustomer(customer);
    setDetailPage(1);
  };

  const blockActionAlert = (customer: CustomerSummary) => {
    alert(
      [
        `${customer.nickname} 고객의 ${customer.blocked ? "차단해제" : "차단"} 저장은 2차에서 연결합니다.`,
        "",
        "이번 1차 작업은 고객관리 화면 구조와 상세 확인 흐름을 먼저 안정화합니다.",
        "차단 저장은 고객 DB 필드와 차단이력 저장 구조 확인 후 진행해야 합니다.",
      ].join("\n")
    );
  };

  return (
    <section className="space-y-5">
      <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-black tracking-[0.18em] text-blue-500">CUSTOMER MANAGEMENT</div>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.05em] text-slate-950">{CUSTOMER_TERMS.pageTitle}</h1>
            <p className="mt-2 text-sm font-bold text-slate-500">
              {CUSTOMER_TERMS.pageSubTitle} · 1차는 조회/상세 확인 전용입니다.
            </p>
          </div>

          <div className="rounded-full bg-blue-50 px-4 py-2 text-xs font-black text-blue-700">
            읽기전용 연결
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <SummaryCard label="전체 고객" value={`${customers.length.toLocaleString("ko-KR")}명`} sub="현재 주문 데이터 기준" />
          <SummaryCard label="정상 고객" value={`${normalCustomers.length.toLocaleString("ko-KR")}명`} sub="차단 제외" />
          <SummaryCard label="차단 고객" value={`${blockedCustomers.length.toLocaleString("ko-KR")}명`} sub="차단 표시 기준" />
          <SummaryCard label="관리필요 고객" value={`${attentionCustomers.length.toLocaleString("ko-KR")}명`} sub="미입금/입금확인 필요" />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(760px,1fr)_390px]">
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

          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead className="bg-slate-50 text-xs font-black text-slate-500">
                <tr>
                  <th className="w-[94px] px-3 py-3 text-left">{CUSTOMER_TERMS.customerStatus}</th>
                  <th className="w-[150px] px-3 py-3 text-left">닉네임</th>
                  <th className="w-[112px] px-3 py-3 text-left">이름</th>
                  <th className="w-[150px] px-3 py-3 text-left">전화번호</th>
                  <th className="w-[82px] px-3 py-3 text-right">주문수</th>
                  <th className="w-[132px] px-3 py-3 text-right">{CUSTOMER_TERMS.totalOrderAmount}</th>
                  <th className="w-[124px] px-3 py-3 text-left">{CUSTOMER_TERMS.latestOrder}</th>
                  <th className="w-[112px] px-3 py-3 text-center">{CUSTOMER_TERMS.work}</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {visibleCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-sm font-black text-slate-400">
                      표시할 고객이 없습니다.
                    </td>
                  </tr>
                ) : (
                  visibleCustomers.map((customer) => (
                    <tr key={customer.key} className="hover:bg-slate-50">
                      <td className="px-3 py-3">{statusBadge(customer)}</td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => openDetail(customer)}
                          className="truncate font-black text-blue-700 underline-offset-2 hover:underline"
                          title="고객 상세 보기"
                        >
                          {customer.nickname}
                        </button>
                      </td>
                      <td className="truncate px-3 py-3 font-bold text-slate-700">{customer.name}</td>
                      <td className="px-3 py-3 font-bold text-slate-600">{formatPhone(customer.phone)}</td>
                      <td className="px-3 py-3 text-right font-black text-slate-800">{customer.orderCount.toLocaleString("ko-KR")}건</td>
                      <td className="px-3 py-3 text-right font-black text-slate-950">{money(customer.totalAmount)}</td>
                      <td className="px-3 py-3 font-bold text-slate-600">{customer.latestOrderAt || "-"}</td>
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => blockActionAlert(customer)}
                          className={`rounded-xl px-3 py-1.5 text-xs font-black ${
                            customer.blocked
                              ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                              : "bg-red-50 text-red-700 hover:bg-red-100"
                          }`}
                        >
                          {customer.blocked ? CUSTOMER_TERMS.unblock : CUSTOMER_TERMS.block}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
              <div className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-black text-white">
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

        <AdminLiveCustomerIssueRail />
      </div>

      <CustomerDetailDrawer
        customer={selectedCustomer}
        page={detailPage}
        setPage={setDetailPage}
        onClose={() => setSelectedCustomer(null)}
      />
    </section>
  );
}
