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
    <aside className="flex min-h-screen w-[220px] shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6">
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

      {activeMenu === "broadcast" ? (
        <section
          className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
          data-ruru-quick-modal-dock="sidebar-inline"
        >
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black tracking-[0.18em] text-slate-400">QUICK</div>
              <div className="text-sm font-black text-slate-950">빠른보기</div>
            </div>
            <div className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-600">방송중</div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("ruru-admin-live-open-panel", { detail: "orders" }))}
              className="h-10 rounded-xl border border-blue-100 bg-blue-50 text-xs font-black text-blue-700 transition hover:bg-blue-100 active:scale-[0.98]"
            >
              주문
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("ruru-admin-live-open-panel", { detail: "payments" }))}
              className="h-10 rounded-xl border border-emerald-100 bg-emerald-50 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 active:scale-[0.98]"
            >
              입금
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("ruru-admin-live-open-panel", { detail: "customers" }))}
              className="h-10 rounded-xl border border-amber-100 bg-amber-50 text-xs font-black text-amber-700 transition hover:bg-amber-100 active:scale-[0.98]"
            >
              고객
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("ruru-admin-live-open-panel", { detail: "settlement" }))}
              className="h-10 rounded-xl border border-violet-100 bg-violet-50 text-xs font-black text-violet-700 transition hover:bg-violet-100 active:scale-[0.98]"
            >
              정산
            </button>
          </div>

          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => window.open("http://pf.kakao.com/_RMxaqX", "_blank", "noopener")}
              className="flex h-10 items-center justify-center gap-1 rounded-xl border border-blue-100 bg-blue-50 text-xs font-black text-blue-700 transition hover:bg-blue-100 active:scale-[0.98]"
            >
              <span>💬</span>
              카톡 상담
            </button>
            <button
              type="button"
              onClick={() => window.open("https://user.service.payster.co.kr/#/payment/smspayment", "_blank", "noopener")}
              className="flex h-10 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 text-xs font-black text-slate-700 transition hover:bg-slate-100 active:scale-[0.98]"
            >
              <span>💳</span>
              카드결제
            </button>
          </div>

          <div className="mt-2 rounded-xl bg-slate-50 px-2 py-2 text-[10px] font-bold leading-4 text-slate-500">
            방송 중 필요한 내용만 빠르게 확인
          </div>
        </section>
      ) : null}

      <div className="mt-4 space-y-3">
        <LiveOpsStatusBox />
        <AdminLiveCustomerIssueSummaryCard onOpenCustomers={() => onMenuChange("customers")} />
        <AdminLiveLogoutButton />
      </div>
    </aside>
  );
}
