"use client";

import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AdminTab = "today" | "orders" | "customers" | "deposits" | "settlement" | "settings";

type OrderRow = {
  id: number;
  created_at: string | null;
  order_group_id: string | null;
  order_lookup_code: string | null;
  broadcast_id: string | null;
  broadcast_name: string | null;
  youtube_nickname: string | null;
  customer_name: string | null;
  phone: string | null;
  customer_phone: string | null;
  zipcode: string | null;
  address: string | null;
  detail_address: string | null;
  request_memo: string | null;
  memo: string | null;
  special_note: string | null;
  admin_memo: string | null;
  product_name: string | null;
  color: string | null;
  size: string | null;
  qty: number | null;
  product_price: number | null;
  shipping_fee: number | null;
  total_price: number | null;
  adjusted_product_price: number | null;
  adjusted_shipping_fee: number | null;
  adjusted_total_price: number | null;
  final_amount: number | null;
  vat_amount: number | null;
  admin_price_memo: string | null;
  customer_card_extra_rate_applied: number | null;
  actual_card_fee_rate_applied: number | null;
  refund_amount: number | null;
  payment_method: string | null;
  admin_order_status_v2: string | null;
  order_manage_status: string | null;
  tracking_number: string | null;
  tracking_company: string | null;
  customer_id: number | null;
  is_deleted: boolean | null;
};

type CustomerRow = {
  id: number;
  youtube_nickname: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  detail_address: string | null;
  customer_memo: string | null;
  customer_tags: string[] | null;
  is_blocked: string | boolean | null;
  block_reason: string | null;
  last_order_at: string | null;
  created_at: string | null;
};

type DepositRow = {
  id: number;
  depositor_name: string;
  amount: number;
  deposited_time: string | null;
  match_order_group_id: string | null;
  match_customer_id: number | null;
  match_status: string;
  confirmed_at: string | null;
  confirmed_note: string | null;
  created_at: string | null;
};

type BroadcastRow = {
  id: string;
  public_title: string | null;
  admin_subtitle: string | null;
  started_at: string | null;
  created_at: string | null;
};

type SettingRow = { key: string; value: string };

type OrderGroup = {
  groupId: string;
  first: OrderRow;
  rows: OrderRow[];
  totalAmount: number;
  totalQty: number;
};

const TABS: Array<{ key: AdminTab; label: string; desc: string }> = [
  { key: "today", label: "오늘할일", desc: "주문·입금·출고 요약" },
  { key: "orders", label: "주문관리", desc: "상태·금액·상세 관리" },
  { key: "customers", label: "고객관리", desc: "메모·차단·특이사항" },
  { key: "deposits", label: "입금매칭", desc: "뱅크다 입금 확인" },
  { key: "settlement", label: "매출정산", desc: "매출·수수료·차액" },
  { key: "settings", label: "설정", desc: "배송비·수수료" },
];

const ORDER_STATUSES = ["미설정", "입금확인", "출고대기", "출고완료", "킵", "픽업예정", "주문취소"];
const PAYMENT_FILTERS = ["전체", "무통장입금", "카드결제"];
const PAID_STATUSES = ["입금확인", "출고대기", "출고완료", "킵", "픽업예정"];
const PAGE_SIZE = 15;

const money = (value: unknown) => `${Number(value || 0).toLocaleString()}원`;
const moneyNumber = (value: unknown) => Number(String(value ?? "0").replace(/[^0-9.-]/g, "")) || 0;
const moneyInput = (value: unknown) => String(value ?? "").replace(/[^0-9]/g, "");
const orderBaseAmount = (row: OrderRow) => Number(row.final_amount ?? row.adjusted_total_price ?? row.total_price ?? 0);

