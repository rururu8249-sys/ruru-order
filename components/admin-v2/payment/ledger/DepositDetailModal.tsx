import type { ReactNode } from "react";
import type { LedgerStatus, RawDepositRow } from "./depositLedgerTypes";
import DepositLinkedOrderInfo from "./DepositLinkedOrderInfo";
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
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[108px_1fr] items-start gap-3 border-b border-slate-100 px-1 py-3 last:border-b-0">
      <div className="text-xs font-black text-slate-400">{label}</div>
      <div className="min-w-0 text-sm font-black leading-5 text-slate-900">{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: LedgerStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusClass(status)}`}>
      {status}
    </span>
  );
}

function guideText(status: LedgerStatus) {
  if (status === "확인완료") {
    return {
      title: "확인완료 입금입니다.",
      body: "메인 목록은 은행 입금 1건 기준으로만 표시하고, 주문 연결·처리방식은 상세정보에서만 확인합니다.",
      className: "border-emerald-100 bg-emerald-50 text-emerald-800",
    };
  }

  if (status === "주의") {
    return {
      title: "확인 필요 입금입니다.",
      body: "입금자명, 금액, 입금시간 또는 상태값을 다시 확인하세요.",
      className: "border-orange-100 bg-orange-50 text-orange-800",
    };
  }

  return {
    title: "아직 확인되지 않은 입금입니다.",
    body: "실제 은행 입금내역은 존재하지만 주문 연결 또는 처리 상태 확인이 필요할 수 있습니다.",
    className: "border-slate-200 bg-slate-50 text-slate-700",
  };
}

export default function DepositDetailModal({ row, onClose }: Props) {
  if (!row) return null;

  const status = getDepositStatus(row);
  const guide = guideText(status);
  const depositorName = getDepositName(row) || "-";
  const amount = getDepositAmount(row);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 px-4 py-4 backdrop-blur-sm">
      <div className="flex max-h-[calc(100dvh-32px)] w-full max-w-[680px] flex-col overflow-hidden rounded-[30px] bg-white shadow-[0_30px_100px_rgba(15,23,42,0.35)]">
        <div className="shrink-0 border-b border-slate-100 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                읽기전용 상세정보
              </div>
              <div className="mt-2 text-2xl font-black tracking-tight text-slate-950">입금 상세정보</div>
              <div className="mt-1 text-sm font-bold text-slate-400">실제 은행 입금 1건에 대한 상세 기록입니다.</div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-lg font-black text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-800"
              aria-label="닫기"
            >
              ×
            </button>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-black text-slate-400">입금자명</div>
              <div className="mt-1 truncate text-base font-black text-slate-950">{depositorName}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-black text-slate-400">입금금액</div>
              <div className="mt-1 text-base font-black tabular-nums text-slate-950">{formatMoney(amount)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-black text-slate-400">처리상태</div>
              <div className="mt-1">
                <StatusBadge status={status} />
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className={`rounded-2xl border px-4 py-3 ${guide.className}`}>
            <div className="text-sm font-black">{guide.title}</div>
            <div className="mt-1 text-xs font-bold leading-5 opacity-85">{guide.body}</div>
          </div>

          <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4">
            <DetailLine label="입금자명">{depositorName}</DetailLine>
            <DetailLine label="입금금액">{formatMoney(amount)}</DetailLine>
            <DetailLine label="입금일시">{formatDepositDateTime(row)}</DetailLine>
            <DetailLine label="처리상태">
              <StatusBadge status={status} />
            </DetailLine>
            <DetailLine label="처리방식">{getProcessMethod(row)}</DetailLine>
            <DetailLine label="주문연결">{getSafeOrderConnection(row)}</DetailLine>
            <DetailLine label="은행메모">{getBankMemo(row)}</DetailLine>
          </div>

          <div className="mt-3">
            <DepositLinkedOrderInfo row={row} />
          </div>

          <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold leading-5 text-blue-800">
            메인 입금내역 목록은 은행앱처럼 단순 조회용으로 유지합니다. 운영 정보는 이 상세정보에서만 확인합니다.
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-white px-6 py-4 shadow-[0_-10px_30px_rgba(15,23,42,0.06)]">
          <div className="flex justify-end gap-2">
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
    </div>
  );
}
