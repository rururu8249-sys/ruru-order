"use client";

import type { Dispatch, SetStateAction } from "react";

type AdminOrderPaginationProps = {
  orderCount: number;
  orderPage: number;
  orderPageNumbers: number[];
  totalOrderPages: number;
  setOrderPage: Dispatch<SetStateAction<number>>;
};

/**
 * 주문관리 페이지네이션
 *
 * - 페이지 이동 UI만 분리한다.
 * - 주문/입금/정산/DB 로직은 포함하지 않는다.
 */
export default function AdminOrderPagination({
  orderCount,
  orderPage,
  orderPageNumbers,
  totalOrderPages,
  setOrderPage,
}: AdminOrderPaginationProps) {
  return (
    <>
      {orderCount > 0 && (
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    aria-label="주문 페이지 이전"
                    onClick={() => setOrderPage((prev) => Math.max(1, prev - 1))}
                    disabled={orderPage <= 1}
                    className="rounded-2xl border bg-white px-4 py-3 text-sm font-black disabled:opacity-30"
                  >
                    이전
                  </button>

                  {orderPage > 3 && (
                    <button
                      type="button"
                      onClick={() => setOrderPage(1)}
                      className="rounded-2xl border bg-white px-4 py-3 text-sm font-black"
                    >
                      1
                    </button>
                  )}

                  {orderPage > 4 && <span className="px-2 font-black text-gray-400">...</span>}

                  {orderPageNumbers.map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setOrderPage(page)}
                      className={`rounded-2xl px-4 py-3 text-sm font-black ${
                        page === orderPage
                          ? "bg-gray-950 text-white"
                          : "border bg-white text-gray-700"
                      }`}
                    >
                      {page}
                    </button>
                  ))}

                  {orderPage < totalOrderPages - 3 && <span className="px-2 font-black text-gray-400">...</span>}

                  {orderPage < totalOrderPages - 2 && (
                    <button
                      type="button"
                      onClick={() => setOrderPage(totalOrderPages)}
                      className="rounded-2xl border bg-white px-4 py-3 text-sm font-black"
                    >
                      {totalOrderPages}
                    </button>
                  )}

                  <button
                    type="button"
                    aria-label="주문 페이지 다음"
                    onClick={() => setOrderPage((prev) => Math.min(totalOrderPages, prev + 1))}
                    disabled={orderPage >= totalOrderPages}
                    className="rounded-2xl border bg-white px-4 py-3 text-sm font-black disabled:opacity-30"
                  >
                    다음
                  </button>
                </div>
              )}
    </>
  );
}
