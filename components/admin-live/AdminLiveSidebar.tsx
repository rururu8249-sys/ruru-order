import { ADMIN_LIVE_MENUS, type AdminLiveMenuKey } from "./adminLiveMenu";
import AdminSoundControl from "./AdminSoundControl";
import AdminLiveLogoutButton from "./AdminLiveLogoutButton";

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
}: Props) {
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
          "fixed inset-y-0 left-0 z-40 flex w-[220px] shrink-0 flex-col border-r border-line bg-surface px-4 py-6 transition-transform duration-200",
          "md:static md:z-auto md:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="mb-8 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-deep text-white">▶</div>
          <div className="min-w-0">
            <div className="truncate text-lg font-black tracking-tight text-ink">루루동이LIVE</div>
            <div className="text-[11px] font-bold text-ink-mute">운영 컨트롤타워</div>
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

        <nav className="space-y-1.5">
          {ADMIN_LIVE_MENUS.map((menu) => {
            const active = menu.key === activeMenu;

            return (
              <button
                key={menu.key}
                type="button"
                onClick={() => {
                  onMenuChange(menu.key);
                  onCloseNav?.();
                }}
                className={[
                  "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition",
                  active
                    ? "bg-rose-soft text-rose-deep shadow-sm ring-1 ring-rose-line"
                    : "text-ink-soft hover:bg-surface-2 hover:text-ink",
                ].join(" ")}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface text-base shadow-sm ring-1 ring-line">
                  {menu.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-black">{menu.label}</span>
                  <span className="block truncate text-[10px] font-bold opacity-60">{menu.desc}</span>
                </span>
                {menu.key === "broadcast" && exceptionBadges && (exceptionBadges.needMatch > 0 || exceptionBadges.cardUnpaid > 0) ? (
                  <span className="ml-auto flex shrink-0 flex-col items-end gap-0.5">
                    {exceptionBadges.needMatch > 0 ? (
                      <span
                        role="button"
                        title={`입금자명·금액이 주문과 자동으로 안 맞아 수동 확인이 필요한 주문 ${exceptionBadges.needMatch}건 — 클릭하면 해당 주문만 보여요`}
                        onClick={(e) => { e.stopPropagation(); onExceptionBadgeClick?.("match"); }}
                        className="cursor-pointer whitespace-nowrap rounded-full bg-danger-bg px-2 py-0.5 text-[10px] font-black text-danger-tx hover:ring-2 hover:ring-danger-tx/30"
                      >매칭 {exceptionBadges.needMatch} ›</span>
                    ) : null}
                    {exceptionBadges.cardUnpaid > 0 ? (
                      <span
                        role="button"
                        title={`카드결제 선택 후 아직 결제완료 처리 전인 주문 ${exceptionBadges.cardUnpaid}건 — 클릭하면 해당 주문만 보여요`}
                        onClick={(e) => { e.stopPropagation(); onExceptionBadgeClick?.("card"); }}
                        className="cursor-pointer whitespace-nowrap rounded-full bg-danger-bg px-2 py-0.5 text-[10px] font-black text-danger-tx hover:ring-2 hover:ring-danger-tx/30"
                      >카드 {exceptionBadges.cardUnpaid} ›</span>
                    ) : null}
                  </span>
                ) : null}
              </button>
            );
          })}

          {/* 유튜브 SEO·썸네일 생성기 — 독립 툴 페이지 링크 (메뉴 state 미사용, 새 탭) */}
          <a
            href="/admin-live/youtube-seo"
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-ink-soft transition hover:bg-surface-2 hover:text-ink"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface text-base shadow-sm ring-1 ring-line">
              🎬
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-black">유튜브 SEO</span>
              <span className="block truncate text-[10px] font-bold opacity-60">제목·썸네일 생성기</span>
            </span>
            <span className="ml-auto shrink-0 text-[10px] font-black opacity-40">↗</span>
          </a>
        </nav>

        {activeMenu === "broadcast" ? (
          <section
            className="mt-4 rounded-2xl border border-line bg-surface p-3 shadow-sm"
            data-ruru-quick-modal-dock="sidebar-inline"
          >
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black tracking-[0.18em] text-ink-mute">QUICK</div>
                <div className="text-sm font-black text-ink">빠른보기</div>
              </div>
              <div className="rounded-full bg-rose-soft px-2 py-1 text-[10px] font-black text-rose-deep">방송중</div>
            </div>

            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const aw = window.screen.availWidth || 1600;
                  const ah = window.screen.availHeight || 1000;
                  const W = Math.min(1700, Math.round(aw * 0.92));
                  const H = Math.min(1050, Math.round(ah * 0.92));
                  const left = Math.max(0, Math.round((aw - W) / 2));
                  const top = Math.max(0, Math.round((ah - H) / 2));
                  const w = window.open(
                    "https://business.kakao.com/_RMxaqX/chats?t_src=business_partnercenter&t_ch=lnb&t_obj=%EB%82%B4%EC%B1%84%ED%8C%85_%ED%81%B4%EB%A6%AD",
                    "ruruKakaoConsult",
                    `popup=yes,width=${W},height=${H},left=${left},top=${top}`
                  );
                  if (w) { try { w.resizeTo(W, H); w.moveTo(left, top); w.focus(); } catch { /* 무시 */ } }
                }}
                className="flex h-10 items-center justify-center gap-1 rounded-xl border border-rose-line bg-rose-soft text-xs font-black text-rose-deep transition hover:opacity-90 active:scale-[0.98]"
              >
                <span>💬</span>
                카톡채널
              </button>
              <button
                type="button"
                onClick={() => window.open("https://user.service.payster.co.kr/#/payment/smspayment", "ruruPayster", "popup=yes,width=480,height=720")}
                className="flex h-10 items-center justify-center gap-1 rounded-xl border border-line bg-surface-2 text-xs font-black text-ink-soft transition hover:bg-surface-3 active:scale-[0.98]"
              >
                <span>💳</span>
                카드결제
              </button>
            </div>

            <div className="mt-2 rounded-xl bg-surface-2 px-2 py-2 text-[10px] font-bold leading-4 text-ink-soft">
              방송 중 필요한 내용만 빠르게 확인
            </div>

            <AdminSoundControl />
          </section>
        ) : null}

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
