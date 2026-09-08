// components/admin-live/adminLiveMenu.ts
// [2026-09-08 5단계 · 레이아웃 B] 메뉴 단일화 9개 → 5개(방송 / 주문·입금 / 상품 / 고객 / 설정).
//   · 사이드바 = 큰 메뉴 5개. 누르면 화면 통째로 바뀐다(팝업 아님).
//   · 큰 메뉴 안의 작은 탭은 예전 화면 키(AdminLiveMenuKey)를 그대로 쓴다 → ?panel=… 주소, 기존 setActiveMenu 호출 전부 호환.
//   · 옛 키 → 큰 메뉴 매핑은 TOP_MENU_OF 하나로만 정한다.

export type AdminLiveMenuKey =
  | "broadcast" // 방송 콘솔(시작·종료·제목·URL·현황)
  | "chatorder" // 채팅주문 대기열
  | "event" // 이벤트(룰렛·인형뽑기·서바이벌·달리기·미션)
  | "reports" // 방송 기록·판매 리포트
  | "orders" // 실시간 주문(주문표)
  | "payments" // 입금내역
  | "settlement" // 정산
  | "products" // 상품
  | "customers" // 회원·이슈·단골
  | "notice" // 쪽지·공지
  | "settings"; // 설정

export type AdminLiveTopMenuKey = "broadcast" | "orders" | "products" | "customers" | "settings";

export type AdminLiveTopMenuItem = {
  key: AdminLiveTopMenuKey;
  label: string;
  desc: string;
  /** 사이드바 아이콘(글자). 5-C 에서 SVG 로 교체 예정 */
  icon: string;
  /** 큰 메뉴를 누르면 열리는 첫 화면 */
  defaultKey: AdminLiveMenuKey;
};

export const ADMIN_LIVE_TOP_MENUS: AdminLiveTopMenuItem[] = [
  { key: "broadcast", label: "방송", desc: "시작·종료 · 채팅주문 · 이벤트", icon: "▶", defaultKey: "broadcast" },
  { key: "orders", label: "주문·입금", desc: "실시간 주문 · 입금내역 · 정산", icon: "₩", defaultKey: "orders" },
  { key: "products", label: "상품", desc: "방송 상품 · 쇼핑몰 · 등록", icon: "▦", defaultKey: "products" },
  { key: "customers", label: "고객", desc: "회원 · 이슈 · 쪽지·공지", icon: "☺", defaultKey: "customers" },
  { key: "settings", label: "설정", desc: "상점 · 결제 · 알림", icon: "⚙", defaultKey: "settings" },
];

export type AdminLiveSubTab = { key: AdminLiveMenuKey; label: string };

/** 큰 메뉴 안의 작은 탭(화면 상단 가로 탭). 1개뿐이면 탭 줄을 안 그린다 */
export const ADMIN_LIVE_SUB_TABS: Record<AdminLiveTopMenuKey, AdminLiveSubTab[]> = {
  broadcast: [
    { key: "broadcast", label: "방송 콘솔" },
    { key: "chatorder", label: "채팅주문" },
    { key: "event", label: "이벤트" },
    { key: "reports", label: "방송 기록·리포트" },
  ],
  orders: [
    { key: "orders", label: "실시간 주문" },
    { key: "payments", label: "입금내역" },
    { key: "settlement", label: "정산" },
  ],
  products: [{ key: "products", label: "상품" }],
  customers: [
    { key: "customers", label: "회원·이슈·단골" },
    { key: "notice", label: "쪽지·공지" },
  ],
  settings: [{ key: "settings", label: "설정" }],
};

const TOP_MENU_OF: Record<AdminLiveMenuKey, AdminLiveTopMenuKey> = {
  broadcast: "broadcast",
  chatorder: "broadcast",
  event: "broadcast",
  reports: "broadcast",
  orders: "orders",
  payments: "orders",
  settlement: "orders",
  products: "products",
  customers: "customers",
  notice: "customers",
  settings: "settings",
};

export function topMenuOf(key: AdminLiveMenuKey): AdminLiveTopMenuKey {
  return TOP_MENU_OF[key] || "broadcast";
}

export function getAdminLiveTopMenu(key: AdminLiveTopMenuKey): AdminLiveTopMenuItem {
  return ADMIN_LIVE_TOP_MENUS.find((menu) => menu.key === key) || ADMIN_LIVE_TOP_MENUS[0];
}

export const ADMIN_LIVE_ALL_MENU_KEYS: AdminLiveMenuKey[] = Object.keys(TOP_MENU_OF) as AdminLiveMenuKey[];

export function isAdminLiveMenuKey(value: unknown): value is AdminLiveMenuKey {
  return typeof value === "string" && (ADMIN_LIVE_ALL_MENU_KEYS as string[]).includes(value);
}

/** 화면 제목(페이지 헤더용) */
export function getAdminLiveScreenTitle(key: AdminLiveMenuKey): string {
  const top = getAdminLiveTopMenu(topMenuOf(key));
  const sub = ADMIN_LIVE_SUB_TABS[top.key].find((t) => t.key === key);
  return sub && ADMIN_LIVE_SUB_TABS[top.key].length > 1 ? `${top.label} › ${sub.label}` : top.label;
}
