"use client";

type AdminOrderCustomerInfoPanelProps = {
  selectedOrderDetail: any;
  InfoBox: any;
  fullAddress: any;
};

/**
 * 주문관리 상세 모달 주문자 정보 영역
 *
 * - 주문시간/결제방식/닉네임/주문자명/전화번호/주소 표시만 담당한다.
 * - DB/API/입금/정산 로직은 포함하지 않는다.
 */
export default function AdminOrderCustomerInfoPanel({
  selectedOrderDetail,
  InfoBox,
  fullAddress,
}: AdminOrderCustomerInfoPanelProps) {
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <InfoBox label="주문시간" value={selectedOrderDetail.first.created_at || "-"} />
      <InfoBox label="결제방식" value={selectedOrderDetail.first.payment_method || "-"} />
      <InfoBox label="유튜브 닉네임" value={selectedOrderDetail.first.youtube_nickname || "-"} />
      <InfoBox label="주문자명" value={selectedOrderDetail.first.customer_name || "-"} />
      <InfoBox label="전화번호" value={selectedOrderDetail.first.customer_phone || "-"} />
      <InfoBox label="주소" value={fullAddress(selectedOrderDetail.first) || "-"} />
    </div>
  );
}
