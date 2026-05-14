// app/admin/page.tsx
// 전체 교체용
// 기존 page.tsx 전체 삭제 후 아래 내용으로 통째로 교체

"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

import BroadcastPanel from "@/components/admin/BroadcastPanel";
import OrderTable from "@/components/admin/OrderTable";
import SettlementPanel from "@/components/admin/SettlementPanel";

const ADMIN_PASSWORD = "8249";

export default function AdminPage() {

  const [isAuthed, setIsAuthed] = useState(false);
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<
    "orders" | "members" | "stats"
  >("orders");

  const [orders, setOrders] = useState<any[]>([]);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  const [viewMode, setViewMode] = useState<
    "card" | "table"
  >("table");

  const [search, setSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");

  const [selectedBroadcastId, setSelectedBroadcastId] =
    useState("ALL");

  const [publicTitle, setPublicTitle] = useState("");
  const [adminSubtitle, setAdminSubtitle] = useState("");

  const [shippingFee, setShippingFee] =
    useState("4000");

  const [cardFeeRate, setCardFeeRate] =
    useState("10");

  const [warehouseCost, setWarehouseCost] =
    useState(0);

  const [pgFee, setPgFee] =
    useState(0);

  const [extraIncome, setExtraIncome] =
    useState(0);

  const [extraIncomeMemo, setExtraIncomeMemo] =
    useState("");

  const [expenses, setExpenses] = useState([
    {
      type: "생활비",
      amount: 0,
      memo: "",
    },
  ]);

  useEffect(() => {

    const saved =
      sessionStorage.getItem("ruru_admin_login");

    if (saved === "Y") {

      setIsAuthed(true);
      loadAll();

    } else {

      setLoading(false);

    }

  }, []);

  const activeBroadcast = useMemo(() => {

    return (
      broadcasts.find(
        (b) => b.status === "ON"
      ) || null
    );

  }, [broadcasts]);

  const formatWon = (value: any) =>
    `${Number(value || 0).toLocaleString()}원`;

  const loadAll = async () => {

    setLoading(true);

    const [
      ordersResult,
      broadcastsResult,
      customersResult,
    ] = await Promise.all([

      supabase
        .from("orders")
        .select("*")
        .order("created_at", {
          ascending: false,
        }),

      supabase
        .from("broadcasts")
        .select("*")
        .order("created_at", {
          ascending: false,
        }),

      supabase
        .from("customers")
        .select("*")
        .order("last_order_at", {
          ascending: false,
        }),

    ]);

    setOrders(ordersResult.data || []);
    setBroadcasts(broadcastsResult.data || []);
    setCustomers(customersResult.data || []);

    setLoading(false);

  };

  const handleLogin = () => {

    if (password !== ADMIN_PASSWORD) {

      alert("관리자 비밀번호 오류");
      return;

    }

    sessionStorage.setItem(
      "ruru_admin_login",
      "Y"
    );

    setIsAuthed(true);

    loadAll();

  };

  const handleLogout = () => {

    sessionStorage.removeItem(
      "ruru_admin_login"
    );

    setIsAuthed(false);

  };

  const startBroadcast = async () => {

    const { error } =
      await supabase
        .from("broadcasts")
        .insert({

          public_title: publicTitle,
          admin_subtitle: adminSubtitle,

          shipping_fee:
            Number(shippingFee || 0),

          card_fee_rate:
            Number(cardFeeRate || 0),

          status: "ON",

          started_at:
            new Date().toISOString(),

        });

    if (error) {

      alert(error.message);
      return;

    }

    await loadAll();

    alert("방송 시작 완료");

  };

  const endBroadcast = async () => {

    if (!activeBroadcast?.id) {

      alert("현재 방송 없음");
      return;

    }

    await supabase
      .from("broadcasts")
      .update({

        status: "OFF",

        ended_at:
          new Date().toISOString(),

      })
      .eq("id", activeBroadcast.id);

    await loadAll();

    alert("방송 종료 완료");

  };

  const saveBroadcastSettings =
    async () => {

      if (!activeBroadcast?.id) {

        alert("현재 방송 없음");
        return;

      }

      const { error } =
        await supabase
          .from("broadcasts")
          .update({

            public_title:
              publicTitle,

            admin_subtitle:
              adminSubtitle,

            shipping_fee:
              Number(shippingFee || 0),

            card_fee_rate:
              Number(cardFeeRate || 0),

          })
          .eq(
            "id",
            activeBroadcast.id
          );

      if (error) {

        alert(error.message);
        return;

      }

      await loadAll();

      alert("방송 수정 완료");

    };

  const updateOrderStatus =
    async (
      orderId: number,
      status: string
    ) => {

      const { error } =
        await supabase
          .from("orders")
          .update({

            order_manage_status:
              status,

          })
          .eq("id", orderId);

      if (error) {

        alert(error.message);
        return;

      }

      await loadAll();

    };

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

  const updateExpense = (
    index: number,
    key: string,
    value: any
  ) => {

    setExpenses((prev) =>
      prev.map((item, idx) => {

        if (idx !== index)
          return item;

        return {
          ...item,
          [key]: value,
        };

      })
    );

  };

  const filteredOrders =
    useMemo(() => {

      const keyword =
        search.toLowerCase();

      return orders.filter(
        (order) => {

          const matchKeyword =

            !keyword ||

            String(
              order.youtube_nickname || ""
            )
              .toLowerCase()
              .includes(keyword) ||

            String(
              order.customer_name || ""
            )
              .toLowerCase()
              .includes(keyword) ||

            String(
              order.product_name || ""
            )
              .toLowerCase()
              .includes(keyword);

          const matchBroadcast =

            selectedBroadcastId ===
              "ALL" ||

            String(
              order.broadcast_id || ""
            ) === selectedBroadcastId;

          return (
            matchKeyword &&
            matchBroadcast
          );

        }
      );

    }, [
      orders,
      search,
      selectedBroadcastId,
    ]);

  const totalSales =
    orders.reduce(

      (sum, order) =>

        sum +
        Number(
          order.adjusted_total_price ||
          order.total_price ||
          0
        ),

      0
    );

  const cardSales =
    orders
      .filter(
        (order) =>
          order.payment_method ===
          "CARD"
      )
      .reduce(

        (sum, order) =>

          sum +
          Number(
            order.adjusted_total_price ||
            order.total_price ||
            0
          ),

        0
      );

  if (!isAuthed) {

    return (

      <main className="min-h-screen bg-gray-100 flex items-center justify-center p-5">

        <div className="bg-white rounded-3xl p-6 w-full max-w-sm border">

          <div className="text-3xl font-extrabold mb-5">
            관리자 로그인
          </div>

          <input
            type="password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            className="w-full border rounded-2xl p-4 mb-4"
            placeholder="비밀번호"
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

  return (

    <main className="min-h-screen bg-gray-100 p-5 text-gray-900">

      <div className="max-w-7xl mx-auto">

        <div className="flex items-center justify-between mb-5">

          <div>

            <div className="text-3xl font-extrabold">
              루루동이 관리자 ERP
            </div>

            <div className="text-gray-500 mt-1">
              방송 / 주문 / 회원 / 정산 관리
            </div>

          </div>

          <button
            onClick={handleLogout}
            className="bg-black text-white px-5 py-3 rounded-2xl font-bold"
          >
            로그아웃
          </button>

        </div>

        <div className="grid grid-cols-3 gap-2 mb-5">

          <button
            onClick={() =>
              setTab("orders")
            }
            className={`p-4 rounded-2xl font-bold ${
              tab === "orders"
                ? "bg-black text-white"
                : "bg-white"
            }`}
          >
            주문관리
          </button>

          <button
            onClick={() =>
              setTab("members")
            }
            className={`p-4 rounded-2xl font-bold ${
              tab === "members"
                ? "bg-black text-white"
                : "bg-white"
            }`}
          >
            회원관리
          </button>

          <button
            onClick={() =>
              setTab("stats")
            }
            className={`p-4 rounded-2xl font-bold ${
              tab === "stats"
                ? "bg-black text-white"
                : "bg-white"
            }`}
          >
            통계/정산
          </button>

        </div>

        <BroadcastPanel
          broadcastTitle={publicTitle}
          adminMemo={adminSubtitle}
          shippingFee={Number(
            shippingFee || 0
          )}
          cardFeeRate={Number(
            cardFeeRate || 0
          )}
          startedAt={
            activeBroadcast?.started_at
          }
          setBroadcastTitle={
            setPublicTitle
          }
          setAdminMemo={
            setAdminSubtitle
          }
          setShippingFee={(value) =>
            setShippingFee(
              String(value)
            )
          }
          setCardFeeRate={(value) =>
            setCardFeeRate(
              String(value)
            )
          }
          onStartBroadcast={
            startBroadcast
          }
          onEndBroadcast={
            endBroadcast
          }
          onSaveSettings={
            saveBroadcastSettings
          }
          isBroadcasting={
            !!activeBroadcast
          }
        />

        {tab === "orders" && (

          <div className="mt-5">

            <section className="bg-white rounded-3xl border p-5 mb-5">

              <div className="grid md:grid-cols-2 gap-3">

                <input
                  value={search}
                  onChange={(e) =>
                    setSearch(
                      e.target.value
                    )
                  }
                  placeholder="닉네임 / 이름 / 상품 검색"
                  className="border rounded-2xl p-4"
                />

                <select
                  value={
                    selectedBroadcastId
                  }
                  onChange={(e) =>
                    setSelectedBroadcastId(
                      e.target.value
                    )
                  }
                  className="border rounded-2xl p-4"
                >

                  <option value="ALL">
                    전체 방송
                  </option>

                  {broadcasts.map(
                    (broadcast) => (

                      <option
                        key={broadcast.id}
                        value={broadcast.id}
                      >
                        {
                          broadcast.public_title
                        }
                      </option>

                    )
                  )}

                </select>

              </div>

            </section>

            <OrderTable
              orders={filteredOrders}
              viewMode={viewMode}
              setViewMode={
                setViewMode
              }
              updateOrderStatus={
                updateOrderStatus
              }
            />

          </div>

        )}

        {tab === "members" && (

          <section className="bg-white rounded-3xl border p-5 mt-5">

            <div className="text-2xl font-extrabold mb-5">
              회원관리
            </div>

            <input
              value={memberSearch}
              onChange={(e) =>
                setMemberSearch(
                  e.target.value
                )
              }
              placeholder="회원 검색"
              className="w-full border rounded-2xl p-4 mb-5"
            />

            <div className="grid gap-3">

              {customers
                .filter(
                  (customer) => {

                    const keyword =
                      memberSearch.toLowerCase();

                    return (

                      !keyword ||

                      String(
                        customer.customer_name ||
                        ""
                      )
                        .toLowerCase()
                        .includes(
                          keyword
                        ) ||

                      String(
                        customer.youtube_nickname ||
                        ""
                      )
                        .toLowerCase()
                        .includes(
                          keyword
                        )

                    );

                  }
                )
                .map((customer) => (

                  <div
                    key={customer.id}
                    className="border rounded-2xl p-4 bg-gray-50"
                  >

                    <div className="font-extrabold text-xl">
                      {
                        customer.youtube_nickname
                      }
                    </div>

                    <div className="mt-1 text-gray-600">
                      {
                        customer.customer_name
                      }
                    </div>

                    <div className="mt-1 text-gray-600">
                      {
                        customer.customer_phone
                      }
                    </div>

                  </div>

                ))}

            </div>

          </section>

        )}

        {tab === "stats" && (

          <div className="mt-5">

            <SettlementPanel
              totalSales={totalSales}
              warehouseCost={
                warehouseCost
              }
              setWarehouseCost={
                setWarehouseCost
              }

              cardSales={
                cardSales
              }

              pgFee={pgFee}
              setPgFee={setPgFee}

              extraIncome={
                extraIncome
              }

              setExtraIncome={
                setExtraIncome
              }

              extraIncomeMemo={
                extraIncomeMemo
              }

              setExtraIncomeMemo={
                setExtraIncomeMemo
              }

              expenses={expenses}

              addExpense={
                addExpense
              }

              updateExpense={
                updateExpense
              }
            />

          </div>

        )}

      </div>

    </main>

  );

}