const readSettingNumber = (settings: SettingRow[], key: string, fallback: number) => {
  const found = settings.find((item) => item.key === key);
  const parsed = Number(found?.value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const selectClass = (status?: string | null) => {
  if (status === "입금확인") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (status === "출고대기") return "border-amber-300 bg-amber-50 text-amber-800";
  if (status === "출고완료") return "border-blue-300 bg-blue-50 text-blue-800";
  if (status === "킵") return "border-violet-300 bg-violet-50 text-violet-800";
  if (status === "픽업예정") return "border-cyan-300 bg-cyan-50 text-cyan-800";
  if (status === "주문취소") return "border-red-300 bg-red-50 text-red-800";
  return "border-neutral-300 bg-white text-neutral-700";
};

export default function AdminV2Page() {
  const [activeTab, setActiveTab] = useState<AdminTab>("orders");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([]);
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [pendingKeyword, setPendingKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [paymentFilter, setPaymentFilter] = useState("전체");
  const [dateFilter, setDateFilter] = useState("");
  const [openedOrderGroupIds, setOpenedOrderGroupIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  const loadData = async () => {
    setLoading(true);

    const [ordersResult, customersResult, depositsResult, broadcastsResult, settingsResult] = await Promise.all([
      supabase.from("orders").select("*").neq("is_deleted", true).order("created_at", { ascending: false }).limit(500),
      supabase.from("customers").select("*").order("last_order_at", { ascending: false, nullsFirst: false }).limit(500),
      supabase.from("deposits").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("broadcasts").select("*").order("started_at", { ascending: false }).limit(120),
      supabase.from("settings").select("key,value").order("key"),
    ]);

    if (ordersResult.error) alert("주문 불러오기 실패\n\n" + ordersResult.error.message);
    else setOrders((ordersResult.data || []) as OrderRow[]);

    if (customersResult.error) alert("고객 불러오기 실패\n\n" + customersResult.error.message);
    else setCustomers((customersResult.data || []) as CustomerRow[]);

    setDeposits((depositsResult.data || []) as DepositRow[]);
    setBroadcasts((broadcastsResult.data || []) as BroadcastRow[]);
    setSettings((settingsResult.data || []) as SettingRow[]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [keyword, statusFilter, paymentFilter, dateFilter, activeTab]);

  const orderGroups = useMemo<OrderGroup[]>(() => {
    const map = new Map<string, OrderRow[]>();

    orders.forEach((order) => {
      const groupId = String(order.order_group_id || order.order_lookup_code || order.id || "");
      if (!map.has(groupId)) map.set(groupId, []);
      map.get(groupId)?.push(order);
    });

    return Array.from(map.entries()).map(([groupId, rows]) => ({
      groupId,
      first: rows[0],
      rows,
      totalAmount: rows.reduce((sum, row) => sum + Number(row.final_amount ?? row.adjusted_total_price ?? row.total_price ?? 0), 0),
      totalQty: rows.reduce((sum, row) => sum + Number(row.qty || 0), 0),
    }));
  }, [orders]);

  const dateOptions = useMemo(() => {
    const map = new Map<string, string>();

    broadcasts.forEach((broadcast) => {
      const sourceDate = broadcast.started_at || broadcast.created_at;
      const key = toDateKey(sourceDate);
      if (!key) return;

      const title = broadcast.public_title || broadcast.admin_subtitle || "방송제목 없음";
      map.set(key, `${formatDateLabel(sourceDate)} ${title}`);
    });

    orderGroups.forEach((group) => {
      const key = toDateKey(group.first.created_at);
      if (!key || map.has(key)) return;
      map.set(key, `${formatDateLabel(group.first.created_at)} 방송없음`);
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([value, label]) => ({ value, label }));
  }, [broadcasts, orderGroups]);

  useEffect(() => {
    if (!dateFilter && dateOptions.length > 0) {
      setDateFilter(dateOptions[0].value);
    }
  }, [dateOptions, dateFilter]);

  const filteredOrderGroups = useMemo(() => {
    const word = keyword.trim().toLowerCase();

    return orderGroups.filter((group) => {
      const status = group.first.admin_order_status_v2 || "미설정";
      const payment = group.first.payment_method || "미설정";
      const matchStatus = statusFilter === "전체" || status === statusFilter;
      const matchPayment = paymentFilter === "전체" || payment === paymentFilter;
      const matchDate = !dateFilter || toDateKey(group.first.created_at) === dateFilter;

      const target = [
        group.groupId,
        group.first.order_lookup_code,
        group.first.youtube_nickname,
        group.first.customer_name,
        group.first.phone,
        group.first.customer_phone,
        group.first.payment_method,
        ...group.rows.map((row) => `${row.product_name} ${row.color} ${row.size}`),
      ].filter(Boolean).join(" ").toLowerCase();

      return matchStatus && matchPayment && matchDate && (!word || target.includes(word));
    });
  }, [orderGroups, keyword, statusFilter, paymentFilter, dateFilter]);

  const settingsSummary = useMemo(() => ({
    customerCardRate: readSettingNumber(settings, "customer_card_extra_rate", 10),
    actualCardRate: readSettingNumber(settings, "actual_card_fee_rate", 7),
    defaultShippingFee: readSettingNumber(settings, "default_shipping_fee", 4000),
    remoteAreaShippingFee: readSettingNumber(settings, "remote_area_shipping_fee", 6000),
  }), [settings]);

  const summaryCards = useMemo(() => {
    const notCanceled = filteredOrderGroups.filter((group) => (group.first.admin_order_status_v2 || "미설정") !== "주문취소");

    const totalOrderProductQty = filteredOrderGroups.reduce((sum, group) => sum + group.totalQty, 0);
    const totalOrderCount = filteredOrderGroups.length;
    const totalOrderAmount = notCanceled.reduce((sum, group) => sum + group.totalAmount, 0);

    const bankPaid = filteredOrderGroups.filter((group) => group.first.payment_method === "무통장입금" && PAID_STATUSES.includes(group.first.admin_order_status_v2 || "")).length;
    const bankUnpaid = filteredOrderGroups.filter((group) => group.first.payment_method === "무통장입금" && (group.first.admin_order_status_v2 || "미설정") === "미설정").length;
    const cardPaid = filteredOrderGroups.filter((group) => group.first.payment_method === "카드결제" && PAID_STATUSES.includes(group.first.admin_order_status_v2 || "")).length;
    const cardUnpaid = filteredOrderGroups.filter((group) => group.first.payment_method === "카드결제" && (group.first.admin_order_status_v2 || "미설정") === "미설정").length;
    const canceledAmount = filteredOrderGroups
      .filter((group) => (group.first.admin_order_status_v2 || "미설정") === "주문취소")
      .reduce((sum, group) => sum + group.totalAmount, 0);

    return {
      totalOrderProductQty,
      totalOrderCount,
      totalOrderAmount,
      bankPaid,
      bankUnpaid,
      cardPaid,
      cardUnpaid,
      canceledAmount,
    };
  }, [filteredOrderGroups]);

  const sideSummary = useMemo(() => {
    const buyerMap = new Map<string, { name: string; amount: number; count: number }>();
    const productMap = new Map<string, { name: string; qty: number; amount: number }>();

    filteredOrderGroups.forEach((group) => {
      if ((group.first.admin_order_status_v2 || "미설정") === "주문취소") return;

      const nickname = group.first.youtube_nickname || group.first.customer_name || "이름없음";
      const currentBuyer = buyerMap.get(nickname) || { name: nickname, amount: 0, count: 0 };
      currentBuyer.amount += group.totalAmount;
      currentBuyer.count += 1;
      buyerMap.set(nickname, currentBuyer);

      group.rows.forEach((row) => {
        const productName = row.product_name || "상품명 없음";
        const currentProduct = productMap.get(productName) || { name: productName, qty: 0, amount: 0 };
        currentProduct.qty += Number(row.qty || 0);
        currentProduct.amount += Number(row.final_amount ?? row.adjusted_total_price ?? row.total_price ?? 0);
        productMap.set(productName, currentProduct);
      });
    });

    return {
      buyerRanking: Array.from(buyerMap.values()).sort((a, b) => b.amount - a.amount).slice(0, 7),
      productRanking: Array.from(productMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 7),
    };
  }, [filteredOrderGroups]);

  const totalPages = Math.max(1, Math.ceil(filteredOrderGroups.length / PAGE_SIZE));
  const pagedGroups = filteredOrderGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleOrderDetail = (groupId: string) => {
    setOpenedOrderGroupIds((prev) => prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]);
  };

  const updateOrderStatus = async (group: OrderGroup, nextStatus: string) => {
    const ids = group.rows.map((row) => row.id).filter(Boolean);
    setOrders((prev) => prev.map((order) => ids.includes(order.id) ? { ...order, admin_order_status_v2: nextStatus, order_manage_status: nextStatus } : order));

    const { error } = await supabase
      .from("orders")
      .update({ admin_order_status_v2: nextStatus, order_manage_status: nextStatus })
      .in("id", ids);

    if (error) {
      alert("상태 변경 실패\n\n" + error.message);
      await loadData();
    }
  };

  const updateOrderFinalAmount = async (row: OrderRow, nextAmount: number, reason: string) => {
    const cleanReason = reason.trim();
    const beforeAmount = orderBaseAmount(row);

    if (!Number.isFinite(nextAmount) || nextAmount < 0) {
      alert("최종정산금액을 정확히 입력해주세요.");
      return;
    }

    if (!cleanReason || cleanReason.length < 2) {
      alert("금액 수정 사유를 2글자 이상 입력해주세요.\n예: 부분환불, 금액오입력, 배송비조정");
      return;
    }

    if (beforeAmount === nextAmount) {
      alert("현재 기준금액과 동일합니다. 수정할 금액을 다시 확인해주세요.");
      return;
    }

    const ok = confirm(
      `최종정산금액을 수정할까요?

이전: ${beforeAmount.toLocaleString()}원
변경: ${nextAmount.toLocaleString()}원
사유: ${cleanReason}

수정이력에 기록됩니다.`
    );

    if (!ok) return;

    const { data, error } = await supabase.rpc("update_order_final_amount_with_log", {
      p_order_id: row.id,
      p_final_amount: nextAmount,
      p_reason: cleanReason,
      p_editor: "admin-v2",
    });

    if (error) {
      alert(
        "금액 수정 실패\n\n" +
          error.message +
          "\n\n먼저 Supabase SQL Editor에서 money_log_sql_setup.sql을 실행했는지 확인해주세요."
      );
      return;
    }

    const updatedRow = Array.isArray(data) ? data[0] : data;

    setOrders((prev) =>
      prev.map((order) =>
        order.id === row.id
          ? {
              ...order,
              final_amount: Number(updatedRow?.final_amount ?? nextAmount),
              admin_price_memo: String(updatedRow?.admin_price_memo ?? cleanReason),
            }
          : order
      )
    );

    alert("최종정산금액 수정 및 이력 저장이 완료되었습니다.");
  };

  const saveSetting = async (key: string, value: string) => {
    const { data, error: selectError } = await supabase.from("settings").select("id").eq("key", key).limit(1);
    if (selectError) return alert("설정 확인 실패\n\n" + selectError.message);

    const existing = data?.[0];
    const result = existing?.id
      ? await supabase.from("settings").update({ value }).eq("id", existing.id)
      : await supabase.from("settings").insert({ key, value });

    if (result.error) return alert("설정 저장 실패\n\n" + result.error.message);
    await loadData();
  };

  return (
    <main className="min-h-screen bg-neutral-100 text-neutral-950">
      <div className="flex min-h-screen">
        <aside className="hidden w-56 shrink-0 bg-neutral-950 p-4 text-white md:flex md:flex-col">
          <div className="mb-5">
            <div className="text-[10px] font-black tracking-[0.24em] text-neutral-500">RURU ADMIN V2</div>
            <div className="mt-2 text-xl font-black">루루동이 운영센터</div>
            <div className="mt-1 text-xs font-semibold text-neutral-400">실무형 주문 작업판</div>
          </div>

          <nav className="grid gap-1.5">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-xl px-3 py-2 text-left transition ${
                  activeTab === tab.key ? "bg-white text-neutral-950" : "text-neutral-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <div className="text-[15px] font-black">{tab.label}</div>
                <div className="text-[10px] font-semibold text-neutral-500">{tab.desc}</div>
              </button>
            ))}
          </nav>

          <div className="mt-auto grid gap-2 text-xs font-bold">
            <Link href="/admin" className="rounded-xl bg-white/10 p-2 text-neutral-300">기존 관리자</Link>
            <Link href="/" className="rounded-xl bg-white/10 p-2 text-neutral-300">고객페이지</Link>
          </div>
        </aside>

        <section className="min-w-0 flex-1 p-3">
          <div className="mb-3 flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-3 py-2">
            <div>
              <div className="text-[10px] font-black tracking-widest text-neutral-400">RURU ADMIN V2</div>
              <div className="text-lg font-black">{TABS.find((tab) => tab.key === activeTab)?.label}</div>
            </div>
            <button type="button" onClick={loadData} className="rounded-lg bg-neutral-950 px-3 py-2 text-xs font-black text-white">새로고침</button>
          </div>

          <div className="mb-3 grid grid-cols-3 gap-1.5 md:hidden">
            {TABS.map((tab) => (
              <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`rounded-lg px-2 py-2 text-xs font-black ${activeTab === tab.key ? "bg-neutral-950 text-white" : "bg-white text-neutral-700"}`}>
                {tab.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center font-black text-neutral-500">불러오는 중...</div>
          ) : (
            <>
              <SummaryCards summaryCards={summaryCards} />

              {activeTab === "customers" ? (
                <CustomerPanel customers={customers} />
              ) : activeTab === "deposits" ? (
                <DepositPanel deposits={deposits} />
              ) : activeTab === "settlement" ? (
                <SettlementPanel
                  orderGroups={filteredOrderGroups}
                  deposits={deposits}
                  actualCardRate={settingsSummary.actualCardRate}
                  dateLabel={dateOptions.find((item) => item.value === dateFilter)?.label || "최근 기준"}
                  buyerRanking={sideSummary.buyerRanking}
                  productRanking={sideSummary.productRanking}
                />
              ) : activeTab === "settings" ? (
                <SettingsPanel settingsSummary={settingsSummary} saveSetting={saveSetting} />
              ) : (
                <>
                  <FilterBar
                    pendingKeyword={pendingKeyword}
                    setPendingKeyword={setPendingKeyword}
                    onSearch={() => setKeyword(pendingKeyword)}
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    paymentFilter={paymentFilter}
                    setPaymentFilter={setPaymentFilter}
                    dateFilter={dateFilter}
                    setDateFilter={setDateFilter}
                    dateOptions={dateOptions}
                  />

                  <div className="grid gap-3 xl:grid-cols-[minmax(780px,1fr)_340px]">
                    <div className="min-w-0">
                      <OrderWorkTable groups={pagedGroups} openedOrderGroupIds={openedOrderGroupIds} onToggle={toggleOrderDetail} onStatusChange={updateOrderStatus} onFinalAmountChange={updateOrderFinalAmount} />
                      <Pagination page={page} totalPages={totalPages} setPage={setPage} totalCount={filteredOrderGroups.length} />
                    </div>
                    <OperationSummary buyerRanking={sideSummary.buyerRanking} productRanking={sideSummary.productRanking} onMore={() => setActiveTab("settlement")} />
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryCards({
  summaryCards,
}: {
  summaryCards: {
    totalOrderProductQty: number;
    totalOrderCount: number;
    totalOrderAmount: number;
    bankPaid: number;
    bankUnpaid: number;
    cardPaid: number;
    cardUnpaid: number;
    canceledAmount: number;
  };
}) {
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4 xl:grid-cols-8">
      <SummaryCard label="총 주문 상품개수" value={`${summaryCards.totalOrderProductQty}개`} />
      <SummaryCard label="총 주문서 개수" value={`${summaryCards.totalOrderCount}건`} />
      <SummaryCard label="📋 주문서 총 합계" value={money(summaryCards.totalOrderAmount)} />
      <SummaryCard label="무통장 결제완료" value={`${summaryCards.bankPaid}명`} />
      <SummaryCard label="무통장 미입금" value={`${summaryCards.bankUnpaid}명`} strong />
      <SummaryCard label="카드 결제완료" value={`${summaryCards.cardPaid}명`} />
      <SummaryCard label="카드 미결제" value={`${summaryCards.cardUnpaid}명`} />
      <SummaryCard label="취소금액" value={money(summaryCards.canceledAmount)} />
    </div>
  );
}

function SummaryCard({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white p-3 text-center ${strong ? "border-neutral-950" : "border-neutral-200"}`}>
      <div className="text-[12px] font-black text-neutral-500">{label}</div>
      <div className="mt-1 text-[16px] font-black tracking-tight text-neutral-950">{value}</div>
    </div>
  );
}

function FilterBar({
  pendingKeyword,
  setPendingKeyword,
  onSearch,
  statusFilter,
  setStatusFilter,
  paymentFilter,
  setPaymentFilter,
  dateFilter,
  setDateFilter,
  dateOptions,
}: {
  pendingKeyword: string;
  setPendingKeyword: (value: string) => void;
  onSearch: () => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  paymentFilter: string;
  setPaymentFilter: (value: string) => void;
  dateFilter: string;
  setDateFilter: (value: string) => void;
  dateOptions: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="mb-2 grid gap-2 rounded-xl border border-neutral-200 bg-white p-2 lg:grid-cols-[250px_138px_130px_minmax(220px,360px)_82px]">
      <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="h-10 rounded-lg border border-neutral-200 px-3 text-[14px] font-black outline-none">
        {dateOptions.length === 0 ? <option value="">방송/날짜 없음</option> : null}
        {dateOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-lg border border-neutral-200 px-3 text-[14px] font-black outline-none">
        <option value="전체">전체상태</option>
        {ORDER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
      </select>
      <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} className="h-10 rounded-lg border border-neutral-200 px-3 text-[14px] font-black outline-none">
        {PAYMENT_FILTERS.map((payment) => <option key={payment} value={payment}>{payment}</option>)}
      </select>
      <input
        value={pendingKeyword}
        onChange={(event) => setPendingKeyword(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSearch();
        }}
        placeholder="검색"
        className="h-10 rounded-lg border border-neutral-200 px-3 text-[15px] font-bold outline-none focus:border-neutral-950"
      />
      <button type="button" onClick={onSearch} className="h-10 rounded-lg bg-neutral-950 px-3 text-[14px] font-black text-white">
        검색
      </button>
    </div>
  );
}

function OperationSummary({
  buyerRanking,
  productRanking,
  onMore,
}: {
  buyerRanking: Array<{ name: string; amount: number; count: number }>;
  productRanking: Array<{ name: string; qty: number; amount: number }>;
  onMore: () => void;
}) {
  return (
    <aside className="grid content-start gap-2">
      <SidePanel title="👑 최대구매자 랭킹" onMore={onMore}>
        <RankingList items={buyerRanking.map((item) => ({ title: item.name, sub: `${item.count}건`, right: money(item.amount) }))} />
      </SidePanel>

      <SidePanel title="👍 많이 팔린 상품" onMore={onMore}>
        <RankingList items={productRanking.map((item) => ({ title: item.name, sub: "", right: `${item.qty}개` }))} />
      </SidePanel>
    </aside>
  );
}

function toDateKey(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateLabel(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const day = dayNames[date.getDay()];
  return `${yyyy}.${mm}.${dd}(${day})`;
}

function shortOrderCode(group: OrderGroup) {
  return String(group.first.order_lookup_code || group.groupId || group.first.id || "-").replace("RURU-", "");
}

function buildItemSummary(group: OrderGroup) {
  const firstItem = group.rows[0];
  const firstText = [
    firstItem.product_name,
    firstItem.color && firstItem.color !== "없음" ? firstItem.color : "",
    firstItem.size && firstItem.size !== "없음" ? firstItem.size : "",
  ].filter(Boolean).join(" ");

  const firstQty = Number(firstItem.qty || 1);
  const firstQtyText = firstQty > 0 ? ` x${firstQty}` : "";
  if (group.rows.length <= 1) return `${firstText || "상품명 없음"}${firstQtyText}`;
  return `${firstText || "상품명 없음"}${firstQtyText} 외 ${group.rows.length - 1}개`;
}

function OrderWorkTable({
  groups,
  openedOrderGroupIds,
  onToggle,
  onStatusChange,
  onFinalAmountChange,
}: {
  groups: OrderGroup[];
  openedOrderGroupIds: string[];
  onToggle: (groupId: string) => void;
  onStatusChange: (group: OrderGroup, status: string) => void;
  onFinalAmountChange: (row: OrderRow, nextAmount: number, reason: string) => Promise<void>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="hidden grid-cols-[84px_124px_128px_minmax(250px,1fr)_82px_108px_106px_90px] bg-neutral-950 px-3 py-2 text-[13px] font-black text-white lg:grid">
        <div>주문번호</div>
        <div>작성일</div>
        <div>고객</div>
        <div>주문내역</div>
        <div>결제</div>
        <div className="text-right">금액</div>
        <div className="text-center">상태</div>
        <div className="text-center">상세</div>
      </div>

      {groups.map((group) => {
        const isOpen = openedOrderGroupIds.includes(group.groupId);
        const status = group.first.admin_order_status_v2 || "미설정";

        return (
          <div key={group.groupId} className="border-t border-neutral-100 first:border-t-0">
            <div className="grid gap-2 px-3 py-2.5 lg:grid-cols-[84px_124px_128px_minmax(250px,1fr)_82px_108px_106px_90px] lg:items-center">
              <div className="text-[13px] font-black text-neutral-500">{shortOrderCode(group)}</div>
              <div className="text-[13px] font-bold text-neutral-500">{formatDateLabel(group.first.created_at)}</div>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-black">{group.first.youtube_nickname || "-"}</div>
                <div className="truncate text-[12px] font-bold text-neutral-500">{group.first.customer_name || "-"}</div>
              </div>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-bold text-neutral-800">{buildItemSummary(group)}</div>
              </div>
              <div className="text-[13px] font-black text-neutral-600">{group.first.payment_method || "-"}</div>
              <div className="text-left lg:text-right">
                <div className="text-[15px] font-black">{money(group.totalAmount)}</div>
              </div>
              <select value={status} onChange={(event) => onStatusChange(group, event.target.value)} className={`h-8 w-full rounded-lg border px-2 text-center text-xs font-black outline-none ${selectClass(status)}`}>
                {ORDER_STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <button type="button" onClick={() => onToggle(group.groupId)} className="h-8 rounded-lg border border-neutral-300 bg-white px-2 text-xs font-black text-neutral-700 hover:bg-neutral-50">
                {isOpen ? "상세닫기" : "상세보기"}
              </button>
            </div>

            {isOpen ? <OrderDetailBlock group={group} onFinalAmountChange={onFinalAmountChange} /> : null}
          </div>
        );
      })}
    </div>
  );
}

function OrderDetailBlock({
  group,
  onFinalAmountChange,
}: {
  group: OrderGroup;
  onFinalAmountChange: (row: OrderRow, nextAmount: number, reason: string) => Promise<void>;
}) {
  const first = group.first;
  const address = [first.address, first.detail_address].filter(Boolean).join(" ");
  const memo = [first.request_memo, first.memo, first.special_note, first.admin_memo].filter(Boolean).join(" / ");

  return (
    <div className="border-t border-neutral-100 bg-neutral-50 px-3 py-3">
      <div className="grid gap-2 md:grid-cols-[1.1fr_1.4fr_1fr]">
        <DetailBox title="고객정보">
          <div>전화번호: {first.customer_phone || first.phone || "-"}</div>
          <div>주소: {address || "-"}</div>
        </DetailBox>
        <DetailBox title="상세상품">
          {group.rows.map((row) => (
            <div key={row.id}>
              {[row.product_name, row.color, row.size].filter(Boolean).join(" / ")} x{row.qty || 1} · 현재 최종 {money(orderBaseAmount(row))}
            </div>
          ))}
        </DetailBox>
        <DetailBox title="관리정보">
          <div>송장: {first.tracking_company || "로젠"} {first.tracking_number || "미등록"}</div>
          <div>메모: {memo || "-"}</div>
        </DetailBox>
      </div>

      <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[15px] font-black">💰 최종정산금액 수정</div>
            <div className="mt-0.5 text-[12px] font-bold text-neutral-500">
              원본 금액은 건드리지 않고 final_amount만 저장합니다. 수정 사유는 필수입니다.
            </div>
          </div>
          <div className="rounded-lg bg-red-50 px-2 py-1 text-[11px] font-black text-red-700">
            돈 로직: 사유 없이 수정 금지
          </div>
        </div>

        <div className="grid gap-2">
          {group.rows.map((row) => (
            <FinalAmountEditor key={row.id} row={row} onSave={onFinalAmountChange} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FinalAmountEditor({
  row,
  onSave,
}: {
  row: OrderRow;
  onSave: (row: OrderRow, nextAmount: number, reason: string) => Promise<void>;
}) {
  const currentAmount = orderBaseAmount(row);
  const [amountText, setAmountText] = useState(String(currentAmount));
  const [reason, setReason] = useState(row.admin_price_memo || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAmountText(String(orderBaseAmount(row)));
    setReason(row.admin_price_memo || "");
  }, [row.final_amount, row.adjusted_total_price, row.total_price, row.admin_price_memo]);

  const save = async () => {
    const nextAmount = moneyNumber(amountText);
    setSaving(true);
    try {
      await onSave(row, nextAmount, reason);
    } finally {
      setSaving(false);
    }
  };

  const hasFinalOverride = row.final_amount !== null && row.final_amount !== undefined;

  return (
    <div className="grid gap-2 rounded-xl border border-neutral-100 bg-neutral-50 p-2 lg:grid-cols-[minmax(220px,1fr)_130px_150px_minmax(200px,1fr)_82px] lg:items-center">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-black text-neutral-800">
          {[row.product_name, row.color, row.size].filter(Boolean).join(" / ") || "상품명 없음"}
        </div>
        <div className="mt-0.5 text-[11px] font-bold text-neutral-500">
          원본 {money(row.total_price)} · 기준계산 {money(row.adjusted_total_price ?? row.total_price)} · 최종정산 {hasFinalOverride ? `${money(row.final_amount)} 직접수정됨` : "미수정"}
        </div>
      </div>
      <div className="text-[12px] font-black text-neutral-600 lg:text-right">현재 최종 {money(currentAmount)}</div>
      <input
        value={Number(amountText || 0).toLocaleString()}
        onChange={(event) => setAmountText(moneyInput(event.target.value))}
        inputMode="numeric"
        className="h-9 rounded-lg border border-neutral-200 bg-white px-2 text-right text-[14px] font-black outline-none focus:border-neutral-950"
        placeholder="최종금액"
      />
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        className="h-9 rounded-lg border border-neutral-200 bg-white px-2 text-[13px] font-bold outline-none focus:border-neutral-950"
        placeholder="수정사유 필수 예: 부분환불"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="h-9 rounded-lg bg-neutral-950 px-2 text-[13px] font-black text-white disabled:cursor-not-allowed disabled:bg-neutral-400"
      >
        {saving ? "저장중" : "저장"}
      </button>
    </div>
  );
}

function DetailBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-3 text-xs font-bold text-neutral-700">
      <div className="mb-2 text-[11px] font-black text-neutral-400">{title}</div>
      <div className="grid gap-1">{children}</div>
    </div>
  );
}

function Pagination({ page, totalPages, setPage, totalCount }: { page: number; totalPages: number; setPage: (page: number) => void; totalCount: number }) {
  const pages = Array.from({ length: Math.min(totalPages, 7) }, (_, index) => index + 1);

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2">
      <div className="text-[13px] font-bold text-neutral-500">총 {totalCount}건 / {page}페이지</div>
      <div className="flex gap-1">
        <button onClick={() => setPage(Math.max(1, page - 1))} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-black">이전</button>
        {pages.map((pageNumber) => (
          <button key={pageNumber} onClick={() => setPage(pageNumber)} className={`rounded-lg px-3 py-1.5 text-xs font-black ${page === pageNumber ? "bg-neutral-950 text-white" : "border border-neutral-200 bg-white"}`}>
            {pageNumber}
          </button>
        ))}
        <button onClick={() => setPage(Math.min(totalPages, page + 1))} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-black">다음</button>
      </div>
    </div>
  );
}

function SidePanel({ title, onMore, children }: { title: string; onMore?: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[15px] font-black">{title}</div>
        {onMore ? (
          <button type="button" onClick={onMore} className="rounded-lg border border-neutral-200 px-2 py-1 text-[12px] font-black text-neutral-600">
            더보기
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="rounded-lg bg-neutral-50 p-3 text-center text-xs font-bold text-neutral-400">{text}</div>;
}

function CustomerPanel({ customers }: { customers: CustomerRow[] }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {customers.map((customer) => {
        const blocked = customer.is_blocked === true || customer.is_blocked === "true" || customer.is_blocked === "Y";
        return (
          <div key={customer.id} className="rounded-xl border border-neutral-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-black">{customer.youtube_nickname || "-"}</div>
                <div className="mt-1 text-[13px] font-bold text-neutral-500">{customer.customer_name || "-"} · {customer.customer_phone || "-"}</div>
              </div>
              <span className={`rounded-full px-2 py-1 text-[11px] font-black ${blocked ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-600"}`}>{blocked ? "차단" : "정상"}</span>
            </div>
            <div className="mt-2 rounded-xl bg-neutral-50 p-2 text-xs font-semibold text-neutral-600">{customer.customer_memo || "메모 없음"}</div>
          </div>
        );
      })}
    </div>
  );
}

function DepositPanel({ deposits }: { deposits: DepositRow[] }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      {deposits.length === 0 ? (
        <div className="rounded-xl bg-neutral-50 p-4 text-center text-sm font-bold text-neutral-500">아직 deposits 테이블에 저장된 입금내역이 없습니다.</div>
      ) : (
        <div className="grid gap-1">
          {deposits.map((deposit) => (
            <div key={deposit.id} className="grid grid-cols-[1fr_110px_100px] rounded-xl bg-neutral-50 px-3 py-2 text-sm">
              <div className="font-black">{deposit.depositor_name}</div>
              <div className="text-right font-black">{money(deposit.amount)}</div>
              <div className="text-center font-bold text-neutral-500">{deposit.match_status}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettlementPanel({
  orderGroups,
  deposits,
  actualCardRate,
  dateLabel,
  buyerRanking,
  productRanking,
}: {
  orderGroups: OrderGroup[];
  deposits: DepositRow[];
  actualCardRate: number;
  dateLabel: string;
  buyerRanking: Array<{ name: string; amount: number; count: number }>;
  productRanking: Array<{ name: string; qty: number; amount: number }>;
}) {
  const orderSales = orderGroups.reduce((sum, group) => sum + group.totalAmount, 0);
  const depositSales = deposits.filter((item) => item.match_status === "확인완료").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const cardFeeLoss = Math.round(depositSales * (actualCardRate / 100));

  return (
    <div className="grid gap-3">
      <div className="rounded-xl border border-neutral-200 bg-white p-3 text-[15px] font-black">
        기준: {dateLabel}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <SummaryCard label="주문매출" value={money(orderSales)} />
        <SummaryCard label="확인입금" value={money(depositSales)} />
        <SummaryCard label="카드수수료" value={money(cardFeeLoss)} />
        <SummaryCard label="차액" value={money(orderSales - depositSales)} strong />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <SidePanel title="👑 최대구매자 전체">
          <RankingList items={buyerRanking.map((item) => ({ title: item.name, sub: `${item.count}건`, right: money(item.amount) }))} />
        </SidePanel>
        <SidePanel title="👍 상품 판매 전체">
          <RankingList items={productRanking.map((item) => ({ title: item.name, sub: "", right: `${item.qty}개` }))} />
        </SidePanel>
      </div>
    </div>
  );
}

function RankingList({ items }: { items: Array<{ title: string; sub: string; right: string }> }) {
  return (
    <div className="grid gap-1.5">
      {items.length === 0 ? (
        <EmptyLine text="내역 없음" />
      ) : (
        items.map((item, index) => (
          <div key={`${item.title}-${index}`} className="grid grid-cols-[28px_1fr_auto] items-center rounded-lg bg-neutral-50 px-2 py-2 text-[13px]">
            <div className="font-black text-neutral-400">{index + 1}</div>
            <div className="min-w-0">
              <div className="truncate font-black">{item.title}</div>
              {item.sub ? <div className="text-[11px] font-bold text-neutral-400">{item.sub}</div> : null}
            </div>
            <div className="font-black">{item.right}</div>
          </div>
        ))
      )}
    </div>
  );
}

function SettingsPanel({
  settingsSummary,
  saveSetting,
}: {
  settingsSummary: {
    customerCardRate: number;
    actualCardRate: number;
    defaultShippingFee: number;
    remoteAreaShippingFee: number;
  };
  saveSetting: (key: string, value: string) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <SettingInput label="고객 카드추가 수수료율" desc="0~10% 사이 / 새 주문부터 적용" value={settingsSummary.customerCardRate} suffix="%" min={0} max={10} onSave={(value) => saveSetting("customer_card_extra_rate", String(value))} />
      <LockedSettingCard label="실제 카드업체 수수료율" desc="정산 사고 방지를 위해 7% 고정 / 관리자 수정 불가" value={7} suffix="%" />
      <SettingInput label="기본 배송비" desc="일반 주소 기본 배송비" value={settingsSummary.defaultShippingFee} suffix="원" min={0} max={50000} onSave={(value) => saveSetting("default_shipping_fee", String(value))} />
      <SettingInput label="제주/산간 배송비" desc="주소 자동감지 대상 배송비" value={settingsSummary.remoteAreaShippingFee} suffix="원" min={0} max={50000} onSave={(value) => saveSetting("remote_area_shipping_fee", String(value))} />
    </div>
  );
}

function LockedSettingCard({
  label,
  desc,
  value,
  suffix,
}: {
  label: string;
  desc: string;
  value: number;
  suffix: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-100 p-4">
      <div className="text-[15px] font-black text-neutral-500">{label}</div>
      <div className="mt-2 text-3xl font-black tracking-tight">{value.toLocaleString()}<span className="ml-1 text-lg text-neutral-500">{suffix}</span></div>
      <div className="mt-1 text-xs font-semibold text-neutral-500">{desc}</div>
      <div className="mt-3 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-[13px] font-black text-neutral-500">
        고정값입니다. 과거/현재 주문 정산 보호를 위해 화면에서 수정하지 않습니다.
      </div>
    </div>
  );
}

function SettingInput({
  label,
  desc,
  value,
  suffix,
  min,
  max,
  onSave,
}: {
  label: string;
  desc: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  onSave: (value: number) => void;
}) {
  const [localValue, setLocalValue] = useState(String(value));
  useEffect(() => setLocalValue(String(value)), [value]);

  const save = () => {
    const parsed = Number(localValue);
    if (!Number.isFinite(parsed)) return alert("숫자로 입력해주세요.");
    if (parsed < min || parsed > max) return alert(`${min}~${max} 범위 안에서 입력해주세요.`);
    onSave(parsed);
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="text-[15px] font-black text-neutral-500">{label}</div>
      <div className="mt-2 text-3xl font-black tracking-tight">{value.toLocaleString()}<span className="ml-1 text-lg text-neutral-500">{suffix}</span></div>
      <div className="mt-1 text-xs font-semibold text-neutral-500">{desc}</div>
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <input value={localValue} onChange={(event) => setLocalValue(event.target.value.replace(/[^0-9.]/g, ""))} className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-lg font-black outline-none focus:border-neutral-950" />
        <button type="button" onClick={save} className="rounded-xl bg-neutral-950 px-4 py-2 text-[15px] font-black text-white">저장</button>
      </div>
    </div>
  );
}
