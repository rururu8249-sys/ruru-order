"use client";

import AdminOrderDetailBox from "@/components/admin-v2/orders/AdminOrderDetailBox";

type AdminOrderMemoSectionProps = {
  shippingExcelMemo: string;
  productSummary: string;
  legacyProductMemo: string;
  adminMemo: string;
  specialNote: string;
};

export default function AdminOrderMemoSection({
  shippingExcelMemo,
  productSummary,
  legacyProductMemo,
  adminMemo,
  specialNote,
}: AdminOrderMemoSectionProps) {
  return (
    <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[15px] font-black">🧾 메모 구조 분리</div>
          <div className="mt-0.5 text-[12px] font-bold text-neutral-500">
            택배사 배송메모에는 고객 배송메모만 사용합니다. 상품요약은 배송메모로 보내지 않습니다.
          </div>
        </div>

        <div className="rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">
          택배 엑셀 메모 = 배송메모만
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <AdminOrderDetailBox title="배송메모 / 택배사 전송">
          <div>{shippingExcelMemo || "없음"}</div>
        </AdminOrderDetailBox>

        <AdminOrderDetailBox title="상품요약 / 내부확인">
          <div>{productSummary || legacyProductMemo || "상품요약 없음"}</div>
        </AdminOrderDetailBox>

        <AdminOrderDetailBox title="관리자메모">
          <div>{adminMemo || "없음"}</div>
        </AdminOrderDetailBox>

        <AdminOrderDetailBox title="특이사항">
          <div>{specialNote || "없음"}</div>
        </AdminOrderDetailBox>
      </div>
    </div>
  );
}
