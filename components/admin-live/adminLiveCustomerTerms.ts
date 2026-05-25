// components/admin-live/adminLiveCustomerTerms.ts
// 목적: 고객관리 화면 용어 통일
// 주의: UI 문구 전용. 고객 차단 저장, 메모 저장, 주문/입금/정산 로직 없음.

export const CUSTOMER_TERMS = {
  pageTitle: "고객관리",
  pageSubTitle: "고객 검색 · 이슈 확인 · 주문이력 · 차단 관리",
  customerStatus: "고객상태",
  normal: "정상",
  blocked: "차단",
  block: "차단",
  unblock: "차단해제",
  customerIssue: "고객이슈",
  issueOpen: "미해결",
  issueResolved: "해결",
  issueAll: "전체",
  customerMemo: "고객메모",
  orderHistory: "주문내역",
  totalOrderAmount: "누적구매금액",
  orderCount: "총 주문수",
  latestOrder: "최근주문",
  work: "작업",
} as const;

export const CUSTOMER_ISSUE_TYPES = [
  "구매",
  "입금",
  "배송",
  "교환",
  "반품",
  "환불",
  "차단",
  "기타",
] as const;
