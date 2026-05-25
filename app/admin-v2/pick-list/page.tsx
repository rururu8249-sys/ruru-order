"use client";

import { showAdminToast } from "@/lib/adminToast";

// app/admin-v2/pick-list/page.tsx
// 전체 교체
// 위치: /Users/ruru/Desktop/ruru-order-app/app/admin-v2/pick-list/page.tsx
// 목적: 물건 챙김용 간단 리스트 + 조건별 출력
// 주의: DB 읽기 전용입니다. 주문 저장/금액/정산/배송비 로직을 수정하지 않습니다.


import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  COMBINE_SHIPPING_SETTING_KEYS,
  fromDateTimeLocalValue,
  getDefaultTonightCombineWindow,
  parseCombineShippingSettings,
  toDateTimeLocalValue,
} from "@/lib/admin-v2/combineShipping";

type OrderRow = {
  id: string | number;
  created_at: string;
  youtube_nickname?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  product_name?: string | null;
  color?: string | null;
  size?: string | null;
  qty?: number | string | null;
  payment_method?: string | null;
  order_manage_status?: string | null;
};

type PickGroup = {
  key: string;
  nickname: string;
  name: string;
  phone: string;
  items: string[];
  totalQty: number;
  statusSummary: string;
};

type PaymentFilter =
  | "all"
  | "paidOnly"
  | "bankPaid"
  | "cardPaid"
  | "unpaid"
  | "readyToPick"
  | "shipped"
  | "canceledOnly";

type SortField =
  | "nickname"
  | "name"
  | "phone"
  | "items"
  | "status"
  | "totalQty";

type SortDirection = "asc" | "desc";

const normalizeText = (value: unknown) => String(value || "").trim();

const toNumber = (value: unknown) => {
  const numberValue = Number(String(value || "").replace(/[^0-9.-]/g, ""));

  if (!Number.isFinite(numberValue)) return 0;

  return numberValue;
};

const hideNone = (value: unknown) => {
  const text = normalizeText(value);

  if (!text) return "";
  if (text === "없음") return "";

  return text;
};

const isCanceledOrder = (statusValue: unknown) => {
  const status = normalizeText(statusValue);

  if (!status) return false;

  return status.includes("취소") || status.includes("환불");
};

const isCardPaidOrder = (order: OrderRow) => {
  const paymentMethod = normalizeText(order.payment_method);
  const status = normalizeText(order.order_manage_status);

  return (
    paymentMethod.includes("카드") &&
    (status.includes("카드결제완료") ||
      status.includes("결제완료") ||
      status.includes("입금확인") ||
      status.includes("픽업") ||
      status.includes("출고"))
  );
};

const isBankPaidOrder = (order: OrderRow) => {
  const paymentMethod = normalizeText(order.payment_method);
  const status = normalizeText(order.order_manage_status);

  return (
    !paymentMethod.includes("카드") &&
    (status.includes("입금확인") ||
      status.includes("픽업") ||
      status.includes("출고"))
  );
};

const isPaidOrder = (order: OrderRow) => {
  return isBankPaidOrder(order) || isCardPaidOrder(order);
};

const isUnpaidOrder = (order: OrderRow) => {
  const status = normalizeText(order.order_manage_status);

  if (isCanceledOrder(status)) return false;
  if (isPaidOrder(order)) return false;
  if (status.includes("미입금")) return true;
  if (status.includes("주문완료")) return true;
  if (!status) return true;

  return false;
};

const matchesPaymentFilter = (order: OrderRow, filter: PaymentFilter) => {
  const status = normalizeText(order.order_manage_status);

  if (filter !== "canceledOnly" && isCanceledOrder(status)) {
    return false;
  }

  if (filter === "all") return true;
  if (filter === "paidOnly") return isPaidOrder(order);
  if (filter === "bankPaid") return isBankPaidOrder(order);
  if (filter === "cardPaid") return isCardPaidOrder(order);
  if (filter === "unpaid") return isUnpaidOrder(order);
  if (filter === "readyToPick") return status.includes("픽업");
  if (filter === "shipped") return status.includes("출고");
  if (filter === "canceledOnly") return isCanceledOrder(status);

  return true;
};

const formatItemLabel = (order: OrderRow) => {
  const qty = toNumber(order.qty);

  return [
    normalizeText(order.product_name),
    hideNone(order.color),
    hideNone(order.size),
    qty ? `x${qty}` : "",
  ]
    .filter(Boolean)
    .join(" ");
};

