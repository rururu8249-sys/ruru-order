"use client";

import type { LiveOrder } from "./types";

function money(value: number) {
  return `₩${value.toLocaleString("ko-KR")}`;
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
  if (order.paymentStatus === "unpaid") {
    return <span className="rounded-lg bg-red-100 px-2 py-1 text-xs font-black text-red-700">미입금</span>;
  }
  return <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">입금확인</span>;
}

type Props = {
  orders: LiveOrder[];
  selectedOrderId: string;
  onSelectOrder: (order: LiveOrder) => void;
};

export default function LiveOrderTable({ orders, selectedOrderId, onSelectOrder }: Props) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-lg font-black text-slate-950">실시간 주문서</h2>

        {[
          ["전체", "128", "bg-blue-600 text-white"],
          ["미입금", "32", "bg-slate-100 text-slate-600"],
          ["입금확인", "96", "bg-slate-100 text-slate-600"],
          ["수동매칭", "7", "bg-slate-100 text-slate-600"],
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
            {orders.map((order) => {
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
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center">
        <div className="text-xs font-black text-slate-500">총 128건</div>
        <div className="mx-auto flex items-center gap-5 text-sm font-black">
          <button className="text-slate-400">‹</button>
          <button className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white">1</button>
          <button className="text-slate-500">2</button>
          <button className="text-slate-500">3</button>
          <button className="text-slate-500">4</button>
          <button className="text-slate-500">5</button>
          <button className="text-slate-400">›</button>
        </div>
      </div>
    </section>
  );
}
