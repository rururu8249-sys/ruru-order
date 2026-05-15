// app/admin/page.tsx
// 전체 교체용
// 주문관리: 거파/블랙 삭제, 주문서취소+사유팝업, 환불팝업, 결제수단 표시/필터, 상태필터, 로젠송장 생성, 페이스터 정산

"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PaymentBadge } from "@/components/admin/OrderStatusBadges";
import AdminQuickFilters from "@/components/admin/AdminQuickFilters";

const ADMIN_PASSWORD = "8249";

const STATUS_OPTIONS = [
  "주문확인전",
  "주문확인완료",
  "출고대기",
  "출고완료",
  "주문서취소",
  "환불",
];

const STATUS_FILTER_OPTIONS = [
  "전체상태",
  "주문확인전",
  "주문확인완료",
  "출고대기",
  "출고완료",
  "주문서취소",
  "환불",
  "부분환불",
];

const PAYMENT_FILTER_OPTIONS = [
  "전체결제",
  "무통장입금",
  "카드결제",
  "기타결제",
];

const EXPENSE_OPTIONS = [
  "생활비",
  "주유비",
  "택배비",
  "알바비",
  "환불",
  "기타",
];

const onlyNumber = (value: string) =>
  String(value || "").replace(/[^0-9]/g, "");

const toNumber = (value: any) =>
  Number(onlyNumber(String(value || "")) || 0);

const moneyText = (value: any) =>
  toNumber(value).toLocaleString();

const won = (value: any) =>
  `${Number(value || 0).toLocaleString()}원`;

const getOrderTotal = (order: any) =>
  Number(order.adjusted_total_price || order.total_price || 0);

const getOrderShipping = (order: any) =>
  Number(
    order.final_shipping_fee ??
      order.adjusted_shipping_fee ??
      order.shipping_fee ??
      0
  );

const getAddress = (order: any) =>
  String(
    order.address ||
      order.customer_address ||
      order.shipping_address ||
      order.receiver_address ||
      ""
  ).trim();

const getDetailAddress = (order: any) =>
  String(
    order.detail_address ||
      order.address_detail ||
      order.customer_detail_address ||
      ""
  ).trim();

const getFullAddress = (order: any) =>
  `${getAddress(order)} ${getDetailAddress(order)}`.trim();

const getPaymentLabel = (order: any) => {
  const raw = String(
    order.payment_method ||
      order.pay_method ||
      order.payment_type ||
      order.payment ||
      ""
  ).toLowerCase();

  if (
    raw.includes("카드") ||
    raw.includes("card") ||
    raw.includes("페이스터") ||
    raw.includes("payster")
  ) {
    return "카드결제";
  }

  if (
    raw.includes("무통장") ||
    raw.includes("입금") ||
    raw.includes("bank") ||
    raw.includes("cash")
  ) {
    return "무통장입금";
  }

  return raw ? String(order.payment_method || order.pay_method || order.payment_type) : "무통장입금";
};

