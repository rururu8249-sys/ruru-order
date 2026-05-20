"use client";

type PaymentMatchSyncStatusProps = {
  autoSyncEnabled: boolean;
  autoSyncLoading: boolean;
  lastAutoSyncLabel: string;
  lastAutoSyncMessage: string;
  serverDepositCount: number;
  onToggleAutoSync: () => void;
  onReloadList: () => void;
  serverDepositLoading: boolean;
};

export default function PaymentMatchSyncStatus({
  autoSyncEnabled,
  autoSyncLoading,
  lastAutoSyncLabel,
  lastAutoSyncMessage,
  serverDepositCount,
  onToggleAutoSync,
  onReloadList,
  serverDepositLoading,
}: PaymentMatchSyncStatusProps) {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[13px] font-black text-blue-950">
            입금내역 {serverDepositCount.toLocaleString()}건
          </div>
          <div className="mt-1 text-[12px] font-bold text-blue-700">
            {autoSyncEnabled ? "자동조회 켜짐" : "자동조회 꺼짐"}
            {autoSyncLoading ? " · 조회중" : ""}
            {lastAutoSyncLabel ? ` · 마지막 ${lastAutoSyncLabel}` : ""}
            {" · "}
            {lastAutoSyncMessage}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onToggleAutoSync}
            className={`rounded-lg px-3 py-2 text-[12px] font-black active:scale-[0.98] ${
              autoSyncEnabled ? "bg-emerald-600 text-white" : "bg-neutral-200 text-neutral-700"
            }`}
          >
            {autoSyncEnabled ? "자동조회 켜짐" : "자동조회 꺼짐"}
          </button>

          <button
            type="button"
            onClick={onReloadList}
            disabled={serverDepositLoading}
            className="rounded-lg bg-blue-600 px-3 py-2 text-[12px] font-black text-white active:scale-[0.98] disabled:bg-neutral-300"
          >
            {serverDepositLoading ? "불러오는중..." : "목록 새로고침"}
          </button>
        </div>
      </div>
    </div>
  );
}
