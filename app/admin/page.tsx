// app/admin/page.tsx
// 전체 교체용
// 주문관리: 거파/블랙 삭제, 주문서취소+사유팝업, 환불팝업, 결제수단 표시/필터, 상태필터, 로젠송장 생성, 페이스터 정산

"use client";

import { useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
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

  const [tab, setTab] = useState<"orders" | "members" | "stats" | "trash">("orders");

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
  const [showDetailStats, setShowDetailStats] = useState(false);

  const [publicTitle, setPublicTitle] = useState("");
  const [adminSubtitle, setAdminSubtitle] = useState("");
  const [shippingFee, setShippingFee] = useState(4000);
  const [cardFeeRate, setCardFeeRate] = useState(10);
  const [combineShippingEnabled, setCombineShippingEnabled] = useState(true);
  const [combineShippingGroup, setCombineShippingGroup] = useState("");
  const [combineShippingMemo, setCombineShippingMemo] = useState("");

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

  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [detailShippingFee, setDetailShippingFee] = useState(0);
  const [detailTotalPrice, setDetailTotalPrice] = useState(0);
  const [detailAdminMemo, setDetailAdminMemo] = useState("");

  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [selectedTrashOrderIds, setSelectedTrashOrderIds] = useState<number[]>([]);

  const [colWidths, setColWidths] = useState<Record<string, number>>({
    check: 64,
    status: 180,
    member: 180,
    item: 300,
    qty: 100,
    total: 150,
    shipping: 150,
    payment: 150,
  });

  const activeBroadcast = useMemo(() => {
    return broadcasts.find((broadcast) => broadcast.status === "ON") || null;
  }, [broadcasts]);

  useEffect(() => {
    setSelectedOrderIds([]);
    setSelectedTrashOrderIds([]);
  }, [tab, selectedBroadcastId, statusFilter, paymentFilter, search]);

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
    setCombineShippingEnabled(activeBroadcast.combine_shipping_enabled !== false);
    setCombineShippingGroup(activeBroadcast.combine_shipping_group || "");
    setCombineShippingMemo(activeBroadcast.combine_shipping_memo || "");
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
      combine_shipping_enabled: combineShippingEnabled,
      combine_shipping_group: combineShippingGroup.trim() || publicTitle.trim(),
      combine_shipping_memo: combineShippingMemo.trim(),
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
        combine_shipping_enabled: combineShippingEnabled,
        combine_shipping_group: combineShippingGroup.trim() || publicTitle.trim(),
        combine_shipping_memo: combineShippingMemo.trim(),
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

  const formatDateTime = (value: string) => {
    if (!value) return "-";

    try {
      return new Date(value).toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "-";
    }
  };

  const getOrderCode = (order: any) => {
    return String(order.order_lookup_code || `ORDER-${order.id || ""}`).toUpperCase();
  };

  const openOrderDetail = (order: any) => {
    setSelectedOrder(order);
    setDetailShippingFee(getOrderShipping(order));
    setDetailTotalPrice(getOrderTotal(order));
    setDetailAdminMemo(order.admin_memo || order.memo || "");
  };

  const saveOrderDetail = async () => {
    if (!selectedOrder?.id) return;

    const { error } = await supabase
      .from("orders")
      .update({
        adjusted_shipping_fee: Number(detailShippingFee || 0),
        final_shipping_fee: Number(detailShippingFee || 0),
        adjusted_total_price: Number(detailTotalPrice || 0),
        admin_memo: detailAdminMemo.trim(),
      })
      .eq("id", selectedOrder.id);

    if (error) {
      alert("주문 상세 저장 오류: " + error.message);
      return;
    }

    setSelectedOrder(null);
    await loadAll();
    alert("주문 상세정보 저장 완료");
  };

  const moveOrderToTrash = async (order: any) => {
    if (!order?.id) return;

    const code = getOrderCode(order);
    const label = `${order.youtube_nickname || "-"} / ${order.customer_name || "-"}`;

    if (!confirm(`이 주문을 휴지통으로 이동할까요?\n\n${code}\n${label}\n\n휴지통에서 복구할 수 있습니다.`)) {
      return;
    }

    const { error } = await supabase
      .from("orders")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        delete_memo: "관리자 삭제",
      })
      .eq("id", order.id);

    if (error) {
      alert("휴지통 이동 오류: " + error.message);
      return;
    }

    if (selectedOrder?.id === order.id) {
      setSelectedOrder(null);
    }

    await loadAll();
    alert("휴지통으로 이동했습니다.");
  };

  const restoreOrderFromTrash = async (order: any) => {
    if (!order?.id) return;

    const code = getOrderCode(order);

    if (!confirm(`이 주문을 복구할까요?\n\n${code}`)) return;

    const { error } = await supabase
      .from("orders")
      .update({
        is_deleted: false,
        deleted_at: null,
        delete_memo: "",
        is_permanently_deleted: false,
        permanently_deleted_at: null,
      })
      .eq("id", order.id);

    if (error) {
      alert("주문 복구 오류: " + error.message);
      return;
    }

    await loadAll();
    alert("주문을 복구했습니다.");
  };

  const permanentlyDeleteOrder = async (order: any) => {
    if (!order?.id) return;

    const code = getOrderCode(order);

    if (!confirm(`정말 완전삭제 처리할까요?\n\n${code}\n\n화면과 휴지통에서 완전히 사라집니다.`)) return;

    const { error } = await supabase
      .from("orders")
      .update({
        is_permanently_deleted: true,
        permanently_deleted_at: new Date().toISOString(),
        is_deleted: true,
        deleted_at: order.deleted_at || new Date().toISOString(),
        delete_memo: order.delete_memo || "관리자 영구삭제",
      })
      .eq("id", order.id);

    if (error) {
      alert("영구삭제 처리 오류: " + error.message);
      return;
    }

    await loadAll();
    alert("영구삭제 처리 완료");
  };

  const getTrashRemainDays = (order: any) => {
    if (!order.deleted_at) return 30;

    const deleted = new Date(order.deleted_at).getTime();
    const now = Date.now();
    const passedDays = Math.floor((now - deleted) / (1000 * 60 * 60 * 24));

    return Math.max(0, 30 - passedDays);
  };

  const isTrashExpired = (order: any) => {
    return getTrashRemainDays(order) <= 0;
  };

  const toggleOrderSelection = (orderId: number) => {
    setSelectedOrderIds((prev) => {
      if (prev.includes(orderId)) {
        return prev.filter((id) => id !== orderId);
      }

      return [...prev, orderId];
    });
  };

  const toggleTrashOrderSelection = (orderId: number) => {
    setSelectedTrashOrderIds((prev) => {
      if (prev.includes(orderId)) {
        return prev.filter((id) => id !== orderId);
      }

      return [...prev, orderId];
    });
  };

  const selectAllFilteredOrders = () => {
    const ids = filteredOrders.map((order) => Number(order.id)).filter(Boolean);
    setSelectedOrderIds(ids);
  };

  const clearSelectedOrders = () => {
    setSelectedOrderIds([]);
  };

  const selectAllTrashOrders = () => {
    const ids = trashOrders.map((order) => Number(order.id)).filter(Boolean);
    setSelectedTrashOrderIds(ids);
  };

  const clearSelectedTrashOrders = () => {
    setSelectedTrashOrderIds([]);
  };

  const bulkMoveOrdersToTrash = async () => {
    if (selectedOrderIds.length === 0) {
      alert("선택된 주문이 없습니다.");
      return;
    }

    if (!confirm(`선택한 주문 ${selectedOrderIds.length}건을 휴지통으로 이동할까요?`)) {
      return;
    }

    const { error } = await supabase
      .from("orders")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        delete_memo: "관리자 일괄 삭제",
      })
      .in("id", selectedOrderIds);

    if (error) {
      alert("일괄 휴지통 이동 오류: " + error.message);
      return;
    }

    setSelectedOrderIds([]);
    await loadAll();
    alert(`선택 주문 ${selectedOrderIds.length}건을 휴지통으로 이동했습니다.`);
  };

  const bulkRestoreOrdersFromTrash = async () => {
    if (selectedTrashOrderIds.length === 0) {
      alert("선택된 휴지통 주문이 없습니다.");
      return;
    }

    if (!confirm(`선택한 휴지통 주문 ${selectedTrashOrderIds.length}건을 복구할까요?`)) {
      return;
    }

    const { error } = await supabase
      .from("orders")
      .update({
        is_deleted: false,
        deleted_at: null,
        delete_memo: "",
      })
      .in("id", selectedTrashOrderIds);

    if (error) {
      alert("일괄 복구 오류: " + error.message);
      return;
    }

    setSelectedTrashOrderIds([]);
    await loadAll();
    alert(`선택 주문 ${selectedTrashOrderIds.length}건을 복구했습니다.`);
  };

  const bulkPermanentlyDeleteOrders = async () => {
    if (selectedTrashOrderIds.length === 0) {
      alert("선택된 휴지통 주문이 없습니다.");
      return;
    }

    const count = selectedTrashOrderIds.length;

    if (!confirm(`선택한 주문 ${count}건을 영구삭제 처리할까요?\\n\\n화면과 휴지통에서 완전히 사라집니다.`)) {
      return;
    }

    const { error } = await supabase
      .from("orders")
      .update({
        is_permanently_deleted: true,
        permanently_deleted_at: new Date().toISOString(),
        is_deleted: true,
      })
      .in("id", selectedTrashOrderIds);

    if (error) {
      alert("일괄 영구삭제 처리 오류: " + error.message);
      return;
    }

    setSelectedTrashOrderIds([]);
    await loadAll();
    alert(`선택 주문 ${count}건을 영구삭제 처리했습니다.`);
  };

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return orders.filter((order) => {
      if (order.is_permanently_deleted === true) return false;
      if (order.is_deleted === true) return false;

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

  const trashOrders = useMemo(() => {
    return orders
      .filter((order) => order.is_deleted === true && order.is_permanently_deleted !== true)
      .sort((a, b) => {
        const aTime = new Date(a.deleted_at || a.created_at || "").getTime();
        const bTime = new Date(b.deleted_at || b.created_at || "").getTime();
        return bTime - aTime;
      });
  }, [orders]);

  const orderSummary = useMemo(() => {
    const totalCount = filteredOrders.length;

    const refundCount = filteredOrders.filter((order) => {
      const status = getDisplayStatus(order);
      return status === "환불";
    }).length;

    const partialRefundCount = filteredOrders.filter((order) => {
      const status = getDisplayStatus(order);
      return status === "부분환불";
    }).length;

    const cancelCount = filteredOrders.filter((order) => {
      const status = getDisplayStatus(order);
      return status === "주문서취소";
    }).length;

    const cardCount = filteredOrders.filter((order) => {
      return getPaymentLabel(order) === "카드결제";
    }).length;

    const bankCount = filteredOrders.filter((order) => {
      return getPaymentLabel(order) === "무통장입금";
    }).length;

    const newCount = filteredOrders.filter((order) => {
      const status = getDisplayStatus(order);
      return status === "주문확인전";
    }).length;

    const totalAmount = filteredOrders.reduce((sum, order) => {
      return sum + Number(order.adjusted_total_price || order.total_price || 0);
    }, 0);

    return {
      totalCount,
      newCount,
      refundCount,
      partialRefundCount,
      cancelCount,
      cardCount,
      bankCount,
      totalAmount,
    };
  }, [filteredOrders]);

  const newOrderAlerts = useMemo(() => {
    return filteredOrders.filter((order) => {
      const status = getDisplayStatus(order);
      return status === "주문확인전";
    });
  }, [filteredOrders]);

  const recentNewOrderAlerts = useMemo(() => {
    return newOrderAlerts.slice(0, 3);
  }, [newOrderAlerts]);

  const settlementOrders = useMemo(() => {
    return orders.filter((order) => {
      if (order.is_permanently_deleted === true) return false;
      if (order.is_deleted === true) return false;

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

  const dashboardGrossSales = filteredOrders
    .filter((order) => order.order_manage_status !== "주문서취소")
    .reduce((sum, order) => sum + getOrderTotal(order), 0);

  const dashboardRefundAmount = filteredOrders.reduce(
    (sum, order) => sum + getRefundAmount(order),
    0
  );

  const dashboardSales = filteredOrders.reduce(
    (sum, order) => sum + getNetOrderTotal(order),
    0
  );

  const dashboardCardSales = filteredOrders
    .filter((order) => isPaysterPayment(order))
    .reduce((sum, order) => sum + getNetOrderTotal(order), 0);

  const dashboardCardFeeSettlement = Math.round(
    dashboardCardSales * (Number(cardFeeRate || 0) / 100)
  );

  const dashboardFinalProfit =
    dashboardSales - dashboardCardFeeSettlement;


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

  const cardFeeSettlement = Math.round(cardSales * (Number(cardFeeRate || 0) / 100));
  const totalExpense = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const finalProfit =
    totalSales - warehouseCost - cardFeeSettlement - totalExpense;

  const addExpense = () => {
    setExpenses((prev) => [...prev, { type: "생활비", amount: 0, memo: "" }]);
  };

  const removeExpense = (index: number) => {
    setExpenses((prev) => {
      if (prev.length <= 1) {
        return [{ type: "생활비", amount: 0, memo: "" }];
      }

      return prev.filter((_, idx) => idx !== index);
    });
  };

  const updateExpense = (index: number, key: string, value: any) => {
    setExpenses((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        return { ...item, [key]: value };
      })
    );
  };

  const moveExpense = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= expenses.length) return;

    setExpenses((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const getCustomerStats = (customer: any) => {
    const phone = String(customer.customer_phone || "");
    const nickname = String(customer.youtube_nickname || "");
    const name = String(customer.customer_name || "");

    const customerOrders = orders.filter((order) => {
      if (order.is_permanently_deleted === true) return false;
      if (order.is_deleted === true) return false;

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

  const cleanOptionText = (value: any) => {
    const text = String(value || "").trim();

    if (!text) return "";
    if (text === "없음") return "";
    if (text === "-") return "";
    if (text.toLowerCase() === "none") return "";

    return text;
  };

  const getRozenItemText = (ordersInGroup: any[]) => {
    const itemLines = ordersInGroup.map((order) => {
      const productName = cleanOptionText(order.product_name) || "상품";
      const color = cleanOptionText(order.color);
      const size = cleanOptionText(order.size);
      const option = cleanOptionText(order.option_name || order.product_option);

      const qty = Number(order.qty || 1);

      const optionParts = [color, size, option].filter(Boolean);
      const optionText =
        optionParts.length > 0 ? `(${optionParts.join(" / ")})` : "";

      return `${productName}${optionText} x${qty}`;
    });

    const totalQty = ordersInGroup.reduce(
      (sum, order) => sum + Number(order.qty || 1),
      0
    );

    return `${itemLines.join(" / ")} / 총 ${totalQty}개`;
  };

  const buildRozenGroups = (targetOrders: any[]) => {
    const groupMap = new Map<string, any[]>();

    targetOrders.forEach((order) => {
      const nickname = String(order.youtube_nickname || "").trim();
      const phone = String(order.customer_phone || "").replace(/[^0-9]/g, "");
      const address = getFullAddress(order);

      const key = `${nickname}__${phone}__${address}`;

      const prev = groupMap.get(key) || [];
      groupMap.set(key, [...prev, order]);
    });

    return Array.from(groupMap.values());
  };

  const downloadRozenExcel = async () => {
    try {
      const targetOrders = filteredOrders.filter(
        (order) => getDisplayStatus(order) === "주문확인완료"
      );

      if (targetOrders.length === 0) {
        alert("주문확인완료 상태인 주문이 없습니다.");
        return;
      }

      const templatePaths = [
        "/templates/rozen_template.xlsx",
        "/rozen_template.xlsx",
      ];

      let response: Response | null = null;
      let usedTemplatePath = "";

      for (const path of templatePaths) {
        const tryResponse = await fetch(`${path}?v=${Date.now()}`);

        if (tryResponse.ok) {
          response = tryResponse;
          usedTemplatePath = path;
          break;
        }
      }

      if (!response) {
        alert(
          "로젠 송장 템플릿 파일을 찾을 수 없습니다.\n\n확인 위치:\n/public/templates/rozen_template.xlsx\n\n시도 경로:\n" +
            templatePaths.join("\n")
        );
        return;
      }

      const templateBuffer = await response.arrayBuffer();

      if (!templateBuffer || templateBuffer.byteLength < 1000) {
        alert(
          "로젠 송장 템플릿 파일을 불러왔지만 파일 내용이 비정상입니다.\n\n사용 경로: " +
            usedTemplatePath
        );
        return;
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(templateBuffer);

      const worksheet = workbook.worksheets[0];

      if (!worksheet) {
        alert("로젠 송장 템플릿에 시트가 없습니다.");
        return;
      }

      const groups = buildRozenGroups(targetOrders);

      // 로젠 업로드 파일은 헤더 없이 1행부터 실제 송장 데이터만 들어가야 합니다.
      // 템플릿 1행은 스타일 참고용으로만 사용하고, 샘플 글씨는 전부 지운 뒤 1행부터 입력합니다.
      const startRow = 1;
      const templateRow = worksheet.getRow(startRow);

      // 기존 샘플/데이터 영역 정리
      const lastRow = Math.max(worksheet.rowCount, startRow);
      for (let rowNumber = startRow; rowNumber <= lastRow; rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);

        for (let col = 1; col <= 11; col += 1) {
          row.getCell(col).value = null;
        }

        row.commit();
      }

      groups.forEach((ordersInGroup, index) => {
        const firstOrder = ordersInGroup[0];

        const rowNumber = startRow + index;
        const row = worksheet.getRow(rowNumber);

        // 원본 템플릿 1행 스타일을 새 행에 최대한 유지
        if (index > 0) {
          for (let col = 1; col <= 11; col += 1) {
            const sourceCell = templateRow.getCell(col);
            const targetCell = row.getCell(col);

            // ExcelJS 스타일은 TypeScript 타입이 까다로워서
            // 원본 템플릿 셀 스타일을 JSON 방식으로 안전하게 복사합니다.
            targetCell.style = sourceCell.style
              ? JSON.parse(JSON.stringify(sourceCell.style))
              : {};

            if (sourceCell.numFmt) {
              targetCell.numFmt = sourceCell.numFmt;
            }
          }

          row.height = templateRow.height;
        }

        const nickname = String(firstOrder.youtube_nickname || "").trim();
        const phone = String(firstOrder.customer_phone || "").replace(/[^0-9]/g, "");
        const fullAddress = getFullAddress(firstOrder);
        const addressWithNickname = `${fullAddress} /${nickname}`.trim();
        const itemText = getRozenItemText(ordersInGroup);

        const values = [
          nickname,
          "",
          addressWithNickname,
          phone,
          phone,
          "1",
          "2750",
          "010",
          itemText,
          "",
          "친절배송부탁드립니다.",
        ];

        values.forEach((value, colIndex) => {
          row.getCell(colIndex + 1).value = value;
        });

        row.commit();
      });

      const totalOriginalQty = targetOrders.reduce(
        (sum, order) => sum + Number(order.qty || 1),
        0
      );

      const totalGroupedQty = groups.reduce(
        (sum, ordersInGroup) =>
          sum +
          ordersInGroup.reduce(
            (innerSum, order) => innerSum + Number(order.qty || 1),
            0
          ),
        0
      );

      if (totalOriginalQty !== totalGroupedQty) {
        alert(
          `수량 검산 오류입니다.\\n원본수량: ${totalOriginalQty}개\\n송장수량: ${totalGroupedQty}개`
        );
        return;
      }

      const outputBuffer = await workbook.xlsx.writeBuffer();

      const blob = new Blob([outputBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const filename = `rozen_${yyyy}${mm}${dd}.xlsx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);

      alert(
        `로젠 송장 생성 완료\\n합배송 묶음: ${groups.length}건\\n총수량: ${totalGroupedQty}개`
      );
    } catch (error: any) {
      console.error(error);
      alert(
        "로젠 송장 생성 중 오류가 발생했습니다.\\n템플릿 파일 또는 주문 데이터를 확인해주세요."
      );
    }
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

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-5">
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
            onClick={() => setTab("trash")}
            className={`p-4 rounded-2xl font-bold border ${
              tab === "trash"
                ? "bg-black text-white"
                : "bg-white text-gray-900 border-gray-300"
            }`}
          >
            휴지통 {trashOrders.length > 0 ? `(${trashOrders.length})` : ""}
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

          <a
            href="/admin/notice"
            className="p-4 rounded-2xl font-bold border bg-white text-gray-900 border-gray-300 text-center hover:bg-black hover:text-white transition"
          >
            공지관리
          </a>
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

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
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

            <div>
              <div className="text-sm font-bold mb-2 text-gray-700">
                합배송 사용
              </div>

              <label className="h-[54px] flex items-center gap-2 border rounded-2xl px-4 font-extrabold bg-white">
                <input
                  type="checkbox"
                  checked={combineShippingEnabled}
                  onChange={(e) => setCombineShippingEnabled(e.target.checked)}
                />
                사용
              </label>
            </div>

            <div>
              <div className="text-sm font-bold mb-2 text-gray-700">
                합배송 그룹
              </div>

              <input
                value={combineShippingGroup}
                onChange={(e) => setCombineShippingGroup(e.target.value)}
                placeholder="예) 0516 신발/의류"
                className="w-full border rounded-2xl px-4 py-3"
              />
            </div>
          </div>

          <div className="mt-4">
            <div className="text-sm font-bold mb-2 text-gray-700">
              합배송 메모
            </div>

            <input
              value={combineShippingMemo}
              onChange={(e) => setCombineShippingMemo(e.target.value)}
              placeholder="예) 오늘 방송끼리 이름+전화번호+주소 같으면 무료배송"
              className="w-full border rounded-2xl px-4 py-3"
            />
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
                  <br />
                  합배송 {combineShippingEnabled ? "사용" : "미사용"}
                  {combineShippingGroup ? ` / ${combineShippingGroup}` : ""}
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

            <section className="grid grid-cols-1 md:grid-cols-3 gap-3 my-5">
              <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                <div className="text-xs text-gray-500 font-bold">
                  방송매출
                </div>

                <div className="text-2xl font-extrabold mt-1">
                  {won(dashboardSales)}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 shadow-sm">
                <div className="text-xs text-blue-600 font-bold">
                  카드매출
                </div>

                <div className="text-2xl font-extrabold mt-1 text-blue-700">
                  {won(dashboardCardSales)}
                </div>
              </div>

              <div className="bg-black text-white rounded-2xl p-4 shadow-sm">
                <div className="text-xs opacity-70 font-bold">
                  최종순이익
                </div>

                <div className="text-3xl font-extrabold mt-1">
                  {won(dashboardFinalProfit)}
                </div>
              </div>
            </section>

            <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 my-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <div>
                  <div className="text-xl font-extrabold text-gray-900">
                    주문 요약
                  </div>
                  <div className="text-sm text-gray-500 font-bold mt-1">
                    현재 필터 기준으로 계산됩니다.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowDetailStats((prev) => !prev)}
                  className="rounded-2xl bg-gray-100 text-gray-800 px-5 py-3 font-extrabold"
                >
                  {showDetailStats ? "상세 접기" : "상세 보기"}
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                  <div className="text-xs text-gray-500 font-bold">조회 주문</div>
                  <div className="text-2xl font-extrabold mt-1">{orderSummary.totalCount}건</div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                  <div className="text-xs text-gray-500 font-bold">조회 금액</div>
                  <div className="text-2xl font-extrabold mt-1">{won(orderSummary.totalAmount)}</div>
                </div>

                <button
                  type="button"
                  onClick={() => setStatusFilter("주문확인전")}
                  className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-left hover:bg-yellow-100 transition"
                >
                  <div className="text-xs text-yellow-700 font-bold">신규 주문</div>
                  <div className="text-2xl font-extrabold mt-1 text-yellow-700">{orderSummary.newCount}건</div>
                </button>

                <div className="bg-black text-white rounded-2xl p-4">
                  <div className="text-xs opacity-70 font-bold">필터 순매출</div>
                  <div className="text-2xl font-extrabold mt-1">{won(dashboardSales)}</div>
                </div>
              </div>

              {showDetailStats && (
                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 mt-3">
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                    <div className="text-xs text-red-600 font-bold">환불</div>
                    <div className="text-2xl font-extrabold mt-1 text-red-700">{orderSummary.refundCount}건</div>
                  </div>

                  <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
                    <div className="text-xs text-orange-600 font-bold">부분환불</div>
                    <div className="text-2xl font-extrabold mt-1 text-orange-700">{orderSummary.partialRefundCount}건</div>
                  </div>

                  <div className="bg-gray-100 border border-gray-300 rounded-2xl p-4">
                    <div className="text-xs text-gray-600 font-bold">주문서취소</div>
                    <div className="text-2xl font-extrabold mt-1 text-gray-800">{orderSummary.cancelCount}건</div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                    <div className="text-xs text-blue-600 font-bold">카드결제</div>
                    <div className="text-2xl font-extrabold mt-1 text-blue-700">{orderSummary.cardCount}건</div>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                    <div className="text-xs text-gray-600 font-bold">무통장입금</div>
                    <div className="text-2xl font-extrabold mt-1 text-gray-800">{orderSummary.bankCount}건</div>
                  </div>

                  <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                    <div className="text-xs text-red-600 font-bold">환불금액</div>
                    <div className="text-2xl font-extrabold mt-1 text-red-700">- {won(dashboardRefundAmount)}</div>
                  </div>
                </div>
              )}
            </section>

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

            <section className="bg-white rounded-3xl border border-yellow-200 shadow-sm p-5 my-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <div>
                  <div className="text-xl font-extrabold text-gray-900">
                    🔔 신규 주문 알림
                  </div>
                  <div className="text-sm text-gray-500 font-bold mt-1">
                    최근 신규 주문 3건까지 표시됩니다. 상태를 변경하면 신규 표시가 자동으로 사라집니다.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setStatusFilter("주문확인전")}
                  className="rounded-2xl bg-yellow-400 text-black px-5 py-3 font-extrabold"
                >
                  신규주문 {newOrderAlerts.length}건 보기
                </button>
              </div>

              {recentNewOrderAlerts.length > 0 ? (
                <div className="grid gap-2">
                  {recentNewOrderAlerts.map((order) => (
                    <div
                      key={`new-alert-${order.id}`}
                      className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded-2xl bg-yellow-50 border border-yellow-100 px-4 py-3"
                    >
                      <div className="font-extrabold text-gray-900">
                        🟡 {order.youtube_nickname || "-"} / {order.customer_name || "-"}
                      </div>

                      <div className="text-sm font-bold text-gray-700 md:text-right">
                        {order.product_name || "상품명 없음"}
                        {" · "}
                        {order.color || "없음"} / {order.size || "없음"}
                        {" · "}
                        {order.qty || 0}개
                        {" · "}
                        {won(getOrderTotal(order))}
                      </div>
                    </div>
                  ))}

                  {newOrderAlerts.length > recentNewOrderAlerts.length && (
                    <div className="rounded-2xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm font-bold text-gray-500 text-center">
                      외 {newOrderAlerts.length - recentNewOrderAlerts.length}건 더 있습니다.
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl bg-gray-50 border border-gray-200 px-4 py-4 text-center text-gray-500 font-bold">
                  신규 주문 알림이 없습니다.
                </div>
              )}
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
                    onClick={selectAllFilteredOrders}
                    className="px-5 py-3 rounded-2xl font-bold bg-gray-100 text-black"
                  >
                    전체선택
                  </button>

                  <button
                    onClick={clearSelectedOrders}
                    className="px-5 py-3 rounded-2xl font-bold bg-gray-100 text-black"
                  >
                    선택해제
                  </button>

                  <button
                    onClick={bulkMoveOrdersToTrash}
                    disabled={selectedOrderIds.length === 0}
                    className="px-5 py-3 rounded-2xl font-bold bg-red-600 text-white disabled:opacity-40"
                  >
                    선택 {selectedOrderIds.length}건 삭제
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
                        <ResizableTh colKey="check">
                          <input
                            type="checkbox"
                            checked={
                              filteredOrders.length > 0 &&
                              selectedOrderIds.length === filteredOrders.length
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                selectAllFilteredOrders();
                              } else {
                                clearSelectedOrders();
                              }
                            }}
                          />
                        </ResizableTh>
                        <ResizableTh colKey="status">상태</ResizableTh>
                        <ResizableTh colKey="member">닉네임 / 이름</ResizableTh>
                        <ResizableTh colKey="item">주문내역</ResizableTh>
                        <ResizableTh colKey="qty">수량</ResizableTh>
                        <ResizableTh colKey="total">금액</ResizableTh>
                        <ResizableTh colKey="shipping">배송비</ResizableTh>
                        <ResizableTh colKey="payment">결제수단</ResizableTh>
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
                          <tr
                            key={order.id}
                            className={`border-b ${
                              status === "환불"
                                ? "bg-red-50 hover:bg-red-100"
                                : status === "부분환불"
                                ? "bg-orange-50 hover:bg-orange-100"
                                : status === "주문서취소"
                                ? "bg-gray-100 hover:bg-gray-200"
                                : paymentLabel === "카드결제"
                                ? "bg-blue-50/40 hover:bg-blue-50"
                                : "hover:bg-gray-50"
                            }`}
                          >
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={selectedOrderIds.includes(Number(order.id))}
                                onChange={() => toggleOrderSelection(Number(order.id))}
                                className="w-5 h-5"
                              />
                            </td>

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

                              {status === "주문확인전" && (
                                <div className="mt-2 inline-flex items-center rounded-full bg-yellow-100 px-3 py-1 text-xs font-extrabold text-yellow-800 border border-yellow-200">
                                  🟡 신규
                                </div>
                              )}
                            </td>

                            <td className="p-3">
                              <button
                                type="button"
                                onClick={() => openOrderDetail(order)}
                                className="mb-1 text-left text-xs font-extrabold text-blue-600 hover:underline"
                              >
                                #{getOrderCode(order)}
                              </button>

                              <div className={`font-extrabold ${shouldStrike ? "line-through text-gray-400" : ""}`}>
                                {order.youtube_nickname || "-"} / {order.customer_name || "-"}
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

                              <button
                                type="button"
                                onClick={() => moveOrderToTrash(order)}
                                className="mt-2 w-full rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs font-extrabold text-red-700 hover:bg-red-100"
                              >
                                🗑 삭제
                              </button>
                            </td>


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
                      <div
                        key={order.id}
                        className={`border rounded-3xl p-5 ${
                          status === "환불"
                            ? "bg-red-50 border-red-200"
                            : status === "부분환불"
                            ? "bg-orange-50 border-orange-200"
                            : status === "주문서취소"
                            ? "bg-gray-100 border-gray-300"
                            : paymentLabel === "카드결제"
                            ? "bg-blue-50/40 border-blue-100"
                            : "bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selectedOrderIds.includes(Number(order.id))}
                              onChange={() => toggleOrderSelection(Number(order.id))}
                              className="mt-2 w-5 h-5"
                            />

                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => openOrderDetail(order)}
                                className="w-full text-left text-sm font-extrabold text-blue-600 hover:underline"
                              >
                                #{getOrderCode(order)}
                              </button>

                              <div className={`text-2xl font-extrabold ${shouldStrike ? "line-through text-gray-400" : ""}`}>
                                {order.youtube_nickname || "-"} / {order.customer_name || "-"}
                              </div>

                              <PaymentBadge payment={paymentLabel} />

                              <button
                                type="button"
                                onClick={() => moveOrderToTrash(order)}
                                className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs font-extrabold text-red-700 hover:bg-red-100"
                              >
                                🗑 삭제
                              </button>
                              </div>
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
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}


        {tab === "trash" && (
          <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 mt-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
              <div>
                <div className="text-2xl font-extrabold">주문 휴지통</div>
                <div className="text-sm text-gray-500 mt-1">
                  삭제한 주문을 복구하거나 영구삭제할 수 있습니다. 30일 경과 건은 완전삭제 대상입니다.
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={selectAllTrashOrders}
                  className="bg-gray-100 text-black px-5 py-3 rounded-2xl font-bold"
                >
                  전체선택
                </button>

                <button
                  onClick={clearSelectedTrashOrders}
                  className="bg-gray-100 text-black px-5 py-3 rounded-2xl font-bold"
                >
                  선택해제
                </button>

                <button
                  onClick={bulkRestoreOrdersFromTrash}
                  disabled={selectedTrashOrderIds.length === 0}
                  className="bg-black text-white px-5 py-3 rounded-2xl font-bold disabled:opacity-40"
                >
                  선택 {selectedTrashOrderIds.length}건 복구
                </button>

                <button
                  onClick={bulkPermanentlyDeleteOrders}
                  disabled={selectedTrashOrderIds.length === 0}
                  className="bg-red-600 text-white px-5 py-3 rounded-2xl font-bold disabled:opacity-40"
                >
                  선택 영구삭제
                </button>

                <button
                  onClick={loadAll}
                  className="bg-gray-300 text-black px-5 py-3 rounded-2xl font-bold"
                >
                  새로고침
                </button>
              </div>
            </div>

            {trashOrders.length === 0 ? (
              <div className="rounded-3xl bg-gray-50 border border-gray-200 p-8 text-center font-bold text-gray-500">
                휴지통에 있는 주문이 없습니다.
              </div>
            ) : (
              <div className="grid gap-3">
                {trashOrders.map((order) => {
                  const remainDays = getTrashRemainDays(order);
                  const expired = isTrashExpired(order);

                  return (
                    <article
                      key={order.id}
                      className={`rounded-3xl border p-5 ${
                        expired
                          ? "bg-red-50 border-red-200"
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedTrashOrderIds.includes(Number(order.id))}
                            onChange={() => toggleTrashOrderSelection(Number(order.id))}
                            className="mt-2 w-5 h-5 shrink-0"
                          />

                          <div className="min-w-0">
                            <div className="text-sm font-extrabold text-blue-600">
                            #{getOrderCode(order)}
                          </div>

                          <div className="mt-1 text-xl font-extrabold text-gray-950">
                            {order.youtube_nickname || "-"} / {order.customer_name || "-"}
                          </div>

                          <div className="mt-2 text-gray-700 font-bold">
                            {order.product_name || "상품명 없음"} · {order.color || "없음"} / {order.size || "없음"} · {order.qty || 0}개
                          </div>

                          <div className="mt-1 text-gray-700 font-bold">
                            금액 {won(getOrderTotal(order))} / 배송비 {won(getOrderShipping(order))}
                          </div>

                          <div className="mt-2 text-sm text-gray-500 font-bold">
                            주문시간: {formatDateTime(order.created_at)}
                            <br />
                            삭제시간: {formatDateTime(order.deleted_at)}
                            <br />
                            삭제메모: {order.delete_memo || "-"}
                          </div>

                          <div
                            className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-extrabold ${
                              expired
                                ? "bg-red-600 text-white"
                                : "bg-gray-200 text-gray-700"
                            }`}
                          >
                            {expired ? "30일 경과 · 완전삭제 대상" : `완전삭제까지 ${remainDays}일 남음`}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-1 gap-2 shrink-0 md:w-[150px]">
                          <button
                            onClick={() => restoreOrderFromTrash(order)}
                            className="bg-black text-white rounded-2xl px-4 py-3 font-extrabold"
                          >
                            복구
                          </button>

                          <button
                            onClick={() => permanentlyDeleteOrder(order)}
                            className="bg-red-600 text-white rounded-2xl px-4 py-3 font-extrabold"
                          >
                            영구삭제
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
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
                  <div className="text-xl font-extrabold mb-5">매출 · 차감 정산</div>

                  <div className="space-y-4">
                    <div>
                      <div className="text-sm font-bold mb-2">창고 정산금액</div>
                      <MoneyInput value={warehouseCost} onChange={setWarehouseCost} />
                    </div>

                    <div>
                      <div className="text-sm font-bold mb-2">카드 수수료정산({cardFeeRate}%)</div>
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
                    <div className="text-xl font-extrabold">기타 지출 관리</div>
                    <button
                      onClick={addExpense}
                      className="bg-black text-white px-4 py-2 rounded-2xl font-bold"
                    >
                      추가하기
                    </button>
                  </div>

                  <div className="max-h-[360px] overflow-y-auto pr-1 space-y-4">
                    {expenses.map((expense, index) => (
                      <div
                        key={index}
                        className="border rounded-2xl p-4 bg-gray-50"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", String(index));
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          const fromIndex = Number(e.dataTransfer.getData("text/plain"));
                          moveExpense(fromIndex, index);
                        }}
                      >
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="text-sm font-extrabold text-gray-500 cursor-move">
                            ↕ 지출 {index + 1}
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => moveExpense(index, index - 1)}
                              className="px-3 py-2 rounded-xl bg-white border font-bold text-sm"
                              type="button"
                            >
                              ↑
                            </button>

                            <button
                              onClick={() => moveExpense(index, index + 1)}
                              className="px-3 py-2 rounded-xl bg-white border font-bold text-sm"
                              type="button"
                            >
                              ↓
                            </button>

                            <button
                              onClick={() => removeExpense(index)}
                              className="px-3 py-2 rounded-xl bg-red-500 text-white font-bold text-sm"
                              type="button"
                            >
                              삭제
                            </button>
                          </div>
                        </div>

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

                  <div className="mt-4 rounded-2xl bg-gray-50 border p-4">
                    <div className="text-sm text-gray-500 font-bold">기타 지출 합계</div>
                    <div className="text-2xl font-extrabold mt-1">{won(totalExpense)}</div>
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


        {selectedOrder && (
          <div className="fixed inset-0 z-[99999] bg-black/50 flex items-center justify-center p-4">
            <section className="w-full max-w-4xl max-h-[90vh] overflow-auto bg-white rounded-[2rem] shadow-2xl border border-gray-200">
              <div className="sticky top-0 bg-white border-b border-gray-200 p-5 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-extrabold text-blue-600">
                    #{getOrderCode(selectedOrder)}
                  </div>
                  <h2 className="text-2xl font-extrabold text-gray-950">
                    주문 상세정보
                  </h2>
                </div>

                <button
                  onClick={() => setSelectedOrder(null)}
                  className="rounded-2xl bg-gray-100 px-5 py-3 font-extrabold"
                >
                  닫기
                </button>
              </div>

              <div className="p-5 grid gap-5">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="rounded-3xl border bg-gray-50 p-5">
                    <div className="text-lg font-extrabold mb-4">주문 기본정보</div>

                    <div className="grid gap-2 text-sm font-bold text-gray-700">
                      <div>주문번호: #{getOrderCode(selectedOrder)}</div>
                      <div>주문시간: {formatDateTime(selectedOrder.created_at)}</div>
                      <div>방송명: {selectedOrder.broadcast_public_title || selectedOrder.broadcast_name || "-"}</div>
                      <div>상태: {getDisplayStatus(selectedOrder)}</div>
                      <div>결제수단: {getPaymentLabel(selectedOrder)}</div>
                    </div>
                  </div>

                  <div className="rounded-3xl border bg-gray-50 p-5">
                    <div className="text-lg font-extrabold mb-4">고객 정보</div>

                    <div className="grid gap-2 text-sm font-bold text-gray-700">
                      <div>닉네임: {selectedOrder.youtube_nickname || "-"}</div>
                      <div>이름: {selectedOrder.customer_name || "-"}</div>
                      <div>전화번호: {selectedOrder.customer_phone || "-"}</div>
                      <div>주소: {getFullAddress(selectedOrder) || "-"}</div>
                      <div>요청사항: {selectedOrder.request_memo || selectedOrder.memo || "-"}</div>
                      <div>고객확인: {selectedOrder.customer_match_status || "-"}</div>
                      <div>고객메모: {selectedOrder.customer_memo || selectedOrder.customer_note || "-"}</div>
                      <div>특이사항: {selectedOrder.special_note || selectedOrder.note || "-"}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border bg-white p-5">
                  <div className="text-lg font-extrabold mb-4">상품 정보</div>

                  <div className="grid md:grid-cols-4 gap-3 text-sm font-bold text-gray-700">
                    <div className="rounded-2xl bg-gray-50 p-4">
                      <div className="text-gray-400 text-xs mb-1">상품명</div>
                      {selectedOrder.product_name || "상품명 없음"}
                    </div>

                    <div className="rounded-2xl bg-gray-50 p-4">
                      <div className="text-gray-400 text-xs mb-1">색상/사이즈</div>
                      {selectedOrder.color || "없음"} / {selectedOrder.size || "없음"}
                    </div>

                    <div className="rounded-2xl bg-gray-50 p-4">
                      <div className="text-gray-400 text-xs mb-1">수량</div>
                      {selectedOrder.qty || 0}개
                    </div>

                    <div className="rounded-2xl bg-gray-50 p-4">
                      <div className="text-gray-400 text-xs mb-1">현재금액</div>
                      {won(getOrderTotal(selectedOrder))}
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border bg-white p-5">
                  <div className="text-lg font-extrabold mb-4">관리자 수정</div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-sm font-bold mb-2 text-gray-700">
                        배송비 수정
                      </div>
                      <MoneyInput value={detailShippingFee} onChange={setDetailShippingFee} />
                    </div>

                    <div>
                      <div className="text-sm font-bold mb-2 text-gray-700">
                        구매금액 수정
                      </div>
                      <MoneyInput value={detailTotalPrice} onChange={setDetailTotalPrice} />
                    </div>

                    <div>
                      <div className="text-sm font-bold mb-2 text-gray-700">
                        관리자 메모
                      </div>
                      <input
                        value={detailAdminMemo}
                        onChange={(e) => setDetailAdminMemo(e.target.value)}
                        className="w-full border rounded-2xl p-4 font-bold"
                        placeholder="관리자만 보는 메모"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border bg-red-50 border-red-200 p-5">
                  <div className="text-lg font-extrabold mb-4 text-red-700">
                    환불/취소내역
                  </div>

                  <div className="grid gap-2 text-sm font-bold text-red-700">
                    <div>환불유형: {selectedOrder.refund_type || "-"}</div>
                    <div>환불금액: {selectedOrder.refund_amount ? won(selectedOrder.refund_amount) : "-"}</div>
                    <div>환불사유/메모: {selectedOrder.refund_memo || "-"}</div>
                    <div>취소사유: {selectedOrder.cancel_reason || "-"}</div>
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-2">
                  <button
                    onClick={saveOrderDetail}
                    className="bg-black text-white rounded-2xl p-4 font-extrabold"
                  >
                    상세정보 저장
                  </button>

                  <button
                    onClick={() => moveOrderToTrash(selectedOrder)}
                    className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 font-extrabold"
                  >
                    🗑 휴지통 이동
                  </button>

                  <button
                    onClick={() => setSelectedOrder(null)}
                    className="bg-gray-100 text-gray-900 rounded-2xl p-4 font-extrabold"
                  >
                    닫기
                  </button>
                </div>
              </div>
            </section>
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
