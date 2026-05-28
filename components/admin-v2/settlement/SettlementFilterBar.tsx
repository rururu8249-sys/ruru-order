"use client";

import { useMemo, useState } from "react";
import type { PaymentFilter, SettlementBroadcastOption } from "./settlementTypes";

type Props = {
  startDate: string;
  endDate: string;
  paymentFilter: PaymentFilter;
  broadcastOptions: SettlementBroadcastOption[];
  selectedBroadcastKeys: string[];
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onPaymentFilterChange: (value: PaymentFilter) => void;
  onSelectedBroadcastKeysChange: (value: string[]) => void;
  onReset: () => void;
};

export default function SettlementFilterBar({
  startDate,
  endDate,
  paymentFilter,
  broadcastOptions,
  selectedBroadcastKeys,
  onStartDateChange,
  onEndDateChange,
  onPaymentFilterChange,
  onSelectedBroadcastKeysChange,
  onReset,
}: Props) {
  const [broadcastSearch, setBroadcastSearch] = useState("");
  const [open, setOpen] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedBroadcastKeys), [selectedBroadcastKeys]);
  const filteredOptions = useMemo(() => {
    const keyword = broadcastSearch.trim().toLowerCase();
    if (!keyword) return broadcastOptions.slice(0, 80);
    return broadcastOptions
      .filter((option) => `${option.label} ${option.subLabel}`.toLowerCase().includes(keyword))
      .slice(0, 80);
  }, [broadcastOptions, broadcastSearch]);

  const selectedLabel =
    selectedBroadcastKeys.length === 0
      ? "전체보기"
      : `${selectedBroadcastKeys.length.toLocaleString()}개 방송 선택`;

  const toggleKey = (key: string) => {
    const next = new Set(selectedBroadcastKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedBroadcastKeysChange(Array.from(next));
  };

  return (
    <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-[0_14px_35px_rgba(15,23,42,0.05)]">
      <div className="grid gap-3 xl:grid-cols-[1fr_1fr_1.4fr_1fr_auto]">
        <label className="grid gap-1">
          <span className="text-xs font-black text-slate-500">시작일</span>
          <input
            type="date"
            value={startDate}
            onChange={(event) => onStartDateChange(event.target.value)}
            className="h-11 rounded-2xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-black text-slate-500">종료일</span>
          <input
            type="date"
            value={endDate}
            onChange={(event) => onEndDateChange(event.target.value)}
            className="h-11 rounded-2xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
          />
        </label>

        <div className="relative grid gap-1">
          <span className="text-xs font-black text-slate-500">방송리스트</span>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex h-11 items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 text-left text-sm font-black text-slate-700 shadow-sm"
          >
            <span>{selectedLabel}</span>
            <span className="text-xs text-slate-400">다중선택</span>
          </button>

          {open ? (
            <div className="absolute left-0 right-0 top-[70px] z-20 overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
              <input
                value={broadcastSearch}
                onChange={(event) => setBroadcastSearch(event.target.value)}
                placeholder="방송명/날짜 검색"
                className="mb-2 h-10 w-full rounded-2xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-400"
              />

              <div className="mb-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => onSelectedBroadcastKeysChange([])}
                  className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white"
                >
                  전체보기
                </button>
                <button
                  type="button"
                  onClick={() => onSelectedBroadcastKeysChange(filteredOptions.map((option) => option.key))}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600"
                >
                  검색결과 선택
                </button>
              </div>

              <div className="max-h-[280px] overflow-y-auto pr-1">
                {filteredOptions.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 p-4 text-center text-xs font-bold text-slate-400">
                    검색된 방송이 없습니다.
                  </div>
                ) : (
                  filteredOptions.map((option) => (
                    <label
                      key={option.key}
                      className="mb-1 flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 hover:bg-blue-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSet.has(option.key)}
                        onChange={() => toggleKey(option.key)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-slate-800">{option.label}</span>
                        <span className="block text-xs font-bold text-slate-400">
                          {option.subLabel} · 주문 {option.count.toLocaleString()}건
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>

        <label className="grid gap-1">
          <span className="text-xs font-black text-slate-500">결제수단</span>
          <select
            value={paymentFilter}
            onChange={(event) => onPaymentFilterChange(event.target.value as PaymentFilter)}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
          >
            <option value="전체">전체</option>
            <option value="무통장입금">무통장입금</option>
            <option value="카드결제">카드결제</option>
            <option value="기타">기타</option>
          </select>
        </label>

        <div className="flex items-end">
          <button
            type="button"
            onClick={onReset}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 shadow-sm hover:bg-slate-50"
          >
            초기화
          </button>
        </div>
      </div>

      <div className="mt-3 text-xs font-bold text-slate-400">
        기본값은 전체보기입니다. 방송이 많아져도 날짜 범위와 검색으로 좁힌 뒤 다중선택할 수 있습니다.
      </div>
    </div>
  );
}
