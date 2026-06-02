"use client";

// components/admin-v2/customers/AdminCustomerDetailDrawer.tsx
// 목적: 고객 상세정보 우측 Drawer
// 주의: UI 조회 전용. 고객 차단/메모 저장, 주문/정산/입금 로직 없음.

import { useEffect } from "react";
import type { CustomerRow } from "@/lib/admin-v2/types";

type AdminCustomerDetailDrawerProps = {
  customer: CustomerRow | null;
  onClose: () => void;
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

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function InfoBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="mb-3 text-sm font-black text-neutral-400">{title}</div>
      <div className="grid gap-2 text-sm font-bold text-neutral-700">{children}</div>
    </section>
  );
}

export default function AdminCustomerDetailDrawer({
  customer,
  onClose,
}: AdminCustomerDetailDrawerProps) {
  useEffect(() => {
    if (!customer) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [customer, onClose]);

  if (!customer) return null;

  const blocked = isBlockedCustomer(customer);
  const tags = Array.isArray(customer.customer_tags) ? customer.customer_tags : [];
  const address = [(customer as any).zipcode, customer.address, customer.detail_address].filter(Boolean).join(" ");

  return (
    <div
      className="fixed inset-0 z-[85] flex justify-end bg-black/35 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-[760px] flex-col bg-neutral-50 shadow-[-18px_0_48px_rgba(15,23,42,0.24)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-black text-blue-600">고객 상세</div>
              <h2 className="mt-1 truncate text-2xl font-black tracking-[-0.05em] text-neutral-950">
                {customer.youtube_nickname || "-"}
              </h2>
              <div className="mt-1 text-xs font-bold text-neutral-500">
                {customer.customer_name || "-"} · {formatPhone(customer.customer_phone)}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-1.5 text-xs font-black ${blocked ? "bg-red-100 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                {blocked ? "차단회원" : "정상회원"}
              </span>

              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-black text-neutral-800 active:scale-[0.98]"
              >
                닫기
              </button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid gap-4">
            <InfoBox title="기본정보">
              <div>닉네임: <span className="font-black text-neutral-950">{customer.youtube_nickname || "-"}</span></div>
              <div>이름: <span className="font-black text-neutral-950">{customer.customer_name || "-"}</span></div>
              <div>전화번호: <span className="font-black text-neutral-950">{formatPhone(customer.customer_phone) || "-"}</span></div>
              <div>최근주문: <span className="font-black text-neutral-950">{formatDate(customer.last_order_at)}</span></div>
              <div>최초등록: <span className="font-black text-neutral-950">{formatDate(customer.created_at)}</span></div>
            </InfoBox>

            <InfoBox title="배송정보">
              <div className="break-keep leading-relaxed">
                {address || "주소 정보 없음"}
              </div>
            </InfoBox>

            <InfoBox title="특이사항 / 메모">
              <div className="min-h-[84px] rounded-xl bg-neutral-50 p-3 leading-relaxed">
                {customer.customer_memo || "메모 없음"}
              </div>
              {tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </InfoBox>

            <InfoBox title="차단정보">
              <div>차단여부: <span className={blocked ? "font-black text-red-600" : "font-black text-emerald-600"}>{blocked ? "차단" : "정상"}</span></div>
              <div>차단사유: <span className="font-black text-neutral-950">{customer.block_reason || "-"}</span></div>
            </InfoBox>
          </div>
        </div>

        <footer className="border-t border-neutral-200 bg-white px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-bold text-neutral-500">
              다음 단계에서 메모 수정/차단 처리/주문이력 연결을 붙일 수 있습니다.
            </div>

            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl bg-neutral-950 px-5 text-sm font-black text-white active:scale-[0.98]"
            >
              닫기
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
