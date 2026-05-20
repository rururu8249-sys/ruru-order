"use client";

type PaymentMatchTopActionsProps = {
  previewLoading: boolean;
  syncing: boolean;
  autoSyncLoading: boolean;
  onPreview: () => void;
  onSync: () => void;
};

export default function PaymentMatchTopActions({
  previewLoading,
  syncing,
  autoSyncLoading,
  onPreview,
  onSync,
}: PaymentMatchTopActionsProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={onPreview}
        disabled={previewLoading}
        className="rounded-lg bg-neutral-950 px-4 py-2 text-[13px] font-black text-white shadow-sm active:scale-[0.98] disabled:bg-neutral-300"
      >
        {previewLoading ? "확인중..." : "후보 확인"}
      </button>

      <button
        type="button"
        onClick={onSync}
        disabled={syncing || autoSyncLoading}
        className="rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-black text-white shadow-sm active:scale-[0.98] disabled:bg-neutral-300"
      >
        {syncing || autoSyncLoading ? "조회중..." : "입금 새로고침"}
      </button>
    </div>
  );
}
