// components/admin-v2/ui/adminDesignSystem.ts
// 목적: 관리자 페이지 제목/설명/상태명/색상/버튼/카드 기준 통일
// 주의:
// - 이 파일은 기준표입니다.
// - 현재 화면에 자동 적용되지 않습니다.
// - 주문 저장, 입금매칭, 정산, 배송비, DB 로직 없음.

export const ADMIN_MENU_LABELS = {
  live: "방송",
  orders: "주문관리",
  payment: "입금확인",
  customers: "고객관리",
  settlement: "정산통계",
  settings: "설정",
} as const;

export const ADMIN_PAGE_HEADERS = {
  live: {
    label: "루루동이 관리자",
    title: "방송",
    description: "라이브 방송 화면과 실시간 주문·입금·고객이슈를 한 화면에서 확인합니다.",
  },
  orders: {
    label: "루루동이 관리자",
    title: "주문관리",
    description: "주문상세, 입금상태, 배송상태, 메모를 빠르게 확인하고 처리합니다.",
  },
  payment: {
    label: "루루동이 관리자",
    title: "입금확인",
    description: "입금내역을 주문과 비교해 자동·수동 입금확인을 처리합니다.",
  },
  customers: {
    label: "루루동이 관리자",
    title: "고객관리",
    description: "고객 정보, 주문이력, 특이사항, 차단 여부를 확인합니다.",
  },
  settlement: {
    label: "루루동이 관리자",
    title: "정산통계",
    description: "방송별 매출, 입금, 배송비, 환불, 순매출 흐름을 확인합니다.",
  },
  settings: {
    label: "루루동이 관리자",
    title: "설정",
    description: "방송, 주문서, 배송비, 계좌, 알림 설정을 관리합니다.",
  },
} as const;

export const ADMIN_STATUS_LABELS = {
  unpaid: "입금대기",
  paymentNeeded: "입금매칭 필요",
  autoPaid: "자동입금확인",
  manualPaid: "수동입금확인",
  amountMismatch: "금액불일치",
  unmatchedDeposit: "미매칭입금",
  cardPaid: "카드결제완료",
  readyToShip: "출고대기",
  shipped: "출고완료",
  canceled: "주문서취소",
  refunded: "환불",
  hidden: "숨김",
  normal: "정상",
  warning: "주의",
  blocked: "차단",
} as const;

export const ADMIN_STATUS_TONES = {
  default: "border-slate-200 bg-slate-50 text-slate-700",
  selected: "border-blue-200 bg-blue-50 text-blue-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",

  unpaid: "border-red-200 bg-red-50 text-red-700",
  paymentNeeded: "border-orange-200 bg-orange-50 text-orange-700",
  autoPaid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  manualPaid: "border-blue-200 bg-blue-50 text-blue-700",
  amountMismatch: "border-red-300 bg-red-50 text-red-800",
  unmatchedDeposit: "border-yellow-200 bg-yellow-50 text-yellow-800",
  cardPaid: "border-violet-200 bg-violet-50 text-violet-700",

  readyToShip: "border-sky-200 bg-sky-50 text-sky-700",
  shipped: "border-emerald-200 bg-emerald-50 text-emerald-700",
  canceled: "border-slate-200 bg-slate-100 text-slate-500",
  refunded: "border-slate-300 bg-slate-100 text-slate-600",

  normal: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-orange-200 bg-orange-50 text-orange-700",
  blocked: "border-red-200 bg-red-50 text-red-700",
} as const;

export const ADMIN_BUTTON_TONES = {
  primary: "bg-blue-600 text-white hover:bg-blue-700",
  dark: "bg-slate-950 text-white hover:bg-slate-900",
  secondary: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  danger: "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  success: "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  warning: "border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100",
} as const;

export const ADMIN_COMMON_LAYOUT = {
  page: "min-h-screen bg-slate-100 text-slate-950",
  panel: "rounded-3xl border border-slate-200 bg-white shadow-sm",
  card: "rounded-3xl border border-slate-200 bg-white p-4 shadow-sm",
  filterBar: "rounded-3xl border border-slate-200 bg-white p-4 shadow-sm",
  input:
    "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50",
  tableHead: "bg-slate-950 text-white",
  tableRow: "border-t border-slate-100 hover:bg-slate-50",
} as const;

export const ADMIN_FILTER_LABELS = {
  broadcast: "방송",
  period: "기간",
  status: "상태",
  payment: "결제",
  delivery: "배송",
  customerType: "고객구분",
  keyword: "검색",
  sort: "정렬",
  refresh: "새로고침",
  all: "전체보기",
} as const;

export const ADMIN_LEGACY_TERMS_TO_REVIEW = [
  "입금매칭센터",
  "확인완료",
  "매칭완료",
  "처리완료",
  "결제완료",
  "입금확인/카드결제완료만",
  "무통장 입금확인만",
  "입금대기/확인전만",
  "주문없음",
  "초과입금",
  "부분입금",
] as const;
