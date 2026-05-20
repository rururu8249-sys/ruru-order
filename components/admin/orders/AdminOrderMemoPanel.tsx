"use client";

type AdminOrderMemoPanelProps = {
  selectedOrderDetail: any;
  InfoBox: any;
};

/**
 * 주문관리 상세 모달 배송메모/특이사항 영역
 *
 * - 배송메모와 특이사항 표시만 담당한다.
 * - DB/API/입금/정산/금액 로직은 포함하지 않는다.
 */
export default function AdminOrderMemoPanel({
  selectedOrderDetail,
  InfoBox,
}: AdminOrderMemoPanelProps) {
  return (
    <div className="mt-5 grid md:grid-cols-2 gap-3">
      <InfoBox
        label="배송메모"
        value={selectedOrderDetail.first.request_memo || "-"}
      />
      <InfoBox
        label="특이사항"
        value={
          selectedOrderDetail.first.special_note ||
          selectedOrderDetail.first.memo ||
          "-"
        }
      />
    </div>
  );
}
