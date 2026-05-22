"use client";

import { useMemo, useState } from "react";
import type { LiveOrder } from "./types";

const PAGE_SIZE = 10;

function money(value: number) {
  return `₩${Number(value || 0).toLocaleString("ko-KR")}`;
}

function compactOrderSummary(order: LiveOrder) {
  const first = order.items[0];
  if (!first) return order.orderSummary || "-";
  const firstText = `${first.productName} ${first.optionText}`.replace(/\s+/g, " ").trim();
  const extraCount = order.items.length - 1;
  return extraCount > 0 ? `${firstText} 외 ${extraCount}개` : firstText;
}

function statusBadge(order: LiveOrder) {
  if (order.paymentStatus === "manual_match_needed") {
    return <span className="rounded-lg bg-orange-100 px-2 py-1 text-xs font-black text-orange-700">수동매칭 필요</span>;
  }
  if (order.paymentStatus === "card_unpaid") {
    return <span className="rounded-lg bg-rose-100 px-2 py-1 text-xs font-black text-rose-700">카드미결제</span>;
  }
  if (order.paymentStatus === "unpaid") {
    return <span className="rounded-lg bg-red-100 px-2 py-1 text-xs font-black text-red-700">미입금</span>;
  }
  if (order.paymentStatus === "card_paid") {
    return <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">카드결제완료</span>;
  }
  if (order.paymentStatus === "auto_paid") {
    return <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">자동입금확인</span>;
  }
  if (order.paymentStatus === "manual_paid") {
    return <span className="rounded-lg bg-blue-100 px-2 py-1 text-xs font-black text-blue-700">수동입금확인</span>;
  }
  return <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">입금확인</span>;
}

type Props = {
  orders: LiveOrder[];
  selectedOrderId: string;
  onSelectOrder: (order: LiveOrder) => void;
  loading?: boolean;
};

export default function LiveOrderTable({ orders, selectedOrderId, onSelectOrder, loading = false }: Props) {
  const [page, setPage] = useState(1);

  const counts = useMemo(() => {
    const paid = orders.filter((order) =>
      ["paid", "auto_paid", "manual_paid", "card_paid"].includes(order.paymentStatus)
    ).length;
    const manual = orders.filter((order) => order.paymentStatus === "manual_match_needed").length;
    const unpaid = orders.filter((order) =>
      ["unpaid", "manual_match_needed", "card_unpaid"].includes(order.paymentStatus)
    ).length;

    return {
      total: orders.length,
      unpaid,
      paid,
      manual,
    };
  }, [orders]);

  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleOrders = orders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-lg font-black text-slate-950">실시간 주문서</h2>

        {[
          ["전체", counts.total, "bg-blue-600 text-white"],
          ["미입금", counts.unpaid, "bg-slate-100 text-slate-600"],
          ["입금확인", counts.paid, "bg-slate-100 text-slate-600"],
          ["수동매칭", counts.manual, "bg-slate-100 text-slate-600"],
        ].map(([label, count, cls]) => (
          <button key={label} className={`rounded-full px-3 py-1.5 text-xs font-black ${cls}`}>
            {label} <span className="ml-1 opacity-80">{count}</span>
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600">닉네임 정렬 ˅</button>
          <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600">페이지당 10건 ˅</button>
          <button className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500">↻</button>
        </div>
      </div>

      <div className="mb-2 rounded-xl bg-blue-50 px-3 py-2 text-[11px] font-black text-blue-700">
        현재 표는 최근 주문 500건 전체 기준입니다. 방송/날짜/상태 필터 실제 동작은 다음 단계에서 연결됩니다.
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-4">
        <select className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700">
          <option>방송: 전체보기</option>
          <option>현재 방송</option>
          <option>지난 방송</option>
          <option>방송 선택</option>
        </select>
        <select className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700">
          <option>날짜: 전체보기</option>
          <option>오늘</option>
          <option>어제</option>
          <option>최근 7일</option>
          <option>이번 달</option>
          <option>직접 기간 선택</option>
        </select>
        <select className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700">
          <option>상태: 전체보기</option>
          <option>미입금</option>
          <option>입금확인</option>
          <option>수동매칭 필요</option>
          <option>카드결제완료</option>
          <option>카드미결제</option>
          <option>출고대기</option>
          <option>출고완료</option>
          <option>취소/환불</option>
        </select>
        <input
          placeholder="닉네임 / 이름 / 주문내역 검색"
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead className="bg-slate-50 text-xs font-black text-slate-500">
            <tr>
              <th className="w-[110px] px-3 py-3 text-left">입금확인</th>
              <th className="w-[86px] px-3 py-3 text-left">제출시간</th>
              <th className="w-[86px] px-3 py-3 text-left">입금시간</th>
              <th className="w-[100px] px-3 py-3 text-left">닉네임</th>
              <th className="w-[86px] px-3 py-3 text-left">이름</th>
              <th className="px-3 py-3 text-left">주문내역</th>
              <th className="w-[100px] px-3 py-3 text-right">상품금액</th>
              <th className="w-[76px] px-3 py-3 text-right">배송비</th>
              <th className="w-[94px] px-3 py-3 text-center">작업</th>
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
                    <td className="px-3 py-2.5">{statusBadge(order)}</td>
                    <td className="px-3 py-2.5 font-bold text-slate-600">{order.submittedAt}</td>
                    <td className="px-3 py-2.5 font-bold text-slate-600">{order.paidAt || "-"}</td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => onSelectOrder(order)}
                        className="font-black text-blue-700 underline-offset-2 hover:underline"
                      >
                        {order.nickname}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 font-bold text-slate-700">{order.name}</td>
                    <td className="truncate px-3 py-2.5 font-bold text-slate-700">{compactOrderSummary(order)}</td>
                    <td className="px-3 py-2.5 text-right font-black text-slate-700">{money(order.productAmount)}</td>
                    <td className="px-3 py-2.5 text-right font-black text-slate-700">{money(order.shippingFee)}</td>
                    <td className="px-3 py-2.5 text-center">
                      {order.paymentStatus === "manual_match_needed" ? (
                        <button className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-1 text-xs font-black text-orange-700 hover:bg-orange-100">
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
        <div className="text-xs font-black text-slate-500">총 {orders.length}건</div>
        <div className="mx-auto flex items-center gap-5 text-sm font-black">
          <button onClick={() => setPage(Math.max(1, safePage - 1))} className="text-slate-400">‹</button>
          {Array.from({ length: Math.min(totalPages, 5) }).map((_, index) => {
            const pageNumber = index + 1;
            return (
              <button
                key={pageNumber}
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
          <button onClick={() => setPage(Math.min(totalPages, safePage + 1))} className="text-slate-400">›</button>
        </div>
      </div>
    </section>
  );
}
