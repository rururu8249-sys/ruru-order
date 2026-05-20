"use client";

type AdminOrderMoneyEditPanelProps = {
  selectedOrderDetail: any;
  saveOrderMoneyEdits: any;
  orderItemLabel: any;
  updateOrderLocalField: any;
  onlyNumber: any;
  InfoBox: any;
  money: any;
  calculateOrderRowTotal: any;
};

/**
 * 주문관리 상품/금액 수정 영역
 *
 * - 화면 JSX만 분리한다.
 * - 저장/계산/상태 변경 함수는 부모에서 props로 받는다.
 * - DB/API/입금/정산 로직은 포함하지 않는다.
 */
export default function AdminOrderMoneyEditPanel({
  selectedOrderDetail,
  saveOrderMoneyEdits,
  orderItemLabel,
  updateOrderLocalField,
  onlyNumber,
  InfoBox,
  money,
  calculateOrderRowTotal,
}: AdminOrderMoneyEditPanelProps) {
  return (
    <>
      <div className="mt-5 rounded-3xl bg-gray-50 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="text-lg font-black">상품/금액 수정</div>
                        <button
                          type="button"
                          onClick={saveOrderMoneyEdits}
                          className="rounded-2xl bg-gray-950 px-4 py-3 text-sm font-black text-white active:scale-[0.98]"
                        >
                          금액 수정 저장
                        </button>
                      </div>

                      <div className="grid gap-2">
                        {selectedOrderDetail.rows.map((row: any) => (
                          <div
                            key={String(row.id)}
                            className="rounded-2xl bg-white p-3"
                          >
                            <div className="font-black">{orderItemLabel(row)}</div>

                            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                              <label className="text-xs font-black text-gray-500">
                                상품금액
                                <input
                                  value={String(row.product_price || "")}
                                  onChange={(event) =>
                                    updateOrderLocalField(
                                      row.id,
                                      "product_price",
                                      Number(onlyNumber(event.target.value) || 0)
                                    )
                                  }
                                  inputMode="numeric"
                                  className="mt-1 w-full rounded-xl border bg-gray-50 p-3 font-black text-gray-900"
                                />
                              </label>

                              <label className="text-xs font-black text-gray-500">
                                배송비
                                <input
                                  value={String(row.shipping_fee ?? row.admin_shipping_fee ?? row.adjusted_shipping_fee ?? 0)}
                                  onChange={(event) =>
                                    updateOrderLocalField(
                                      row.id,
                                      "shipping_fee",
                                      Number(onlyNumber(event.target.value) || 0)
                                    )
                                  }
                                  inputMode="numeric"
                                  className="mt-1 w-full rounded-xl border bg-gray-50 p-3 font-black text-gray-900"
                                />
                              </label>

                              <InfoBox label="수량" value={`${row.qty || 1}개`} />
                              <InfoBox
                                label="예상합계"
                                value={money(calculateOrderRowTotal(row))}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
    </>
  );
}