const formatDateTime = (value: string) => {
  if (!value) return "";

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

const escapeCsv = (value: unknown) => {
  const text = String(value ?? "");

  return `"${text.replace(/"/g, '""')}"`;
};

const downloadCsv = (groups: PickGroup[], totalQty: number) => {
  const headers = ["닉네임", "이름", "전화번호", "주문내역", "상태요약", "총수량"];

  const rows = groups.map((group) => [
    group.nickname,
    group.name,
    group.phone,
    group.items.join(" / "),
    group.statusSummary,
    `${group.totalQty}개`,
  ]);

  rows.push(["", "", "", "", "전체 총수량", `${totalQty}개`]);

  const csvText = [headers, ...rows]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\n");

  const blob = new Blob(["\ufeff" + csvText], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `ruru_pick_list_${Date.now()}.csv`;
  anchor.click();

  URL.revokeObjectURL(url);
};

export default function AdminPickListPage() {
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("paidOnly");
  const [keyword, setKeyword] = useState("");
  const [sortField, setSortField] = useState<SortField>("nickname");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    void loadInitialWindow();
  }, []);

  const loadInitialWindow = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("key,value")
      .in("key", COMBINE_SHIPPING_SETTING_KEYS);

    if (!error) {
      const settings = parseCombineShippingSettings(data);

      if (settings.startAt && settings.endAt) {
        setStartLocal(toDateTimeLocalValue(settings.startAt));
        setEndLocal(toDateTimeLocalValue(settings.endAt));
        return;
      }
    }

    const tonight = getDefaultTonightCombineWindow();

    setStartLocal(tonight.startLocal);
    setEndLocal(tonight.endLocal);
  };

  const loadOrders = async () => {
    const startIso = fromDateTimeLocalValue(startLocal);
    const endIso = fromDateTimeLocalValue(endLocal);

    if (!startIso || !endIso) {
      showAdminToast("시작시간과 마감시간을 확인해주세요.");
      return;
    }

    if (new Date(startIso).getTime() >= new Date(endIso).getTime()) {
      showAdminToast("마감시간은 시작시간보다 늦어야 합니다.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, created_at, youtube_nickname, customer_name, customer_phone, product_name, color, size, qty, payment_method, order_manage_status"
      )
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: true })
      .limit(2000);

    setLoading(false);

    if (error) {
      showAdminToast("주문 불러오기 오류: " + error.message);
      return;
    }

    setOrders(data || []);
  };

  const filteredOrders = useMemo(() => {
    const searchText = keyword.trim().toLowerCase();

    return orders.filter((order) => {
      if (!matchesPaymentFilter(order, paymentFilter)) {
        return false;
      }

      if (!searchText) {
        return true;
      }

      const haystack = [
        order.youtube_nickname,
        order.customer_name,
        order.customer_phone,
        order.product_name,
        order.color,
        order.size,
        order.order_manage_status,
        order.payment_method,
      ]
        .map((value) => normalizeText(value).toLowerCase())
        .join(" ");

      return haystack.includes(searchText);
    });
  }, [orders, paymentFilter, keyword]);

  const groups = useMemo(() => {
    const map = new Map<string, PickGroup>();

    filteredOrders.forEach((order) => {
      const nickname = normalizeText(order.youtube_nickname) || "-";
      const name = normalizeText(order.customer_name) || "-";
      const phone = normalizeText(order.customer_phone) || "-";
      const key = [nickname, name, phone].join("|");
      const qty = toNumber(order.qty);
      const itemLabel = formatItemLabel(order);
      const status = normalizeText(order.order_manage_status) || "상태없음";

      if (!map.has(key)) {
        map.set(key, {
          key,
          nickname,
          name,
          phone,
          items: [],
          totalQty: 0,
          statusSummary: "",
        });
      }

      const group = map.get(key);

      if (!group) return;

      if (itemLabel) {
        group.items.push(itemLabel);
      }

      group.totalQty += qty;

      const statusParts = group.statusSummary
        ? group.statusSummary.split(" / ")
        : [];

      if (!statusParts.includes(status)) {
        statusParts.push(status);
      }

      group.statusSummary = statusParts.join(" / ");
    });

    const getSortValue = (group: PickGroup) => {
      if (sortField === "nickname") return group.nickname;
      if (sortField === "name") return group.name;
      if (sortField === "phone") return group.phone;
      if (sortField === "items") return group.items.join(" / ");
      if (sortField === "status") return group.statusSummary;
      if (sortField === "totalQty") return group.totalQty;

      return group.nickname;
    };

    return Array.from(map.values()).sort((a, b) => {
      const aValue = getSortValue(a);
      const bValue = getSortValue(b);

      let result = 0;

      if (typeof aValue === "number" && typeof bValue === "number") {
        result = aValue - bValue;
      } else {
        result = String(aValue).localeCompare(String(bValue), "ko", {
          numeric: true,
          sensitivity: "base",
        });
      }

      return sortDirection === "asc" ? result : result * -1;
    });
  }, [filteredOrders, sortField, sortDirection]);

  const totalQty = useMemo(() => {
    return groups.reduce((sum, group) => sum + group.totalQty, 0);
  }, [groups]);

  const filteredOrderLineCount = filteredOrders.length;

  const allLineCount = orders.length;

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortDirection("asc");
  };

  const sortArrow = (field: SortField) => {
    if (sortField !== field) return "↕";

    return sortDirection === "asc" ? "▲" : "▼";
  };

  const sortButtonClass =
    "inline-flex items-center gap-1 rounded-xl px-2 py-1 font-black transition hover:bg-white/10 active:scale-[0.98]";

  return (
    <main className="min-h-screen bg-[#f8f1e8] px-4 py-6 text-[#241b17]">
      <section className="mx-auto w-full max-w-5xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black text-[#f05a45]">ADMIN PICK LIST</div>
            <h1 className="mt-1 text-[32px] font-black tracking-[-0.07em]">
              물건 챙김 리스트
            </h1>
            <p className="mt-2 text-sm font-bold text-[#7b6554]">
              조건별로 주문을 걸러서 챙길 상품만 출력합니다.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/admin-v2/combine"
              className="rounded-2xl bg-white px-4 py-3 text-sm font-black shadow-[0_8px_20px_rgba(60,38,20,0.12)] ring-1 ring-black/5 active:scale-[0.98]"
            >
              합배송 설정
            </Link>

            <Link
              href="/admin-v2"
              className="rounded-2xl bg-gray-950 px-4 py-3 text-sm font-black text-white shadow-[0_8px_20px_rgba(60,38,20,0.12)] active:scale-[0.98]"
            >
              관리자 홈
            </Link>
          </div>
        </header>

        <section className="mb-5 rounded-[28px] bg-white p-5 shadow-[0_12px_26px_rgba(70,45,25,0.10)] ring-1 ring-black/5">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <div>
              <label className="text-sm font-black text-[#5f4a3c]">시작시간</label>
              <input
                type="datetime-local"
                value={startLocal}
                onChange={(event) => setStartLocal(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-[#ead8c8] bg-white p-4 font-black outline-none focus:border-[#f05a45]"
              />
            </div>

            <div>
              <label className="text-sm font-black text-[#5f4a3c]">마감시간</label>
              <input
                type="datetime-local"
                value={endLocal}
                onChange={(event) => setEndLocal(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-[#ead8c8] bg-white p-4 font-black outline-none focus:border-[#f05a45]"
              />
            </div>

            <button
              type="button"
              onClick={loadOrders}
              disabled={loading}
              className="self-end rounded-2xl bg-[#f05a45] px-5 py-4 font-black text-white shadow-lg shadow-orange-100 active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? "불러오는 중..." : "주문 불러오기"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr_auto]">
            <div>
              <label className="text-sm font-black text-[#5f4a3c]">출력 조건</label>
              <select
                value={paymentFilter}
                onChange={(event) => setPaymentFilter(event.target.value as PaymentFilter)}
                className="mt-2 w-full rounded-2xl border border-[#ead8c8] bg-white p-4 font-black outline-none focus:border-[#f05a45]"
              >
                <option value="paidOnly">입금확인/카드완료만</option>
                <option value="bankPaid">무통장 입금확인만</option>
                <option value="cardPaid">카드결제완료만</option>
                <option value="unpaid">미입금/확인전만</option>
                <option value="readyToPick">픽업예정만</option>
                <option value="shipped">출고완료만</option>
                <option value="all">전체(취소/환불 제외)</option>
                <option value="canceledOnly">취소/환불만</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-black text-[#5f4a3c]">
                검색어
              </label>
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="닉네임 / 이름 / 전화번호 / 상품명 / 색상 / 사이즈"
                className="mt-2 w-full rounded-2xl border border-[#ead8c8] bg-white p-4 font-black outline-none focus:border-[#f05a45]"
              />
            </div>

            <button
              type="button"
              onClick={() => downloadCsv(groups, totalQty)}
              disabled={groups.length === 0}
              className="self-end rounded-2xl bg-gray-950 px-5 py-4 font-black text-white active:scale-[0.98] disabled:opacity-40"
            >
              엑셀용 CSV
            </button>
          </div>

          <div className="mt-3 rounded-2xl bg-[#fff7ec] px-4 py-3 text-xs font-black leading-relaxed text-[#8a5a36]">
            정렬: 표 제목의 닉네임 / 주문내역 / 수량을 누르면 오름차순·내림차순으로 바뀝니다.
          </div>
        </section>

        <section className="mb-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-[24px] bg-white p-5 shadow-[0_10px_22px_rgba(70,45,25,0.08)] ring-1 ring-black/5">
            <div className="text-sm font-black text-[#7b6554]">전체 주문상품 줄수</div>
            <div className="mt-2 text-3xl font-black">{allLineCount}줄</div>
          </div>

          <div className="rounded-[24px] bg-white p-5 shadow-[0_10px_22px_rgba(70,45,25,0.08)] ring-1 ring-black/5">
            <div className="text-sm font-black text-[#7b6554]">필터 후 고객수</div>
            <div className="mt-2 text-3xl font-black">{groups.length}명</div>
          </div>

          <div className="rounded-[24px] bg-white p-5 shadow-[0_10px_22px_rgba(70,45,25,0.08)] ring-1 ring-black/5">
            <div className="text-sm font-black text-[#7b6554]">필터 후 줄수</div>
            <div className="mt-2 text-3xl font-black">{filteredOrderLineCount}줄</div>
          </div>

          <div className="rounded-[24px] bg-[#fff8dc] p-5 shadow-[0_10px_22px_rgba(70,45,25,0.08)] ring-1 ring-black/5">
            <div className="text-sm font-black text-[#9a5b00]">필터 후 총수량</div>
            <div className="mt-2 text-3xl font-black">{totalQty}개</div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[28px] bg-white shadow-[0_12px_26px_rgba(70,45,25,0.10)] ring-1 ring-black/5">
          <div className="grid grid-cols-[120px_1fr_90px] gap-3 bg-gray-950 px-4 py-3 text-sm font-black text-white md:grid-cols-[140px_130px_150px_1fr_130px_90px]">
            <button
              type="button"
              onClick={() => toggleSort("nickname")}
              className={sortButtonClass}
            >
              닉네임 {sortArrow("nickname")}
            </button>

            <button
              type="button"
              onClick={() => toggleSort("name")}
              className={`${sortButtonClass} hidden md:inline-flex`}
            >
              이름 {sortArrow("name")}
            </button>

            <button
              type="button"
              onClick={() => toggleSort("phone")}
              className={`${sortButtonClass} hidden md:inline-flex`}
            >
              전화번호 {sortArrow("phone")}
            </button>

            <button
              type="button"
              onClick={() => toggleSort("items")}
              className={sortButtonClass}
            >
              주문내역 {sortArrow("items")}
            </button>

            <button
              type="button"
              onClick={() => toggleSort("status")}
              className={`${sortButtonClass} hidden md:inline-flex`}
            >
              상태 {sortArrow("status")}
            </button>

            <button
              type="button"
              onClick={() => toggleSort("totalQty")}
              className={`${sortButtonClass} justify-end text-right`}
            >
              수량 {sortArrow("totalQty")}
            </button>
          </div>

          {groups.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm font-black text-[#7b6554]">
              주문을 불러오면 여기에 표시됩니다.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {groups.map((group) => (
                <article
                  key={group.key}
                  className="grid grid-cols-[120px_1fr_90px] gap-3 px-4 py-4 text-sm font-bold md:grid-cols-[140px_130px_150px_1fr_130px_90px]"
                >
                  <div className="font-black">{group.nickname}</div>
                  <div className="hidden md:block">{group.name}</div>
                  <div className="hidden md:block">{group.phone}</div>
                  <div className="break-keep leading-relaxed">
                    {group.items.join(" / ")}
                  </div>
                  <div className="hidden text-xs font-black text-[#7b6554] md:block">
                    {group.statusSummary}
                  </div>
                  <div className="text-right text-lg font-black">
                    {group.totalQty}개
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {groups.length > 0 && (
          <section className="mt-5 rounded-[28px] bg-gray-950 p-5 text-white">
            <div className="flex items-center justify-between gap-4">
              <div className="text-xl font-black">필터된 주문건 전체 총수량</div>
              <div className="text-3xl font-black">{totalQty}개</div>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
