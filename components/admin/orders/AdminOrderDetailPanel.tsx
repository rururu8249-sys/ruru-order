"use client";

type AdminOrderDetailPanelProps = {
  selectedOrderDetail: any;
  setSelectedOrderDetailGroupId: any;
};

/**
 * 주문관리 상세 펼침 패널
 *
 * - 기존 app/admin/page.tsx 안의 주문 상세 화면 박스를 분리한 파일.
 * - DB/API/입금/정산 로직은 포함하지 않는다.
 * - 부모의 기존 상태/함수를 props로 받아 화면만 렌더링한다.
 */
export default function AdminOrderDetailPanel({
  selectedOrderDetail,
  setSelectedOrderDetailGroupId,
}: AdminOrderDetailPanelProps) {
  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-black text-rose-500">
                          주문 상세내역
                        </div>
                        <h2 className="mt-1 text-3xl font-black">
                          {selectedOrderDetail.first.order_lookup_code ||
                            selectedOrderDetail.first.order_group_id ||
                            selectedOrderDetail.groupId}
                        </h2>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedOrderDetailGroupId(null)}
                        className="rounded-2xl bg-gray-100 px-4 py-3 font-black text-gray-700 active:scale-[0.98]"
                      >
                        닫기
                      </button>
                    </div>
    </>
  );
}
