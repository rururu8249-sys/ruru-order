// components/admin-v2/today/AdminTodayOrderBriefPanel.tsx
// 목적: 오늘할일 오른쪽 하단 주문서 간략보기
// 주의: 조회 전용. 주문/입금/배송/정산 상태 변경 없음.

"use client";

import { useMemo, useState } from "react";
import type { OrderGroup } from "@/lib/admin-v2/types";

const PAGE_SIZE = 8;

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function getNickname(group: OrderGroup) {
  const anyGroup = group as unknown as Record<string, any>;
  const first = (group.first || {}) as unknown as Record<string, any>;

  return clean(
    first.youtube_nickname ||
      first.nickname ||
      first.customer_nickname ||
      anyGroup.nickname ||
      anyGroup.customer_nickname ||
      first.customer_name ||
      "-"
  );
}

function getRows(group: OrderGroup) {
  const anyGroup = group as unknown as Record<string, any>;

  if (Array.isArray(anyGroup.rows)) return anyGroup.rows as Record<string, any>[];
  if (Array.isArray(anyGroup.items)) return anyGroup.items as Record<string, any>[];
  if (Array.isArray(anyGroup.orders)) return anyGroup.orders as Record<string, any>[];
  if (Array.isArray(anyGroup.orderItems)) return anyGroup.orderItems as Record<string, any>[];

  return [];
}

function buildOption(row: Record<string, any>) {
  const option = clean(row.product_option || row.option || row.option_name);
  if (option) return option;

  const color = clean(row.color || row.product_color || row.option_color);
  const size = clean(row.size || row.product_size || row.option_size);

  return [color, size].filter(Boolean).join(" / ");
}

function buildRowSummary(row: Record<string, any>) {
  const product = clean(row.product_name || row.item_name || row.name || row.product || row.title);
  const option = buildOption(row);
  const qty = Number(row.qty || row.quantity || row.product_qty || row.count || 1);

  const base = [product, option].filter(Boolean).join(" / ");
  if (!base) return "";

  return `${base}${qty > 0 ? ` x${qty}` : ""}`;
}

function getOrderSummary(group: OrderGroup) {
  const anyGroup = group as unknown as Record<string, any>;
  const first = (group.first || {}) as unknown as Record<string, any>;

  const directSummary = clean(anyGroup.itemSummary || anyGroup.item_summary || anyGroup.orderSummary || anyGroup.order_summary);
  if (directSummary && directSummary !== "주문내용 없음") {
    return directSummary;
  }

  const productLines = anyGroup.productLines;
  if (Array.isArray(productLines)) {
    const lines = productLines.map(clean).filter(Boolean);
    if (lines.length === 1) return lines[0];
    if (lines.length === 2) return `${lines[0]} · ${lines[1]}`;
    if (lines.length > 2) return `${lines[0]} · ${lines[1]} 외 ${lines.length - 2}건`;
  }

  const rows = getRows(group);
  const rowLines = rows.map(buildRowSummary).filter(Boolean);

  if (rowLines.length === 1) return rowLines[0];
  if (rowLines.length === 2) return `${rowLines[0]} · ${rowLines[1]}`;
  if (rowLines.length > 2) return `${rowLines[0]} · ${rowLines[1]} 외 ${rowLines.length - 2}건`;

  const firstSummary = buildRowSummary(first);
  if (firstSummary) return firstSummary;

  return "주문정보 확인 필요";
}

export default function AdminTodayOrderBriefPanel({ groups }: { groups: OrderGroup[] }) {
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [refreshTick, setRefreshTick] = useState(0);

  const filteredGroups = useMemo(() => {
    const word = keyword.trim().toLowerCase();

    const list = groups.filter((group) => {
      if (!word) return true;

      const first = (group.first || {}) as unknown as Record<string, any>;
      const target = [
        getNickname(group),
        getOrderSummary(group),
        group.totalAmount,
        group.groupId,
        first.customer_name,
        first.customer_phone,
        first.phone,
        first.order_number,
        first.order_no,
      ]
        .join(" ")
        .toLowerCase();

      return target.includes(word);
    });

    return list.slice().sort((a, b) => {
      const aTime = new Date(String((a.first as any)?.created_at || 0)).getTime() || 0;
      const bTime = new Date(String((b.first as any)?.created_at || 0)).getTime() || 0;
      return bTime - aTime;
    });
  }, [groups, keyword, refreshTick]);

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleGroups = filteredGroups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const refresh = () => {
    setRefreshTick((value) => value + 1);
    setPage(1);
  };

  return (
    <section className="rounded-[26px] border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[22px] font-black tracking-[-0.04em] text-neutral-950">주문서 간략보기</div>
          <div className="mt-1 text-[12px] font-bold text-neutral-500">
            닉네임·주문내용·금액만 빠르게 확인합니다.
          </div>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="text-[13px] font-black text-neutral-500 transition-all duration-150 hover:text-blue-600 active:scale-[0.96]"
          title="주문서 간략보기 패널만 새로고침"
        >
          🔄 새로고침
        </button>
      </div>

      <div className="mb-3 grid grid-cols-[1fr_auto] gap-2">
        <input
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setPage(1);
          }}
          placeholder="닉네임, 주문내용, 주문번호 검색"
          className="h-11 rounded-xl border border-neutral-200 bg-white px-4 text-[13px] font-bold outline-none transition-all duration-150 focus:border-neutral-950 focus:ring-2 focus:ring-neutral-200"
        />
        <button
          type="button"
          onClick={() => {
            setKeyword("");
            setPage(1);
          }}
          className="h-11 rounded-xl bg-neutral-950 px-4 text-[13px] font-black text-white transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.97]"
        >
          초기화
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200">
        <div className="grid grid-cols-[120px_1fr_110px] bg-neutral-50 px-4 py-3 text-[13px] font-black text-neutral-700">
          <div>닉네임</div>
          <div>주문내용</div>
          <div className="text-right">금액</div>
        </div>

        {visibleGroups.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] font-black text-neutral-400">
            표시할 주문서가 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {visibleGroups.map((group) => (
              <div
                key={group.groupId}
                className="grid grid-cols-[120px_1fr_110px] items-center px-4 py-3 text-[13px] transition-all duration-150 hover:bg-blue-50/40"
              >
                <div className="truncate font-black text-neutral-950">{getNickname(group)}</div>
                <div className="truncate font-bold text-neutral-700">{getOrderSummary(group)}</div>
                <div className="text-right font-black text-neutral-950">{money(group.totalAmount)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12px] font-bold text-neutral-400">
          총 {filteredGroups.length.toLocaleString()}건
        </div>

        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(totalPages, 5) }, (_, index) => index + 1).map((pageNo) => (
            <button
              key={pageNo}
              type="button"
              onClick={() => setPage(pageNo)}
              className={`h-8 w-8 rounded-lg text-[12px] font-black transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.97] ${
                safePage === pageNo ? "bg-neutral-950 text-white" : "border border-neutral-200 bg-white text-neutral-700"
              }`}
            >
              {pageNo}
            </button>
          ))}

          {totalPages > 5 ? <span className="px-1 text-[12px] font-bold text-neutral-400">...</span> : null}

          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={safePage >= totalPages}
            className="h-8 rounded-lg border border-neutral-200 bg-white px-3 text-[12px] font-black text-neutral-700 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.97] disabled:opacity-40"
          >
            다음
          </button>
        </div>
      </div>
    </section>
  );
}
