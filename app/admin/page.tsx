// app/admin/page.tsx
// 전체 교체용
// 목적: 실제 화면이 app/components/admin 안의 최신 컴포넌트를 읽도록 연결

"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

import BroadcastPanel from "@/app/components/admin/BroadcastPanel";
import OrderTable from "@/app/components/admin/OrderTable";
import SettlementPanel from "@/app/components/admin/SettlementPanel";

const ADMIN_PASSWORD = "8249";

const onlyNumber = (value: string) => String(value || "").replace(/[^0-9]/g, "");

const formatWon = (value: any) => `${Number(value || 0).toLocaleString()}원`;

export default function AdminPage() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<"orders" | "members" | "stats">("orders");

  const [orders, setOrders] = useState<any[]>([]);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  const [viewMode, setViewMode] = useState<"card" | "table">("table");

  const [search, setSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedBroadcastId, setSelectedBroadcastId] = useState("ALL");
  const [settlementBroadcastId, setSettlementBroadcastId] = useState("ALL");

  const [publicTitle, setPublicTitle] = useState("");
  const [adminSubtitle, setAdminSubtitle] = useState("");
  const [shippingFee, setShippingFee] = useState("4000");
  const [cardFeeRate, setCardFeeRate] = useState("10");

  const [warehouseCost, setWarehouseCost] = useState(0);
  const [pgFee, setPgFee] = useState(0);
  const [extraIncome, setExtraIncome] = useState(0);
  const [extraIncomeMemo, setExtraIncomeMemo] = useState("");

  const [expenses, setExpenses] = useState([
    {
      type: "생활비",
      amount: 0,
      memo: "",
    },
  ]);

  const activeBroadcast = useMemo(() => {
    return broadcasts.find((broadcast) => broadcast.status === "ON") || null;
  }, [broadcasts]);

  useEffect(() => {
    const saved = sessionStorage.getItem("ruru_admin_login");

    if (saved === "Y") {
      setIsAuthed(true);
      loadAll();
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeBroadcast) return;

    setPublicTitle(activeBroadcast.public_title || "");
    setAdminSubtitle(activeBroadcast.admin_subtitle || "");
    setShippingFee(String(activeBroadcast.shipping_fee ?? 4000));
    setCardFeeRate(String(activeBroadcast.card_fee_rate ?? 10));
  }, [activeBroadcast?.id]);

  const loadAll = async () => {
    setLoading(true);

    const [ordersResult, broadcastsResult, customersResult] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("broadcasts").select("*").order("created_at", { ascending: false }),
      supabase.from("customers").select("*").order("last_order_at", { ascending: false }),
    ]);

    if (ordersResult.error) alert("주문 불러오기 오류: " + ordersResult.error.message);
    if (broadcastsResult.error) alert("방송 불러오기 오류: " + broadcastsResult.error.message);
    if (customersResult.error) alert("회원 불러오기 오류: " + customersResult.error.message);

    setOrders(ordersResult.data || []);
    setBroadcasts(broadcastsResult.data || []);
    setCustomers(customersResult.data || []);
    setLoading(false);
  };

  const handleLogin = () => {
    if (password !== ADMIN_PASSWORD) {
      alert("관리자 비밀번호가 틀렸습니다.");
      return;
    }

    sessionStorage.setItem("ruru_admin_login", "Y");
    setIsAuthed(true);
    loadAll();
  };

  const handleLogout = () => {
    sessionStorage.removeItem("ruru_admin_login");
    setIsAuthed(false);
    setPassword("");
  };

  const startBroadcast = async () => {
    if (!publicTitle.trim()) {
      alert("고객용 방송제목을 입력해주세요.");
      return;
    }

    if (activeBroadcast) {
      alert("이미 방송중입니다. 기존 방송 종료 후 새 방송을 시작해주세요.");
      return;
    }

    const { error } = await supabase.from("broadcasts").insert({
      public_title: publicTitle.trim(),
      admin_subtitle: adminSubtitle.trim(),
      status: "ON",
      shipping_fee: Number(onlyNumber(shippingFee) || 4000),
      card_fee_rate: Number(onlyNumber(cardFeeRate) || 10),
      started_at: new Date().toISOString(),
    });

    if (error) {
      alert("방송 시작 오류: " + error.message);
      return;
    }

    await supabase.from("settings").upsert(
      [
        { key: "broadcast_status", value: "ON" },
        { key: "current_broadcast_name", value: publicTitle.trim() },
      ],
      { onConflict: "key" }
    );

    await loadAll();
    alert("방송 시작 완료");
  };

  const endBroadcast = async () => {
    if (!activeBroadcast?.id) {
      alert("현재 방송중인 방송이 없습니다.");
      return;
    }

    if (!confirm("방송을 종료하고 주문서 작성을 막을까요?")) return;

    const { error } = await supabase
      .from("broadcasts")
      .update({
        status: "OFF",
        ended_at: new Date().toISOString(),
      })
      .eq("id", activeBroadcast.id);

    if (error) {
      alert("방송 종료 오류: " + error.message);
      return;
    }

    await supabase.from("settings").upsert(
      [
        { key: "broadcast_status", value: "OFF" },
        { key: "current_broadcast_name", value: "" },
      ],
      { onConflict: "key" }
    );

    await loadAll();
    alert("방송 종료 완료");
  };

  const saveBroadcastSettings = async () => {
    if (!activeBroadcast?.id) {
      alert("현재 방송중인 방송이 없습니다.");
      return;
    }

    const { error } = await supabase
      .from("broadcasts")
      .update({
        public_title: publicTitle.trim(),
        admin_subtitle: adminSubtitle.trim(),
        shipping_fee: Number(onlyNumber(shippingFee) || 0),
        card_fee_rate: Number(onlyNumber(cardFeeRate) || 0),
      })
      .eq("id", activeBroadcast.id);

    if (error) {
      alert("방송 수정 오류: " + error.message);
      return;
    }

    await supabase.from("settings").upsert(
      [{ key: "current_broadcast_name", value: publicTitle.trim() }],
      { onConflict: "key" }
    );

    await loadAll();
    alert("방송 수정 완료");
  };

  const updateOrderStatus = async (orderId: number, status: string) => {
    const { error } = await supabase
      .from("orders")
      .update({
        order_manage_status: status,
      })
      .eq("id", orderId);

    if (error) {
      alert("주문상태 변경 오류: " + error.message);
      return;
    }

    await loadAll();
  };

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesKeyword =
        !keyword ||
        String(order.customer_name || "").toLowerCase().includes(keyword) ||
        String(order.youtube_nickname || "").toLowerCase().includes(keyword) ||
        String(order.customer_phone || "").includes(keyword) ||
        String(order.product_name || "").toLowerCase().includes(keyword) ||
        String(order.order_lookup_code || "").toLowerCase().includes(keyword);

      const matchesBroadcast =
        selectedBroadcastId === "ALL" ||
        String(order.broadcast_id || "") === selectedBroadcastId;

      return matchesKeyword && matchesBroadcast;
    });
  }, [orders, search, selectedBroadcastId]);

  const settlementOrders = useMemo(() => {
    return orders.filter((order) => {
      if (settlementBroadcastId === "ALL") return true;
      return String(order.broadcast_id || "") === settlementBroadcastId;
    });
  }, [orders, settlementBroadcastId]);

  const totalSales = settlementOrders.reduce(
    (sum, order) => sum + Number(order.adjusted_total_price || order.total_price || 0),
    0
  );

  const cardSales = settlementOrders
    .filter((order) => String(order.payment_method || "").includes("카드"))
    .reduce((sum, order) => sum + Number(order.adjusted_total_price || order.total_price || 0), 0);

  const addExpense = () => {
    setExpenses((prev) => [
      ...prev,
      {
        type: "생활비",
        amount: 0,
        memo: "",
      },
    ]);
  };

  const updateExpense = (index: number, key: string, value: any) => {
    setExpenses((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;

        return {
          ...item,
          [key]: value,
        };
      })
    );
  };

  const getCustomerStats = (customer: any) => {
    const phone = String(customer.customer_phone || "");
    const nickname = String(customer.youtube_nickname || "");
    const name = String(customer.customer_name || "");

    const customerOrders = orders.filter((order) => {
      const samePhone = phone && String(order.customer_phone || "") === phone;
      const sameNickname = nickname && String(order.youtube_nickname || "") === nickname;
      const sameName = name && String(order.customer_name || "") === name;

      return samePhone || (sameNickname && sameName);
    });

    const totalAmount = customerOrders.reduce(
      (sum, order) => sum + Number(order.adjusted_total_price || order.total_price || 0),
      0
    );

    return {
      count: customerOrders.length,
      totalAmount,
      lastOrderAt: customerOrders[0]?.created_at || customer.last_order_at || "",
    };
  };

  const visibleCustomers = useMemo(() => {
    const keyword = memberSearch.trim().toLowerCase();

    return customers.filter((customer) => {
      return (
        !keyword ||
        String(customer.customer_name || "").toLowerCase().includes(keyword) ||
        String(customer.youtube_nickname || "").toLowerCase().includes(keyword) ||
        String(customer.customer_phone || "").includes(keyword) ||
        String(customer.address || "").toLowerCase().includes(keyword)
      );
    });
  }, [customers, memberSearch]);

  if (!isAuthed) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center p-5 text-gray-900">
        <div className="w-full max-w-sm bg-white rounded-3xl p-6 border border-gray-200 shadow-sm">
          <h1 className="text-3xl font-extrabold mb-2 text-gray-900">관리자 로그인</h1>
          <p className="text-gray-700 mb-5">루루동이 관리자 페이지</p>

          <input
            type="password"
            placeholder="관리자 비밀번호"
            className="w-full p-4 rounded-2xl border border-gray-300 bg-white text-gray-900 mb-4 placeholder:text-gray-400"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLogin();
            }}
          />

          <button
            onClick={handleLogin}
            className="w-full bg-black text-white p-4 rounded-2xl font-bold"
          >
            로그인
          </button>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center p-5 text-gray-900">
        <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm text-center">
          <div className="text-2xl font-extrabold mb-2 text-gray-900">루루동이 관리자</div>
          <div className="text-gray-700">불러오는중...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-5 text-gray-900">
      <div className="max-w-7xl mx-auto pb-10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900">루루동이 관리자 ERP</h1>
            <p className="text-gray-700 mt-1">방송 / 주문 / 회원 / 정산 관리</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={loadAll}
              className="bg-black text-white px-5 py-3 rounded-2xl font-bold"
            >
              새로고침
            </button>

            <button
              onClick={handleLogout}
              className="bg-gray-300 text-black px-5 py-3 rounded-2xl font-bold"
            >
              로그아웃
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-5">
          <button
            onClick={() => setTab("orders")}
            className={`p-4 rounded-2xl font-bold border ${
              tab === "orders" ? "bg-black text-white" : "bg-white text-gray-900 border-gray-300"
            }`}
          >
            주문관리
          </button>

          <button
            onClick={() => setTab("members")}
            className={`p-4 rounded-2xl font-bold border ${
              tab === "members" ? "bg-black text-white" : "bg-white text-gray-900 border-gray-300"
            }`}
          >
            회원관리
          </button>

          <button
            onClick={() => setTab("stats")}
            className={`p-4 rounded-2xl font-bold border ${
              tab === "stats" ? "bg-black text-white" : "bg-white text-gray-900 border-gray-300"
            }`}
          >
            통계/정산
          </button>
        </div>

        <BroadcastPanel
          broadcastTitle={publicTitle}
          adminMemo={adminSubtitle}
          shippingFee={Number(onlyNumber(shippingFee) || 0)}
          cardFeeRate={Number(onlyNumber(cardFeeRate) || 0)}
          startedAt={activeBroadcast?.started_at}
          setBroadcastTitle={setPublicTitle}
          setAdminMemo={setAdminSubtitle}
          setShippingFee={(value) => setShippingFee(String(value))}
          setCardFeeRate={(value) => setCardFeeRate(String(value))}
          onStartBroadcast={startBroadcast}
          onEndBroadcast={endBroadcast}
          onSaveSettings={saveBroadcastSettings}
          isBroadcasting={!!activeBroadcast}
        />

        {tab === "orders" && (
          <>
            <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 my-5">
              <div className="grid md:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="닉네임 / 이름 / 전화번호 / 상품 검색"
                  className="w-full p-4 rounded-2xl border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />

                <select
                  className="w-full p-4 rounded-2xl border border-gray-300 bg-white text-gray-900"
                  value={selectedBroadcastId}
                  onChange={(e) => setSelectedBroadcastId(e.target.value)}
                >
                  <option value="ALL">전체 방송</option>
                  {broadcasts.map((broadcast) => (
                    <option key={broadcast.id} value={broadcast.id}>
                      {broadcast.public_title} {broadcast.admin_subtitle ? `/ ${broadcast.admin_subtitle}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <OrderTable
              orders={filteredOrders}
              viewMode={viewMode}
              setViewMode={setViewMode}
              updateOrderStatus={updateOrderStatus}
            />
          </>
        )}

        {tab === "members" && (
          <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 mt-5">
            <div className="text-2xl font-extrabold mb-5">회원관리</div>

            <input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="이름 / 닉네임 / 전화번호 / 주소 검색"
              className="w-full border rounded-2xl p-4 mb-5"
            />

            <div className="grid gap-4">
              {visibleCustomers.map((customer) => {
                const stats = getCustomerStats(customer);
                const isBlocked = customer.is_blocked === "Y";

                return (
                  <div
                    key={customer.id}
                    className={`border rounded-3xl p-5 ${
                      isBlocked ? "bg-red-50 border-red-300" : "bg-gray-50"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-2xl font-extrabold">
                            {customer.youtube_nickname || "-"}
                          </div>

                          <div className="text-lg text-gray-600">
                            {customer.customer_name || "-"}
                          </div>

                          {isBlocked && (
                            <span className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                              차단회원
                            </span>
                          )}
                        </div>

                        <div className="mt-2 text-gray-700">
                          전화번호: {customer.customer_phone || "-"}
                        </div>

                        <div className="mt-1 text-gray-700">
                          주소: {customer.address || "-"} {customer.detail_address || ""}
                        </div>

                        <div className="mt-1 text-gray-700">
                          누적 주문: {stats.count}건 / 누적 구매금액: {formatWon(stats.totalAmount)}
                        </div>

                        <div className="mt-1 text-gray-700">
                          최근 주문일: {stats.lastOrderAt ? new Date(stats.lastOrderAt).toLocaleString("ko-KR") : "-"}
                        </div>

                        {customer.customer_memo && (
                          <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-2xl p-3">
                            특이사항: {customer.customer_memo}
                          </div>
                        )}

                        {customer.block_memo && (
                          <div className="mt-3 bg-red-100 border border-red-200 rounded-2xl p-3 text-red-700">
                            차단메모: {customer.block_memo}
                          </div>
                        )}
                      </div>

                      <div className="flex md:flex-col gap-2">
                        <button className="bg-black text-white px-4 py-3 rounded-2xl font-bold">
                          특이사항
                        </button>

                        <button className="bg-red-600 text-white px-4 py-3 rounded-2xl font-bold">
                          차단관리
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === "stats" && (
          <>
            <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 mt-5 mb-5">
              <div className="text-xl font-extrabold mb-3">정산 조회 조건</div>

              <select
                className="w-full p-4 rounded-2xl border border-gray-300 bg-white text-gray-900"
                value={settlementBroadcastId}
                onChange={(e) => setSettlementBroadcastId(e.target.value)}
              >
                <option value="ALL">전체 방송</option>
                {broadcasts.map((broadcast) => (
                  <option key={broadcast.id} value={broadcast.id}>
                    {broadcast.public_title} {broadcast.admin_subtitle ? `/ ${broadcast.admin_subtitle}` : ""}
                  </option>
                ))}
              </select>
            </section>

            <SettlementPanel
              totalSales={totalSales}
              warehouseCost={warehouseCost}
              setWarehouseCost={setWarehouseCost}
              cardSales={cardSales}
              pgFee={pgFee}
              setPgFee={setPgFee}
              extraIncome={extraIncome}
              setExtraIncome={setExtraIncome}
              extraIncomeMemo={extraIncomeMemo}
              setExtraIncomeMemo={setExtraIncomeMemo}
              expenses={expenses}
              addExpense={addExpense}
              updateExpense={updateExpense}
            />
          </>
        )}
      </div>
    </main>
  );
}
