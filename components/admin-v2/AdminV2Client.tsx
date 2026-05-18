"use client";

// components/admin-v2/AdminV2Client.tsx
// admin-v2 실제 화면 클라이언트 컴포넌트
// 리팩토링 1단계: 기존 기능 유지, page.tsx 몰빵 제거, 돈/상태/포맷 유틸 lib 분리.

import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type {
  AdminTab,
  BroadcastRow,
  CustomerRow,
  DepositRow,
  MoneyEditLogRow,
  OrderGroup,
  OrderRow,
  SettingRow,
  StatusChangeLogRow,
} from "@/lib/admin-v2/types";
import { ORDER_STATUS_OPTIONS, PAGE_SIZE, PAYMENT_FILTERS, TABS } from "@/lib/admin-v2/constants";
import {
  displayOrderPhone,
  formatDateLabel,
  formatKoreanPhone,
  money,
  moneyInput,
  moneyNumber,
  orderPhoneDigits,
  toDateKey,
} from "@/lib/admin-v2/formatters";
import {
  buildItemSummary,
  buildProductSummaryFromRow,
  getAdminMemo,
  getLegacyProductMemo,
  getOrderStatusLabel,
  getOrderStatusValue,
  getShippingExcelMemo,
  getShippingRequestMemo,
  getSpecialNote,
  groupActualCardFeeAmount,
  groupCanceledAmount,
  groupCustomerCardExtraAmount,
  groupGrossBaseAmount,
  groupNetSalesAmount,
  groupRefundAmount,
  isBankPaid,
  isBankPayment,
  isBankUnpaid,
  isCardPaid,
  isCardPayment,
  isCardUnpaid,
  isOrderCanceled,
  isOrderPaid,
  isPaymentUnpaid,
  orderBaseAmount,
  orderNetSalesAmount,
  paymentStatusMeta,
  readSettingNumber,
  selectClass,
  shortOrderCode,
} from "@/lib/admin-v2/orderHelpers";

