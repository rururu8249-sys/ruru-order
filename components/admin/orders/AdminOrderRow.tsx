"use client";

type AdminOrderRowProps = {
  group: any;
  orderStatusValue: any;
  isCanceledOrder: any;
  selectedOrderGroupIds: any;
  toggleOrderGroup: any;
  setSelectedOrderDetailGroupId: any;
  orderItemLabel: any;
  updateOrderGroupStatus: any;
  money: any;
  orderSelectStatusStyle: any;
};

/**
 * 주문관리 행 카드
 *
 * - 기존 app/admin/page.tsx 안의 주문 행 JSX를 분리한 파일.
 * - 상태변경/입금매칭/금액/상세보기 동작은 기존 부모 함수 props로만 연결한다.
 * - DB/API/정산 계산 로직은 포함하지 않는다.
 */
export default function AdminOrderRow({
  group,
  orderStatusValue,
  isCanceledOrder,
  selectedOrderGroupIds,
  toggleOrderGroup,
  setSelectedOrderDetailGroupId,
  orderItemLabel,
  updateOrderGroupStatus,
  money,
  orderSelectStatusStyle,
}: AdminOrderRowProps) {

                      const first = group.first;
                      const statusValue = orderStatusValue(first);
                      const canceled = statusValue === "주문취소" || isCanceledOrder(first);
                      const orderCode =
                        first.order_lookup_code ||
                        first.order_group_id ||
                        String(first.id || "").slice(0, 8);

                      return (
                        <div
                          key={group.groupId}
                          className={`rounded-2xl border px-3 py-3 shadow-sm ${
                            canceled
                              ? "border-red-200 bg-red-50/80 opacity-80"
                              : "bg-white"
                          }`}
                        >
                          <div className="grid grid-cols-[auto_110px_1fr_150px_auto] items-center gap-3">
                            <input
                              type="checkbox"
                              checked={selectedOrderGroupIds.includes(group.groupId)}
                              onChange={() => toggleOrderGroup(group.groupId)}
                              className="h-5 w-5"
                            />

                            <button
                              type="button"
                              onClick={() => setSelectedOrderDetailGroupId(group.groupId)}
                              className="rounded-xl bg-gray-950 px-3 py-2 text-xs font-black text-white active:scale-[0.98]"
                            >
                              {orderCode || "상세보기"}
                            </button>

                            <button
                              type="button"
                              onClick={() => setSelectedOrderDetailGroupId(group.groupId)}
                              className="min-w-0 text-left active:scale-[0.99]"
                            >
                              <div
                                className={`truncate text-base font-black ${
                                  canceled ? "text-red-700 line-through decoration-2" : ""
                                }`}
                              >
                                {first.youtube_nickname || "닉네임없음"} / {" "}
                                {first.customer_name || "이름없음"} / {" "}
                                {first.customer_phone || "전화번호없음"}
                              </div>

                              <div
                                className={`mt-1 truncate text-xs font-bold ${
                                  canceled ? "text-red-500 line-through" : "text-gray-500"
                                }`}
                              >
                                {group.rows.map((row: any) => orderItemLabel(row)).join(" / ")}
                              </div>
                            </button>

                            <select
                              value={statusValue}
                              onChange={(event) =>
                                updateOrderGroupStatus(group.groupId, event.target.value)
                              }
                              className={`rounded-2xl border px-4 py-3 font-black outline-none transition ${orderSelectStatusStyle(orderStatusValue(group.first))}`}
                            >
                              <option value="미설정">미설정</option>
                              <option value="입금확인">입금확인</option>
                              <option value="포장전">포장전</option>
                              <option value="출고완료">출고완료</option>
                              <option value="킵">킵</option>
                              <option value="주문취소">주문취소</option>
                            </select>

                            <div className="text-right">
                              <div className="text-xs font-black text-gray-500">
                                {first.payment_method || "결제없음"} · {group.totalQty}개
                              </div>
                              <div className="text-base font-black text-rose-500">
                                {money(group.totalAmount)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    
}