const isPaysterPayment = (order: any) => {
  const label = getPaymentLabel(order);
  const raw = String(
    order.payment_method ||
      order.pay_method ||
      order.payment_type ||
      order.payment ||
      ""
  ).toLowerCase();

  return (
    label === "카드결제" ||
    raw.includes("페이스터") ||
    raw.includes("payster")
  );
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "주문확인완료":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "출고대기":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "출고완료":
      return "bg-green-100 text-green-700 border-green-200";
    case "부분환불":
      return "bg-orange-100 text-orange-700 border-orange-200";
    case "환불":
      return "bg-gray-200 text-gray-800 border-gray-300";
    case "주문서취소":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

function MoneyInput({
  value,
  onChange,
  disabled = false,
}: {
  value: number | string;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <input
        value={moneyText(value)}
        disabled={disabled}
        onChange={(e) => onChange(toNumber(e.target.value))}
        className="w-full border rounded-2xl p-4 pr-12 font-bold disabled:bg-gray-100"
      />
      <div className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-gray-500">
        원
      </div>
    </div>
  );
}

function PercentInput({
  value,
  onChange,
}: {
  value: number | string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="relative">
      <input
        value={onlyNumber(String(value || ""))}
        onChange={(e) => onChange(toNumber(e.target.value))}
        className="w-full border rounded-2xl p-4 pr-12 font-bold"
      />
      <div className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-gray-500">
        %
      </div>
    </div>
  );
}

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
  const [statusFilter, setStatusFilter] = useState("전체상태");
  const [paymentFilter, setPaymentFilter] = useState("전체결제");

  const [publicTitle, setPublicTitle] = useState("");
  const [adminSubtitle, setAdminSubtitle] = useState("");
  const [shippingFee, setShippingFee] = useState(4000);
  const [cardFeeRate, setCardFeeRate] = useState(10);

  const [warehouseCost, setWarehouseCost] = useState(0);
  const [extraIncome, setExtraIncome] = useState(0);
  const [extraIncomeMemo, setExtraIncomeMemo] = useState("");
  const [expenses, setExpenses] = useState([
    { type: "생활비", amount: 0, memo: "" },
  ]);

  const [refundModalOrder, setRefundModalOrder] = useState<any | null>(null);
  const [refundType, setRefundType] = useState<"전액환불" | "부분환불">("전액환불");
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundMemo, setRefundMemo] = useState("");

  const [cancelModalOrder, setCancelModalOrder] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const [colWidths, setColWidths] = useState<Record<string, number>>({
    status: 180,
    member: 180,
    item: 300,
    qty: 100,
    total: 150,
    shipping: 150,
    payment: 150,
    memo: 320,
    phone: 180,
  });

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
    setShippingFee(Number(activeBroadcast.shipping_fee ?? 4000));
    setCardFeeRate(Number(activeBroadcast.card_fee_rate ?? 10));
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
      shipping_fee: shippingFee,
      card_fee_rate: cardFeeRate,
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
        shipping_fee: shippingFee,
        card_fee_rate: cardFeeRate,
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
      .update({ order_manage_status: status })
      .eq("id", orderId);

    if (error) {
      alert("주문상태 변경 오류: " + error.message);
      return;
    }

    await loadAll();
  };

  const openRefundModal = (order: any) => {
    setRefundModalOrder(order);
    setRefundType("전액환불");
    setRefundAmount(getOrderTotal(order));
    setRefundMemo(order.refund_memo || "");
  };

  const saveRefund = async () => {
    if (!refundModalOrder?.id) return;

    if (!refundMemo.trim()) {
      alert("환불 사유/메모를 입력해주세요.");
      return;
    }

    if (refundType === "부분환불" && refundAmount <= 0) {
      alert("부분환불 금액을 입력해주세요.");
      return;
    }

    const finalAmount =
      refundType === "전액환불" ? getOrderTotal(refundModalOrder) : refundAmount;

    const { error } = await supabase
      .from("orders")
      .update({
        order_manage_status: "환불",
        refund_type: refundType,
        refund_amount: finalAmount,
        refund_memo: refundMemo.trim(),
      })
      .eq("id", refundModalOrder.id);

    if (error) {
      alert("환불 저장 오류: " + error.message);
      return;
    }

    setRefundModalOrder(null);
    setRefundMemo("");
    setRefundAmount(0);
    await loadAll();
  };

  const openCancelModal = (order: any) => {
    setCancelModalOrder(order);
    setCancelReason(order.cancel_reason || "");
  };

  const saveCancelOrder = async () => {
    if (!cancelModalOrder?.id) return;

    if (!cancelReason.trim()) {
      alert("주문서 취소 사유를 입력해주세요.");
      return;
    }

    const { error } = await supabase
      .from("orders")
      .update({
        order_manage_status: "주문서취소",
        cancel_reason: cancelReason.trim(),
      })
      .eq("id", cancelModalOrder.id);

    if (error) {
      alert("주문서취소 저장 오류: " + error.message);
      return;
    }

    setCancelModalOrder(null);
    setCancelReason("");
    await loadAll();
  };

  const handleStatusChange = (order: any, nextStatus: string) => {
    if (nextStatus === "환불") {
      openRefundModal(order);
      return;
    }

    if (nextStatus === "주문서취소") {
      openCancelModal(order);
      return;
    }

    updateOrderStatus(order.id, nextStatus);
  };

  const startResize = (key: string, e: any) => {
    e.preventDefault();

    const startX = e.clientX;
    const startWidth = colWidths[key];

    const onMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.max(90, startWidth + moveEvent.clientX - startX);
      setColWidths((prev) => ({ ...prev, [key]: nextWidth }));
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const ResizableTh = ({
    colKey,
    children,
  }: {
    colKey: string;
    children: any;
  }) => {
    return (
      <th
        className="p-3 text-left relative select-none"
        style={{ width: colWidths[colKey], minWidth: colWidths[colKey] }}
      >
        {children}
        <div
          onMouseDown={(e) => startResize(colKey, e)}
          className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-blue-300"
        />
      </th>
    );
  };

  const getDisplayStatus = (order: any) => {
    if (order.order_manage_status === "주문서취소") return "주문서취소";
    if (order.order_manage_status === "환불" && order.refund_type === "부분환불") return "부분환불";
    if (order.order_manage_status === "환불") return "환불";
    return order.order_manage_status || "주문확인전";
  };

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return orders.filter((order) => {
      const status = getDisplayStatus(order);
      const paymentLabel = getPaymentLabel(order);

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

      const matchesStatus =
        statusFilter === "전체상태" || status === statusFilter;

      const matchesPayment =
        paymentFilter === "전체결제" ||
        paymentLabel === paymentFilter ||
        (paymentFilter === "기타결제" &&
          paymentLabel !== "무통장입금" &&
          paymentLabel !== "카드결제");

      return matchesKeyword && matchesBroadcast && matchesStatus && matchesPayment;
    });
  }, [orders, search, selectedBroadcastId, statusFilter, paymentFilter]);

  const settlementOrders = useMemo(() => {
    return orders.filter((order) => {
      if (settlementBroadcastId === "ALL") return true;
      return String(order.broadcast_id || "") === settlementBroadcastId;
    });
  }, [orders, settlementBroadcastId]);

  const getRefundAmount = (order: any) => {
    if (order.order_manage_status !== "환불") return 0;

    const savedRefund = Number(order.refund_amount || 0);

    if (savedRefund > 0) return savedRefund;

    return getOrderTotal(order);
  };

  const getNetOrderTotal = (order: any) => {
    if (order.order_manage_status === "주문서취소") return 0;

    const gross = getOrderTotal(order);
    const refund = getRefundAmount(order);

    return Math.max(0, gross - refund);
  };

  const grossSales = settlementOrders
    .filter((order) => order.order_manage_status !== "주문서취소")
    .reduce(
      (sum, order) => sum + getOrderTotal(order),
      0
    );

  const totalRefundAmount = settlementOrders.reduce(
    (sum, order) => sum + getRefundAmount(order),
    0
  );

  const totalSales = settlementOrders.reduce(
    (sum, order) => sum + getNetOrderTotal(order),
    0
  );

  const cardSales = settlementOrders
    .filter((order) => isPaysterPayment(order))
    .reduce(
      (sum, order) => sum + getNetOrderTotal(order),
      0
    );

  const cardFeeSettlement = Math.round(cardSales * 0.07);
  const totalExpense = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const finalProfit =
    totalSales - warehouseCost - cardFeeSettlement - totalExpense + extraIncome;

  const addExpense = () => {
    setExpenses((prev) => [...prev, { type: "생활비", amount: 0, memo: "" }]);
  };

  const updateExpense = (index: number, key: string, value: any) => {
    setExpenses((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        return { ...item, [key]: value };
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

  const downloadRozenExcel = () => {
    const targetOrders = filteredOrders.filter(
      (order) => getDisplayStatus(order) === "주문확인완료"
    );

    if (targetOrders.length === 0) {
      alert("주문확인완료 상태인 주문이 없습니다.");
      return;
    }

    const rows = targetOrders.map((order) => {
      const nickname = String(order.youtube_nickname || "").trim();
      const phone = String(order.customer_phone || "").replace(/[^0-9]/g, "");
      const address = `${getFullAddress(order)} /${nickname}`.trim();

      const itemText = `${order.product_name || "상품"}${
        order.color ? `(${order.color}` : ""
      }${order.size ? ` / ${order.size}` : ""}${
        order.color ? ")" : ""
      } x${order.qty || 1} / 총 ${order.qty || 1}개`;

      return [
        nickname,
        "",
        address,
        phone,
        phone,
        "1",
        "2750",
        "010",
        itemText,
        "",
        "친절배송부탁드립니다.",
      ];
    });

    const headerlessTsv = rows
      .map((row) =>
        row
          .map((cell) => String(cell ?? "").replace(/\t/g, " ").replace(/\n/g, " "))
          .join("\t")
      )
      .join("\n");

    const blob = new Blob(["\ufeff" + headerlessTsv], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    });

    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const filename = `${mm}${dd}로젠택배.xls`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  };

  if (!isAuthed) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center p-5 text-gray-900">
        <div className="w-full max-w-sm bg-white rounded-3xl p-6 border border-gray-200 shadow-sm">
          <h1 className="text-3xl font-extrabold mb-2 text-gray-900">
            관리자 로그인
          </h1>
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
          <div className="text-2xl font-extrabold mb-2 text-gray-900">
            루루동이 관리자
          </div>
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
            <h1 className="text-3xl font-extrabold text-gray-900">
              루루동이 관리자 ERP
            </h1>
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
              tab === "orders"
                ? "bg-black text-white"
                : "bg-white text-gray-900 border-gray-300"
            }`}
          >
            주문관리
          </button>

          <button
            onClick={() => setTab("members")}
            className={`p-4 rounded-2xl font-bold border ${
              tab === "members"
                ? "bg-black text-white"
                : "bg-white text-gray-900 border-gray-300"
            }`}
          >
            회원관리
          </button>

          <button
            onClick={() => setTab("stats")}
            className={`p-4 rounded-2xl font-bold border ${
              tab === "stats"
                ? "bg-black text-white"
                : "bg-white text-gray-900 border-gray-300"
            }`}
          >
            통계/정산
          </button>
        </div>

        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-2xl font-extrabold">현재 방송 상태</div>
              <div className="text-sm text-gray-500 mt-1">
                방송 정보 / 배송비 / 카드수수료 실시간 관리
              </div>
            </div>

            <button
              onClick={saveBroadcastSettings}
              className="bg-black text-white px-5 py-3 rounded-2xl font-bold"
            >
              현재 방송 수정 저장
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div>
              <div className="text-sm font-bold mb-2 text-gray-700">
                고객용 방송제목
              </div>
              <input
                value={publicTitle}
                onChange={(e) => setPublicTitle(e.target.value)}
                placeholder="예) 0515 신발 방송"
                className="w-full border rounded-2xl px-4 py-3"
              />
            </div>

            <div>
              <div className="text-sm font-bold mb-2 text-gray-700">
                관리자용 부제목
              </div>
              <input
                value={adminSubtitle}
                onChange={(e) => setAdminSubtitle(e.target.value)}
                placeholder="예) 아지트1 / 1차"
                className="w-full border rounded-2xl px-4 py-3"
              />
            </div>

            <div>
              <div className="text-sm font-bold mb-2 text-gray-700">배송비</div>
              <MoneyInput value={shippingFee} onChange={setShippingFee} />
            </div>

            <div>
              <div className="text-sm font-bold mb-2 text-gray-700">
                카드수수료
              </div>
              <PercentInput value={cardFeeRate} onChange={setCardFeeRate} />
            </div>
          </div>

          <div className="mt-5 bg-gray-50 rounded-3xl border border-gray-200 p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <div className="text-sm text-gray-500 mb-1">방송 상태</div>
                <div
                  className={`text-2xl font-extrabold ${
                    activeBroadcast ? "text-green-600" : "text-red-500"
                  }`}
                >
                  {activeBroadcast ? "방송중" : "방송종료"}
                </div>
              </div>

              <div>
                <div className="text-sm text-gray-500 mb-1">방송 시작시간</div>
                <div className="text-xl font-bold text-black">
                  {activeBroadcast?.started_at
                    ? new Date(activeBroadcast.started_at).toLocaleString("ko-KR")
                    : "-"}
                </div>
              </div>

              <div>
                <div className="text-sm text-gray-500 mb-1">현재 적용 정보</div>
                <div className="text-base font-bold text-gray-800 leading-7">
                  배송비 {shippingFee.toLocaleString()}원
                  <br />
                  카드수수료 {cardFeeRate}%
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={startBroadcast}
                className="bg-green-600 text-white px-6 py-4 rounded-2xl font-extrabold"
              >
                방송시작
              </button>

              <button
                onClick={endBroadcast}
                className="bg-red-500 text-white px-6 py-4 rounded-2xl font-extrabold"
              >
                방송종료
              </button>
            </div>
          </div>
        </section>

        {tab === "orders" && (
          <>
            <AdminQuickFilters
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              paymentFilter={paymentFilter}
              setPaymentFilter={setPaymentFilter}
            />

            <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 my-5">
              <div className="grid md:grid-cols-5 gap-3">
                <input
                  type="text"
                  placeholder="닉네임 / 이름 / 전화번호 / 상품 검색"
                  className="w-full p-4 rounded-2xl border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 md:col-span-2"
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
                      {broadcast.public_title}{" "}
                      {broadcast.admin_subtitle ? `/ ${broadcast.admin_subtitle}` : ""}
                    </option>
                  ))}
                </select>

                <select
                  className="w-full p-4 rounded-2xl border border-gray-300 bg-white text-gray-900"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {STATUS_FILTER_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>

                <select
                  className="w-full p-4 rounded-2xl border border-gray-300 bg-white text-gray-900"
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                >
                  {PAYMENT_FILTER_OPTIONS.filter((item) => item !== "기타결제").map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
                <div>
                  <div className="text-2xl font-extrabold">주문 관리</div>
                  <div className="text-sm text-gray-500 mt-1">
                    주문상태 / 결제수단 / 환불 / 취소 / 로젠송장
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={downloadRozenExcel}
                    className="px-5 py-3 rounded-2xl font-bold bg-blue-600 text-white"
                  >
                    로젠 송장 생성
                  </button>

                  <button
                    onClick={() => setViewMode("card")}
                    className={`px-5 py-3 rounded-2xl font-bold ${
                      viewMode === "card"
                        ? "bg-black text-white"
                        : "bg-gray-100 text-black"
                    }`}
                  >
                    카드형
                  </button>

                  <button
                    onClick={() => setViewMode("table")}
                    className={`px-5 py-3 rounded-2xl font-bold ${
                      viewMode === "table"
                        ? "bg-black text-white"
                        : "bg-gray-100 text-black"
                    }`}
                  >
                    테이블형
                  </button>
                </div>
              </div>

              {viewMode === "table" ? (
                <div className="overflow-auto max-h-[720px] border rounded-2xl">
                  <table className="w-full border-collapse bg-white">
                    <thead>
                      <tr className="bg-gray-100 text-sm sticky top-0 z-20 shadow-sm">
                        <ResizableTh colKey="status">상태</ResizableTh>
                        <ResizableTh colKey="member">닉네임 / 이름</ResizableTh>
                        <ResizableTh colKey="item">주문내역</ResizableTh>
                        <ResizableTh colKey="qty">수량</ResizableTh>
                        <ResizableTh colKey="total">금액</ResizableTh>
                        <ResizableTh colKey="shipping">배송비</ResizableTh>
                        <ResizableTh colKey="payment">결제수단</ResizableTh>
                        <ResizableTh colKey="memo">환불/취소내역</ResizableTh>
                        <ResizableTh colKey="phone">전화번호</ResizableTh>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredOrders.map((order) => {
                        const status = getDisplayStatus(order);
                        const isCanceled = status === "주문서취소";
                        const isRefunded = status === "환불" || status === "부분환불";
                        const shouldStrike = isCanceled || isRefunded;
                        const paymentLabel = getPaymentLabel(order);

                        return (
                          <tr key={order.id} className="border-b hover:bg-gray-50">
                            <td className="p-3">
                              <select
                                value={status === "부분환불" ? "환불" : status}
                                onChange={(e) => handleStatusChange(order, e.target.value)}
                                className={`w-full px-3 py-2 rounded-xl font-extrabold border ${
                                  status === "환불"
                                    ? "bg-red-100 text-red-700 border-red-300"
                                    : status === "부분환불"
                                    ? "bg-orange-100 text-orange-700 border-orange-300"
                                    : status === "주문서취소"
                                    ? "bg-red-100 text-red-700 border-red-300"
                                    : status === "출고대기"
                                    ? "bg-yellow-100 text-yellow-700 border-yellow-300"
                                    : status === "주문확인완료"
                                    ? "bg-blue-100 text-blue-700 border-blue-300"
                                    : status === "출고완료"
                                    ? "bg-green-100 text-green-700 border-green-300"
                                    : "bg-gray-100 text-gray-700 border-gray-300"
                                }`}
                              >
                                {STATUS_OPTIONS.map((item) => (
                                  <option key={item} value={item}>
                                    {item}
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td className="p-3">
                              <div className={`font-extrabold ${shouldStrike ? "line-through text-gray-400" : ""}`}>
                                {order.youtube_nickname || "-"}
                              </div>
                              <div className={`text-sm text-gray-500 ${shouldStrike ? "line-through" : ""}`}>
                                {order.customer_name || "-"}
                              </div>
                            </td>

                            <td className="p-3">
                              <div className={`font-bold ${shouldStrike ? "line-through text-gray-400" : ""}`}>
                                {order.product_name || "상품명 없음"}
                              </div>
                              <div className={`text-sm text-gray-500 ${shouldStrike ? "line-through" : ""}`}>
                                {order.color || "없음"} / {order.size || "없음"}
                              </div>
                            </td>

                            <td className={`p-3 font-bold ${shouldStrike ? "line-through text-gray-400" : ""}`}>
                              {order.qty || 0}개
                            </td>
                            <td className={`p-3 font-extrabold ${shouldStrike ? "line-through text-gray-400" : ""}`}>
                              {won(getOrderTotal(order))}
                            </td>
                            <td className={`p-3 ${shouldStrike ? "line-through text-gray-400" : ""}`}>
                              {won(getOrderShipping(order))}
                            </td>

                            <td className="p-3">
                              <PaymentBadge payment={paymentLabel} />
                            </td>

                            <td className="p-3">
                              {isCanceled ? (
                                <div className="rounded-2xl p-3 border-2 bg-red-50 border-red-300">
                                  <div className="font-extrabold text-red-700">
                                    주문이 취소되었습니다.
                                  </div>
                                  <div className="text-sm text-red-700 mt-1">
                                    사유: {order.cancel_reason || "-"}
                                  </div>
                                </div>
                              ) : order.order_manage_status === "환불" ? (
                                <div className="rounded-2xl p-3 border-2 bg-red-50 border-red-300">
                                  <div className="font-extrabold text-red-700">
                                    {order.refund_type || "환불"} / {won(getRefundAmount(order))}
                                  </div>
                                  <div className="text-sm text-red-700 mt-1">
                                    {order.refund_memo || "-"}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-gray-400 text-sm">-</div>
                              )}
                            </td>

                            <td className="p-3">{order.customer_phone || "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid gap-4">
                  {filteredOrders.map((order) => {
                    const status = getDisplayStatus(order);
                    const isCanceled = status === "주문서취소";
                    const isRefunded = status === "환불" || status === "부분환불";
                    const shouldStrike = isCanceled || isRefunded;
                    const paymentLabel = getPaymentLabel(order);

                    return (
                      <div key={order.id} className="border rounded-3xl p-5">
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className={`text-2xl font-extrabold ${shouldStrike ? "line-through text-gray-400" : ""}`}>
                                {order.youtube_nickname || "-"}
                              </div>
                              <div className={`text-gray-500 ${shouldStrike ? "line-through" : ""}`}>
                                {order.customer_name || "-"}
                              </div>

                              <PaymentBadge payment={paymentLabel} />
                            </div>
                            <div className="text-sm text-gray-500 mt-1">
                              {order.customer_phone || "-"}
                            </div>
                          </div>

                          <select
                            value={status === "부분환불" ? "환불" : status}
                            onChange={(e) => handleStatusChange(order, e.target.value)}
                            className={`px-3 py-2 rounded-xl font-extrabold border ${
                              status === "환불"
                                ? "bg-red-100 text-red-700 border-red-300"
                                : status === "부분환불"
                                ? "bg-orange-100 text-orange-700 border-orange-300"
                                : status === "주문서취소"
                                ? "bg-red-100 text-red-700 border-red-300"
                                : status === "출고대기"
                                ? "bg-yellow-100 text-yellow-700 border-yellow-300"
                                : status === "주문확인완료"
                                ? "bg-blue-100 text-blue-700 border-blue-300"
                                : status === "출고완료"
                                ? "bg-green-100 text-green-700 border-green-300"
                                : "bg-gray-100 text-gray-700 border-gray-300"
                            }`}
                          >
                            {STATUS_OPTIONS.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="bg-gray-50 rounded-2xl border p-4">
                          <div className={`font-bold text-lg ${shouldStrike ? "line-through text-gray-400" : ""}`}>
                            {order.product_name || "상품명 없음"}
                          </div>
                          <div className={`mt-2 text-gray-600 ${shouldStrike ? "line-through" : ""}`}>
                            {order.color || "없음"} / {order.size || "없음"} / {order.qty || 0}개
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-4">
                          <div className="bg-gray-50 rounded-2xl border p-4">
                            <div className="text-sm text-gray-500">결제금액</div>
                            <div className={`text-xl font-extrabold ${shouldStrike ? "line-through text-gray-400" : ""}`}>
                              {won(getOrderTotal(order))}
                            </div>
                          </div>

                          <div className="bg-gray-50 rounded-2xl border p-4">
                            <div className="text-sm text-gray-500">배송비</div>
                            <div className={`text-xl font-extrabold ${shouldStrike ? "line-through text-gray-400" : ""}`}>
                              {won(getOrderShipping(order))}
                            </div>
                          </div>
                        </div>

                        {isCanceled && (
                          <div className="mt-4 bg-red-50 border-2 border-red-300 rounded-2xl p-4">
                            <div className="font-extrabold text-red-700">
                              주문이 취소되었습니다.
                            </div>
                            <div className="text-sm text-red-700 mt-1">
                              사유: {order.cancel_reason || "-"}
                            </div>
                          </div>
                        )}

                        {!isCanceled && order.order_manage_status === "환불" && (
                          <div className="mt-4 bg-red-50 border-2 border-red-300 rounded-2xl p-4">
                            <div className="font-extrabold text-red-700">
                              {order.refund_type || "환불"} / {won(getRefundAmount(order))}
                            </div>
                            <div className="text-sm text-red-700 mt-1">
                              환불 사유: {order.refund_memo || "-"}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
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
                          누적 주문: {stats.count}건 / 누적 구매금액: {won(stats.totalAmount)}
                        </div>
                        <div className="mt-1 text-gray-700">
                          최근 주문일:{" "}
                          {stats.lastOrderAt
                            ? new Date(stats.lastOrderAt).toLocaleString("ko-KR")
                            : "-"}
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
                    {broadcast.public_title}{" "}
                    {broadcast.admin_subtitle ? `/ ${broadcast.admin_subtitle}` : ""}
                  </option>
                ))}
              </select>
            </section>

            <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="text-2xl font-extrabold">방송 정산</div>
                  <div className="text-sm text-gray-500 mt-1">
                    방송별 정산 / 비용 / 순수익 관리
                  </div>
                </div>

                <button className="bg-black text-white px-5 py-3 rounded-2xl font-bold">
                  프린트하기
                </button>
              </div>

              <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
                <div className="bg-gray-50 rounded-2xl border p-5">
                  <div className="text-sm text-gray-500">방송 매출</div>
                  <div className="text-3xl font-extrabold mt-2">{won(totalSales)}</div>
                  <div className="text-xs text-gray-500 mt-2">
                    원매출 {won(grossSales)} - 환불 {won(totalRefundAmount)}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-2xl border p-5">
                  <div className="text-sm text-gray-500">카드매출</div>
                  <div className="text-3xl font-extrabold mt-2">{won(cardSales)}</div>
                </div>

                <div className="bg-red-50 rounded-2xl border border-red-200 p-5">
                  <div className="text-sm text-red-600">환불 차감</div>
                  <div className="text-3xl font-extrabold mt-2 text-red-700">{won(totalRefundAmount)}</div>
                </div>

                <div className="bg-black text-white rounded-2xl border p-5">
                  <div className="text-sm opacity-70">최종 순수익</div>
                  <div className="text-4xl font-extrabold mt-2">{won(finalProfit)}</div>
                </div>
              </div>

              <div className="grid xl:grid-cols-2 gap-5">
                <div className="border rounded-3xl p-5">
                  <div className="text-xl font-extrabold mb-5">방송 정산 입력</div>

                  <div className="space-y-4">
                    <div>
                      <div className="text-sm font-bold mb-2">창고 정산금액</div>
                      <MoneyInput value={warehouseCost} onChange={setWarehouseCost} />
                    </div>

                    <div>
                      <div className="text-sm font-bold mb-2">카드 수수료정산(7%)</div>
                      <MoneyInput value={cardFeeSettlement} onChange={() => {}} disabled />
                      <div className="text-xs text-gray-500 mt-2">
                        카드매출 기준 자동 계산됩니다.
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-bold mb-2">기타 매출</div>
                      <MoneyInput value={extraIncome} onChange={setExtraIncome} />
                    </div>

                    <div>
                      <div className="text-sm font-bold mb-2">기타 매출 메모</div>
                      <input
                        value={extraIncomeMemo}
                        onChange={(e) => setExtraIncomeMemo(e.target.value)}
                        className="w-full border rounded-2xl p-4"
                        placeholder="예) 방송외 판매"
                      />
                    </div>
                  </div>
                </div>

                <div className="border rounded-3xl p-5">
                  <div className="flex items-center justify-between mb-5">
                    <div className="text-xl font-extrabold">기타 지출</div>
                    <button
                      onClick={addExpense}
                      className="bg-black text-white px-4 py-2 rounded-2xl font-bold"
                    >
                      추가하기
                    </button>
                  </div>

                  <div className="space-y-4">
                    {expenses.map((expense, index) => (
                      <div key={index} className="border rounded-2xl p-4 bg-gray-50">
                        <div className="grid md:grid-cols-3 gap-3">
                          <select
                            value={expense.type}
                            onChange={(e) => updateExpense(index, "type", e.target.value)}
                            className="border rounded-2xl p-4"
                          >
                            {EXPENSE_OPTIONS.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>

                          <MoneyInput
                            value={expense.amount}
                            onChange={(value) => updateExpense(index, "amount", value)}
                          />

                          <input
                            value={expense.memo}
                            onChange={(e) => updateExpense(index, "memo", e.target.value)}
                            className="border rounded-2xl p-4"
                            placeholder="메모"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {cancelModalOrder && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-5">
            <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-xl border border-gray-200">
              <div className="text-2xl font-extrabold mb-1">주문서 취소</div>
              <div className="text-sm text-gray-500 mb-5">
                {cancelModalOrder.youtube_nickname || "-"} / {cancelModalOrder.customer_name || "-"}
              </div>

              <div className="mb-5">
                <div className="text-sm font-bold mb-2">주문서 취소 사유</div>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="예) 고객 미입금 / 중복 주문 / 고객 요청 취소 / 품절 취소"
                  className="w-full border rounded-2xl p-4 min-h-[130px]"
                />
                <div className="text-xs text-gray-500 mt-2">
                  이 내용은 고객 주문조회 화면에도 표시됩니다.
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={saveCancelOrder}
                  className="flex-1 bg-red-600 text-white p-4 rounded-2xl font-extrabold"
                >
                  주문서취소 저장
                </button>

                <button
                  onClick={() => {
                    setCancelModalOrder(null);
                    setCancelReason("");
                  }}
                  className="flex-1 bg-gray-200 text-black p-4 rounded-2xl font-extrabold"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )}

        {refundModalOrder && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-5">
            <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-xl border border-gray-200">
              <div className="text-2xl font-extrabold mb-1">환불 처리</div>
              <div className="text-sm text-gray-500 mb-5">
                {refundModalOrder.youtube_nickname || "-"} / {refundModalOrder.customer_name || "-"}
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  onClick={() => {
                    setRefundType("전액환불");
                    setRefundAmount(getOrderTotal(refundModalOrder));
                  }}
                  className={`p-4 rounded-2xl font-bold border ${
                    refundType === "전액환불" ? "bg-black text-white" : "bg-gray-50"
                  }`}
                >
                  전액환불
                </button>

                <button
                  onClick={() => {
                    setRefundType("부분환불");
                    setRefundAmount(0);
                  }}
                  className={`p-4 rounded-2xl font-bold border ${
                    refundType === "부분환불" ? "bg-black text-white" : "bg-gray-50"
                  }`}
                >
                  부분환불
                </button>
              </div>

              <div className="mb-4">
                <div className="text-sm font-bold mb-2">환불금액</div>
                <MoneyInput
                  value={refundAmount}
                  onChange={setRefundAmount}
                  disabled={refundType === "전액환불"}
                />
                {refundType === "전액환불" && (
                  <div className="text-xs text-gray-500 mt-2">
                    전액환불은 주문 총액이 자동 입력됩니다.
                  </div>
                )}
              </div>

              <div className="mb-5">
                <div className="text-sm font-bold mb-2">환불사유 / 메모</div>
                <textarea
                  value={refundMemo}
                  onChange={(e) => setRefundMemo(e.target.value)}
                  placeholder="예) 품절 전액환불 / 상품 1개 부분환불 / 고객 요청"
                  className="w-full border rounded-2xl p-4 min-h-[110px]"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={saveRefund}
                  className="flex-1 bg-black text-white p-4 rounded-2xl font-extrabold"
                >
                  저장
                </button>

                <button
                  onClick={() => {
                    setRefundModalOrder(null);
                    setRefundMemo("");
                    setRefundAmount(0);
                  }}
                  className="flex-1 bg-gray-200 text-black p-4 rounded-2xl font-extrabold"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
