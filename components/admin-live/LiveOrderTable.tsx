"use client";

import { useEffect, useMemo, useState } from "react";
import type { LiveOrder } from "./types";
import { exportLiveOrdersForPicking, exportLiveOrdersForRosen } from "./adminLiveOrderExcelExport";
import { supabase } from "@/lib/supabase";
import LiveOrderCancelViewFilter, { type LiveOrderCancelViewFilterValue } from "./LiveOrderCancelViewFilter";

export type LiveOrderDateFilter = "all" | "today" | "yesterday" | "7days" | "month" | "custom";
export type LiveOrderStatusFilter =
  | "all"
  | "unpaid"
  | "paid"
  | "manual_match_needed"
  | "card_paid"
  | "card_unpaid";

export type LiveOrderFilters = {
  broadcast: string;
  date: LiveOrderDateFilter;
  customStartDate: string;
  customEndDate: string;
  status: LiveOrderStatusFilter;
  keyword: string;
};

type BroadcastOption = {
  value: string;
  label: string;
};

type SortMode = "latest" | "nickname_asc" | "nickname_desc";

function money(value: number) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function todayAlwaysOrderLabel() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

  return `${mm}${dd}(${weekdays[now.getDay()]}) 공구·상시주문`;
}

function buildItemText(item: LiveOrder["items"][number]) {
  return normalizeText(`${item.productName} ${item.optionText}`);
}

