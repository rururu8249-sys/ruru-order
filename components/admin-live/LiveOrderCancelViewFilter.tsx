"use client";

export type LiveOrderCancelViewFilterValue = "all" | "active" | "canceled";

type Props = {
  value: LiveOrderCancelViewFilterValue;
  totalCount: number;
  activeCount: number;
  canceledCount: number;
  onChange: (value: LiveOrderCancelViewFilterValue) => void;
};

function buttonClass(active: boolean, tone: "dark" | "blue" | "red") {
  if (active) {
    if (tone === "blue") return "bg-rose-deep text-white";
    if (tone === "red") return "bg-red-600 text-white";
    return "bg-slate-950 text-white";
  }

  if (tone === "red") return "bg-surface text-danger-tx hover:bg-danger-bg";
  if (tone === "blue") return "bg-surface text-ink-soft hover:bg-rose-soft";
  return "bg-surface text-ink-soft hover:bg-surface-2";
}

export default function LiveOrderCancelViewFilter({
  value,
  totalCount,
  activeCount,
  canceledCount,
  onChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface-2 px-3 py-2">
      <span className="text-xs font-black text-ink-soft">주문보기</span>

      <button
        type="button"
        onClick={() => onChange("all")}
        className={["rounded-xl px-3 py-1.5 text-xs font-black", buttonClass(value === "all", "dark")].join(" ")}
      >
        전체 {totalCount.toLocaleString("ko-KR")}
      </button>

      <button
        type="button"
        onClick={() => onChange("active")}
        className={["rounded-xl px-3 py-1.5 text-xs font-black", buttonClass(value === "active", "blue")].join(" ")}
      >
        정상 {activeCount.toLocaleString("ko-KR")}
      </button>

      <button
        type="button"
        onClick={() => onChange("canceled")}
        className={["rounded-xl px-3 py-1.5 text-xs font-black", buttonClass(value === "canceled", "red")].join(" ")}
      >
        주문서취소만 보기 {canceledCount.toLocaleString("ko-KR")}
      </button>
    </div>
  );
}
