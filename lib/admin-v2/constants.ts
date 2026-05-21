// lib/admin-v2/constants.ts
// admin-v2 공통 상수
// 송장관리 1차 추가: 로젠 원본 업로드 엑셀 재업로드로 출고완료만 반영. 상태값/돈 계산 기준 변경 없음.

import type { AdminTab } from "./types";

export const TABS: Array<{ key: AdminTab; label: string; desc: string }> = [
  { key: "today", label: "오늘할일", desc: "주문·입금·출고 요약" },
  { key: "orders", label: "주문관리", desc: "상태·금액·상세 관리" },
  { key: "shipping", label: "송장관리", desc: "로젠 엑셀·출고반영" },
  { key: "customers", label: "고객관리", desc: "메모·차단·특이사항" },
  { key: "deposits", label: "입금관리", desc: "전체/날짜별 입금내역" },
  { key: "settlement", label: "매출정산", desc: "매출·수수료·차액" },
  { key: "settings", label: "설정", desc: "배송비·수수료" },
];

export const ORDER_STATUS_OPTIONS = [
  { value: "미설정", label: "미결제/확인대기" },
  { value: "입금확인", label: "입금확인" },
  { value: "출고대기", label: "출고대기" },
  { value: "출고완료", label: "출고완료" },
  { value: "킵", label: "킵" },
  { value: "픽업예정", label: "픽업예정" },
  { value: "주문취소", label: "주문취소" },
];

export const PAYMENT_FILTERS = ["전체", "무통장입금", "카드결제"];
export const PAID_STATUSES = ["입금확인", "출고대기", "출고완료", "킵", "픽업예정"];
export const PAGE_SIZE = 15;
