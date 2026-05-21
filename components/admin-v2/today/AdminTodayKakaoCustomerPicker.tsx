"use client";

// components/admin-v2/today/AdminTodayKakaoCustomerPicker.tsx
// 목적: 카톡 대화/수동검색 기반 고객 선택
// 주의: UI 전용. 고객 저장/수정 로직 없음.

import type { CustomerRow } from "@/lib/admin-v2/types";

const formatCustomer = (customer: CustomerRow) => {
  return `${customer.youtube_nickname || "-"} / ${customer.customer_name || "-"} / ${customer.customer_phone || "-"}`;
};

export default function AdminTodayKakaoCustomerPicker({
  matches,
  searchResults,
  selectedCustomerId,
  setSelectedCustomerId,
  customerSearch,
  setCustomerSearch,
}: {
  matches: CustomerRow[];
  searchResults: CustomerRow[];
  selectedCustomerId: number | "";
  setSelectedCustomerId: (value: number | "") => void;
  customerSearch: string;
  setCustomerSearch: (value: string) => void;
}) {
  const merged = [...matches];

  searchResults.forEach((customer) => {
    if (!merged.some((item) => Number(item.id) === Number(customer.id))) {
      merged.push(customer);
    }
  });

  return (
    <section className="rounded-2xl border border-neutral-100 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black text-neutral-950">고객 연결</div>
          <div className="mt-0.5 text-xs font-bold text-neutral-500">
            보통 카톡 대화에는 이름/닉네임만 남으니, 직접 검색으로 보완합니다.
          </div>
        </div>
      </div>

      <input
        value={customerSearch}
        onChange={(event) => setCustomerSearch(event.target.value)}
        placeholder="고객 직접 검색: 닉네임 / 이름 / 전화번호"
        className="mb-2 h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm font-black outline-none focus:border-blue-500"
      />

      {merged.length === 0 ? (
        <div className="rounded-xl bg-neutral-50 p-3 text-xs font-bold text-neutral-500">
          고객 후보가 없습니다. 카톡 이름/닉네임 또는 고객 검색어를 입력해주세요.
        </div>
      ) : (
        <select
          value={selectedCustomerId}
          onChange={(event) => setSelectedCustomerId(event.target.value ? Number(event.target.value) : "")}
          className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-black outline-none focus:border-blue-500"
        >
          <option value="">
            {matches[0] ? `자동추천: ${formatCustomer(matches[0])}` : "고객을 선택해주세요"}
          </option>
          {merged.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {formatCustomer(customer)}
            </option>
          ))}
        </select>
      )}
    </section>
  );
}
