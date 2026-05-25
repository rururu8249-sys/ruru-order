import type { RawDepositRow } from "./depositLedgerTypes";
import {
  formatDepositDateTime,
  formatMoney,
  getBankMemo,
  getDepositAmount,
  getDepositName,
  getDepositStatus,
  getProcessMethod,
  getSafeOrderConnection,
  statusClass,
} from "./depositLedgerUtils";

type Props = {
  row: RawDepositRow | null;
  onClose: () => void;
};

function DetailLine({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-4 border-b border-slate-100 px-1 py-4 last:border-b-0">
      <div className="text-sm font-black text-slate-400">{label}</div>
      <div className="text-sm font-black text-slate-900">{children}</div>
    </div>
  );
}

export default function DepositDetailModal({ row, onClose }: Props) {
  if (!row) return null;

  const status = getDepositStatus(row);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-[34px] bg-white shadow-[0_30px_100px_rgba(15,23,42,0.35)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-7 py-6">
          <div>
            <div className="text-2xl font-black tracking-tight text-slate-950">입금 상세정보</div>
            <div className="mt-1 text-sm font-bold text-slate-400">
              연결/처리 정보는 상세에서만 확인합니다.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-2xl border border-slate-200 text-lg font-black text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div className="px-7 py-3">
          <DetailLine label="입금자명">{getDepositName(row) || "-"}</DetailLine>
          <DetailLine label="입금금액">{formatMoney(getDepositAmount(row))}</DetailLine>
          <DetailLine label="입금일시">{formatDepositDateTime(row)}</DetailLine>
          <DetailLine label="처리상태">
            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusClass(status)}`}>
              {status}
            </span>
          </DetailLine>
          <DetailLine label="처리방식">{getProcessMethod(row)}</DetailLine>
          <DetailLine label="주문연결">{getSafeOrderConnection(row)}</DetailLine>
          <DetailLine label="은행메모">{getBankMemo(row)}</DetailLine>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-7 py-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-600 transition hover:bg-slate-100"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
