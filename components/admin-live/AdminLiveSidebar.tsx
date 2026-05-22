const menus = [
  { key: "broadcast", label: "방송", icon: "📡" },
  { key: "orders", label: "주문서", icon: "📋" },
  { key: "payments", label: "입금확인", icon: "₩" },
  { key: "settlement", label: "정산", icon: "◔" },
  { key: "settings", label: "설정", icon: "⚙" },
];

export default function AdminLiveSidebar() {
  return (
    <aside className="flex h-screen w-[220px] shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6">
      <div className="mb-10 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white">▶</div>
        <div className="text-lg font-black tracking-tight text-slate-950">루루동이LIVE</div>
      </div>

      <nav className="space-y-2">
        {menus.map((menu) => {
          const active = menu.key === "broadcast";
          return (
            <button
              key={menu.key}
              type="button"
              className={[
                "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-[15px] font-bold transition",
                active
                  ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
              ].join(" ")}
            >
              <span className="flex h-7 w-7 items-center justify-center text-base">{menu.icon}</span>
              <span>{menu.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-500">?</span>
          도움말
        </div>
        <p className="text-xs leading-5 text-slate-500">자주 묻는 질문과 이용 가이드를 확인하세요.</p>
      </div>
    </aside>
  );
}
