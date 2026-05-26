import { ADMIN_LIVE_MENUS, type AdminLiveMenuKey } from "./adminLiveMenu";
import LiveOpsStatusBox from "./LiveOpsStatusBox";
import AdminLiveLogoutButton from "./AdminLiveLogoutButton";
import AdminLiveCustomerIssueSummaryCard from "./AdminLiveCustomerIssueSummaryCard";


type Props = {
  activeMenu: AdminLiveMenuKey;
  onMenuChange: (menuKey: AdminLiveMenuKey) => void;
};

export default function AdminLiveSidebar({ activeMenu, onMenuChange }: Props) {
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
        {ADMIN_LIVE_MENUS.map((menu) => {
          const active = menu.key === activeMenu;
          return (
            <button
              key={menu.key}
              type="button"
              onClick={() => onMenuChange(menu.key)}
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

      <div className="mt-auto space-y-3">
        <LiveOpsStatusBox />

        <AdminLiveCustomerIssueSummaryCard onOpenCustomers={() => onMenuChange("customers")} />
      </div>
          <AdminLiveLogoutButton />
    </aside>
  );
}
