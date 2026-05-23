const menus = [
  { key: "broadcast", label: "방송", icon: "📡", desc: "라이브 컨트롤타워" },
  { key: "orders", label: "주문관리", icon: "📋", desc: "주문 상세 관리" },
  { key: "payments", label: "입금확인", icon: "₩", desc: "입금·수동매칭" },
  { key: "customers", label: "회원관리", icon: "👤", desc: "고객·특이사항" },
  { key: "settlement", label: "정산", icon: "◔", desc: "방송·날짜별 정산" },
  { key: "settings", label: "설정", icon: "⚙", desc: "운영 설정" },
];

export default function AdminLiveSidebar() {
  return (
    <aside className="flex h-screen w-[220px] shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white">▶</div>
        <div>
          <div className="text-lg font-black tracking-tight text-slate-950">루루동이LIVE</div>
          <div className="text-[11px] font-bold text-slate-400">운영 컨트롤타워</div>
        </div>
      </div>

      <nav className="space-y-1.5">
        {menus.map((menu) => {
          const active = menu.key === "broadcast";
          return (
            <button
              key={menu.key}
              type="button"
              className={[
                "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition",
                active
                  ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
              ].join(" ")}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-base shadow-sm ring-1 ring-slate-100">
                {menu.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-black">{menu.label}</span>
                <span className="block truncate text-[10px] font-bold opacity-60">{menu.desc}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-500">!</span>
          현재 화면
        </div>
        <p className="text-xs leading-5 text-slate-500">
          방송 메뉴는 실시간 주문·입금매칭 중심입니다. 주문관리/회원관리는 다음 단계에서 별도 화면으로 확장합니다.
        </p>
      </div>
    </aside>
  );
}
