import type { LedgerStatus } from "./depositLedgerTypes";
import { depositLedgerStatusLabel } from "@/lib/orderLabels";

type Props = {
  keyword: string;
  onKeywordChange: (value: string) => void;
  fromDate: string;
  toDate: string;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  onApplyDate: () => void;
  onReset: () => void;
  statusFilter: LedgerStatus | "전체";
  onStatusFilterChange: (value: LedgerStatus | "전체") => void;
  compact?: boolean;
  appliedFromDate?: string;
  appliedToDate?: string;
};

const STATUS_FILTERS: Array<LedgerStatus | "전체"> = ["전체", "미확인", "확인완료", "주의"];

function chipClass(active: boolean, value: LedgerStatus | "전체") {
  if (!active) return "border-line bg-surface text-ink-soft hover:border-line hover:text-info-tx";
  if (value === "확인완료") return "border-line bg-ok-bg text-ok-tx";
  if (value === "주의") return "border-line bg-warn-bg text-warn-tx";
  if (value === "미확인") return "border-line bg-surface-3 text-ink";
  return "border-rose-deep bg-rose-deep text-white";
}

export default function DepositLedgerFilters({
  keyword,
  onKeywordChange,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  onApplyDate,
  onReset,
  statusFilter,
  onStatusFilterChange,
  compact = false,
  appliedFromDate,
  appliedToDate,
}: Props) {
  if (compact) return <section className="space-y-2 py-2">
    <input aria-label="입금자명 또는 금액 검색" value={keyword} onChange={event => onKeywordChange(event.target.value)} placeholder="입금자명 / 금액 검색" className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink md:min-h-9" />
    <div className="flex flex-wrap gap-1" aria-label="입금 상태 필터">
      {STATUS_FILTERS.map(value => <button key={value} type="button" aria-pressed={statusFilter === value} onClick={() => onStatusFilterChange(value)} className={`min-h-11 rounded-full border px-3 text-xs font-bold md:min-h-9 ${chipClass(statusFilter === value,value)}`}>{value === "전체" ? "전체" : depositLedgerStatusLabel(value)}</button>)}
    </div>
    <details className="rounded-xl border border-line px-3 py-2 text-xs font-bold text-ink-soft">
      <summary className="cursor-pointer">기간 {appliedFromDate} ~ {appliedToDate} · 변경</summary>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input aria-label="입금 조회 시작일" type="date" value={fromDate} onChange={event=>onFromDateChange(event.target.value)} className="min-h-11 min-w-0 rounded-xl border border-line bg-surface px-2 md:min-h-9" />
        <input aria-label="입금 조회 종료일" type="date" value={toDate} onChange={event=>onToDateChange(event.target.value)} className="min-h-11 min-w-0 rounded-xl border border-line bg-surface px-2 md:min-h-9" />
        <button type="button" onClick={onApplyDate} className="min-h-11 rounded-xl bg-rose-deep px-3 text-white md:min-h-9">조회</button>
        <button type="button" onClick={onReset} className="min-h-11 rounded-xl border border-line px-3 md:min-h-9">초기화</button>
      </div>
    </details>
  </section>;
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="grid gap-3 xl:grid-cols-[1fr_180px_20px_180px_auto_auto] xl:items-center">
        <label className="relative block">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-ink-mute">⌕</span>
          <input
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="입금자명 / 금액 검색"
            className="h-12 w-full rounded-2xl border border-line bg-surface-2 pl-10 pr-4 text-sm font-bold text-ink outline-none transition focus:border-rose-deep focus:bg-surface focus:ring-4 focus:ring-rose-soft"
          />
        </label>

        <input
          type="date"
          value={fromDate}
          onChange={(event) => onFromDateChange(event.target.value)}
          className="h-12 rounded-2xl border border-line bg-surface px-4 text-sm font-black text-ink outline-none focus:border-rose-deep focus:ring-4 focus:ring-rose-soft"
        />

        <div className="hidden text-center text-sm font-black text-ink-mute xl:block">~</div>

        <input
          type="date"
          value={toDate}
          onChange={(event) => onToDateChange(event.target.value)}
          className="h-12 rounded-2xl border border-line bg-surface px-4 text-sm font-black text-ink outline-none focus:border-rose-deep focus:ring-4 focus:ring-rose-soft"
        />

        <button
          type="button"
          onClick={onApplyDate}
          className="h-12 rounded-2xl bg-rose-deep px-5 text-sm font-black text-white shadow-sm transition hover:bg-surface-3"
        >
          조회
        </button>

        <button
          type="button"
          onClick={onReset}
          className="h-12 rounded-2xl border border-line bg-surface px-5 text-sm font-black text-ink-soft transition hover:border-line hover:bg-surface-2"
        >
          초기화
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((value) => {
            const active = statusFilter === value;

            return (
              <button
                key={value}
                type="button"
                onClick={() => onStatusFilterChange(value)}
                className={`rounded-full border px-4 py-2 text-xs font-black transition ${chipClass(active, value)}`}
              >
                {depositLedgerStatusLabel(value)}
              </button>
            );
          })}
        </div>

        <div className="text-xs font-bold text-ink-mute">
          검색어는 입력 후 자동 반영 · 날짜는 조회 버튼으로 적용
        </div>
      </div>
    </section>
  );
}
