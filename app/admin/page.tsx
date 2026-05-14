// app/admin/page.tsx
// adminUtils 연결 버전 전체 교체용
// 위치: app/admin/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { MoneyInput, PercentInput } from "../../components/admin/AdminMoneyInputs";

import {
  STATUS_OPTIONS,
  STATUS_FILTER_OPTIONS,
  PAYMENT_FILTER_OPTIONS,
  EXPENSE_OPTIONS,
  won,
  getOrderTotal,
  getOrderShipping,
  getPaymentLabel,
  getRefundAmount,
  getDisplayStatus,
  getStatusColor,
  calculateSettlement,
  buildRozenRows,
  downloadTsvAsExcel,
} from "./adminUtils";

const ADMIN_PASSWORD = "8249";

export default function AdminPage() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);

  const [orders, setOrders] = useState<any[]>([]);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  const [tab, setTab] = useState<"orders" | "members" | "stats">("orders");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체상태");
  const [paymentFilter, setPaymentFilter] = useState("전체결제");

  const [warehouseCost, setWarehouseCost] = useState(0);
  const [extraIncome, setExtraIncome] = useState(0);

  const [expenses, setExpenses] = useState([
    { type: "생활비", amount: 0, memo: "" },
  ]);

  useEffect(() => {
    const saved = sessionStorage.getItem("ruru_admin_login");

    if (saved === "Y") {
      setIsAuthed(true);
      loadAll();
    } else {
      setLoading(false);
    }
  }, []);

  const loadAll = async () => {
    setLoading(true);

    const [ordersResult, broadcastsResult, customersResult] =
      await Promise.all([
        supabase
          .from("orders")
          .select("*")
          .order("created_at", { ascending: false }),

        supabase
          .from("broadcasts")
          .select("*")
          .order("created_at", { ascending: false }),

        supabase
          .from("customers")
          .select("*")
          .order("last_order_at", { ascending: false }),
      ]);

    setOrders(ordersResult.data || []);
    setBroadcasts(broadcastsResult.data || []);
    setCustomers(customersResult.data || []);

    setLoading(false);
  };

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return orders.filter((order) => {
      const status = getDisplayStatus(order);
      const paymentLabel = getPaymentLabel(order);

      const matchesKeyword =
        !keyword ||
        String(order.customer_name || "")
          .toLowerCase()
          .includes(keyword) ||
        String(order.youtube_nickname || "")
          .toLowerCase()
          .includes(keyword) ||
        String(order.customer_phone || "").includes(keyword) ||
        String(order.product_name || "")
          .toLowerCase()
          .includes(keyword);

      const matchesStatus =
        statusFilter === "전체상태" || status === statusFilter;

      const matchesPayment =
        paymentFilter === "전체결제" ||
        paymentLabel === paymentFilter;

      return matchesKeyword && matchesStatus && matchesPayment;
    });
  }, [orders, search, statusFilter, paymentFilter]);

  const settlement = useMemo(() => {
    return calculateSettlement(
      filteredOrders,
      expenses,
      warehouseCost,
      extraIncome
    );
  }, [filteredOrders, expenses, warehouseCost, extraIncome]);

  const handleLogin = () => {
    if (password !== ADMIN_PASSWORD) {
      alert("관리자 비밀번호가 틀렸습니다.");
      return;
    }

    sessionStorage.setItem("ruru_admin_login", "Y");
    setIsAuthed(true);
    loadAll();
  };

  const downloadRozenExcel = () => {
    const targetOrders = filteredOrders.filter(
      (order) => getDisplayStatus(order) === "주문확인완료"
    );

    const rows = buildRozenRows(targetOrders);

    downloadTsvAsExcel(
      rows,
      `${new Date().getMonth() + 1}월${new Date().getDate()}일_로젠송장.xls`
    );
  };

  if (!isAuthed) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center p-5">
        <div className="w-full max-w-sm bg-white rounded-3xl p-6 border">
          <h1 className="text-3xl font-extrabold mb-5">
            관리자 로그인
          </h1>

          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLogin();
            }}
            className="w-full border rounded-2xl p-4 mb-4"
          />

          <button
            onClick={handleLogin}
            className="w-full bg-black text-white rounded-2xl p-4 font-bold"
          >
            로그인
          </button>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-2xl font-extrabold">
          불러오는중...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-5">
      <div className="max-w-7xl mx-auto">

        <div className="grid grid-cols-3 gap-2 mb-5">
          <button
            onClick={() => setTab("orders")}
            className={`p-4 rounded-2xl font-bold ${
              tab === "orders"
                ? "bg-black text-white"
                : "bg-white"
            }`}
          >
            주문관리
          </button>

          <button
            onClick={() => setTab("members")}
            className={`p-4 rounded-2xl font-bold ${
              tab === "members"
                ? "bg-black text-white"
                : "bg-white"
            }`}
          >
            회원관리
          </button>

          <button
            onClick={() => setTab("stats")}
            className={`p-4 rounded-2xl font-bold ${
              tab === "stats"
                ? "bg-black text-white"
                : "bg-white"
            }`}
          >
            정산관리
          </button>
        </div>

        {tab === "orders" && (
          <section className="bg-white rounded-3xl border p-5">

            <div className="grid md:grid-cols-4 gap-3 mb-5">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="검색"
                className="border rounded-2xl p-4"
              />

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border rounded-2xl p-4"
              >
                {STATUS_FILTER_OPTIONS.map((item) => (
                  <option key={item}>
                    {item}
                  </option>
                ))}
              </select>

              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="border rounded-2xl p-4"
              >
                {PAYMENT_FILTER_OPTIONS.map((item) => (
                  <option key={item}>
                    {item}
                  </option>
                ))}
              </select>

              <button
                onClick={downloadRozenExcel}
                className="bg-blue-600 text-white rounded-2xl p-4 font-bold"
              >
                로젠 송장 생성
              </button>
            </div>

            <div className="grid gap-4">
              {filteredOrders.map((order) => {
                const status = getDisplayStatus(order);
                const paymentLabel = getPaymentLabel(order);

                const isCanceled =
                  status === "주문서취소";

                const isRefunded =
                  status === "환불" ||
                  status === "부분환불";

                const shouldStrike =
                  isCanceled || isRefunded;

                return (
                  <div
                    key={order.id}
                    className="border rounded-3xl p-5 bg-gray-50"
                  >
                    <div className="flex justify-between gap-4 flex-wrap">

                      <div>
                        <div
                          className={`text-2xl font-extrabold ${
                            shouldStrike
                              ? "line-through text-gray-400"
                              : ""
                          }`}
                        >
                          {order.youtube_nickname || "-"}
                        </div>

                        <div
                          className={`text-gray-500 ${
                            shouldStrike
                              ? "line-through"
                              : ""
                          }`}
                        >
                          {order.customer_name || "-"}
                        </div>
                      </div>

                      <div
                        className={`px-4 py-2 rounded-full border text-sm font-bold ${getStatusColor(status)}`}
                      >
                        {status}
                      </div>

                    </div>

                    <div className="mt-4">
                      <div
                        className={`font-bold text-lg ${
                          shouldStrike
                            ? "line-through text-gray-400"
                            : ""
                        }`}
                      >
                        {order.product_name || "상품명"}
                      </div>

                      <div
                        className={`text-gray-500 mt-1 ${
                          shouldStrike
                            ? "line-through"
                            : ""
                        }`}
                      >
                        {order.color || "없음"} /{" "}
                        {order.size || "없음"} /{" "}
                        {order.qty || 0}개
                      </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-3 mt-5">

                      <div className="bg-white rounded-2xl border p-4">
                        <div className="text-sm text-gray-500">
                          결제금액
                        </div>

                        <div
                          className={`text-2xl font-extrabold ${
                            shouldStrike
                              ? "line-through text-gray-400"
                              : ""
                          }`}
                        >
                          {won(getOrderTotal(order))}
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl border p-4">
                        <div className="text-sm text-gray-500">
                          배송비
                        </div>

                        <div className="text-2xl font-extrabold">
                          {won(getOrderShipping(order))}
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl border p-4">
                        <div className="text-sm text-gray-500">
                          결제수단
                        </div>

                        <div className="text-2xl font-extrabold">
                          {paymentLabel}
                        </div>
                      </div>

                    </div>

                    {isCanceled && (
                      <div className="mt-4 bg-red-50 border border-red-200 rounded-2xl p-4">
                        <div className="font-extrabold text-red-700">
                          주문이 취소되었습니다.
                        </div>

                        <div className="text-red-700 text-sm mt-1">
                          사유: {order.cancel_reason || "-"}
                        </div>
                      </div>
                    )}

                    {isRefunded && (
                      <div className="mt-4 bg-red-50 border border-red-200 rounded-2xl p-4">
                        <div className="font-extrabold text-red-700">
                          {order.refund_type || "환불"} /{" "}
                          {won(getRefundAmount(order))}
                        </div>

                        <div className="text-red-700 text-sm mt-1">
                          {order.refund_memo || "-"}
                        </div>
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === "stats" && (
          <section className="bg-white rounded-3xl border p-5">

            <div className="grid md:grid-cols-3 xl:grid-cols-6 gap-4">

              <div className="bg-gray-50 border rounded-2xl p-5">
                <div className="text-sm text-gray-500">
                  원매출
                </div>

                <div className="text-3xl font-extrabold mt-2">
                  {won(settlement.grossSales)}
                </div>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
                <div className="text-sm text-red-600">
                  환불 차감
                </div>

                <div className="text-3xl font-extrabold mt-2 text-red-700">
                  {won(settlement.totalRefundAmount)}
                </div>
              </div>

              <div className="bg-gray-50 border rounded-2xl p-5">
                <div className="text-sm text-gray-500">
                  최종 방송매출
                </div>

                <div className="text-3xl font-extrabold mt-2">
                  {won(settlement.totalSales)}
                </div>
              </div>

              <div className="bg-gray-50 border rounded-2xl p-5">
                <div className="text-sm text-gray-500">
                  카드매출
                </div>

                <div className="text-3xl font-extrabold mt-2">
                  {won(settlement.cardSales)}
                </div>
              </div>

              <div className="bg-gray-50 border rounded-2xl p-5">
                <div className="text-sm text-gray-500">
                  카드 수수료정산(7%)
                </div>

                <div className="text-3xl font-extrabold mt-2">
                  {won(settlement.cardFeeSettlement)}
                </div>
              </div>

              <div className="bg-black text-white rounded-2xl p-5">
                <div className="text-sm opacity-70">
                  최종 순수익
                </div>

                <div className="text-4xl font-extrabold mt-2">
                  {won(settlement.finalProfit)}
                </div>
              </div>

            </div>

            <div className="grid md:grid-cols-2 gap-5 mt-5">

              <div className="border rounded-3xl p-5">
                <div className="text-xl font-extrabold mb-5">
                  정산 입력
                </div>

                <div className="space-y-4">

                  <div>
                    <div className="text-sm font-bold mb-2">
                      창고 정산금액
                    </div>

                    <MoneyInput
                      value={warehouseCost}
                      onChange={setWarehouseCost}
                    />
                  </div>

                  <div>
                    <div className="text-sm font-bold mb-2">
                      기타 매출
                    </div>

                    <MoneyInput
                      value={extraIncome}
                      onChange={setExtraIncome}
                    />
                  </div>

                </div>
              </div>

              <div className="border rounded-3xl p-5">
                <div className="flex items-center justify-between mb-5">
                  <div className="text-xl font-extrabold">
                    기타 지출
                  </div>

                  <button
                    onClick={() =>
                      setExpenses((prev) => [
                        ...prev,
                        {
                          type: "생활비",
                          amount: 0,
                          memo: "",
                        },
                      ])
                    }
                    className="bg-black text-white px-4 py-2 rounded-2xl font-bold"
                  >
                    추가
                  </button>
                </div>

                <div className="space-y-4">
                  {expenses.map((expense, index) => (
                    <div
                      key={index}
                      className="border rounded-2xl p-4 bg-gray-50"
                    >
                      <div className="grid md:grid-cols-3 gap-3">

                        <select
                          value={expense.type}
                          onChange={(e) => {
                            const copy = [...expenses];
                            copy[index].type = e.target.value;
                            setExpenses(copy);
                          }}
                          className="border rounded-2xl p-4"
                        >
                          {EXPENSE_OPTIONS.map((item) => (
                            <option key={item}>
                              {item}
                            </option>
                          ))}
                        </select>

                        <MoneyInput
                          value={expense.amount}
                          onChange={(value) => {
                            const copy = [...expenses];
                            copy[index].amount = value;
                            setExpenses(copy);
                          }}
                        />

                        <input
                          value={expense.memo}
                          onChange={(e) => {
                            const copy = [...expenses];
                            copy[index].memo = e.target.value;
                            setExpenses(copy);
                          }}
                          placeholder="메모"
                          className="border rounded-2xl p-4"
                        />

                      </div>
                    </div>
                  ))}
                </div>

              </div>

            </div>

          </section>
        )}

      </div>
    </main>
  );
}
