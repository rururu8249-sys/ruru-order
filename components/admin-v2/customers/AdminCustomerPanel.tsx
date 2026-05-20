"use client";

// components/admin-v2/customers/AdminCustomerPanel.tsx
// 목적: 고객관리 표형 리스트 + 검색/필터/정렬 + 고객상세 Drawer
// 주의: UI 조회 전용. 고객 차단 저장, 메모 저장, 주문/정산/입금 로직 없음.

import { useMemo, useState } from "react";
import type { CustomerRow } from "@/lib/admin-v2/types";
import AdminCustomerFilterBar from "@/components/admin-v2/customers/AdminCustomerFilterBar";
import AdminCustomerTable from "@/components/admin-v2/customers/AdminCustomerTable";
import AdminCustomerDetailDrawer from "@/components/admin-v2/customers/AdminCustomerDetailDrawer";

type BlockFilter = "all" | "normal" | "blocked";
type SortKey = "last_order" | "created" | "nickname" | "name";

type AdminCustomerPanelProps = {
  customers: CustomerRow[];
};

const normalize = (value: unknown) => {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .toLowerCase();
};

const isBlockedCustomer = (customer: CustomerRow) => {
  return customer.is_blocked === true || customer.is_blocked === "true" || customer.is_blocked === "Y";
};

const dateValue = (value: string | null) => {
  const date = new Date(value || "");
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
};

export default function AdminCustomerPanel({
  customers,
}: AdminCustomerPanelProps) {
  const [keyword, setKeyword] = useState("");
  const [blockFilter, setBlockFilter] = useState<BlockFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("last_order");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);

  const filteredCustomers = useMemo(() => {
    const word = normalize(keyword);

    return [...customers]
      .filter((customer) => {
        const blocked = isBlockedCustomer(customer);

        if (blockFilter === "blocked" && !blocked) return false;
        if (blockFilter === "normal" && blocked) return false;

        if (!word) return true;

        const haystack = [
          customer.youtube_nickname,
          customer.customer_name,
          customer.customer_phone,
          customer.address,
          customer.detail_address,
          customer.customer_memo,
          customer.block_reason,
          ...(Array.isArray(customer.customer_tags) ? customer.customer_tags : []),
        ]
          .map(normalize)
          .join(" ");

        return haystack.includes(word);
      })
      .sort((a, b) => {
        if (sortKey === "last_order") {
          return dateValue(b.last_order_at) - dateValue(a.last_order_at);
        }

        if (sortKey === "created") {
          return dateValue(b.created_at) - dateValue(a.created_at);
        }

        if (sortKey === "nickname") {
          return String(a.youtube_nickname || "").localeCompare(String(b.youtube_nickname || ""), "ko");
        }

        return String(a.customer_name || "").localeCompare(String(b.customer_name || ""), "ko");
      });
  }, [customers, keyword, blockFilter, sortKey]);

  return (
    <section className="grid gap-3">
      <AdminCustomerFilterBar
        keyword={keyword}
        setKeyword={setKeyword}
        blockFilter={blockFilter}
        setBlockFilter={setBlockFilter}
        sortKey={sortKey}
        setSortKey={setSortKey}
        totalCount={customers.length}
        filteredCount={filteredCustomers.length}
      />

      <AdminCustomerTable
        customers={filteredCustomers}
        onOpenCustomer={setSelectedCustomer}
      />

      <AdminCustomerDetailDrawer
        customer={selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
      />
    </section>
  );
}
