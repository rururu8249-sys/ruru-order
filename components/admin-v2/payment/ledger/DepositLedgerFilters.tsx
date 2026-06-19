import type { LedgerStatus } from "./depositLedgerTypes";

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
}: Props) {
  return (
    <section className="rounded-[30px] border border-line bg-surface p-4 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
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
                {value}
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
