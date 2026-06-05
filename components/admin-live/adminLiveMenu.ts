export type AdminLiveMenuKey =
  | "broadcast"
  | "products"
  | "orders"
  | "payments"
  | "customers"
  | "settlement"
  | "settings";

export type AdminLiveMenuItem = {
  key: AdminLiveMenuKey;
  label: string;
  icon: string;
  desc: string;
  sidebarNotice: string;
  readyTitle: string;
  readyDescription: string;
  checkpoints: string[];
};

export const ADMIN_LIVE_MENUS: AdminLiveMenuItem[] = [
  {
    key: "broadcast",
    label: "주문·입금",
    icon: "📡",
    desc: "라이브 컨트롤타워",
    sidebarNotice: "방송 메뉴는 실시간 주문·결제상태 중심입니다. 주문관리/고객관리/정산통계는 별도 화면으로 확장합니다.",
    readyTitle: "방송 컨트롤타워",
    readyDescription: "라이브 방송, 주문, 결제상태, 고객이슈를 한 화면에서 관리합니다.",
    checkpoints: ["방송 시작/종료", "유튜브 영상·채팅", "실시간 주문", "입금대기 주문"],
  },
  {
    key: "products",
    label: "상품",
    icon: "📦",
    desc: "상품 관리·순환",
    sidebarNotice: "상품 관리 화면에서 방송상품·공구·전체 창고를 보고 순환 담기/새 상품 등록을 합니다.",
    readyTitle: "상품 관리",
    readyDescription: "방송상품, 공구·상시판매, 전체 창고를 보고 선택해 방송 순환에 담거나 새 상품을 등록합니다.",
    checkpoints: ["방송상품", "공구·상시판매", "전체 창고", "새 상품 등록", "순환 담기"],
  },
  {
    key: "orders",
    label: "주문관리",
    icon: "📋",
    desc: "주문 상세 관리",
    sidebarNotice: "주문관리 화면은 주문 목록·상세·필터·상태 변경을 분리해서 연결할 예정입니다.",
    readyTitle: "주문관리 화면 연결 준비중",
    readyDescription: "방송 메뉴의 실시간 주문표와 기존 admin-v2 주문 컴포넌트를 비교한 뒤 안전하게 연결합니다.",
    checkpoints: ["주문 목록", "주문 상세", "입금상태 필터", "배송상태 필터", "일괄 처리"],
  },
  {
    key: "payments",
    label: "입금확인",
    icon: "원",
    desc: "입금 확인 처리",
    sidebarNotice: "입금확인 화면은 자동입금확인 조건을 유지한 상태로 별도 화면 연결 예정입니다.",
    readyTitle: "입금확인 화면 연결 준비중",
    readyDescription: "자동입금확인 조건은 그대로 유지하고, 수동입금확인과 입금내역 조회 화면을 분리 연결합니다.",
    checkpoints: ["입금내역 조회", "자동입금확인", "수동입금확인", "미매칭 입금", "입금 새로고침"],
  },
  {
    key: "customers",
    label: "고객·이슈",
    icon: "👤",
    desc: "고객·특이사항",
    sidebarNotice: "고객관리 화면은 고객 검색·차단·특이사항·이슈 관리를 분리해서 연결할 예정입니다.",
    readyTitle: "고객관리 화면 연결 준비중",
    readyDescription: "고객정보, 차단회원, 특이사항, 고객이슈를 한 화면에서 확인하도록 설계합니다.",
    checkpoints: ["고객 검색", "차단회원", "고객 특이사항", "고객이슈", "최근 주문"],
  },
  {
    key: "settlement",
    label: "정산",
    icon: "◔",
    desc: "방송·날짜별 통계",
    sidebarNotice: "정산통계 화면은 돈 로직을 건드리지 않고 조회·통계 중심으로 설계합니다.",
    readyTitle: "정산통계 화면 연결 준비중",
    readyDescription: "방송별·날짜별 결제완료 매출, 입금대기, 카드결제 통계를 조회 전용으로 구성합니다.",
    checkpoints: ["방송별 매출", "날짜별 통계", "결제상태", "카드결제", "상품 랭킹"],
  },
  {
    key: "settings",
    label: "설정",
    icon: "⚙",
    desc: "운영 설정",
    sidebarNotice: "설정 화면은 방송·주문·입금 관련 설정을 돈 로직과 분리해서 연결할 예정입니다.",
    readyTitle: "설정 화면 연결 준비중",
    readyDescription: "방송 운영, 주문서 작성 가능 시간, 알림, 입금 안내 설정을 분리 관리합니다.",
    checkpoints: ["방송 설정", "주문서 설정", "알림 설정", "입금 안내", "관리자 설정"],
  },
];

export function getAdminLiveMenu(key: AdminLiveMenuKey) {
  return ADMIN_LIVE_MENUS.find((menu) => menu.key === key) || ADMIN_LIVE_MENUS[0];
}
