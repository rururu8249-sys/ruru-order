"use client";

// [㊾ 2026-10-20] 주문조회(/myorder)·공지(/notice) 화면 아래 5칸 메뉴 — 쇼핑 화면(app/order/page.tsx 하단 nav, 새 모양)과 같은 모양.
//   표시·이동만. 새 모양(4단계 s4)이 꺼진 손님에겐 안 그린다(옛 화면은 상단 HOME·주문조회·정보수정·로그아웃 줄 그대로).
//   공지·쪽지 = 전역 CustomerSiteAlertPopup(app/layout.tsx) 이 「ruru-open-notice-box」 를 받아 연다.
//   문의·내정보 = /order?open=inquiry|me (주문서 화면이 열 때 그 창을 띄움). 로그아웃은 내정보 창 안.
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useCustomerUiStage } from "@/lib/useCustomerUiStage";
import CustomerNoteUnreadBadge, { useNoteUnread } from "@/components/customer/CustomerNoteUnreadBadge";

type Props = { active?: "orders" | "notice" };
type TabKey = "home" | "notice" | "orders" | "inquiry" | "me";

const NAV_STYLE: CSSProperties = {
  position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40,
  height: "calc(68px + env(safe-area-inset-bottom))", paddingBottom: "env(safe-area-inset-bottom)",
  background: "#FFFFFF", borderTop: "1px solid #E5E5E5", display: "grid", gridTemplateColumns: "repeat(5,1fr)",
};
const TAB_STYLE: CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px",
  border: "none", background: "none", padding: 0, cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#39393B",
  fontFamily: "inherit", textDecoration: "none",
};

function TabIcon({ tab }: { tab: TabKey }) {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
      {tab === "home" ? <><path d="M4 11l8-7 8 7" /><path d="M6 10v10h12V10" /></>
        : tab === "notice" ? <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>
        : tab === "orders" ? <><path d="M4 8l8-4 8 4v8l-8 4-8-4z" /><path d="M4 8l8 4 8-4M12 12v8" /></>
        : tab === "inquiry" ? <><path d="M4 6.5h16v9H9l-5 3.5z" /></>
        : <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1-3.5 3.8-5 7-5s6 1.5 7 5" /></>}
    </svg>
  );
}

export default function CustomerBottomNav({ active }: Props) {
  const v2 = useCustomerUiStage("s4");
  const noteUnread = useNoteUnread();
  if (!v2) return null;

  const tabs: { key: TabKey; label: string; href?: string; badge?: number }[] = [
    { key: "home", label: "홈", href: "/order" },
    { key: "notice", label: "공지·쪽지", badge: noteUnread },
    { key: "orders", label: "주문내역", href: "/myorder" },
    { key: "inquiry", label: "문의", href: "/order?open=inquiry" },
    { key: "me", label: "내정보", href: "/order?open=me" },
  ];

  const content = (key: TabKey, label: string, badge?: number): ReactNode => (
    <>
      <span style={{ position: "relative", lineHeight: 1 }}>
        <TabIcon tab={key} />
        <CustomerNoteUnreadBadge count={Number(badge) || 0} />
      </span>
      {label}
    </>
  );

  return (
    <nav aria-label="손님 메뉴" style={NAV_STYLE}>
      {tabs.map((tab) => {
        const on = tab.key === active;
        const style: CSSProperties = on ? { ...TAB_STYLE, color: "#111111", fontWeight: 700 } : TAB_STYLE;
        if (tab.href) {
          return (
            <Link key={tab.key} href={tab.href} aria-current={on ? "page" : undefined} style={style}>
              {content(tab.key, tab.label, tab.badge)}
            </Link>
          );
        }
        return (
          <button
            key={tab.key}
            type="button"
            aria-current={on ? "page" : undefined}
            onClick={() => { try { window.dispatchEvent(new Event("ruru-open-notice-box")); } catch { /* 무시 */ } }}
            style={style}
          >
            {content(tab.key, tab.label, tab.badge)}
          </button>
        );
      })}
    </nav>
  );
}
