import { ADMIN_LIVE_MENUS, type AdminLiveMenuKey } from "./adminLiveMenu";
import LiveOpsStatusBox from "./LiveOpsStatusBox";
import AdminLiveLogoutButton from "./AdminLiveLogoutButton";
import AdminLiveCustomerIssueSummaryCard from "./AdminLiveCustomerIssueSummaryCard";

type Props = {
  activeMenu: AdminLiveMenuKey;
  onMenuChange: (menuKey: AdminLiveMenuKey) => void;
  broadcastLive: boolean;
  canStartBroadcast: boolean;
  savingBroadcast?: boolean;
  onStartBroadcast: () => void;
  onEndBroadcast: () => void;
};

export default function AdminLiveSidebar({
  activeMenu,
  onMenuChange,
  broadcastLive,
  canStartBroadcast,
  savingBroadcast = false,
  onStartBroadcast,
  onEndBroadcast,
}: Props) {
  return (
    <aside className="flex min-h-screen w-[220px] shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-deep text-white">▶</div>
        <div>
          <div className="text-lg font-black tracking-tight text-slate-950">루루동이LIVE</div>
          <div className="text-[11px] font-bold text-slate-400">운영 컨트롤타워</div>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-2xl border border-rose-line bg-rose-soft px-3 py-2.5">
        <span className="text-[13px] font-black text-rose-deep">방송모드</span>
        <button
          type="button"
          disabled={savingBroadcast || (!broadcastLive && !canStartBroadcast)}
          onClick={() => (broadcastLive ? onEndBroadcast() : onStartBroadcast())}
          title={!broadcastLive && !canStartBroadcast ? "유튜브 라이브 URL을 먼저 입력하세요" : broadcastLive ? "방송 종료" : "방송 시작"}
          aria-pressed={broadcastLive}
          className={[
            "relative h-5 w-9 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-40",
            broadcastLive ? "bg-red-600" : "bg-slate-300",
          ].join(" ")}
        >
          <span
            className={[
              "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
              broadcastLive ? "right-0.5" : "left-0.5",
            ].join(" ")}
          />
        </button>
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
                  ? "bg-rose-soft text-rose-deep shadow-sm ring-1 ring-rose-line"
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
            <div className="rounded-full bg-rose-soft px-2 py-1 text-[10px] font-black text-rose-deep">방송중</div>
          </div>

          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => window.open("https://business.kakao.com/_RMxaqX/chats?t_src=business_partnercenter&t_ch=lnb&t_obj=%EB%82%B4%EC%B1%84%ED%8C%85_%ED%81%B4%EB%A6%AD", "ruruKakaoConsult", "popup=yes,width=1200,height=860")}
              className="flex h-10 items-center justify-center gap-1 rounded-xl border border-rose-line bg-rose-soft text-xs font-black text-rose-deep transition hover:bg-rose-soft active:scale-[0.98]"
            >
              <span>💬</span>
              카톡채널
            </button>
            <button
              type="button"
              onClick={() => window.open("https://user.service.payster.co.kr/#/payment/smspayment", "ruruPayster", "popup=yes,width=480,height=720")}
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

      <div className="mt-auto pt-4">
        <AdminLiveLogoutButton />
      </div>
    </aside>
  );
}
