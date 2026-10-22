"use client";

// [2026-10-22 폰 최적화 1단계] 폰(md 미만) 하단 고정 5칸 메뉴 — DESIGN-ADMIN §13.
//   주문·입금 / 고객 / AI 비서 / 상품 / 더보기(=기존 사이드바 서랍: 설정·방송·카톡·카드결제·로그아웃).
//   PC(md 이상)에선 렌더 안 됨. 누르면 기존 onMenuChange·onOpenAssistant 그대로(핸들러 신규 0).
import type { AdminLiveMenuKey } from "./adminLiveMenu";
import { topMenuOf } from "./adminLiveMenu";

type Props = {
  activeMenu: AdminLiveMenuKey;
  onMenuChange: (menuKey: AdminLiveMenuKey) => void;
  onOpenAssistant: () => void;
  onMore: () => void;
  /** 주문·입금 칸 배지(매칭필요+카드미결제 건수) */
  badge?: number;
  moreOpen?: boolean;
};

const ICON = {
  orders: "M3 5h18v4H3zM3 11h18v8H3z",
  customers: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0",
  assistant: "M4 5h16v10H9l-4 4v-4H4z",
  products: "M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10",
  more: "M5 12h.01M12 12h.01M19 12h.01",
} as const;

export default function AdminLiveBottomNav({ activeMenu, onMenuChange, onOpenAssistant, onMore, badge = 0, moreOpen = false }: Props) {
  const top = topMenuOf(activeMenu);
  const cells: { key: string; label: string; icon: keyof typeof ICON; active: boolean; onClick: () => void; badge?: number }[] = [
    { key: "orders", label: "주문·입금", icon: "orders", active: !moreOpen && top === "orders", onClick: () => onMenuChange("orders"), badge },
    { key: "customers", label: "고객", icon: "customers", active: !moreOpen && top === "customers", onClick: () => onMenuChange("customers") },
    { key: "assistant", label: "AI 비서", icon: "assistant", active: false, onClick: onOpenAssistant },
    { key: "products", label: "상품", icon: "products", active: !moreOpen && top === "products", onClick: () => onMenuChange("products") },
    { key: "more", label: "더보기", icon: "more", active: moreOpen || top === "settings", onClick: onMore },
  ];
  return (
    <nav
      aria-label="관리자 하단 메뉴"
      className="fixed inset-x-0 bottom-0 z-[35] grid grid-cols-5 border-t border-line bg-surface md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {cells.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.onClick}
          aria-current={c.active ? "page" : undefined}
          className={`relative flex h-14 flex-col items-center justify-center gap-0.5 text-[12px] font-semibold transition ${c.active ? "text-ink" : "text-ink-mute"}`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={c.active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={ICON[c.icon]} />
          </svg>
          <span>{c.label}</span>
          {c.badge ? (
            <span className="absolute left-1/2 top-1.5 ml-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-warn-tx px-1 text-[11px] font-bold leading-none text-white">{c.badge > 99 ? "99+" : c.badge}</span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}
