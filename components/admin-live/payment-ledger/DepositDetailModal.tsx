import type { ReactNode } from "react";
import type { LedgerStatus, RawDepositRow } from "./depositLedgerTypes";
import { depositLedgerStatusLabel } from "@/lib/orderLabels";
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
  presentation?: "modal" | "inline";
  /** [2026-10-21 a4-3] 아직 주문과 안 맞은 입금 → 입금매칭 창을 이 입금으로 연다(매칭 로직은 그 창 그대로) */
  onOpenMatch?: (row: RawDepositRow) => void;
};

function DetailLine({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[108px_1fr] items-start gap-3 border-b border-line-soft px-1 py-3 last:border-b-0">
      <div className="text-xs font-black text-ink-mute">{label}</div>
      <div className="min-w-0 text-sm font-black leading-5 text-ink">{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: LedgerStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusClass(status)}`}>
      {depositLedgerStatusLabel(status)}
    </span>
  );
}

function guideText(status: LedgerStatus) {
  if (status === "확인완료") {
    return {
      title: "주문과 연결이 끝난 입금이에요.",
      body: "연결된 주문은 아래 「연결된 주문」에서 확인해요.",
      className: "border-line bg-ok-bg text-ok-tx",
    };
  }

  if (status === "주의") {
    return {
      title: "확인이 필요한 입금이에요.",
      body: "입금자명·금액·입금시간을 다시 확인해 주세요.",
      className: "border-line bg-warn-bg text-warn-tx",
    };
  }

  return {
    title: "아직 주문과 연결되지 않은 입금이에요.",
    body: "아래 「입금매칭에서 주문 연결」로 주문을 찾아 연결해요.",
    className: "border-line bg-surface-2 text-ink",
  };
}

export default function DepositDetailModal({ row, onClose, presentation = "modal", onOpenMatch }: Props) {
  if (!row) return null;

  const status = getDepositStatus(row);
  const guide = guideText(status);
  const depositorName = getDepositName(row) || "-";
  const amount = getDepositAmount(row);

  return (
    <div className={presentation === "inline" ? "w-full" : "fixed inset-0 z-[80] flex items-center justify-center bg-[var(--color-ink-soft)]/35 px-4 py-4 backdrop-blur-sm"}>
      <div className={presentation === "inline" ? "flex w-full flex-col rounded-2xl bg-surface" : "flex max-h-[calc(100dvh-32px)] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl"}>
        {presentation === "inline" ? <button type="button" onClick={onClose} className="min-h-11 self-start rounded-xl border border-line px-3 text-sm font-bold text-ink md:min-h-9">‹ 목록으로</button> : null}
        <div className="shrink-0 border-b border-line-soft px-6 py-4">
          <div>
            <div className="text-[20px] font-bold text-ink">입금 상세</div>
            <div className="mt-1 text-[13px] text-ink-mute">은행 입금 1건의 기록 — 여기서는 바꿀 수 없어요.</div>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <div className="rounded-2xl border border-line bg-surface-2 p-3">
              <div className="text-xs font-black text-ink-mute">입금자명</div>
              <div className="mt-1 truncate text-base font-black text-ink">{depositorName}</div>
            </div>
            <div className="rounded-2xl border border-line bg-surface-2 p-3">
              <div className="text-xs font-black text-ink-mute">입금금액</div>
              <div className="mt-1 text-base font-black tabular-nums text-ink">{formatMoney(amount)}</div>
            </div>
            <div className="rounded-2xl border border-line bg-surface-2 p-3">
              <div className="text-xs font-black text-ink-mute">처리상태</div>
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

          <div className="mt-3 rounded-2xl border border-line bg-surface px-4">
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
        </div>

        <div className="shrink-0 border-t border-line-soft bg-surface px-6 py-4 shadow-sm">
          <div className="flex items-center justify-end gap-2">
            {/* [2026-10-21 a4-3] 입금내역(조회) → 입금매칭(처리) 입구. 매칭 자체는 입금매칭 창의 기존 API 그대로 */}
            {onOpenMatch && status !== "확인완료" ? (
              <button
                type="button"
                onClick={() => onOpenMatch(row)}
                className="h-10 rounded-lg bg-ink px-4 text-[13px] font-bold text-white transition"
              >
                입금매칭에서 주문 연결
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-lg border border-line bg-surface px-4 text-[13px] font-bold text-ink transition hover:bg-surface-2"
            >
              {presentation === "inline" ? "목록으로" : "확인"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
