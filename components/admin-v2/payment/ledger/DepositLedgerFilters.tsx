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
  if (!active) return "border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-600";
  if (value === "확인완료") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "주의") return "border-orange-200 bg-orange-50 text-orange-700";
  if (value === "미확인") return "border-slate-300 bg-slate-100 text-slate-700";
  return "border-blue-600 bg-blue-600 text-white";
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
    <section className="rounded-[30px] border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
      <div className="grid gap-3 xl:grid-cols-[1fr_180px_20px_180px_auto_auto] xl:items-center">
        <label className="relative block">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">⌕</span>
          <input
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="입금자명 / 금액 검색"
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50"
          />
        </label>

        <input
          type="date"
          value={fromDate}
          onChange={(event) => onFromDateChange(event.target.value)}
          className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
        />

        <div className="hidden text-center text-sm font-black text-slate-300 xl:block">~</div>

        <input
          type="date"
          value={toDate}
          onChange={(event) => onToDateChange(event.target.value)}
          className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
        />

        <button
          type="button"
          onClick={onApplyDate}
          className="h-12 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-sm transition hover:bg-slate-800"
        >
          조회
        </button>

        <button
          type="button"
          onClick={onReset}
          className="h-12 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
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

        <div className="text-xs font-bold text-slate-400">
          검색어는 입력 후 자동 반영 · 날짜는 조회 버튼으로 적용
        </div>
      </div>
    </section>
  );
}
