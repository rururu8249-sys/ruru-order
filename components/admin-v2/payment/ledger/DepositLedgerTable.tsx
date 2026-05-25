import type { LedgerStatus, RawDepositRow, SortDirection, SortKey } from "./depositLedgerTypes";
import {
  formatDepositDateTime,
  formatDepositMoney,
  getDepositAmount,
  getDepositName,
  getDepositStatus,
  getDepositTime,
  statusClass,
} from "./depositLedgerUtils";

type Props = {
  rows: RawDepositRow[];
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSortChange: (key: SortKey) => void;
  onOpenDetail: (row: RawDepositRow) => void;
};

function sortMark(active: boolean, direction: SortDirection) {
  if (!active) return <span className="text-[10px] text-slate-300">↕</span>;
  return <span className="text-[11px] text-blue-600">{direction === "asc" ? "↑" : "↓"}</span>;
}

function SortButton({
  label,
  sortName,
  sortKey,
  sortDirection,
  onSortChange,
}: {
  label: string;
  sortName: SortKey;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSortChange: (key: SortKey) => void;
}) {
  const active = sortName === sortKey;

  return (
    <button
      type="button"
      onClick={() => onSortChange(sortName)}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-black transition ${
        active ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      }`}
      title={`${label} 오름차순/내림차순 정렬`}
    >
      {label}
      {sortMark(active, sortDirection)}
    </button>
  );
}

function StatusBadge({ status }: { status: LedgerStatus }) {
  return (
    <span className={`inline-flex min-w-[74px] justify-center rounded-full border px-3 py-1 text-xs font-black ${statusClass(status)}`}>
      {status}
    </span>
  );
}

export default function DepositLedgerTable({
  rows,
  sortKey,
  sortDirection,
  onSortChange,
  onOpenDetail,
}: Props) {
  return (
    <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <div className="text-lg font-black text-slate-950">은행 입금내역</div>
          <div className="mt-1 text-xs font-bold text-slate-400">실제 입금 1건은 목록에서 반드시 1줄로만 표시됩니다.</div>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
          총 {rows.length.toLocaleString()}건
        </div>
      </div>

      <div className="overflow-auto px-4 pb-3">
        <table className="mx-auto min-w-[820px] max-w-[980px] w-full border-separate border-spacing-0">
          <colgroup>
            <col className="w-[250px]" />
            <col className="w-[210px]" />
            <col className="w-[170px]" />
            <col className="w-[130px]" />
            <col className="w-[90px]" />
          </colgroup>
          <thead>
            <tr className="bg-slate-50">
              <th className="px-4 py-3 text-left">
                <SortButton
                  label="입금일시"
                  sortName="time"
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onSortChange={onSortChange}
                />
              </th>
              <th className="px-4 py-3 text-left">
                <SortButton
                  label="입금자명"
                  sortName="name"
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onSortChange={onSortChange}
                />
              </th>
              <th className="px-4 py-3 text-right">
                <SortButton
                  label="입금금액"
                  sortName="amount"
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onSortChange={onSortChange}
                />
              </th>
              <th className="px-4 py-3 text-center text-xs font-black text-slate-500">상태</th>
              <th className="px-4 py-3 text-center text-xs font-black text-slate-500">상세</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-16 text-center">
                  <div className="text-lg font-black text-slate-700">조회된 입금내역이 없습니다.</div>
                  <div className="mt-2 text-sm font-bold text-slate-400">검색어, 날짜, 상태필터를 다시 확인해주세요.</div>
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const status = getDepositStatus(row);
                const rowKey = `${getDepositTime(row)}-${getDepositName(row)}-${getDepositAmount(row)}-${index}`;

                return (
                  <tr key={rowKey} className="group border-b border-slate-100 transition hover:bg-blue-50/40">
                    <td className="border-b border-slate-100 px-4 py-4 text-sm font-black text-slate-800">
                      {formatDepositDateTime(row)}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-4">
                      <div className="text-base font-black text-slate-950">{getDepositName(row) || "-"}</div>
                    </td>
                    <td className="border-b border-slate-100 px-4 py-4 text-right text-base font-black tabular-nums text-slate-950">
                      {formatDepositMoney(row ? getDepositAmount(row) : 0)}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-4 text-center">
                      <StatusBadge status={status} />
                    </td>
                    <td className="border-b border-slate-100 px-4 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => onOpenDetail(row)}
                        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                      >
                        보기
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
