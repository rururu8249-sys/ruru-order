const stats = [
  { label: "총매출 (미입금포함)", amount: "₩14,280,000", sub: "주문 320건", icon: "📈", color: "bg-violet-50 text-violet-700" },
  { label: "무통장입금", amount: "₩3,210,000", sub: "입금완료 78건", icon: "🏦", color: "bg-orange-50 text-orange-700" },
  { label: "무통장미입금", amount: "₩1,260,000", sub: "미입금 24건", icon: "⏱", color: "bg-amber-50 text-amber-700" },
  { label: "카드결제완료", amount: "₩8,040,000", sub: "결제완료 178건", icon: "💳", color: "bg-emerald-50 text-emerald-700" },
  { label: "카드미결제", amount: "₩1,770,000", sub: "미결제 32건", icon: "💳", color: "bg-blue-50 text-blue-700" },
];

export default function LiveStatsCards() {
  return (
    <section className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-5">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base ${stat.color}`}>{stat.icon}</div>
            <div className="min-w-0">
              <div className="truncate text-xs font-black text-slate-500">{stat.label}</div>
              <div className="text-[17px] font-black tracking-tight text-slate-950">{stat.amount}</div>
              <div className="mt-0.5 text-[11px] font-bold text-slate-400">{stat.sub}</div>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
