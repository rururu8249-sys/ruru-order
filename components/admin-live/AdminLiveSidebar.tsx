// components/admin-live/AdminLiveSidebar.tsx
// [2026-09-08 5단계 · 레이아웃 B] 큰 메뉴 5개(방송 / 주문·입금 / 상품 / 고객 / 설정). 누르면 화면이 통째로 바뀐다.
//   · 예외 배지(매칭필요·카드미결제)는 「주문·입금」에 붙는다.
//   · 예전 「빠른보기」(카톡·카드결제·알림음)는 오른쪽 방송 레일로 옮겼다(AdminLiveBroadcastRail).
//   · 실시간 접속 위젯은 그대로(방송 중 바로 보는 숫자).
import { ADMIN_LIVE_TOP_MENUS, topMenuOf, type AdminLiveMenuKey } from "./adminLiveMenu";
import AdminLiveLogoutButton from "./AdminLiveLogoutButton";
import AdminLiveMenuIcon from "./AdminLiveMenuIcon";
import AdminLiveSidebarPresence from "./AdminLiveSidebarPresence";

type Props = {
  activeMenu: AdminLiveMenuKey;
  onMenuChange: (menuKey: AdminLiveMenuKey) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  navOpen?: boolean;
  onCloseNav?: () => void;
  /** 예외 배지 (읽기 전용): 매칭필요/카드미결제 건수 — 주문·입금 메뉴에 표시 */
  exceptionBadges?: { needMatch: number; cardUnpaid: number };
  /** 배지 클릭 시 해당 상태 필터로 바로 이동 (match=매칭필요, card=카드미결제) */
  onExceptionBadgeClick?: (kind: "match" | "card") => void;
  /** 방송 중 표시(사이드바 상단 점) */
  broadcastOn?: boolean;
  /** 「접속 기록 보기」 → 고객 › 접속 기록 화면으로 (예전엔 사이드바 안 팝업이었다) */
  onOpenVisitStats?: () => void;
};

export default function AdminLiveSidebar({
  activeMenu,
  onMenuChange,
  theme,
  onToggleTheme,
  navOpen = false,
  onCloseNav,
  exceptionBadges,
  onExceptionBadgeClick,
  broadcastOn = false,
  onOpenVisitStats,
}: Props) {
  const activeTop = topMenuOf(activeMenu);

  return (
    <>
      {/* 모바일: 드로어 열렸을 때 뒤 어둡게(클릭하면 닫힘). 데스크탑(md+)에선 숨김 */}
      {navOpen ? (
        <button
          type="button"
          aria-label="메뉴 닫기"
          onClick={onCloseNav}
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
        />
      ) : null}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex w-[220px] shrink-0 flex-col overflow-y-auto border-r border-line bg-surface px-4 py-6 transition-transform duration-200",
          "md:static md:z-auto md:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="mb-6 flex items-center gap-2 px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-deep text-white">
            <AdminLiveMenuIcon menu="broadcast" className="h-[17px] w-[17px]" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-lg font-black tracking-tight text-ink">루루동이LIVE</div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-ink-mute">
              <span className={`inline-block h-2 w-2 rounded-full ${broadcastOn ? "bg-danger-tx" : "bg-line"}`} />
              {broadcastOn ? "방송 중" : "방송 대기"}
            </div>
          </div>
          {/* 모바일 닫기 버튼 */}
          <button
            type="button"
            onClick={onCloseNav}
            className="ml-auto rounded-lg p-1 text-ink-mute hover:bg-surface-2 md:hidden"
            aria-label="메뉴 닫기"
          >
            ✕
          </button>
        </div>

        <nav className="space-y-1">
          {ADMIN_LIVE_TOP_MENUS.map((menu) => {
            const active = menu.key === activeTop;
            const showBadges = menu.key === "orders" && exceptionBadges && (exceptionBadges.needMatch > 0 || exceptionBadges.cardUnpaid > 0);

            return (
              <button
                key={menu.key}
                type="button"
                onClick={() => {
                  onMenuChange(menu.defaultKey);
                  onCloseNav?.();
                }}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition",
                  active
                    ? "bg-rose-soft text-rose-deep shadow-sm ring-1 ring-rose-line"
                    : "text-ink-soft hover:bg-surface-2 hover:text-ink",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1",
                    active ? "bg-rose-deep text-white ring-rose-deep" : "bg-surface text-ink-soft ring-line",
                  ].join(" ")}
                  aria-hidden
                >
                  <AdminLiveMenuIcon menu={menu.key} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-black">{menu.label}</span>
                  <span className="block truncate text-[10px] font-bold opacity-60">{menu.desc}</span>
                </span>
                {showBadges ? (
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    {exceptionBadges.needMatch > 0 ? (
                      <span
                        role="button"
                        title={`입금자명·금액이 주문과 자동으로 안 맞아 수동 확인이 필요한 주문 ${exceptionBadges.needMatch}건 — 클릭하면 해당 주문만 보여요`}
                        onClick={(e) => { e.stopPropagation(); onExceptionBadgeClick?.("match"); onCloseNav?.(); }}
                        className="cursor-pointer whitespace-nowrap rounded-full bg-danger-bg px-2 py-0.5 text-[10px] font-black text-danger-tx hover:ring-2 hover:ring-danger-tx/30"
                      >매칭필요 {exceptionBadges.needMatch} ›</span>
                    ) : null}
                    {exceptionBadges.cardUnpaid > 0 ? (
                      <span
                        role="button"
                        title={`카드결제 선택 후 아직 결제완료 처리 전인 주문 ${exceptionBadges.cardUnpaid}건 — 클릭하면 해당 주문만 보여요`}
                        onClick={(e) => { e.stopPropagation(); onExceptionBadgeClick?.("card"); onCloseNav?.(); }}
                        className="cursor-pointer whitespace-nowrap rounded-full bg-danger-bg px-2 py-0.5 text-[10px] font-black text-danger-tx hover:ring-2 hover:ring-danger-tx/30"
                      >카드미결제 {exceptionBadges.cardUnpaid} ›</span>
                    ) : null}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* [2026-08-29 사장님 요청] 실시간 접속자 — 사이드바에서 바로 보이게 */}
        <AdminLiveSidebarPresence onOpenVisitStats={() => { onOpenVisitStats?.(); onCloseNav?.(); }} />

        <div className="mt-auto space-y-2 pt-4">
          {/* 라이트/다크 토글 */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 py-2.5 text-xs font-black text-ink-soft transition hover:bg-surface-3"
          >
            {theme === "dark" ? "☀️ 라이트 모드" : "🌙 다크 모드"}
          </button>
          <AdminLiveLogoutButton />
        </div>
      </aside>
    </>
  );
}
