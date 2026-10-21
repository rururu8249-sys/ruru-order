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
  | "sales" // 판매기록
  | "settlement" // 정산
  | "products" // 상품
  | "customers" // 회원·이슈·단골
  | "notice" // 쪽지·공지사항(손님 화면 공지 설정은 설정 › 손님 공지·구매동의)
  | "visits" // 접속 기록(날짜별·방송별)
  | "settings" // 설정
  | "audit"; // 시스템 점검(공통 — 방송/쇼핑몰 상관없음)

export type AdminLiveTopMenuKey = "broadcast" | "orders" | "products" | "customers" | "settings";

export type AdminLiveTopMenuItem = {
  key: AdminLiveTopMenuKey;
  label: string;
  desc: string;
  /** 큰 메뉴를 누르면 열리는 첫 화면 */
  defaultKey: AdminLiveMenuKey;
};

export const ADMIN_LIVE_TOP_MENUS: AdminLiveTopMenuItem[] = [
  // 아이콘은 AdminLiveMenuIcon.tsx (SVG) — 기기마다 모양이 달라지는 이모지를 쓰지 않는다
  // [2026-10-21 a4-1] 「방송」 큰 메뉴 삭제 — 시작·종료·방송 관리는 사이드바 방송 카드로(사장님: 시작할 때만 쓰는데 왜 메뉴인가).
  //   화면 키 "broadcast"·sub-tab 정의는 보존(?panel=broadcast 옛 주소 → 주문·입금 + 방송 관리 창).
  { key: "orders", label: "주문·입금", desc: "실시간 주문 · 입금내역 · 정산 · 판매분석 · 이벤트", defaultKey: "orders" },
  { key: "products", label: "상품", desc: "방송 상품 · 쇼핑몰 · 등록", defaultKey: "products" },
  { key: "customers", label: "고객", desc: "회원 · 고객이슈 · 쪽지·공지사항 · 단골 · 접속 기록 · 계정 잇기", defaultKey: "customers" },
  { key: "settings", label: "설정", desc: "돈·결제 · 손님 화면 · 방송·알림 · 상점", defaultKey: "settings" },
];

export type AdminLiveCustomersTab = "members" | "issues" | "loyalty" | "link";
/** custTab 이 있으면 같은 화면(customers) 안의 탭 — [2026-10-21 a3-2] 고객 메뉴 2층 탭을 1층으로 편 것 */
export type AdminLiveSubTab = { key: AdminLiveMenuKey; label: string; custTab?: AdminLiveCustomersTab };

/** 큰 메뉴 안의 작은 탭(화면 상단 가로 탭). 1개뿐이면 탭 줄을 안 그린다 */
export const ADMIN_LIVE_SUB_TABS: Record<AdminLiveTopMenuKey, AdminLiveSubTab[]> = {
  broadcast: [
    { key: "broadcast", label: "방송 콘솔" },
    // chatorder(채팅주문): 2026-10-21 사장님: 나중을 위해 보존, 메뉴에서만 숨김 (?panel=chatorder 로는 열림)
  ],
  // [2026-09-09 사장님 요청] 이벤트를 방송 → 주문·입금 안으로 옮겼다
  orders: [
    { key: "orders", label: "실시간 주문" },
    { key: "payments", label: "입금내역" },
    { key: "settlement", label: "정산" },
    { key: "sales", label: "판매분석" },
    { key: "event", label: "이벤트" },
  ],
  products: [{ key: "products", label: "상품" }],
  // [2026-10-21 a3-2] 2층(회원·이슈·단골 안의 탭) → 1층 6탭. 화면 키는 그대로(customers 안 탭은 custTab 으로 구분)
  customers: [
    { key: "customers", label: "회원", custTab: "members" },
    { key: "customers", label: "고객이슈", custTab: "issues" },
    { key: "notice", label: "쪽지·공지사항" },
    { key: "customers", label: "단골", custTab: "loyalty" },
    { key: "visits", label: "접속 기록" },
    { key: "customers", label: "계정 잇기", custTab: "link" },
  ],
  // audit(시스템 점검): 2026-10-21 메뉴에서 뺌. ?panel=audit 로 들어오면 설정으로 폴백
  settings: [{ key: "settings", label: "설정" }],
};

const TOP_MENU_OF: Record<AdminLiveMenuKey, AdminLiveTopMenuKey> = {
  broadcast: "orders", // [2026-10-21 a4-1] 방송 메뉴 삭제 → 주문·입금 안에서 방송 관리 창
  chatorder: "orders",
  event: "orders", // [2026-09-09 사장님 요청] 방송 → 주문·입금
  reports: "orders",
  orders: "orders",
  payments: "orders",
  sales: "orders",
  settlement: "orders",
  products: "products",
  customers: "customers",
  notice: "customers",
  visits: "customers",
  settings: "settings",
  audit: "settings",
};

export function topMenuOf(key: AdminLiveMenuKey): AdminLiveTopMenuKey {
  return TOP_MENU_OF[key] || "orders";
}

export function getAdminLiveTopMenu(key: AdminLiveTopMenuKey): AdminLiveTopMenuItem {
  return ADMIN_LIVE_TOP_MENUS.find((menu) => menu.key === key) || ADMIN_LIVE_TOP_MENUS[0]; // [a4-1] broadcast 는 목록에 없음 → 첫 메뉴(주문·입금)
}

export const ADMIN_LIVE_ALL_MENU_KEYS: AdminLiveMenuKey[] = Object.keys(TOP_MENU_OF) as AdminLiveMenuKey[];

export function isAdminLiveMenuKey(value: unknown): value is AdminLiveMenuKey {
  return typeof value === "string" && (ADMIN_LIVE_ALL_MENU_KEYS as string[]).includes(value);
}

/** 화면 제목(페이지 헤더용) */
export function getAdminLiveScreenTitle(key: AdminLiveMenuKey): string {
  if(key==='reports') key='sales';
  const top = getAdminLiveTopMenu(topMenuOf(key));
  const sub = ADMIN_LIVE_SUB_TABS[top.key].find((t) => t.key === key);
  return sub && ADMIN_LIVE_SUB_TABS[top.key].length > 1 ? `${top.label} › ${sub.label}` : top.label;
}
