"use client";

type RankModalItem = {
  id: string;
  rank: number;
  title: string;
  amountText: string;
  subLabel: string;
};

export default function SettlementRankModal({
  open,
  title,
  subtitle,
  items,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  items: RankModalItem[];
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-[680px] overflow-hidden rounded-[30px] border border-line bg-surface shadow-[0_30px_90px_rgba(15,23,42,0.28)]">
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-6 py-5">
          <div>
            <div className="text-xl font-black text-ink">{title}</div>
            <div className="mt-1 text-sm font-bold text-ink-mute">{subtitle}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-line bg-surface px-4 py-2 text-sm font-black text-ink shadow-sm transition hover:bg-surface-2"
          >
            닫기
          </button>
        </div>

        <div className="max-h-[68vh] overflow-y-auto px-6 py-5">
          {items.length === 0 ? (
            <div className="rounded-3xl bg-surface-2 px-5 py-10 text-center text-sm font-black text-ink-mute">
              표시할 순위 데이터가 없습니다.
            </div>
          ) : (
            <div className="grid gap-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-3 rounded-3xl border border-line-soft bg-surface px-4 py-4 shadow-[0_10px_28px_rgba(15,23,42,0.06)] sm:grid-cols-[54px_1fr_auto] sm:items-center"
                >
                  <div className="text-lg font-black text-ink-mute">{item.rank}위</div>
                  <div>
                    <div className="text-sm font-black leading-5 text-ink">{item.title}</div>
                    <div className="mt-1 text-xs font-bold text-ink-mute">{item.subLabel}</div>
                  </div>
                  <div className="text-lg font-black tabular-nums text-ink">{item.amountText}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
