"use client";

// components/customer/CustomerMissingDetailAddressPanel.tsx
// 목적: 상세주소 누락 시 브라우저 confirm 대신 화면 안 확인 패널 표시
// 주의: UI 전용. 주문 저장, 금액, 배송비, 입금, 정산 로직 없음.

// [2026-09-20] 가운데 확인창 «한 벌» 틀 — 1:1 [취소(=돌아가서 입력)][그래도 제출하기]. 제출 동작(onConfirm) 무변경.
import CustomerDialog from "./CustomerDialog";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function CustomerMissingDetailAddressPanel({ open, onClose, onConfirm }: Props) {
  if (!open) return null;

  return (
    <CustomerDialog
      open
      onClose={onClose}
      icon="⚠️"
      title="상세주소가 비어 있어요"
      cancelLabel="돌아가서 입력"
      primary={{ label: "그래도 제출하기", onClick: onConfirm, danger: true }}
    >
      아파트·빌라·오피스텔은 <b style={{ color: "#3A2F34" }}>동·호수가 없으면</b> 배송이 늦어지거나 반송될 수 있어요.<br />
      정말 상세주소 없이 보낼 때만 「그래도 제출하기」를 눌러 주세요.
    </CustomerDialog>
  );
}
