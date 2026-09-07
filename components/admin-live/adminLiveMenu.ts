export type AdminLiveMenuKey =
  | "broadcast"
  | "products"
  | "chatorder"
  | "orders"
  | "payments"
  | "customers"
  | "notice"
  | "event"
  | "settlement"
  | "settings";

export type AdminLiveMenuItem = {
  key: AdminLiveMenuKey;
  label: string;
  icon: string;
  desc: string;
};

export const ADMIN_LIVE_MENUS: AdminLiveMenuItem[] = [
  {
    key: "broadcast",
    label: "주문·입금",
    icon: "📡",
    desc: "라이브 컨트롤타워",
  },
  {
    key: "products",
    label: "상품",
    icon: "📦",
    desc: "상품 관리·순환",
  },
  {
    key: "chatorder",
    label: "채팅주문",
    icon: "💬",
    desc: "유튜브 채팅 접수",
  },
  {
    key: "settlement",
    label: "정산",
    icon: "◔",
    desc: "방송·날짜별 통계",
  },
  {
    key: "customers",
    label: "고객·이슈",
    icon: "👤",
    desc: "고객·특이사항",
  },
  {
    // [2026-08-30] 흩어져 있던 손님 공지를 한자리에. 설정 → 주문서 표시 안에 숨어 있던 것을 꺼냈다.
    key: "notice",
    label: "공지·쪽지",
    icon: "📢",
    desc: "손님 공지·쪽지",
  },
  {
    key: "event",
    label: "이벤트",
    icon: "◆",
    desc: "룰렛·인형뽑기",
  },
  {
    key: "settings",
    label: "설정",
    icon: "⚙",
    desc: "운영 설정",
  },
];

export function getAdminLiveMenu(key: AdminLiveMenuKey) {
  return ADMIN_LIVE_MENUS.find((menu) => menu.key === key) || ADMIN_LIVE_MENUS[0];
}
