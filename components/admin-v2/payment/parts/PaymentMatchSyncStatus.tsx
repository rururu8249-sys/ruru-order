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
    <div className="mb-3 rounded-xl border border-line bg-surface px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[12px] font-black text-ink">
            <span>입금내역 {serverDepositCount.toLocaleString()}건</span>
            <span className={autoSyncEnabled ? "text-ok-tx" : "text-ink-mute"}>
              {autoSyncEnabled ? "자동조회 + 정확매칭 자동확인 켜짐" : "자동조회 + 자동확인 꺼짐"}
            </span>
            {autoSyncLoading && <span className="text-info-tx">조회중</span>}
            {lastAutoSyncLabel && <span className="text-ink-soft">마지막 {lastAutoSyncLabel}</span>}
          </div>

          <div className="mt-0.5 truncate text-[11px] font-bold text-ink-soft">
            {lastAutoSyncMessage}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onToggleAutoSync}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-black active:scale-[0.98] ${
              autoSyncEnabled ? "bg-emerald-600 text-white" : "bg-surface-3 text-ink"
            }`}
          >
            {autoSyncEnabled ? "자동 ON" : "자동 OFF"}
          </button>

          <button
            type="button"
            onClick={onReloadList}
            disabled={serverDepositLoading}
            className="rounded-lg bg-neutral-950 px-3 py-1.5 text-[12px] font-black text-white active:scale-[0.98] disabled:bg-surface-3"
          >
            {serverDepositLoading ? "불러오는중" : "목록 새로고침"}
          </button>
        </div>
      </div>
    </div>
  );
}