export function AdminV2Client() {
  const [activeTab, setActiveTab] = useState<AdminTab>("orders");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [moneyEditLogs, setMoneyEditLogs] = useState<MoneyEditLogRow[]>([]);
  const [statusChangeLogs, setStatusChangeLogs] = useState<StatusChangeLogRow[]>([]);
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

    const [ordersResult, customersResult, depositsResult, moneyLogsResult, statusLogsResult, broadcastsResult, settingsResult] = await Promise.all([
      supabase.from("orders").select("*").neq("is_deleted", true).order("created_at", { ascending: false }).limit(500),
      supabase.from("customers").select("*").order("last_order_at", { ascending: false, nullsFirst: false }).limit(500),
      supabase.from("deposits").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.rpc("get_order_money_edit_logs_for_admin_v2"),
      supabase.rpc("get_order_status_change_logs_for_admin_v2"),
      supabase.from("broadcasts").select("*").order("started_at", { ascending: false }).limit(120),
      supabase.from("settings").select("key,value").order("key"),
    ]);

    if (ordersResult.error) alert("주문 불러오기 실패\n\n" + ordersResult.error.message);
    else setOrders((ordersResult.data || []) as OrderRow[]);

    if (customersResult.error) alert("고객 불러오기 실패\n\n" + customersResult.error.message);
    else setCustomers((customersResult.data || []) as CustomerRow[]);

    setDeposits((depositsResult.data || []) as DepositRow[]);

    if (moneyLogsResult.error) {
      alert("금액수정이력 불러오기 실패\n\n" + moneyLogsResult.error.message);
      setMoneyEditLogs([]);
    } else {
      setMoneyEditLogs((moneyLogsResult.data || []) as MoneyEditLogRow[]);
    }

    if (statusLogsResult.error) {
      alert("상태변경이력 불러오기 실패\n\n" + statusLogsResult.error.message);
      setStatusChangeLogs([]);
    } else {
      setStatusChangeLogs((statusLogsResult.data || []) as StatusChangeLogRow[]);
    }

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

    return Array.from(map.entries()).map(([groupId, rows]) => {
      const group = {
        groupId,
        first: rows[0],
        rows,
        totalAmount: 0,
        totalQty: rows.reduce((sum, row) => sum + Number(row.qty || 0), 0),
      };

      return {
        ...group,
        totalAmount: groupNetSalesAmount(group),
      };
    });
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
      const status = getOrderStatusValue(group.first);
      const payment = group.first.payment_method || "미설정";
      const matchStatus = statusFilter === "전체" || status === statusFilter;
      const matchPayment = paymentFilter === "전체" || payment === paymentFilter;
      const matchDate = !dateFilter || toDateKey(group.first.created_at) === dateFilter;

      const target = [
        group.groupId,
        group.first.order_lookup_code,
        group.first.youtube_nickname,
        group.first.customer_name,
        displayOrderPhone(group.first),
        orderPhoneDigits(group.first),
        group.first.phone,
        group.first.customer_phone,
        group.first.payment_method,
        ...group.rows.map((row) => `${row.product_name} ${row.color} ${row.size} ${displayOrderPhone(row)} ${orderPhoneDigits(row)}`),
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
    const notCanceled = filteredOrderGroups.filter((group) => !isOrderCanceled(group.first));

    const totalOrderProductQty = filteredOrderGroups.reduce((sum, group) => sum + group.totalQty, 0);
    const totalOrderCount = filteredOrderGroups.length;
    const totalOrderAmount = notCanceled.reduce((sum, group) => sum + groupNetSalesAmount(group), 0);

    const bankPaid = filteredOrderGroups.filter((group) => isBankPaid(group.first)).length;
    const bankUnpaid = filteredOrderGroups.filter((group) => isBankUnpaid(group.first)).length;
    const cardPaid = filteredOrderGroups.filter((group) => isCardPaid(group.first)).length;
    const cardUnpaid = filteredOrderGroups.filter((group) => isCardUnpaid(group.first)).length;
    const canceledAmount = filteredOrderGroups.reduce((sum, group) => sum + groupCanceledAmount(group), 0);

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
      if (isOrderCanceled(group.first)) return;

      const nickname = group.first.youtube_nickname || group.first.customer_name || "이름없음";
      const currentBuyer = buyerMap.get(nickname) || { name: nickname, amount: 0, count: 0 };
      currentBuyer.amount += group.totalAmount;
      currentBuyer.count += 1;
      buyerMap.set(nickname, currentBuyer);

      group.rows.forEach((row) => {
        const productName = row.product_name || "상품명 없음";
        const currentProduct = productMap.get(productName) || { name: productName, qty: 0, amount: 0 };
        currentProduct.qty += Number(row.qty || 0);
        currentProduct.amount += orderNetSalesAmount(row);
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
    const nowIso = new Date().toISOString();

    const changedRows = group.rows.filter((row) => getOrderStatusValue(row) !== nextStatus);

    if (changedRows.length === 0) {
      return;
    }

    const shouldSaveDepositConfirmedAt = nextStatus === "입금확인";
    const shouldSaveShippedAt = nextStatus === "출고완료";

    if (shouldSaveShippedAt) {
      const hasTrackingNumber = group.rows.some((row) => String(row.tracking_number || "").trim());
      if (!hasTrackingNumber) {
        const ok = confirm(
          "송장번호가 아직 없습니다.\n\n그래도 출고완료로 변경할까요?\n출고시간은 저장되고, 송장번호는 나중에 상세보기에서 입력할 수 있습니다."
        );
        if (!ok) return;
      }
    }

    const updatePayload: Partial<OrderRow> = {
      admin_order_status_v2: nextStatus,
      order_manage_status: nextStatus,
    };

    // 입금확인 시간을 처음 처리한 시점으로 보존하기 위해,
    // 이미 deposit_confirmed_at 이 있는 주문은 덮어쓰지 않습니다.
    if (shouldSaveDepositConfirmedAt) {
      const needsDepositTime = group.rows.some((row) => !row.deposit_confirmed_at);
      if (needsDepositTime) {
        updatePayload.deposit_confirmed_at = nowIso;
      }
    }

    // 출고완료 시간을 처음 처리한 시점으로 보존하기 위해,
    // 이미 shipped_at 이 있는 주문은 덮어쓰지 않습니다.
    if (shouldSaveShippedAt) {
      const needsShippedTime = group.rows.some((row) => !row.shipped_at);
      if (needsShippedTime) {
        updatePayload.shipped_at = nowIso;
      }
    }

    const statusLogPayloads = changedRows.map((row) => {
      const beforeStatus = getOrderStatusValue(row);
      const depositConfirmedAtAfter =
        shouldSaveDepositConfirmedAt && !row.deposit_confirmed_at
          ? nowIso
          : row.deposit_confirmed_at;
      const shippedAtAfter =
        shouldSaveShippedAt && !row.shipped_at
          ? nowIso
          : row.shipped_at;

      return {
        order_id: row.id,
        order_group_id: row.order_group_id,
        order_lookup_code: row.order_lookup_code,
        changed_by: "admin-v2",
        change_source: "admin-v2-status-change",
        before_status: beforeStatus,
        after_status: nextStatus,
        before_order_manage_status: row.order_manage_status || beforeStatus,
        after_order_manage_status: nextStatus,
        payment_method: row.payment_method || "",
        deposit_confirmed_at_before: row.deposit_confirmed_at || "",
        deposit_confirmed_at_after: depositConfirmedAtAfter || "",
        snapshot_before: {
          id: row.id,
          admin_order_status_v2: row.admin_order_status_v2,
          order_manage_status: row.order_manage_status,
          payment_method: row.payment_method,
          deposit_confirmed_at: row.deposit_confirmed_at,
          shipped_at: row.shipped_at,
          tracking_company: row.tracking_company,
          tracking_number: row.tracking_number,
        },
        snapshot_after: {
          id: row.id,
          admin_order_status_v2: nextStatus,
          order_manage_status: nextStatus,
          payment_method: row.payment_method,
          deposit_confirmed_at: depositConfirmedAtAfter,
          shipped_at: shippedAtAfter,
          tracking_company: row.tracking_company,
          tracking_number: row.tracking_number,
        },
      };
    });

    setOrders((prev) =>
      prev.map((order) => {
        if (!ids.includes(order.id)) return order;

        return {
          ...order,
          admin_order_status_v2: nextStatus,
          order_manage_status: nextStatus,
          deposit_confirmed_at:
            shouldSaveDepositConfirmedAt && !order.deposit_confirmed_at
              ? nowIso
              : order.deposit_confirmed_at,
          shipped_at:
            shouldSaveShippedAt && !order.shipped_at
              ? nowIso
              : order.shipped_at,
        };
      })
    );

    const { error } = await supabase
      .from("orders")
      .update(updatePayload)
      .in("id", ids);

    if (error) {
      alert("상태 변경 실패\n\n" + error.message);
      await loadData();
      return;
    }

    const { error: logError } = await supabase.rpc("insert_order_status_change_logs_for_admin_v2", {
      p_logs: statusLogPayloads,
    });

    if (logError) {
      alert("상태는 변경됐지만 상태변경이력 저장에 실패했습니다.\n\n" + logError.message);
      await loadData();
      return;
    }

    const { data: latestStatusLogs, error: latestStatusLogsError } = await supabase
      .rpc("get_order_status_change_logs_for_admin_v2");

    if (latestStatusLogsError) {
      alert("상태변경이력 재조회에 실패했습니다.\n\n" + latestStatusLogsError.message);
    } else {
      setStatusChangeLogs((latestStatusLogs || []) as StatusChangeLogRow[]);
    }
  };

  const updateOrderTracking = async (group: OrderGroup, trackingCompany: string, trackingNumber: string) => {
    const cleanCompany = String(trackingCompany || "").trim() || "로젠";
    const cleanNumber = String(trackingNumber || "").trim().replace(/\s+/g, "");

    if (!cleanCompany) {
      alert("택배사를 입력해주세요.");
      return;
    }

    if (cleanNumber.length < 4) {
      alert("송장번호를 정확히 입력해주세요.");
      return;
    }

    const ids = group.rows.map((row) => row.id).filter(Boolean);
    const ok = confirm(
      `송장정보를 저장할까요?\n\n택배사: ${cleanCompany}\n송장번호: ${cleanNumber}\n\n같은 주문묶음 ${ids.length}개 행에 동일하게 저장됩니다.`
    );

    if (!ok) return;

    setOrders((prev) =>
      prev.map((order) =>
        ids.includes(order.id)
          ? {
              ...order,
              tracking_company: cleanCompany,
              tracking_number: cleanNumber,
            }
          : order
      )
    );

    const { error } = await supabase
      .from("orders")
      .update({
        tracking_company: cleanCompany,
        tracking_number: cleanNumber,
      })
      .in("id", ids);

    if (error) {
      alert("송장정보 저장 실패\n\n" + error.message);
      await loadData();
      return;
    }

    alert("송장정보가 저장되었습니다.");
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

    const { data: latestLogs, error: latestLogsError } = await supabase
      .rpc("get_order_money_edit_logs_for_admin_v2");

    if (latestLogsError) {
      alert("금액수정은 저장됐지만 이력 재조회에 실패했습니다.\n\n" + latestLogsError.message);
    } else {
      setMoneyEditLogs((latestLogs || []) as MoneyEditLogRow[]);
    }

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
                  selectedDateKey={dateFilter}
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
                      <OrderWorkTable groups={pagedGroups} openedOrderGroupIds={openedOrderGroupIds} moneyEditLogs={moneyEditLogs} statusChangeLogs={statusChangeLogs} onToggle={toggleOrderDetail} onStatusChange={updateOrderStatus} onTrackingChange={updateOrderTracking} onFinalAmountChange={updateOrderFinalAmount} />
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
      <SummaryCard label="무통장 입금확인" value={`${summaryCards.bankPaid}명`} />
      <SummaryCard label="무통장 미입금" value={`${summaryCards.bankUnpaid}명`} strong />
      <SummaryCard label="카드 결제완료" value={`${summaryCards.cardPaid}명`} />
      <SummaryCard label="카드 미결제/링크대기" value={`${summaryCards.cardUnpaid}명`} strong />
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
        {ORDER_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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

function OrderWorkTable({
  groups,
  openedOrderGroupIds,
  moneyEditLogs,
  statusChangeLogs,
  onToggle,
  onStatusChange,
  onTrackingChange,
  onFinalAmountChange,
}: {
  groups: OrderGroup[];
  openedOrderGroupIds: string[];
  moneyEditLogs: MoneyEditLogRow[];
  statusChangeLogs: StatusChangeLogRow[];
  onToggle: (groupId: string) => void;
  onStatusChange: (group: OrderGroup, status: string) => void;
  onTrackingChange: (group: OrderGroup, trackingCompany: string, trackingNumber: string) => Promise<void>;
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
        const status = getOrderStatusValue(group.first);
        const paymentMeta = paymentStatusMeta(group.first);
        const rowIds = new Set(group.rows.map((row) => row.id));
        const groupMoneyLogs = moneyEditLogs.filter((log) => rowIds.has(Number(log.order_id)));
        const groupStatusLogs = statusChangeLogs.filter((log) => rowIds.has(Number(log.order_id)));
        const isShippedDone = getOrderStatusValue(group.first) === "출고완료";
        const hasTrackingNumber = group.rows.some((row) => String(row.tracking_number || "").trim());
        const hasShippedAt = group.rows.some((row) => row.shipped_at);

        return (
          <div key={group.groupId} className="border-t border-neutral-100 first:border-t-0">
            <div className="grid gap-2 px-3 py-2.5 lg:grid-cols-[84px_124px_128px_minmax(250px,1fr)_82px_108px_106px_90px] lg:items-center">
              <div className="text-[13px] font-black text-neutral-500">{shortOrderCode(group)}</div>
              <div className="text-[13px] font-bold text-neutral-500">{formatDateLabel(group.first.created_at)}</div>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-black">{group.first.youtube_nickname || "-"}</div>
                <div className="truncate text-[12px] font-bold text-neutral-500">
                  {group.first.customer_name || "-"} · {displayOrderPhone(group.first)}
                </div>
              </div>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-bold text-neutral-800">{buildItemSummary(group)}</div>
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-black text-neutral-700">{group.first.payment_method || "-"}</div>
                <div className={`mt-0.5 inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-black ${paymentMeta.className}`}>
                  {paymentMeta.label}
                </div>
              </div>
              <div className="text-left lg:text-right">
                <div className="text-[15px] font-black">{money(group.totalAmount)}</div>
                {groupMoneyLogs.length > 0 ? (
                  <div className="mt-0.5 text-[10px] font-black text-red-600">금액수정 {groupMoneyLogs.length}건</div>
                ) : null}
              </div>
              <div>
                <select value={status} onChange={(event) => onStatusChange(group, event.target.value)} className={`h-8 w-full rounded-lg border px-2 text-center text-xs font-black outline-none ${selectClass(status)}`}>
                  {ORDER_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                {groupStatusLogs.length > 0 ? (
                  <div className="mt-0.5 text-center text-[10px] font-black text-blue-700">상태변경 {groupStatusLogs.length}건</div>
                ) : null}
                {isShippedDone && !hasTrackingNumber ? (
                  <div className="mt-0.5 text-center text-[10px] font-black text-red-600">송장없음</div>
                ) : null}
                {isShippedDone && !hasShippedAt ? (
                  <div className="mt-0.5 text-center text-[10px] font-black text-red-600">출고시간없음</div>
                ) : null}
              </div>
              <button type="button" onClick={() => onToggle(group.groupId)} className="h-8 rounded-lg border border-neutral-300 bg-white px-2 text-xs font-black text-neutral-700 hover:bg-neutral-50">
                {isOpen ? "상세닫기" : "상세보기"}
              </button>
            </div>

            {isOpen ? <OrderDetailBlock group={group} moneyEditLogs={groupMoneyLogs} statusChangeLogs={groupStatusLogs} onTrackingChange={onTrackingChange} onFinalAmountChange={onFinalAmountChange} /> : null}
          </div>
        );
      })}
    </div>
  );
}

function OrderDetailBlock({
  group,
  moneyEditLogs,
  statusChangeLogs,
  onTrackingChange,
  onFinalAmountChange,
}: {
  group: OrderGroup;
  moneyEditLogs: MoneyEditLogRow[];
  statusChangeLogs: StatusChangeLogRow[];
  onTrackingChange: (group: OrderGroup, trackingCompany: string, trackingNumber: string) => Promise<void>;
  onFinalAmountChange: (row: OrderRow, nextAmount: number, reason: string) => Promise<void>;
}) {
  const first = group.first;
  const paymentMeta = paymentStatusMeta(first);
  const address = [first.address, first.detail_address].filter(Boolean).join(" ");
  const shippingRequestMemo = getShippingRequestMemo(first);
  const shippingExcelMemo = getShippingExcelMemo(first);
  const adminMemo = getAdminMemo(first);
  const specialNote = getSpecialNote(first);
  const legacyProductMemo = getLegacyProductMemo(first);
  const productSummary = group.rows.map((row) => buildProductSummaryFromRow(row)).join(" / ");

  return (
    <div className="border-t border-neutral-100 bg-neutral-50 px-3 py-3">
      <div className="grid gap-2 md:grid-cols-[1.1fr_1.4fr_1fr]">
        <DetailBox title="고객정보">
          <div>전화번호: {displayOrderPhone(first)}</div>
          <div>주소: {address || "-"}</div>
        </DetailBox>
        <DetailBox title="상품요약">
          {group.rows.map((row) => (
            <div key={row.id}>
              {buildProductSummaryFromRow(row)} · 현재 최종 {money(orderBaseAmount(row))}
            </div>
          ))}
        </DetailBox>
        <DetailBox title="관리정보">
          <div>결제상태: {paymentMeta.label} · {paymentMeta.desc}</div>
          <div>입금확인시간: {first.deposit_confirmed_at ? formatDateLabel(first.deposit_confirmed_at) : "미확인"}</div>
          <div>출고완료시간: {first.shipped_at ? formatDateLabel(first.shipped_at) : "미처리"}</div>
          <div>송장: {first.tracking_company || "로젠"} {first.tracking_number || "미등록"}</div>
          <div>관리자메모: {adminMemo || "없음"}</div>
        </DetailBox>
      </div>

      <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[15px] font-black">🧾 메모 구조 분리</div>
            <div className="mt-0.5 text-[12px] font-bold text-neutral-500">
              택배사 배송메모에는 고객 배송메모(request_memo)만 사용합니다. 상품요약은 배송메모로 보내지 않습니다.
            </div>
          </div>
          <div className="rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">
            택배 엑셀 메모 = 배송메모만
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <DetailBox title="배송메모 / 택배사 전송">
            <div>{shippingExcelMemo || "없음"}</div>
          </DetailBox>
          <DetailBox title="상품요약 / 내부확인">
            <div>{productSummary || legacyProductMemo || "상품요약 없음"}</div>
          </DetailBox>
          <DetailBox title="관리자메모">
            <div>{adminMemo || "없음"}</div>
          </DetailBox>
          <DetailBox title="특이사항">
            <div>{specialNote || "없음"}</div>
          </DetailBox>
        </div>
      </div>

      <TrackingEditor group={group} onSave={onTrackingChange} />

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

      <MoneyEditLogPanel logs={moneyEditLogs} />
      <StatusChangeLogPanel logs={statusChangeLogs} />
    </div>
  );
}

function StatusChangeLogPanel({ logs }: { logs: StatusChangeLogRow[] }) {
  return (
    <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[15px] font-black">🔁 상태 변경이력</div>
          <div className="mt-0.5 text-[12px] font-bold text-neutral-500">
            주문 상태를 누가/언제/무엇에서 무엇으로 바꿨는지 확인합니다.
          </div>
        </div>
        <div className="rounded-lg bg-neutral-100 px-2 py-1 text-[11px] font-black text-neutral-600">
          {logs.length}건
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-xl bg-neutral-50 p-3 text-center text-[12px] font-bold text-neutral-400">
          상태 변경이력이 없습니다.
        </div>
      ) : (
        <div className="grid gap-1.5">
          {logs.map((log) => (
            <div key={log.id} className="grid gap-1 rounded-xl bg-neutral-50 p-2 text-[12px] font-bold text-neutral-700 md:grid-cols-[128px_1fr_160px] md:items-center">
              <div className="font-black text-neutral-500">{formatDateLabel(log.changed_at)}</div>
              <div>
                <span className="font-black text-amber-700">{getOrderStatusLabel(log.before_status)}</span>
                <span className="mx-1 text-neutral-400">→</span>
                <span className="font-black text-blue-700">{getOrderStatusLabel(log.after_status)}</span>
                <span className="ml-2 text-neutral-500">
                  {log.payment_method || "-"}
                  {log.deposit_confirmed_at_after ? ` · 입금확인 ${formatDateLabel(log.deposit_confirmed_at_after)}` : ""}
                </span>
              </div>
              <div className="text-neutral-500 md:text-right">
                {log.changed_by || "admin-v2"} · 주문ID {log.order_id || "-"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MoneyEditLogPanel({ logs }: { logs: MoneyEditLogRow[] }) {
  return (
    <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[15px] font-black">🧾 금액 수정이력</div>
          <div className="mt-0.5 text-[12px] font-bold text-neutral-500">
            최종정산금액을 누가/언제/얼마에서 얼마로/왜 바꿨는지 확인합니다.
          </div>
        </div>
        <div className="rounded-lg bg-neutral-100 px-2 py-1 text-[11px] font-black text-neutral-600">
          {logs.length}건
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-xl bg-neutral-50 p-3 text-center text-[12px] font-bold text-neutral-400">
          금액 수정이력이 없습니다.
        </div>
      ) : (
        <div className="grid gap-1.5">
          {logs.map((log) => (
            <div key={log.id} className="grid gap-1 rounded-xl bg-neutral-50 p-2 text-[12px] font-bold text-neutral-700 md:grid-cols-[128px_1fr_160px] md:items-center">
              <div className="font-black text-neutral-500">{formatDateLabel(log.changed_at)}</div>
              <div>
                <span className="font-black text-red-700">{money(log.before_numeric)}</span>
                <span className="mx-1 text-neutral-400">→</span>
                <span className="font-black text-blue-700">{money(log.after_numeric)}</span>
                <span className="ml-2 text-neutral-500">사유: {log.reason || "-"}</span>
              </div>
              <div className="text-neutral-500 md:text-right">
                {log.changed_by || "admin-v2"} · 주문ID {log.order_id}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TRACKING_COMPANIES = ["로젠", "CJ대한통운", "한진", "롯데", "우체국", "기타"];

function TrackingEditor({
  group,
  onSave,
}: {
  group: OrderGroup;
  onSave: (group: OrderGroup, trackingCompany: string, trackingNumber: string) => Promise<void>;
}) {
  const first = group.first;
  const [trackingCompany, setTrackingCompany] = useState(first.tracking_company || "로젠");
  const [trackingNumber, setTrackingNumber] = useState(first.tracking_number || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTrackingCompany(first.tracking_company || "로젠");
    setTrackingNumber(first.tracking_number || "");
  }, [first.tracking_company, first.tracking_number]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(group, trackingCompany, trackingNumber);
    } finally {
      setSaving(false);
    }
  };

  const shippedAtText = first.shipped_at ? formatDateLabel(first.shipped_at) : "아직 출고완료 처리 전";
  const trackingMissingAfterShip = getOrderStatusValue(first) === "출고완료" && !String(first.tracking_number || "").trim();

  return (
    <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[15px] font-black">🚚 송장/출고 관리</div>
          <div className="mt-0.5 text-[12px] font-bold text-neutral-500">
            같은 주문묶음 전체에 동일한 택배사/송장번호를 저장합니다. 택배 엑셀 배송메모는 request_memo만 사용해야 합니다.
          </div>
        </div>
        <div className={`rounded-lg px-2 py-1 text-[11px] font-black ${trackingMissingAfterShip ? "bg-red-50 text-red-700" : "bg-neutral-100 text-neutral-600"}`}>
          {trackingMissingAfterShip ? "출고완료인데 송장없음" : `출고시간 ${shippedAtText}`}
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-[150px_minmax(180px,1fr)_86px]">
        <select
          value={trackingCompany}
          onChange={(event) => setTrackingCompany(event.target.value)}
          className="h-10 rounded-lg border border-neutral-200 bg-white px-2 text-[14px] font-black outline-none focus:border-neutral-950"
        >
          {TRACKING_COMPANIES.map((company) => (
            <option key={company} value={company}>{company}</option>
          ))}
        </select>

        <input
          value={trackingNumber}
          onChange={(event) => setTrackingNumber(event.target.value.replace(/\s+/g, ""))}
          inputMode="numeric"
          className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-[15px] font-black outline-none focus:border-neutral-950"
          placeholder="송장번호 입력"
        />

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="h-10 rounded-lg bg-neutral-950 px-3 text-[13px] font-black text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          {saving ? "저장중" : "저장"}
        </button>
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
                <div className="mt-1 text-[13px] font-bold text-neutral-500">{customer.customer_name || "-"} · {formatKoreanPhone(customer.customer_phone)}</div>
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
  selectedDateKey,
  dateLabel,
  buyerRanking,
  productRanking,
}: {
  orderGroups: OrderGroup[];
  deposits: DepositRow[];
  actualCardRate: number;
  selectedDateKey: string;
  dateLabel: string;
  buyerRanking: Array<{ name: string; amount: number; count: number }>;
  productRanking: Array<{ name: string; qty: number; amount: number }>;
}) {
  const activeGroups = orderGroups.filter((group) => !isOrderCanceled(group.first));

  const depositsForDate = deposits.filter((item) => {
    if (!selectedDateKey) return true;
    return toDateKey(item.deposited_time || item.created_at) === selectedDateKey;
  });

  const orderSales = activeGroups.reduce((sum, group) => sum + groupNetSalesAmount(group), 0);
  const grossBaseSales = activeGroups.reduce((sum, group) => sum + groupGrossBaseAmount(group), 0);
  const refundAmount = activeGroups.reduce((sum, group) => sum + groupRefundAmount(group), 0);
  const canceledAmount = orderGroups.reduce((sum, group) => sum + groupCanceledAmount(group), 0);

  const bankConfirmedOrderSales = activeGroups
    .filter((group) => isBankPaid(group.first))
    .reduce((sum, group) => sum + groupNetSalesAmount(group), 0);

  const cardConfirmedOrderSales = activeGroups
    .filter((group) => isCardPaid(group.first))
    .reduce((sum, group) => sum + groupNetSalesAmount(group), 0);

  const bankUnpaidOrderSales = activeGroups
    .filter((group) => isBankUnpaid(group.first))
    .reduce((sum, group) => sum + groupNetSalesAmount(group), 0);

  const cardUnpaidOrderSales = activeGroups
    .filter((group) => isCardUnpaid(group.first))
    .reduce((sum, group) => sum + groupNetSalesAmount(group), 0);

  const confirmedBankDeposits = depositsForDate
    .filter((item) => item.match_status === "확인완료")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const actualCardFee = activeGroups
    .filter((group) => isCardPaid(group.first))
    .reduce((sum, group) => sum + groupActualCardFeeAmount(group, actualCardRate), 0);

  const customerCardExtra = activeGroups
    .filter((group) => isCardPaid(group.first))
    .reduce((sum, group) => sum + groupCustomerCardExtraAmount(group), 0);

  const cardFeeMargin = customerCardExtra - actualCardFee;
  const expectedConfirmedSales = bankConfirmedOrderSales + cardConfirmedOrderSales;
  const unpaidOrderSales = bankUnpaidOrderSales + cardUnpaidOrderSales;
  const bankDepositDiff = bankConfirmedOrderSales - confirmedBankDeposits;

  return (
    <div className="grid gap-3">
      <div className="rounded-xl border border-neutral-200 bg-white p-3 text-[15px] font-black">
        기준: {dateLabel}
        <div className="mt-1 text-[12px] font-bold text-neutral-500">
          카드수수료는 주문 당시 저장된 actual_card_fee_rate_applied를 우선 사용하고, 없는 기존 주문만 {actualCardRate}%를 보조 적용합니다.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <SummaryCard label="주문매출" value={money(orderSales)} />
        <SummaryCard label="기준금액" value={money(grossBaseSales)} />
        <SummaryCard label="무통장 확인" value={money(bankConfirmedOrderSales)} />
        <SummaryCard label="카드 확인" value={money(cardConfirmedOrderSales)} />
        <SummaryCard label="미결제 합계" value={money(unpaidOrderSales)} strong />
        <SummaryCard label="확인입금자료" value={money(confirmedBankDeposits)} />
        <SummaryCard label="무통장 차액" value={money(bankDepositDiff)} strong={bankDepositDiff !== 0} />
        <SummaryCard label="카드 실수수료" value={money(actualCardFee)} />
        <SummaryCard label="카드 추가금" value={money(customerCardExtra)} />
        <SummaryCard label="카드 수수료차익" value={money(cardFeeMargin)} strong={cardFeeMargin < 0} />
        <SummaryCard label="환불금액" value={money(refundAmount)} />
        <SummaryCard label="취소금액" value={money(canceledAmount)} />
        <SummaryCard label="확정매출" value={money(expectedConfirmedSales)} />
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] font-bold text-amber-900">
        ⚠️ 환불금액(refund_amount)이 따로 입력되어 있으면 final_amount에서 차감합니다. final_amount를 이미 환불 반영 금액으로 직접 낮춘 경우에는 refund_amount를 중복 입력하지 않는 운영 기준이 필요합니다.
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

export default AdminV2Client;
