"use client";

import type { SettlementBroadcastRow } from "./settlementTypes";
import { won } from "./settlementUtils";

export default function SettlementBroadcastTable({
  rows,
}: {
  rows: SettlementBroadcastRow[];
}) {
  return (
    <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
        <div>
          <div className="text-lg font-black text-slate-950">방송별 정산 리스트</div>
          <div className="mt-1 text-xs font-bold text-slate-400">
            완료매출, 카드수수료, 창고정산/기타지출, 실수익을 방송 날짜 기준으로 묶어 보여줍니다.
          </div>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
          {rows.length.toLocaleString()}개
        </div>
      </div>

      <div className="overflow-auto">
        <table className="min-w-[1080px] w-full border-separate border-spacing-0">
          <thead>
            <tr className="bg-slate-50 text-xs font-black text-slate-500">
              <th className="px-4 py-3 text-left">방송/날짜</th>
              <th className="px-4 py-3 text-right">주문</th>
              <th className="px-4 py-3 text-right">총주문액</th>
              <th className="px-4 py-3 text-right">완료매출</th>
              <th className="px-4 py-3 text-right">무통장</th>
              <th className="px-4 py-3 text-right">카드</th>
              <th className="px-4 py-3 text-right">카드수수료</th>
              <th className="px-4 py-3 text-right">창고정산/기타지출</th>
              <th className="px-4 py-3 text-right">미입금/확인필요</th>
              <th className="px-4 py-3 text-right">실수익</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-16 text-center text-sm font-bold text-slate-400">
                  표시할 방송별 정산 내역이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key} className="border-b border-slate-100 hover:bg-blue-50/30">
                  <td className="border-b border-slate-100 px-4 py-4">
                    <div className="max-w-[260px] truncate text-sm font-black text-slate-900">{row.label}</div>
                    <div className="mt-1 text-xs font-bold text-slate-400">{row.dateKey}</div>
                  </td>
                  <td className="border-b border-slate-100 px-4 py-4 text-right text-sm font-black text-slate-700">{row.count.toLocaleString()}건</td>
                  <td className="border-b border-slate-100 px-4 py-4 text-right text-sm font-black tabular-nums text-slate-900">{won(row.totalOrderAmount)}</td>
                  <td className="border-b border-slate-100 px-4 py-4 text-right text-sm font-black tabular-nums text-blue-700">{won(row.paidAmount)}</td>
                  <td className="border-b border-slate-100 px-4 py-4 text-right text-sm font-black tabular-nums text-emerald-700">{won(row.bankAmount)}</td>
                  <td className="border-b border-slate-100 px-4 py-4 text-right text-sm font-black tabular-nums text-blue-700">{won(row.cardAmount)}</td>
                  <td className="border-b border-slate-100 px-4 py-4 text-right text-sm font-black tabular-nums text-rose-700">-{won(row.actualCardFee)}</td>
                  <td className="border-b border-slate-100 px-4 py-4 text-right text-sm font-black tabular-nums text-violet-700">-{won(row.warehouseOtherExpense)}</td>
                  <td className="border-b border-slate-100 px-4 py-4 text-right text-sm font-black tabular-nums text-orange-700">{won(row.unpaidAmount)}</td>
                  <td className="border-b border-slate-100 px-4 py-4 text-right text-sm font-black tabular-nums text-slate-950">{won(row.netAmount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