function getTotalQty(order: LiveOrder) {
  return (order.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

function compactOrderSummary(order: LiveOrder) {
  const items = order.items || [];

  if (!items.length) return order.orderSummary || "-";

  const itemTexts = items.map(buildItemText).filter(Boolean);

  if (itemTexts.length <= 1) {
    return itemTexts[0] || order.orderSummary || "-";
  }

  const maxChars = 70;
  const visible: string[] = [];
  let usedLength = 0;

  itemTexts.forEach((itemText) => {
    const nextLength = usedLength + itemText.length + (visible.length > 0 ? 3 : 0);

    if (nextLength <= maxChars) {
      visible.push(itemText);
      usedLength = nextLength;
    }
  });

  if (visible.length === 0) {
    return `${itemTexts[0]} 외 ${itemTexts.length - 1}개`;
  }

  const hiddenCount = itemTexts.length - visible.length;
  const joined = visible.join("  |  ");

  return hiddenCount > 0 ? `${joined} 외 ${hiddenCount}개` : joined;
}

function getVisibleOrderSummaryParts(order: LiveOrder) {
  const items = order.items || [];

  if (!items.length) {
    return {
      parts: [order.orderSummary || "-"],
      hiddenCount: 0,
    };
  }

  const itemTexts = items.map(buildItemText).filter(Boolean);

  if (itemTexts.length <= 1) {
    return {
      parts: [itemTexts[0] || order.orderSummary || "-"],
      hiddenCount: 0,
    };
  }

  const maxChars = 70;
  const visible: string[] = [];
  let usedLength = 0;

  itemTexts.forEach((itemText) => {
    const nextLength = usedLength + itemText.length + (visible.length > 0 ? 3 : 0);

    if (nextLength <= maxChars) {
      visible.push(itemText);
      usedLength = nextLength;
    }
  });

  if (visible.length === 0) {
    return {
      parts: [itemTexts[0]],
      hiddenCount: itemTexts.length - 1,
    };
  }

  return {
    parts: visible,
    hiddenCount: itemTexts.length - visible.length,
  };
}

function renderOrderSummary(order: LiveOrder) {
  const { parts, hiddenCount } = getVisibleOrderSummaryParts(order);

  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2 overflow-hidden whitespace-nowrap">
      {parts.map((part, index) => (
        <span key={`${part}-${index}`} className="inline-flex min-w-0 items-center gap-2">
          {index > 0 && <span className="shrink-0 font-black text-red-500">|</span>}
          <span className="truncate">{part}</span>
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="shrink-0 font-black text-slate-500">외 {hiddenCount}개</span>
      )}
    </span>
  );
}

function statusBadge(order: LiveOrder) {
  if (order.paymentStatus === "canceled") {
    return <span className="rounded-lg bg-red-100 px-2 py-1 text-xs font-black text-red-700">주문서취소</span>;
  }

  if (order.paymentStatus === "manual_match_needed") {
    return <span className="rounded-lg bg-orange-100 px-2 py-1 text-xs font-black text-orange-700">입금확인 필요</span>;
  }
  if (order.paymentStatus === "card_unpaid") {
    return <span className="rounded-lg bg-red-100 px-2 py-1 text-xs font-black text-red-700">카드 미결제</span>;
  }
  if (order.paymentStatus === "unpaid") {
    return <span className="rounded-lg bg-red-100 px-2 py-1 text-xs font-black text-red-700">무통장 미입금</span>;
  }
  if (order.paymentStatus === "card_paid") {
    return <span className="rounded-lg bg-violet-100 px-2 py-1 text-xs font-black text-violet-700">카드결제완료</span>;
  }
  if (order.paymentStatus === "auto_paid") {
    return <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">자동입금확인</span>;
  }
  if (order.paymentStatus === "manual_paid") {
    return <span className="rounded-lg bg-blue-100 px-2 py-1 text-xs font-black text-blue-700">수동입금확인</span>;
  }
  return <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">입금확인완료</span>;
}

type Props = {
  orders: LiveOrder[];
  allOrderCount: number;
  selectedOrderId: string;
  onSelectOrder: (order: LiveOrder) => void;
  onOpenManualMatch?: (order: LiveOrder) => void;
  onRefresh?: () => void | Promise<void>;
  loading?: boolean;
  filters: LiveOrderFilters;
  onFiltersChange: (filters: LiveOrderFilters) => void;
  broadcastOptions: BroadcastOption[];
};




export default function LiveOrderTable({
  orders,
  allOrderCount,
  selectedOrderId,
  onSelectOrder,
  onOpenManualMatch,
  onRefresh,
  loading = false,
  filters,
  onFiltersChange,
  broadcastOptions,
}: Props) {
  const [page, setPage] = useState(1);
  const [pendingKeyword, setPendingKeyword] = useState(filters.keyword);
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [pageSize, setPageSize] = useState(10);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState<"" | "rozen" | "picking">("");
  const [cancelViewFilter, setCancelViewFilter] = useState<LiveOrderCancelViewFilterValue>("all");

  useEffect(() => {
    setPage(1);
  }, [cancelViewFilter]);

  useEffect(() => {
    setPage(1);
  }, [filters.broadcast, filters.date, filters.customStartDate, filters.customEndDate, filters.status, filters.keyword, sortMode, pageSize]);

  useEffect(() => {
    setPendingKeyword(filters.keyword);
  }, [filters.keyword]);

  const counts = useMemo(() => {
    const paid = orders.filter((order) =>
      ["paid", "auto_paid", "manual_paid", "card_paid"].includes(order.paymentStatus)
    ).length;
    const manual = orders.filter((order) => order.paymentStatus === "manual_match_needed").length;
    const canceled = orders.filter((order) => order.paymentStatus === "canceled").length;
    const unpaid = orders.filter((order) =>
      ["unpaid", "manual_match_needed", "card_unpaid"].includes(order.paymentStatus)
    ).length;

    return {
      total: orders.length,
      unpaid,
      paid,
      manual,
      canceled,
    };
  }, [orders]);

  const sortedOrders = useMemo(() => {
    const list = [...orders];

    if (sortMode === "nickname_asc") {
      return list.sort((a, b) => a.nickname.localeCompare(b.nickname, "ko-KR"));
    }

    if (sortMode === "nickname_desc") {
      return list.sort((a, b) => b.nickname.localeCompare(a.nickname, "ko-KR"));
    }

    return list.sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime() || 0;
      const bTime = new Date(b.createdAt || 0).getTime() || 0;
      return bTime - aTime;
    });
  }, [orders, sortMode]);

  const cancelViewFilteredOrders = useMemo(() => {
    if (cancelViewFilter === "active") {
      return sortedOrders.filter((order) => order.paymentStatus !== "canceled");
    }

    if (cancelViewFilter === "canceled") {
      return sortedOrders.filter((order) => order.paymentStatus === "canceled");
    }

    return sortedOrders;
  }, [sortedOrders, cancelViewFilter]);

  const cancelFilteredActiveCount = sortedOrders.filter((order) => order.paymentStatus !== "canceled").length;
  const cancelFilteredCanceledCount = sortedOrders.length - cancelFilteredActiveCount;

  const totalPages = Math.max(1, Math.ceil(cancelViewFilteredOrders.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleOrders = cancelViewFilteredOrders.slice((safePage - 1) * pageSize, safePage * pageSize);

  const exportableOrders = useMemo(
    () => cancelViewFilteredOrders.filter((order) => order.paymentStatus !== "canceled"),
    [cancelViewFilteredOrders]
  );
  const canceledExportExcludedCount = cancelViewFilteredOrders.length - exportableOrders.length;

  const updateFilter = <K extends keyof LiveOrderFilters>(key: K, value: LiveOrderFilters[K]) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    });
  };

  const applyKeyword = () => {
    updateFilter("keyword", pendingKeyword.trim());
  };

  const resetFilters = () => {
    setPendingKeyword("");
    setSortMode("latest");
    setPageSize(10);
    onFiltersChange({
      broadcast: "all",
      date: "all",
      customStartDate: "",
      customEndDate: "",
      status: "all",
      keyword: "",
    });
  };

  const toggleNicknameSort = () => {
    setSortMode((current) => {
      if (current === "latest") return "nickname_asc";
      if (current === "nickname_asc") return "nickname_desc";
      return "latest";
    });
  };

  const sortLabel =
    sortMode === "nickname_asc" ? "닉네임 ↑" : sortMode === "nickname_desc" ? "닉네임 ↓" : "최신순";

  const refreshOrders = async () => {
    if (!onRefresh) return;

    setRefreshing(true);

    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };


  const currentFilterLabel = useMemo(() => {
    const broadcastLabel =
      filters.broadcast === "all"
        ? "방송: 전체보기"
        : filters.broadcast === "none"
          ? todayAlwaysOrderLabel()
          : broadcastOptions.find((option) => option.value === filters.broadcast)?.label || "선택 방송";

    const dateLabelMap: Record<LiveOrderDateFilter, string> = {
      all: "날짜: 전체보기",
      today: "오늘",
      yesterday: "어제",
      "7days": "최근 7일",
      month: "이번 달",
      custom:
        filters.customStartDate || filters.customEndDate
          ? `직접 선택 ${filters.customStartDate || "시작일"}~${filters.customEndDate || "종료일"}`
          : "직접 선택",
    };

    const statusLabelMap: Record<LiveOrderStatusFilter, string> = {
      all: "상태: 전체보기",
      unpaid: "결제대기",
      paid: "입금확인완료",
      manual_match_needed: "입금확인 필요",
      card_paid: "카드결제완료",
      card_unpaid: "카드 미결제",
    };

    return [
      broadcastLabel,
      dateLabelMap[filters.date],
      statusLabelMap[filters.status],
      filters.keyword ? `검색: ${filters.keyword}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }, [broadcastOptions, filters]);

  const exportRosen = async () => {
    setExporting("rozen");

    try {
      await exportLiveOrdersForRosen(exportableOrders, { filterLabel: currentFilterLabel });
    } finally {
      setExporting("");
    }
  };

  const exportPicking = async () => {
    setExporting("picking");

    try {
      await exportLiveOrdersForPicking(exportableOrders, { filterLabel: currentFilterLabel });
    } finally {
      setExporting("");
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-lg font-black text-slate-950">실시간 주문서</h2>

        {[
          ["전체", counts.total, "all"],
          ["결제대기", counts.unpaid, "unpaid"],
          ["입금확인완료", counts.paid, "paid"],
          ["주문서취소", counts.canceled, "canceled"],
        ].map(([label, count, status]) => {
          const active = filters.status === status;

          return (
            <button
              key={label}
              type="button"
              onClick={() => updateFilter("status", status as LiveOrderStatusFilter)}
              className={[
                "rounded-full px-3 py-1.5 text-xs font-black transition",
                active
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700",
              ].join(" ")}
            >
              {label} <span className="ml-1 opacity-80">{count}</span>
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={exportRosen}
            disabled={exporting !== "" || exportableOrders.length === 0}
            className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            title="현재 필터 조건 그대로 로젠 송장 엑셀을 내보냅니다"
          >
            {exporting === "rozen" ? "내보내는중..." : "택배송장 내보내기"}
          </button>

          <button
            type="button"
            onClick={exportPicking}
            disabled={exporting !== "" || exportableOrders.length === 0}
            className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            title="현재 필터 조건 그대로 물건챙기기 엑셀을 내보냅니다"
          >
            {exporting === "picking" ? "내보내는중..." : "물건챙기기 엑셀"}
          </button>

            {canceledExportExcludedCount > 0 ? (
              <span className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600">
                주문서취소 {canceledExportExcludedCount.toLocaleString("ko-KR")}건은 엑셀 내보내기에서 자동 제외됩니다.
              </span>
            ) : null}

          <button
            type="button"
            onClick={toggleNicknameSort}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
          >
            {sortLabel}
          </button>

          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 outline-none hover:bg-slate-50"
          >
            <option value={10}>페이지당 10건</option>
            <option value={20}>페이지당 20건</option>
            <option value={30}>페이지당 30건</option>
          </select>

          <button
            type="button"
            onClick={refreshOrders}
            disabled={!onRefresh || refreshing}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            title="주문 새로고침"
          >
            {refreshing ? "…" : "↻"}
          </button>
        </div>
      </div>

      <div className="mb-2 rounded-xl bg-blue-50 px-3 py-2 text-[11px] font-black text-blue-700">
        상단 카운트 버튼과 필터가 실제 주문서와 매출요약에 함께 적용됩니다. 검색은 Enter 또는 검색 버튼을 눌렀을 때만 적용됩니다.
      </div>

      <div className="mb-3 flex w-full flex-wrap items-center gap-2 xl:flex-nowrap">
        <select className="h-11 w-full flex-none rounded-xl border border-slate-200 bg-white px-2 text-[12px] font-black text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50 sm:w-[170px]"
          value={filters.broadcast}
          onChange={(event) => updateFilter("broadcast", event.target.value)}
        >
          <option value="all">방송: 전체보기</option>
          {broadcastOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          <option value="none">{todayAlwaysOrderLabel()}</option>
        </select>

        <select className="h-11 w-full flex-none rounded-xl border border-slate-200 bg-white px-2 text-[12px] font-black text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50 sm:w-[120px]"
          value={filters.date}
          onChange={(event) => updateFilter("date", event.target.value as LiveOrderDateFilter)}
        >
          <option value="all">날짜: 전체보기</option>
          <option value="today">오늘</option>
          <option value="yesterday">어제</option>
          <option value="7days">최근 7일</option>
          <option value="month">이번 달</option>
          <option value="custom">직접 선택</option>
        </select>

        {filters.date === "custom" && (
          <>
            <input className="h-11 w-full flex-none sm:w-[120px] sm:min-w-[120px] sm:max-w-[120px] rounded-xl border border-slate-200 bg-white px-2 text-[12px] font-black text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
              type="date"
              value={filters.customStartDate}
              onChange={(event) => updateFilter("customStartDate", event.target.value)}
              aria-label="시작일"
            />
            <input className="h-11 w-full flex-none sm:w-[120px] sm:min-w-[120px] sm:max-w-[120px] rounded-xl border border-slate-200 bg-white px-2 text-[12px] font-black text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
              type="date"
              value={filters.customEndDate}
              onChange={(event) => updateFilter("customEndDate", event.target.value)}
              aria-label="종료일"
            />
          </>
        )}

        <select className="h-11 w-full flex-none rounded-xl border border-slate-200 bg-white px-2 text-[12px] font-black text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50 sm:w-[128px]"
          value={filters.status}
          onChange={(event) => updateFilter("status", event.target.value as LiveOrderStatusFilter)}
        >
          <option value="all">상태: 전체보기</option>
          <option value="unpaid">결제대기</option>
          <option value="paid">입금확인완료</option>
          <option value="manual_match_needed">입금확인 필요</option>
          <option value="card_paid">카드결제완료</option>
          <option value="card_unpaid">카드 미결제</option>
        </select>

        <input className="h-11 min-w-[160px] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-black text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
          value={pendingKeyword}
          onChange={(event) => setPendingKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") applyKeyword();
          }}
          placeholder="닉네임 / 이름 / 주문내역 검색"
        />

        <button className="h-11 w-full flex-none rounded-xl bg-blue-600 px-3 text-[12px] font-black text-white shadow-sm hover:bg-blue-700 active:scale-[0.99] sm:w-[84px]"
          type="button"
          onClick={applyKeyword}
        >
          검색
        </button>

        <button className="h-11 w-full flex-none rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-black text-slate-600 shadow-sm hover:bg-slate-50 active:scale-[0.99] sm:w-[84px]"
          type="button"
          onClick={resetFilters}
        >
          초기화
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead className="bg-slate-50 text-xs font-black text-slate-500">
            <tr>
              <th className="w-[124px] px-4 py-3 text-left">결제상태</th>
              <th className="w-[88px] px-3 py-3 text-left">제출시간</th>
              <th className="w-[88px] px-3 py-3 text-left">입금시간</th>
              <th className="w-[150px] px-4 py-3 text-left">닉네임</th>
              <th className="w-[112px] px-4 py-3 text-left">이름</th>
              <th className="px-4 py-3 text-left">주문내역</th>
              <th className="w-[76px] px-3 py-3 text-center">총수량</th>
              <th className="w-[116px] px-3 py-3 text-right">상품금액</th>
              <th className="w-[96px] px-3 py-3 text-right">배송비</th>
              <th className="w-[72px] px-3 py-3 text-center">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm font-black text-slate-400">
                  실제 주문 데이터를 불러오는 중입니다.
                </td>
              </tr>
            ) : visibleOrders.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm font-black text-slate-400">
                  표시할 주문이 없습니다.
                </td>
              </tr>
            ) : (
              visibleOrders.map((order) => {
                const selected = order.id === selectedOrderId;
                return (
                  <tr key={order.id} className={selected ? "bg-blue-50/70" : "hover:bg-slate-50"}>
                    <td className="px-4 py-3">{statusBadge(order)}</td>
                    <td className="px-3 py-3 font-bold text-slate-600">{order.submittedAt}</td>
                    <td className="px-3 py-3 font-bold text-slate-600">{order.paidAt || "-"}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onSelectOrder(order)}
                        className="font-black text-blue-700 underline-offset-2 hover:underline"
                      >
                        {order.nickname}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-700">{order.name}</td>
                    <td className="min-w-0 px-4 py-3 font-bold text-slate-700" title={order.orderSummary || compactOrderSummary(order)}>
                      {renderOrderSummary(order)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex min-w-[54px] items-center justify-center rounded-lg bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">
                        총 {getTotalQty(order)}개
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-black text-slate-700">
                      <div>{money(order.productAmount)}</div>
                      {String((order as any).paymentMethod || "").includes("카드") && Number((order as any).cardPaymentTotalAmount || 0) > 0 ? (
                        <div className="mt-1 text-[11px] font-black text-purple-700">
                          카드총액 {money(Number((order as any).cardPaymentTotalAmount || 0))}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-right font-black text-slate-700">
                      <div>{money(order.shippingFee)}</div>
                      {String((order as any).paymentMethod || "").includes("카드") && Number((order as any).cardExtraAmount || 0) > 0 ? (
                        <div className="mt-1 text-[11px] font-black text-purple-700">
                          카드+ {money(Number((order as any).cardExtraAmount || 0))}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {order.paymentStatus === "manual_match_needed" && onOpenManualMatch ? (
                        <button
                          type="button"
                          onClick={() => onOpenManualMatch(order)}
                          className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-1 text-xs font-black text-orange-700 hover:bg-orange-100"
                        >
                          매칭하기
                        </button>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center">
        <div className="text-xs font-black text-slate-500">
          총 {orders.length}건 / 전체 {allOrderCount}건
        </div>
        <div className="mx-auto flex items-center gap-5 text-sm font-black">
          <button type="button" onClick={() => setPage(Math.max(1, safePage - 1))} className="text-slate-400">‹</button>
          {Array.from({ length: Math.min(totalPages, 5) }).map((_, index) => {
            const pageNumber = index + 1;
            return (
              <button
                key={pageNumber}
                type="button"
                onClick={() => setPage(pageNumber)}
                className={
                  safePage === pageNumber
                    ? "flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white"
                    : "text-slate-500"
                }
              >
                {pageNumber}
              </button>
            );
          })}
          <button type="button" onClick={() => setPage(Math.min(totalPages, safePage + 1))} className="text-slate-400">›</button>
        </div>
      </div>
    </section>
  );
}
