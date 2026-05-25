"use client";

import AdminOrderDetailBox from "@/components/admin-v2/orders/AdminOrderDetailBox";

type AdminOrderDetailSummaryProps = {
  phoneText: string;
  addressText: string;
  productSummaries: string[];
  paymentStatusText: string;
  depositConfirmedText: string;
  shippedAtText: string;
  trackingText: string;
  adminMemo: string;
};

export default function AdminOrderDetailSummary({
  phoneText,
  addressText,
  productSummaries,
  paymentStatusText,
  depositConfirmedText,
  shippedAtText,
  trackingText,
  adminMemo,
}: AdminOrderDetailSummaryProps) {
  return (
    <div className="grid gap-2 md:grid-cols-[1.1fr_1.4fr_1fr]">
      <AdminOrderDetailBox title="고객정보">
        <div>전화번호: {phoneText || "-"}</div>

        <div className="mt-2">
          배송주소: <span className="whitespace-pre-wrap break-keep font-bold text-slate-900">{addressText || "-"}</span>
        </div>
      </AdminOrderDetailBox>

      <AdminOrderDetailBox title="상품요약">
        {productSummaries.length > 0 ? (
          productSummaries.map((summary, index) => (
            <div key={`${summary}-${index}`}>{summary}</div>
          ))
        ) : (
          <div>상품요약 없음</div>
        )}
      </AdminOrderDetailBox>

      <AdminOrderDetailBox title="관리정보">
        <div>결제상태: {paymentStatusText}</div>
        <div>입금확인시간: {depositConfirmedText}</div>
        <div>출고완료시간: {shippedAtText}</div>
        <div>송장: {trackingText}</div>
        <div>관리자메모: {adminMemo || "없음"}</div>
      </AdminOrderDetailBox>
    </div>
  );
}
