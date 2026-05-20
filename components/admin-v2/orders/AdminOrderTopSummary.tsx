"use client";

type AdminOrderTopSummaryProps = {
  summaryCards: {
    totalOrderProductQty: number;
    totalOrderCount: number;
    totalOrderAmount: number;
    bankPaid: number;
    bankUnpaid: number;
    cardPaid: number;
    cardUnpaid: number;
    canceledAmount: number;
  };
};

export default function AdminOrderTopSummary({ summaryCards: _summaryCards }: AdminOrderTopSummaryProps) {
  return null;
}
