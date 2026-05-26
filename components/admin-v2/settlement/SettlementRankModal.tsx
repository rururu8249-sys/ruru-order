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
      <div className="w-full max-w-[680px] overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <div className="text-xl font-black text-slate-950">{title}</div>
            <div className="mt-1 text-sm font-bold text-slate-400">{subtitle}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            닫기
          </button>
        </div>

        <div className="max-h-[68vh] overflow-y-auto px-6 py-5">
          {items.length === 0 ? (
            <div className="rounded-3xl bg-slate-50 px-5 py-10 text-center text-sm font-black text-slate-400">
              표시할 순위 데이터가 없습니다.
            </div>
          ) : (
            <div className="grid gap-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-3 rounded-3xl border border-slate-100 bg-white px-4 py-4 shadow-[0_10px_28px_rgba(15,23,42,0.06)] sm:grid-cols-[54px_1fr_auto] sm:items-center"
                >
                  <div className="text-lg font-black text-slate-400">{item.rank}위</div>
                  <div>
                    <div className="text-sm font-black leading-5 text-slate-900">{item.title}</div>
                    <div className="mt-1 text-xs font-bold text-slate-400">{item.subLabel}</div>
                  </div>
                  <div className="text-lg font-black tabular-nums text-slate-950">{item.amountText}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
