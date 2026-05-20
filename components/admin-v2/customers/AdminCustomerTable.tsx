"use client";

// components/admin-v2/customers/AdminCustomerTable.tsx
// 목적: 고객관리 표형 리스트
// 주의: UI 전용. 고객 차단/메모 저장 로직 없음.

import type { CustomerRow } from "@/lib/admin-v2/types";

type AdminCustomerTableProps = {
  customers: CustomerRow[];
  onOpenCustomer: (customer: CustomerRow) => void;
};

const isBlockedCustomer = (customer: CustomerRow) => {
  return customer.is_blocked === true || customer.is_blocked === "true" || customer.is_blocked === "Y";
};

const formatPhone = (value: string | null) => {
  const digits = String(value || "").replace(/[^0-9]/g, "").slice(0, 11);

  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;

  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};

const formatDate = (value: string | null) => {
  if (!value) return "-";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";

  return date.toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
};

export default function AdminCustomerTable({
  customers,
  onOpenCustomer,
}: AdminCustomerTableProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="grid grid-cols-[44px_minmax(140px,1fr)_120px_150px_110px_120px] border-b border-neutral-200 bg-neutral-50 px-3 py-3 text-xs font-black text-neutral-500">
        <div className="text-center">상세</div>
        <div>고객</div>
        <div className="text-center">상태</div>
        <div>전화번호</div>
        <div className="text-center">최근주문</div>
        <div className="text-center">메모</div>
      </div>

      {customers.length === 0 ? (
        <div className="px-4 py-16 text-center text-sm font-black text-neutral-400">
          조건에 맞는 고객이 없습니다.
        </div>
      ) : (
        <div className="divide-y divide-neutral-100">
          {customers.map((customer) => {
            const blocked = isBlockedCustomer(customer);
            const memo = customer.customer_memo || "";
            const tags = Array.isArray(customer.customer_tags) ? customer.customer_tags : [];

            return (
              <button
                key={customer.id}
                type="button"
                onClick={() => onOpenCustomer(customer)}
                className="grid w-full grid-cols-[44px_minmax(140px,1fr)_120px_150px_110px_120px] items-center px-3 py-3 text-left text-sm transition hover:bg-blue-50/40 active:scale-[0.999]"
              >
                <div className="flex justify-center">
                  <span className="rounded-lg bg-neutral-950 px-2 py-1 text-[11px] font-black text-white">
                    보기
                  </span>
                </div>

                <div className="min-w-0">
                  <div className="truncate text-[15px] font-black text-neutral-950">
                    {customer.youtube_nickname || "-"}
                  </div>
                  <div className="mt-0.5 truncate text-xs font-bold text-neutral-500">
                    {customer.customer_name || "-"}
                  </div>
                </div>

                <div className="text-center">
                  <span className={`rounded-full px-2 py-1 text-[11px] font-black ${blocked ? "bg-red-100 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {blocked ? "차단" : "정상"}
                  </span>
                </div>

                <div className="font-bold text-neutral-600">
                  {formatPhone(customer.customer_phone)}
                </div>

                <div className="text-center text-xs font-black text-neutral-500">
                  {formatDate(customer.last_order_at)}
                </div>

                <div className="text-center">
                  <span className={`rounded-full px-2 py-1 text-[11px] font-black ${memo || tags.length > 0 ? "bg-amber-50 text-amber-700" : "bg-neutral-100 text-neutral-500"}`}>
                    {memo || tags.length > 0 ? "있음" : "없음"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
