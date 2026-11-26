"use client";

// [2026-11-26 VER3 시안 「관리자 · 정산 한 장」] 정산 화면 = 이 한 장.
//   계산은 전부 AdminSettlementPanel 이 넘겨준 stats / broadcastRows (calculateStats·buildBroadcastRows) 그대로 — 여기선 보여주기만.

import { useState } from "react";
import type { SettlementBroadcastOption, SettlementBroadcastRow, SettlementStats } from "./settlementTypes";
import { won } from "./settlementUtils";

type Props = {
  stats: SettlementStats;
  actualCardFeeRate: string;
  startDate: string;
  endDate: string;
  broadcastOptions: SettlementBroadcastOption[];
  selectedBroadcastKeys: string[];
  broadcastRows: SettlementBroadcastRow[];
  onQuickRange: (range: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onSelectedBroadcastKeysChange: (value: string[]) => void;
  onOpenManualPanel: () => void;
  onExportSummaryCsv: () => void;
  onGoToUnpaidOrders?: () => void;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function dateKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function monthRange(offset: number) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = offset === 0 ? now : new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { start: dateKey(first), end: dateKey(last), month: first.getMonth() + 1 };
}

const chipOn = "h-10 rounded-full bg-ink px-4 text-sm font-bold text-white";
const chipOff = "h-10 rounded-full border border-line-strong bg-surface px-4 text-sm text-ink hover:bg-surface-2";

export default function SettlementOnePage(props: Props) {
  const {
    stats,
    actualCardFeeRate,
    startDate,
    endDate,
    broadcastOptions,
    selectedBroadcastKeys,
    broadcastRows,
  } = props;
  const [customOpen, setCustomOpen] = useState(false);
  const [showAllLives, setShowAllLives] = useState(false);

  // 방송 하나를 고르면 그 방송 날짜부터 오늘까지(자정 넘긴 주문 포함) + 그 방송 키로만 거른다.
  //   날짜를 비우면 계산이 «이번 달»로 잡혀 지난 달 방송이 0원으로 보이기 때문.
  const pickBroadcast = (key: string, fallbackDate = "") => {
    setCustomOpen(false);
    if (!key) {
      props.onSelectedBroadcastKeysChange([]);
      props.onQuickRange("month");
      return;
    }
    const option = broadcastOptions.find((o) => o.key === key);
    const from = option?.dateKey || fallbackDate;
    props.onStartDateChange(from);
    props.onEndDateChange(from ? dateKey(new Date()) : "");
    props.onSelectedBroadcastKeysChange([key]);
  };

  const thisMonth = monthRange(0);
  const lastMonth = monthRange(-1);
  const pickedBroadcast = selectedBroadcastKeys.length === 1 ? broadcastOptions.find((o) => o.key === selectedBroadcastKeys[0]) : undefined;
  const noFilter = !startDate && !endDate && selectedBroadcastKeys.length === 0;
  const isThisMonth = !pickedBroadcast && !customOpen && (noFilter || (startDate === thisMonth.start && endDate === thisMonth.end));
  const isLastMonth = !pickedBroadcast && !customOpen && startDate === lastMonth.start && endDate === lastMonth.end;

  const scopeLabel = pickedBroadcast
    ? pickedBroadcast.label.replace(/방송없음$/, "쇼핑몰 주문")
    : isThisMonth
      ? `${thisMonth.month}월`
      : isLastMonth
        ? `${lastMonth.month}월`
        : `${startDate || "처음"} ~ ${endDate || "오늘"}`;

  const hasCost = stats.productCostRowCount > 0;
  const costMissing = stats.productCostMissingCount;
  const big = hasCost ? stats.netAfterProductCost : stats.netAmount;
  const bigTitle = hasCost
    ? costMissing > 0
      ? `${scopeLabel} 남는 돈 (적어 둔 입금가까지 뺌)`
      : `${scopeLabel} 진짜 남는 돈 (입금가까지 뺌)`
    : `${scopeLabel} 남는 돈 (입금가 빼기 전)`;

  const rate = Number(actualCardFeeRate) || 0;
  const lives = showAllLives ? broadcastRows : broadcastRows.slice(0, 8);

  const minusRow = (label: string, sub: string, amount: number) => (
    <>
      <span className="font-extrabold text-danger">−</span>
      <span>
        {label} {sub ? <span className="text-[13px] text-ink-mute">{sub}</span> : null}
      </span>
      <span className="tabular-nums">{won(amount)}</span>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-4 text-[22px] font-extrabold text-ink">정산</h1>
        <button
          type="button"
          className={isThisMonth ? chipOn : chipOff}
          onClick={() => {
            setCustomOpen(false);
            props.onSelectedBroadcastKeysChange([]);
            props.onQuickRange("month");
          }}
        >
          이번 달
        </button>
        <button
          type="button"
          className={isLastMonth ? chipOn : chipOff}
          onClick={() => {
            setCustomOpen(false);
            props.onSelectedBroadcastKeysChange([]);
            props.onQuickRange("lastMonth");
          }}
        >
          지난 달
        </button>
        <label className="relative">
          <span className="sr-only">방송 고르기</span>
          <select
            aria-label="방송별"
            className={`${pickedBroadcast ? chipOn : chipOff} max-w-[260px] appearance-none pr-8`}
            value={pickedBroadcast?.key || ""}
            onChange={(e) => {
              pickBroadcast(e.target.value);
            }}
          >
            <option value="">방송별</option>
            {broadcastOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label.replace(/방송없음$/, "쇼핑몰 주문")}
              </option>
            ))}
          </select>
          <span aria-hidden="true" className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs ${pickedBroadcast ? "text-white" : "text-ink-mute"}`}>
            ▾
          </span>
        </label>
        <button
          type="button"
          className={customOpen ? chipOn : chipOff}
          onClick={() => {
            props.onSelectedBroadcastKeysChange([]);
            setCustomOpen(true);
          }}
        >
          기간 고르기
        </button>
        {customOpen ? (
          <span className="flex items-center gap-1">
            <input
              type="date"
              aria-label="시작일"
              value={startDate}
              onChange={(e) => props.onStartDateChange(e.target.value)}
              className="h-10 rounded-[10px] border border-line-strong bg-surface px-2 text-sm"
            />
            <span className="text-ink-mute">~</span>
            <input
              type="date"
              aria-label="종료일"
              value={endDate}
              onChange={(e) => props.onEndDateChange(e.target.value)}
              className="h-10 rounded-[10px] border border-line-strong bg-surface px-2 text-sm"
            />
          </span>
        ) : null}
        <span className="flex-1" />
        <button type="button" onClick={props.onExportSummaryCsv} className="h-10 rounded-[10px] border border-line-strong bg-surface px-3.5 text-sm text-ink hover:bg-surface-2">
          엑셀
        </button>
        <button type="button" onClick={props.onOpenManualPanel} className="h-10 rounded-[10px] bg-ink px-3.5 text-sm font-bold text-white">
          + 지출 적기
        </button>
      </div>

      <div className="flex flex-wrap gap-4">
        <section className="min-w-0 flex-[2_1_520px] rounded-2xl border border-line bg-surface px-7 py-6">
          <div className="text-sm text-ink-mute">{bigTitle}</div>
          <div className={`mt-1.5 text-[40px] font-extrabold tabular-nums ${big < 0 ? "text-danger" : "text-ok"}`}>{won(big)}</div>

          <div className="mt-[22px] grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-y-3.5 text-base text-ink">
            <span />
            <span>
              받은 돈 <span className="text-[13px] text-ink-mute">결제완료 {stats.paidCount.toLocaleString("ko-KR")}건</span>
            </span>
            <b className="tabular-nums">{won(stats.paidAmount)}</b>
            {stats.manualIncomeAmount > 0 ? (
              <>
                <span className="font-extrabold text-ok">+</span>
                <span>추가 수익</span>
                <span className="tabular-nums">{won(stats.manualIncomeAmount)}</span>
              </>
            ) : null}
            {minusRow("카드 수수료", rate ? `${rate}%` : "", stats.actualCardFee)}
            {minusRow("택배·알바 등 지출", "", stats.warehouseOtherExpense)}
            {hasCost ? minusRow("상품 입금가", "", stats.productCostAmount) : null}
            <span className="col-span-full border-t-2 border-ink" />
            <span className="font-extrabold">=</span>
            <b>{hasCost && costMissing === 0 ? "진짜 남는 돈" : "남는 돈"}</b>
            <b className={`tabular-nums ${big < 0 ? "text-danger" : "text-ok"}`}>{won(big)}</b>
          </div>

          {costMissing > 0 ? (
            <div className="mt-5 rounded-[10px] bg-warn-bg px-3.5 py-3 text-sm text-warn">
              입금가 안 적은 상품 {costMissing.toLocaleString("ko-KR")}개 — 그만큼 덜 빠졌어요 (상품 수정에서 입금가를 적으면 다음 주문부터 빠져요)
            </div>
          ) : null}
        </section>

        <section className="flex min-w-0 flex-[1_1_320px] flex-col gap-1 rounded-2xl border border-line bg-surface px-[22px] py-5">
          <div className="mb-2 text-base font-bold text-ink">방송별 매출 (누르면 그 방송 정산)</div>
          {broadcastRows.length === 0 ? <div className="py-6 text-sm text-ink-mute">이 기간에 주문이 없어요.</div> : null}
          {lives.map((row) => {
            const on = selectedBroadcastKeys.length === 1 && selectedBroadcastKeys[0] === row.key;
            const [date, ...rest] = row.label.split(" · ");
            const name = (rest.length ? rest.join(" · ") : row.label).replace(/^방송없음$/, "쇼핑몰 주문");
            return (
              <button
                type="button"
                key={row.key}
                onClick={() => pickBroadcast(on ? "" : row.key, row.dateKey)}
                className={`flex items-center justify-between gap-3 border-t border-line py-3 text-left text-sm ${on ? "bg-surface-2" : "hover:bg-surface-2"}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{name}</span>
                  <span className="block text-xs text-ink-mute">
                    {rest.length ? date : row.dateKey} · 주문 {row.count.toLocaleString("ko-KR")}
                  </span>
                </span>
                <b className="shrink-0 tabular-nums text-ink">{won(row.paidAmount)}</b>
              </button>
            );
          })}
          {pickedBroadcast ? (
            <button type="button" onClick={() => pickBroadcast("")} className="border-t border-line py-3 text-left text-sm font-bold text-ink hover:bg-surface-2">
              ← 이번 달 전체 방송 보기
            </button>
          ) : null}
          {broadcastRows.length > lives.length ? (
            <button type="button" onClick={() => setShowAllLives(true)} className="border-t border-line py-3 text-sm text-ink-soft hover:text-ink">
              더 보기 ({(broadcastRows.length - lives.length).toLocaleString("ko-KR")}개)
            </button>
          ) : null}
          <div className="mt-auto pt-2 text-xs text-ink-mute">
            아직 못 받은 돈은 빼고 셈 · 미수 {won(stats.unpaidAmount)}
            {stats.unpaidAmount > 0 && props.onGoToUnpaidOrders ? (
              <button type="button" onClick={props.onGoToUnpaidOrders} className="ml-2 font-bold text-ink underline">
                주문 보기
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
