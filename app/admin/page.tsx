"use client";

import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type ProductStatus = "판매중" | "품절" | "숨김";
type ProductType = "공구상품" | "방송상품";
type ShippingType = "일반" | "업체";
type CombineShipping = "Y" | "N";

type Product = {
  id?: string | number;
  product_name: string;
  description: string;
  price: number;
  stock: number;
  shipping_type: ShippingType;
  combine_shipping: CombineShipping;
  product_type: ProductType;
  external_image_url: string;
  image_url: string;
  status: ProductStatus;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

type Broadcast = {
  id?: string | number;
  public_title: string;
  admin_subtitle: string;
  status: string;
  started_at?: string | null;
  ended_at?: string | null;
  shipping_fee: number;
  card_fee_rate: number;
  is_combine_shipping_target?: boolean;
  created_at?: string;
};

type OrderNotice = {
  id: string;
  groupKey: string;
  customerName: string;
  nickname: string;
  phone: string;
  productName: string;
  qty: number;
  amount: number;
  createdAt: string;
};

type AdminOrder = {
  id?: string | number;
  order_group_id?: string;
  order_lookup_code?: string;
  created_at?: string;
  broadcast_id?: string | number;
  broadcast_name?: string;
  youtube_nickname?: string;
  customer_name?: string;
  customer_phone?: string;
  zipcode?: string;
  address?: string;
  detail_address?: string;
  request_memo?: string;
  product_name?: string;
  color?: string;
  size?: string;
  qty?: number;
  product_price?: number;
  total_price?: number;
  adjusted_total_price?: number;
  adjusted_product_price?: number;
  adjusted_shipping_fee?: number;
  payment_method?: string;
  order_status?: string;
  admin_status?: string;
  order_manage_status?: string;
  shipping_status?: string;
  memo?: string;
  special_note?: string;
  is_deleted?: boolean;
  admin_order_status?: string;
  admin_product_price?: number;
  admin_shipping_fee?: number;
  shipping_fee?: number;
  vat_amount?: number;
};

type CustomerProfile = {
  id?: string | number;
  youtube_nickname?: string;
  customer_name?: string;
  customer_phone?: string;
  zipcode?: string;
  address?: string;
  detail_address?: string;
  request_memo?: string;
  is_blocked?: boolean;
  admin_memo?: string;
};

type DepositEntry = {
  id: string;
  depositor: string;
  amount: number;
  time: string;
  raw: string;
};

type DepositSummary = {
  depositor: string;
  totalAmount: number;
  count: number;
  times: string[];
  entries: DepositEntry[];
};

type DepositMatchStatus =
  | "완전일치"
  | "합산일치"
  | "금액맞음"
  | "부분입금"
  | "초과입금"
  | "미입금"
  | "확인필요"
  | "주문없음"
  | "확인완료";

type DepositMatchRow = {
  groupId: string;
  orderCode: string;
  nickname: string;
  customerName: string;
  phone: string;
  orderAmount: number;
  itemText: string;
  paymentMethod: string;
  currentStatus: string;
  matchedName: string;
  depositAmount: number;
  depositCount: number;
  depositTimes: string;
  status: DepositMatchStatus;
  memo: string;
};

type DepositReviewOrder = {
  groupId: string;
  orderAmount: number;
  itemText: string;
  status: string;
};

type DepositReviewEntry = DepositEntry & {
  matchScore?: number;
  matchReason?: string;
};

type DepositReviewGroup = {
  reviewKey: string;
  nickname: string;
  customerName: string;
  phone: string;
  orders: DepositReviewOrder[];
  deposits: DepositReviewEntry[];
  siteTotal: number;
  depositTotal: number;
  difference: number;
  status: DepositMatchStatus;
  memo: string;
  isDepositOnly?: boolean;
};

const emptyProduct: Product = {
  product_name: "",
  description: "",
  price: 0,
  stock: 0,
  shipping_type: "일반",
  combine_shipping: "Y",
  product_type: "공구상품",
  external_image_url: "",
  image_url: "",
  status: "판매중",
  sort_order: 1,
};

const money = (value: number | string) =>
  `${Number(value || 0).toLocaleString()}원`;

const onlyNumber = (value: string) => value.replace(/[^0-9]/g, "");
const normalizePhoneKey = (value?: string) => String(value || "").replace(/[^0-9]/g, "");

export default function AdminPage() {
  const [activeMenu, setActiveMenu] = useState<
    "dashboard" | "products" | "broadcasts" | "orders" | "customers" | "deposits"
  >(() => {
    if (typeof window === "undefined") return "dashboard";

    const saved = window.localStorage.getItem("ruru_admin_active_menu");
    const allowed = ["dashboard", "products", "broadcasts", "orders", "customers", "deposits"];

    return allowed.includes(saved || "") ? (saved as any) : "dashboard";
  });

  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<Product>(emptyProduct);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [savingProduct, setSavingProduct] = useState(false);

  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"전체" | ProductStatus>("전체");
  const [typeFilter, setTypeFilter] = useState<"전체" | ProductType>("전체");

  const [selectedIds, setSelectedIds] = useState<Array<string | number>>([]);
  const [bulkShippingType, setBulkShippingType] = useState<ShippingType>("일반");
  const [bulkCombineShipping, setBulkCombineShipping] =
    useState<CombineShipping>("Y");
  const [bulkStatus, setBulkStatus] = useState<ProductStatus>("판매중");

  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [activeBroadcast, setActiveBroadcast] = useState<Broadcast | null>(null);
  const [loadingBroadcasts, setLoadingBroadcasts] = useState(true);
  const [savingBroadcast, setSavingBroadcast] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastSubtitle, setBroadcastSubtitle] = useState("");
  const [broadcastShippingFee, setBroadcastShippingFee] = useState(4000);
  const [broadcastCardFeeRate, setBroadcastCardFeeRate] = useState(10);
  const [isCombineShippingTarget, setIsCombineShippingTarget] = useState(true);
  const [selectedBroadcastProductIds, setSelectedBroadcastProductIds] = useState<Array<string | number>>([]);

  const [orderNotices, setOrderNotices] = useState<OrderNotice[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [noticeCompact, setNoticeCompact] = useState(true);
  const [noticeOpacity, setNoticeOpacity] = useState(92);
  const [noticePanelOpen, setNoticePanelOpen] = useState(false);
  const recentOrderGroupRef = useRef<Set<string>>(new Set());
  const audioContextRef = useRef<any>(null);

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orderKeyword, setOrderKeyword] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<"전체" | "무통장입금" | "카드결제">("전체");
  const [selectedOrderGroupIds, setSelectedOrderGroupIds] = useState<string[]>([]);
  const [selectedOrderDetailGroupId, setSelectedOrderDetailGroupId] = useState<string | null>(null);
  const [orderPageSize, setOrderPageSize] = useState(10);
  const [orderPage, setOrderPage] = useState(1);
  const [customerKeyword, setCustomerKeyword] = useState("");
  const [blockedPhones, setBlockedPhones] = useState<string[]>([]);
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [selectedCustomerKeys, setSelectedCustomerKeys] = useState<string[]>([]);
  const [selectedCustomerDetailKey, setSelectedCustomerDetailKey] = useState<string | null>(null);
  const [showOnlyLinkedProducts, setShowOnlyLinkedProducts] = useState(false);

  const [depositRawText, setDepositRawText] = useState("");
  const [depositKeyword, setDepositKeyword] = useState("");
  const [depositStatusFilter, setDepositStatusFilter] = useState<"전체" | DepositMatchStatus>("전체");
  const [confirmedDepositReviewKeys, setConfirmedDepositReviewKeys] = useState<string[]>([]);

  useEffect(() => {
    loadAll();

    if (typeof window !== "undefined") {
      const savedSound = localStorage.getItem("ruru_admin_order_sound") === "ON";
      if (savedSound) setSoundEnabled(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ruru_admin_active_menu", activeMenu);
  }, [activeMenu]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const saved = localStorage.getItem("ruru_deposit_review_confirmed_keys");
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        setConfirmedDepositReviewKeys(parsed.filter(Boolean));
      }
    } catch {
      setConfirmedDepositReviewKeys([]);
    }
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("ruru-admin-order-notices")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          const row: any = payload.new || {};
          const groupKey = String(
            row.order_group_id || row.order_lookup_code || row.id || crypto.randomUUID()
          );

          if (recentOrderGroupRef.current.has(groupKey)) {
            return;
          }

          recentOrderGroupRef.current.add(groupKey);

          window.setTimeout(() => {
            recentOrderGroupRef.current.delete(groupKey);
          }, 15000);

          const notice: OrderNotice = {
            id: `${groupKey}-${Date.now()}`,
            groupKey,
            customerName: row.customer_name || "고객명 없음",
            nickname: row.youtube_nickname || "",
            phone: row.customer_phone || "",
            productName: row.product_name || "상품명 없음",
            qty: Number(row.qty || 1),
            amount: Number(
              row.adjusted_total_price ||
                row.total_price ||
                row.product_price ||
                0
            ),
            createdAt: row.created_at || new Date().toISOString(),
          };

          setOrderNotices((prev) => [notice, ...prev].slice(0, 3));
          playOrderSound();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [soundEnabled]);

  useEffect(() => {
    if (!soundEnabled) return;

    const resumeSound = async () => {
      try {
        const AudioContextClass =
          (window as any).AudioContext || (window as any).webkitAudioContext;

        if (!AudioContextClass) return;

        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContextClass();
        }

        if (audioContextRef.current.state === "suspended") {
          await audioContextRef.current.resume();
        }
      } catch {
        // 사용자 입력 전 브라우저 정책으로 실패 가능
      }
    };

    document.addEventListener("click", resumeSound, { once: true });
    document.addEventListener("keydown", resumeSound, { once: true });

    return () => {
      document.removeEventListener("click", resumeSound);
      document.removeEventListener("keydown", resumeSound);
    };
  }, [soundEnabled]);

  const loadAll = async () => {
    await Promise.all([loadProducts(), loadBroadcasts(), loadOrders(), loadCustomers()]);
  };

  const loadProducts = async () => {
    setLoadingProducts(true);

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("id", { ascending: false });

    if (error) {
      alert("상품 목록 불러오기 실패\n\n" + error.message);
      setLoadingProducts(false);
      return;
    }

    setProducts((data || []) as Product[]);
    setLoadingProducts(false);
  };

  const loadOrders = async () => {
    setLoadingOrders(true);

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      console.log("주문 목록 불러오기 실패", error.message);
      setOrders([]);
      setLoadingOrders(false);
      return;
    }

    setOrders(((data || []) as AdminOrder[]).filter((order) => order.is_deleted !== true));
    setLoadingOrders(false);
  };

  const loadCustomers = async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .limit(1000);

    if (error) {
      console.log("고객 목록 불러오기 실패", error.message);
      setCustomers([]);
      return;
    }

    setCustomers((data || []) as CustomerProfile[]);
  };

  const loadBroadcastProductIds = async (broadcastId: string | number) => {
    const { data, error } = await supabase
      .from("broadcast_products")
      .select("product_id")
      .eq("broadcast_id", broadcastId);

    if (error) {
      console.log("broadcast_products 불러오기 실패", error.message);
      setSelectedBroadcastProductIds([]);
      return;
    }

    setSelectedBroadcastProductIds(
      (data || []).map((row: any) => row.product_id).filter(Boolean)
    );
  };

  const loadBroadcasts = async () => {
    setLoadingBroadcasts(true);

    const { data, error } = await supabase
      .from("broadcasts")
      .select("*")
      .neq("is_deleted", true)
      .order("started_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(20);

    if (error) {
      alert("방송 목록 불러오기 실패\n\n" + error.message);
      setLoadingBroadcasts(false);
      return;
    }

    const rows = (data || []) as Broadcast[];
    setBroadcasts(rows);

    const active = rows.find((row) => row.status === "ON") || null;
    setActiveBroadcast(active);

    if (active) {
      setBroadcastTitle(active.public_title || "");
      setBroadcastSubtitle(active.admin_subtitle || "");
      setBroadcastShippingFee(Number(active.shipping_fee || 4000));
      setBroadcastCardFeeRate(Number(active.card_fee_rate || 10));
      setIsCombineShippingTarget(Boolean(active.is_combine_shipping_target));
      if (active.id) await loadBroadcastProductIds(active.id);
    } else {
      setSelectedBroadcastProductIds([]);
    }

    setLoadingBroadcasts(false);
  };

  const filteredProducts = useMemo(() => {
    const word = keyword.trim().toLowerCase();

    return products.filter((product) => {
      const matchKeyword =
        !word ||
        String(product.product_name || "").toLowerCase().includes(word) ||
        String(product.description || "").toLowerCase().includes(word);

      const matchStatus =
        statusFilter === "전체" || product.status === statusFilter;

      const matchType = typeFilter === "전체" || product.product_type === typeFilter;

      return matchKeyword && matchStatus && matchType;
    });
  }, [products, keyword, statusFilter, typeFilter]);

  const broadcastSelectableProducts = useMemo(() => {
    return products.filter(
      (product) =>
        product.status !== "숨김" &&
        (product.product_type === "방송상품" || product.product_type === "공구상품")
    );
  }, [products]);

  const selectedBroadcastProducts = useMemo(() => {
    return products.filter(
      (product) =>
        product.id !== undefined && selectedBroadcastProductIds.includes(product.id)
    );
  }, [products, selectedBroadcastProductIds]);

  const visibleBroadcastSelectableProducts = useMemo(() => {
    if (!showOnlyLinkedProducts) return broadcastSelectableProducts;

    return broadcastSelectableProducts.filter(
      (product) =>
        product.id !== undefined && selectedBroadcastProductIds.includes(product.id)
    );
  }, [broadcastSelectableProducts, selectedBroadcastProductIds, showOnlyLinkedProducts]);

  const filteredOrders = useMemo(() => {
    const word = orderKeyword.trim().toLowerCase();

    return orders.filter((order) => {
      const matchPayment =
        paymentFilter === "전체" || order.payment_method === paymentFilter;

      const target = [
        order.youtube_nickname,
        order.customer_name,
        order.customer_phone,
        order.product_name,
        order.order_lookup_code,
        order.broadcast_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchWord = !word || target.includes(word);

      return matchPayment && matchWord;
    });
  }, [orders, orderKeyword, paymentFilter]);

  useEffect(() => {
    setOrderPage(1);
  }, [orderKeyword, paymentFilter, orderPageSize]);

  const orderGroups = useMemo(() => {
    const map = new Map<string, AdminOrder[]>();

    filteredOrders.forEach((order) => {
      const key = String(order.order_group_id || order.order_lookup_code || order.id || "");
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(order);
    });

    return Array.from(map.entries()).map(([groupId, rows]) => ({
      groupId,
      rows,
      first: rows[0],
      totalQty: rows.reduce((sum, row) => sum + Number(row.qty || 0), 0),
      totalAmount: rows.reduce(
        (sum, row) =>
          sum +
          Number(
            row.adjusted_total_price ??
              row.total_price ??
              Number(row.product_price || 0) * Number(row.qty || 1)
          ),
        0
      ),
    }));
  }, [filteredOrders]);


  const normalizeDepositName = (value: any) => {
    return String(value || "")
      .replace(/\s/g, "")
      .replace(/[(){}\[\],.·ㆍ\-_/]/g, "")
      .toLowerCase();
  };

  const safeMoneyNumber = (value: any) => {
    if (value === null || value === undefined || value === "") return 0;
    const cleaned = String(value).replace(/[^0-9.-]/g, "");
    return Number(cleaned || 0);
  };

  const getOrderRowQty = (row: AdminOrder) => {
    const qty = safeMoneyNumber(row.qty);
    return qty > 0 ? qty : 1;
  };

  const getOrderRowProductTotal = (row: AdminOrder) => {
    return safeMoneyNumber(row.product_price) * getOrderRowQty(row);
  };

  const getOrderRowShippingFee = (row: AdminOrder) => {
    return safeMoneyNumber(
      row.shipping_fee ??
        row.admin_shipping_fee ??
        row.adjusted_shipping_fee ??
        0
    );
  };

  const getOrderRowCardRate = (row: AdminOrder) => {
    if (row.payment_method !== "카드결제") return 0;

    const previousProductTotal =
      safeMoneyNumber(row.adjusted_product_price) ||
      safeMoneyNumber(row.product_price) * getOrderRowQty(row);

    const previousVat = safeMoneyNumber(row.vat_amount);

    if (previousProductTotal > 0 && previousVat > 0) {
      return previousVat / previousProductTotal;
    }

    return 0.1;
  };

  const getOrderRowCardFee = (row: AdminOrder) => {
    if (row.payment_method !== "카드결제") return 0;
    return Math.round(getOrderRowProductTotal(row) * getOrderRowCardRate(row));
  };

  const calculateOrderRowTotal = (row: AdminOrder) => {
    return (
      getOrderRowProductTotal(row) +
      getOrderRowShippingFee(row) +
      getOrderRowCardFee(row)
    );
  };

  const orderGroupAmount = (rows: AdminOrder[]) => {
    return rows.reduce((sum, row) => {
      const storedTotal =
        row.adjusted_total_price !== undefined && row.adjusted_total_price !== null
          ? safeMoneyNumber(row.adjusted_total_price)
          : row.total_price !== undefined && row.total_price !== null
          ? safeMoneyNumber(row.total_price)
          : calculateOrderRowTotal(row);

      return sum + storedTotal;
    }, 0);
  };

  const parseDepositEntries = (text: string): DepositEntry[] => {
    const lines = String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const entries: DepositEntry[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const statusLine = lines[index] || "";

      if (!/^미매칭$/i.test(statusLine.trim())) {
        continue;
      }

      const depositorLine = lines[index + 1] || "";
      const amountLine = lines[index + 2] || "";
      const timeLine = lines[index + 3] || "";

      const amountMatch = amountLine.match(/^\+\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*원$/);
      const timeMatch = timeLine.match(/^([0-2]?\d):([0-5]\d)$/);

      if (!depositorLine || !amountMatch) {
        continue;
      }

      entries.push({
        id: `${index}-${depositorLine}-${amountLine}-${timeLine}`,
        depositor: depositorLine.trim(),
        amount: Number(String(amountMatch[1] || "0").replace(/,/g, "")),
        time: timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : "",
        raw: [statusLine, depositorLine, amountLine, timeLine].join(" / "),
      });

      index += 3;
    }

    return entries;
  };

  const depositEntries = useMemo(() => {
    return parseDepositEntries(depositRawText);
  }, [depositRawText]);

  const depositSummaries = useMemo(() => {
    const map = new Map<string, DepositSummary>();

    depositEntries.forEach((entry) => {
      const key = normalizeDepositName(entry.depositor);
      if (!key) return;

      if (!map.has(key)) {
        map.set(key, {
          depositor: entry.depositor,
          totalAmount: 0,
          count: 0,
          times: [],
          entries: [],
        });
      }

      const summary = map.get(key);
      if (!summary) return;

      summary.totalAmount += Number(entry.amount || 0);
      summary.count += 1;
      if (entry.time) summary.times.push(entry.time);
      summary.entries.push(entry);
    });

    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [depositEntries]);

  const compactKoreanName = (value: any) => {
    return normalizeDepositName(value)
      .replace(/유민영|고객님|님$/g, "")
      .trim();
  };

  const isSimilarDepositName = (depositName: string, orderName: string) => {
    const depositKey = compactKoreanName(depositName);
    const orderKey = compactKoreanName(orderName);

    if (!depositKey || !orderKey) return false;
    if (depositKey === orderKey) return true;

    if (depositKey.length >= 2 && orderKey.includes(depositKey)) return true;
    if (orderKey.length >= 2 && depositKey.includes(orderKey)) return true;

    if (depositKey.length >= 3 && orderKey.includes(depositKey.slice(0, 3))) return true;
    if (orderKey.length >= 3 && depositKey.includes(orderKey.slice(0, 3))) return true;

    return false;
  };

  const findSimilarDepositSummary = (
    nickname: string,
    customerName: string,
    summaries: DepositSummary[]
  ) => {
    return (
      summaries.find((summary) => isSimilarDepositName(summary.depositor, nickname)) ||
      summaries.find((summary) => isSimilarDepositName(summary.depositor, customerName)) ||
      null
    );
  };

  const isCrossNameMatch = (depositor: string, nickname: string, customerName: string) => {
    const depositKey = normalizeDepositName(depositor);
    const nicknameKey = normalizeDepositName(nickname);
    const nameKey = normalizeDepositName(customerName);

    if (!depositKey) return false;

    if (nicknameKey && depositKey === nicknameKey) return true;
    if (nameKey && depositKey === nameKey) return true;

    return false;
  };

  const isPossibleNameMatch = (depositor: string, nickname: string, customerName: string) => {
    const depositKey = normalizeDepositName(depositor);
    const nicknameKey = normalizeDepositName(nickname);
    const nameKey = normalizeDepositName(customerName);

    if (!depositKey) return false;

    const candidates = [nicknameKey, nameKey].filter(Boolean);

    return candidates.some((target) => {
      if (!target) return false;
      if (depositKey === target) return true;

      // 수수밭 ↔ 옥수수밭유민영 같은 일부 포함 케이스
      if (depositKey.length >= 2 && target.includes(depositKey)) return true;
      if (target.length >= 2 && depositKey.includes(target)) return true;

      // 앞글자 일부 일치도 미입금으로 버리지 않고 확인필요로 올림
      if (depositKey.length >= 3 && target.includes(depositKey.slice(0, 3))) return true;
      if (target.length >= 3 && depositKey.includes(target.slice(0, 3))) return true;

      return false;
    });
  };

  const findExactDepositSummary = (
    nickname: string,
    customerName: string,
    summaries: DepositSummary[]
  ) => {
    return (
      summaries.find((summary) => isCrossNameMatch(summary.depositor, nickname, customerName)) ||
      null
    );
  };

  const findPossibleDepositSummary = (
    nickname: string,
    customerName: string,
    summaries: DepositSummary[]
  ) => {
    return (
      summaries.find((summary) => isPossibleNameMatch(summary.depositor, nickname, customerName)) ||
      null
    );
  };

  const depositMatchRows = useMemo<DepositMatchRow[]>(() => {
    const customerOrderTotalMap = new Map<string, number>();
    const customerOrderCountMap = new Map<string, number>();

    const customerKeyOf = (nickname: string, customerName: string, phone?: string) => {
      const phoneKey = normalizePhoneKey(phone || "");
      const nicknameKey = normalizeDepositName(nickname);
      const nameKey = normalizeDepositName(customerName);

      return phoneKey || `${nicknameKey}|${nameKey}`;
    };

    orderGroups.forEach((group) => {
      const first = group.first;
      const nickname = String(first.youtube_nickname || "").trim();
      const customerName = String(first.customer_name || "").trim();
      const key = customerKeyOf(nickname, customerName, first.customer_phone);
      const amount = orderGroupAmount(group.rows);

      customerOrderTotalMap.set(key, (customerOrderTotalMap.get(key) || 0) + amount);
      customerOrderCountMap.set(key, (customerOrderCountMap.get(key) || 0) + 1);
    });

    return orderGroups.map((group) => {
      const first = group.first;
      const orderAmount = orderGroupAmount(group.rows);
      const nickname = String(first.youtube_nickname || "").trim();
      const customerName = String(first.customer_name || "").trim();
      const customerKey = customerKeyOf(nickname, customerName, first.customer_phone);
      const customerTotalOrderAmount = customerOrderTotalMap.get(customerKey) || orderAmount;
      const customerOrderCount = customerOrderCountMap.get(customerKey) || 1;

      const exactSummary = findExactDepositSummary(nickname, customerName, depositSummaries);
      const possibleSummary = !exactSummary
        ? findPossibleDepositSummary(nickname, customerName, depositSummaries)
        : null;

      const sameOrderAmountDifferentName = depositSummaries.filter(
        (summary) =>
          summary.totalAmount === orderAmount &&
          !isCrossNameMatch(summary.depositor, nickname, customerName)
      );

      const sameCustomerTotalDifferentName = depositSummaries.filter(
        (summary) =>
          summary.totalAmount === customerTotalOrderAmount &&
          !isCrossNameMatch(summary.depositor, nickname, customerName)
      );

      let status: DepositMatchStatus = "미입금";
      let matchedSummary: DepositSummary | null = null;
      let memo = "일치하는 입금내역 없음";

      if (exactSummary) {
        matchedSummary = exactSummary;

        if (exactSummary.totalAmount === customerTotalOrderAmount) {
          status = exactSummary.count > 1 || customerOrderCount > 1 ? "합산일치" : "완전일치";
          memo =
            customerOrderCount > 1
              ? `닉네임/이름이 같은 고객 주문 ${customerOrderCount}건 총액 ${money(customerTotalOrderAmount)}과 입금합계가 일치`
              : "입금자명이 닉네임 또는 이름과 일치하고 금액도 일치";
        } else if (exactSummary.totalAmount === orderAmount) {
          status = exactSummary.count > 1 ? "합산일치" : "완전일치";
          memo = "입금자명이 닉네임 또는 이름과 일치하고 해당 주문금액과 일치";
        } else if (exactSummary.totalAmount < customerTotalOrderAmount) {
          status = "부분입금";
          memo = `닉네임/이름은 일치하지만 같은 고객 전체 주문금액보다 ${money(customerTotalOrderAmount - exactSummary.totalAmount)} 부족`;
        } else {
          status = "초과입금";
          memo = `닉네임/이름은 일치하지만 같은 고객 전체 주문금액보다 ${money(exactSummary.totalAmount - customerTotalOrderAmount)} 초과`;
        }
      } else if (possibleSummary) {
        matchedSummary = possibleSummary;
        status = "확인필요";

        if (possibleSummary.totalAmount === customerTotalOrderAmount) {
          memo = `입금자명이 닉네임/이름과 일부 유사하고 같은 고객 주문 ${customerOrderCount}건 총액과 일치`;
        } else if (possibleSummary.totalAmount === orderAmount) {
          memo = "입금자명이 닉네임/이름과 일부 유사하고 해당 주문금액과 일치";
        } else if (possibleSummary.totalAmount < customerTotalOrderAmount) {
          memo = `입금자명이 유사하지만 같은 고객 전체 주문금액보다 ${money(customerTotalOrderAmount - possibleSummary.totalAmount)} 부족`;
        } else {
          memo = `입금자명이 유사하지만 같은 고객 전체 주문금액보다 ${money(possibleSummary.totalAmount - customerTotalOrderAmount)} 초과`;
        }
      } else if (sameCustomerTotalDifferentName.length === 1 && customerOrderCount > 1) {
        matchedSummary = sameCustomerTotalDifferentName[0];
        status = "확인필요";
        memo = `입금자명은 다르지만 같은 고객 주문 ${customerOrderCount}건 총액과 같은 입금이 있어 확인 필요`;
      } else if (sameOrderAmountDifferentName.length === 1) {
        matchedSummary = sameOrderAmountDifferentName[0];
        status = "확인필요";
        memo = "주문금액과 같은 입금은 있지만 입금자명이 닉네임/이름과 달라 확인 필요";
      } else if (sameOrderAmountDifferentName.length > 1 || sameCustomerTotalDifferentName.length > 1) {
        matchedSummary = sameOrderAmountDifferentName[0] || sameCustomerTotalDifferentName[0] || null;
        status = "확인필요";
        memo = "같은 금액의 입금자가 여러 명이라 확인 필요";
      }

      return {
        groupId: group.groupId,
        orderCode: String(first.order_lookup_code || first.order_group_id || first.id || "").slice(0, 20),
        nickname: nickname || "-",
        customerName: customerName || "-",
        phone: first.customer_phone || "",
        orderAmount,
        itemText: group.rows
          .map((row) =>
            [
              String(row.product_name || "").trim(),
              String(row.color || "").trim() && String(row.color || "").trim() !== "없음"
                ? String(row.color || "").trim()
                : "",
              String(row.size || "").trim() && String(row.size || "").trim() !== "없음"
                ? String(row.size || "").trim()
                : "",
              `x${Number(row.qty || 1)}`,
            ]
              .filter(Boolean)
              .join(" ")
          )
          .join(" / "),
        paymentMethod: first.payment_method || "-",
        currentStatus: first.admin_order_status || first.order_manage_status || "미설정",
        matchedName: matchedSummary?.depositor || "-",
        depositAmount: matchedSummary?.totalAmount || 0,
        depositCount: matchedSummary?.count || 0,
        depositTimes: matchedSummary?.times.join(", ") || "-",
        status,
        memo,
      };
    });
  }, [orderGroups, depositSummaries]);

  const inlineOrderItemLabel = (row: AdminOrder) => {
    return [
      String(row.product_name || "").trim(),
      String(row.color || "").trim() && String(row.color || "").trim() !== "없음"
        ? String(row.color || "").trim()
        : "",
      String(row.size || "").trim() && String(row.size || "").trim() !== "없음"
        ? String(row.size || "").trim()
        : "",
      `x${Number(row.qty || 1)}`,
    ]
      .filter(Boolean)
      .join(" ");
  };

  const getReviewCustomerKey = (nickname: string, customerName: string, phone?: string) => {
    const phoneKey = normalizePhoneKey(phone || "");
    const nicknameKey = normalizeDepositName(nickname);
    const nameKey = normalizeDepositName(customerName);

    return phoneKey || `${nicknameKey}|${nameKey}`;
  };

  const getDepositReviewScore = (
    entry: DepositEntry,
    nickname: string,
    customerName: string,
    siteTotal: number,
    orders: DepositReviewOrder[]
  ) => {
    const depositorKey = normalizeDepositName(entry.depositor);
    const nicknameKey = normalizeDepositName(nickname);
    const nameKey = normalizeDepositName(customerName);

    let score = 0;
    const reasons: string[] = [];

    if (depositorKey && nicknameKey && depositorKey === nicknameKey) {
      score += 3;
      reasons.push("닉네임 일치");
    }

    if (depositorKey && nameKey && depositorKey === nameKey) {
      score += 3;
      reasons.push("이름 일치");
    }

    if (
      depositorKey &&
      nicknameKey &&
      depositorKey !== nicknameKey &&
      isSimilarDepositName(entry.depositor, nickname)
    ) {
      score += 1;
      reasons.push("닉네임 유사");
    }

    if (
      depositorKey &&
      nameKey &&
      depositorKey !== nameKey &&
      isSimilarDepositName(entry.depositor, customerName)
    ) {
      score += 1;
      reasons.push("이름 유사");
    }

    if (entry.amount === siteTotal) {
      score += 3;
      reasons.push("총액 일치");
    }

    if (orders.some((order) => order.orderAmount === entry.amount)) {
      score += 1;
      reasons.push("단건금액 일치");
    }

    return {
      score,
      reason: reasons.join(" + ") || "후보",
    };
  };

  const depositReviewGroups = useMemo<DepositReviewGroup[]>(() => {
    const customerMap = new Map<string, DepositReviewGroup>();

    orderGroups.forEach((group) => {
      const first = group.first;
      const nickname = String(first.youtube_nickname || "").trim();
      const customerName = String(first.customer_name || "").trim();
      const phone = first.customer_phone || "";
      const reviewKey = getReviewCustomerKey(nickname, customerName, phone);
      const orderAmount = orderGroupAmount(group.rows);

      if (!customerMap.has(reviewKey)) {
        customerMap.set(reviewKey, {
          reviewKey,
          nickname: nickname || "-",
          customerName: customerName || "-",
          phone,
          orders: [],
          deposits: [],
          siteTotal: 0,
          depositTotal: 0,
          difference: 0,
          status: "미입금",
          memo: "",
        });
      }

      const target = customerMap.get(reviewKey);
      if (!target) return;

      target.orders.push({
        groupId: group.groupId,
        orderAmount,
        itemText: group.rows.map((row) => inlineOrderItemLabel(row)).filter(Boolean).join(" / "),
        status: first.admin_order_status || first.order_manage_status || "미설정",
      });

      target.siteTotal += orderAmount;
    });

    const groups: DepositReviewGroup[] = Array.from(customerMap.values());
    const assignedDepositIds = new Set<string>();

    depositEntries.forEach((entry) => {
      let bestGroupIndex = -1;
      let bestScore = 0;
      let bestReason = "";

      groups.forEach((group, groupIndex) => {
        const result = getDepositReviewScore(
          entry,
          group.nickname,
          group.customerName,
          group.siteTotal,
          group.orders
        );

        if (result.score > bestScore) {
          bestGroupIndex = groupIndex;
          bestScore = result.score;
          bestReason = result.reason;
        }
      });

      if (bestGroupIndex >= 0 && bestScore >= 2) {
        groups[bestGroupIndex].deposits.push({
          ...entry,
          matchScore: bestScore,
          matchReason: bestReason,
        });

        assignedDepositIds.add(entry.id);
      }
    });

    depositEntries.forEach((entry) => {
      if (assignedDepositIds.has(entry.id)) return;

      groups.push({
        reviewKey: `deposit-only-${entry.id}`,
        nickname: "-",
        customerName: "-",
        phone: "",
        orders: [],
        deposits: [{ ...entry, matchScore: 0, matchReason: "주문 후보 없음" }],
        siteTotal: 0,
        depositTotal: entry.amount,
        difference: entry.amount,
        status: "주문없음",
        memo: "입금은 있지만 연결된 사이트 주문 후보가 없습니다.",
        isDepositOnly: true,
      });
    });

    groups.forEach((group) => {
      group.depositTotal = group.deposits.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
      group.difference = group.depositTotal - group.siteTotal;

      if (confirmedDepositReviewKeys.includes(group.reviewKey)) {
        group.status = "확인완료";
        group.memo = "관리자가 수동 확인 완료";
        return;
      }

      if (group.isDepositOnly) {
        group.status = "주문없음";
        return;
      }

      if (group.deposits.length === 0) {
        group.status = "미입금";
        group.memo = "입금 후보가 없습니다.";
      } else if (group.difference === 0) {
        group.status = group.orders.length > 1 || group.deposits.length > 1 ? "합산일치" : "완전일치";
        group.memo = "사이트 주문합계와 복붙 입금합계가 일치합니다.";
      } else if (group.difference < 0) {
        group.status = "부분입금";
        group.memo = `입금이 ${money(Math.abs(group.difference))} 부족합니다.`;
      } else if (group.difference > 0) {
        group.status = "초과입금";
        group.memo = `입금이 ${money(group.difference)} 많습니다.`;
      } else {
        group.status = "확인필요";
        group.memo = "확인이 필요합니다.";
      }
    });

    return groups.sort((a, b) => {
      const aConfirmed = a.status === "확인완료" ? 1 : 0;
      const bConfirmed = b.status === "확인완료" ? 1 : 0;
      const aProblem = a.status === "미입금" || a.status === "주문없음" || a.status === "초과입금" || a.status === "부분입금" ? 0 : 1;
      const bProblem = b.status === "미입금" || b.status === "주문없음" || b.status === "초과입금" || b.status === "부분입금" ? 0 : 1;

      return aConfirmed - bConfirmed || aProblem - bProblem || b.siteTotal - a.siteTotal;
    });
  }, [orderGroups, depositEntries, confirmedDepositReviewKeys]);

  const filteredDepositReviewGroups = useMemo(() => {
    const word = depositKeyword.trim().toLowerCase();

    return depositReviewGroups.filter((group) => {
      const matchStatus =
        depositStatusFilter === "전체" || group.status === depositStatusFilter;

      const target = [
        group.nickname,
        group.customerName,
        group.phone,
        group.status,
        group.memo,
        ...group.orders.map((order) => order.itemText),
        ...group.deposits.map((entry) => `${entry.depositor} ${entry.amount} ${entry.time}`),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchWord = !word || target.includes(word);

      return matchStatus && matchWord;
    });
  }, [depositReviewGroups, depositKeyword, depositStatusFilter]);

  const saveConfirmedDepositReviewKeys = (keys: string[]) => {
    const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
    setConfirmedDepositReviewKeys(uniqueKeys);

    if (typeof window !== "undefined") {
      localStorage.setItem("ruru_deposit_review_confirmed_keys", JSON.stringify(uniqueKeys));
    }
  };

  const confirmDepositReviewGroup = async (group: DepositReviewGroup) => {
    for (const order of group.orders) {
      await updateOrderGroupStatus(order.groupId, "입금확인");
    }

    saveConfirmedDepositReviewKeys([...confirmedDepositReviewKeys, group.reviewKey]);
  };

  const undoDepositReviewGroup = (group: DepositReviewGroup) => {
    saveConfirmedDepositReviewKeys(
      confirmedDepositReviewKeys.filter((key) => key !== group.reviewKey)
    );
  };

  const depositTotalSummary = useMemo(() => {
    const totalDepositAmount = depositEntries.reduce(
      (sum, entry) => sum + Number(entry.amount || 0),
      0
    );

    const matchedDepositAmount = depositReviewGroups
      .filter((group) => group.status === "완전일치" || group.status === "합산일치" || group.status === "확인완료")
      .reduce((sum, group) => sum + Number(group.depositTotal || 0), 0);

    const needCheckDepositAmount = depositReviewGroups
      .filter((group) => group.status === "확인필요" || group.status === "부분입금" || group.status === "초과입금" || group.status === "주문없음")
      .reduce((sum, group) => sum + Number(group.depositTotal || 0), 0);

    const unpaidAmount = depositReviewGroups
      .filter((group) => group.status === "미입금")
      .reduce((sum, group) => sum + Number(group.siteTotal || 0), 0);

    return {
      totalDepositAmount,
      matchedDepositAmount,
      needCheckDepositAmount,
      unpaidAmount,
    };
  }, [depositEntries, depositReviewGroups]);

  const filteredDepositMatchRows = useMemo(() => {
    const word = depositKeyword.trim().toLowerCase();

    return depositMatchRows.filter((row) => {
      const matchStatus =
        depositStatusFilter === "전체" || row.status === depositStatusFilter;

      const target = [
        row.orderCode,
        row.nickname,
        row.customerName,
        row.phone,
        row.itemText,
        row.matchedName,
        row.status,
        row.memo,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchWord = !word || target.includes(word);

      return matchStatus && matchWord;
    });
  }, [depositMatchRows, depositKeyword, depositStatusFilter]);

  const depositStatusStyle = (status: DepositMatchStatus) => {
    if (status === "완전일치") return "bg-green-100 text-green-700";
    if (status === "합산일치") return "bg-blue-100 text-blue-700";
    if (status === "금액맞음") return "bg-emerald-100 text-emerald-700";
    if (status === "부분입금") return "bg-orange-100 text-orange-700";
    if (status === "초과입금") return "bg-red-100 text-red-700";
    if (status === "미입금") return "bg-gray-100 text-gray-600";
    if (status === "주문없음") return "bg-pink-100 text-pink-700";
    if (status === "확인완료") return "bg-green-600 text-white";
    return "bg-yellow-100 text-yellow-700";
  };

  const confirmDepositMatch = async (groupId: string) => {
    await updateOrderGroupStatus(groupId, "입금확인");
  };


  const isCanceledOrder = (order: AdminOrder) => {
    const text = [
      order.admin_order_status,
      order.order_status,
      order.admin_status,
      order.order_manage_status,
      order.shipping_status,
    ]
      .filter(Boolean)
      .join(" ");

    return /취소|환불|주문취소|삭제/.test(text);
  };

  const totalOrderPages = Math.max(1, Math.ceil(orderGroups.length / orderPageSize));

  const paginatedOrderGroups = useMemo(() => {
    const safePage = Math.min(Math.max(orderPage, 1), totalOrderPages);
    const startIndex = (safePage - 1) * orderPageSize;
    return orderGroups.slice(startIndex, startIndex + orderPageSize);
  }, [orderGroups, orderPage, orderPageSize, totalOrderPages]);

  const orderPageNumbers = useMemo(() => {
    const pages: number[] = [];
    const start = Math.max(1, orderPage - 2);
    const end = Math.min(totalOrderPages, orderPage + 2);

    for (let page = start; page <= end; page += 1) {
      pages.push(page);
    }

    return pages;
  }, [orderPage, totalOrderPages]);

  const selectedOrderDetail = useMemo(() => {
    if (!selectedOrderDetailGroupId) return null;
    return orderGroups.find((group) => group.groupId === selectedOrderDetailGroupId) || null;
  }, [orderGroups, selectedOrderDetailGroupId]);

    const customerRows = useMemo(() => {
    const map = new Map<string, AdminOrder[]>();

    orders.forEach((order) => {
      const phoneKey = normalizePhoneKey(order.customer_phone || "");
      const key =
        phoneKey ||
        String(order.youtube_nickname || order.customer_name || order.id || "");

      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(order);
    });

    const keyword = customerKeyword.trim().toLowerCase();

    return Array.from(map.entries())
      .map(([key, rows]) => {
        const first = rows[0] || {};
        const phoneKey = normalizePhoneKey(first.customer_phone || "");

        const totalQty = rows.reduce(
          (sum, row) => sum + Number(row.qty || 0),
          0
        );

        const totalAmount = rows.reduce(
          (sum, row) =>
            sum +
            Number(
              row.adjusted_total_price ||
                row.total_price ||
                Number(row.product_price || 0) * Number(row.qty || 1)
            ),
          0
        );

        const cancelCount = rows.filter((row) => isCanceledOrder(row)).length;

        const recentOrderAt =
          rows
            .map((row) => row.created_at || "")
            .filter(Boolean)
            .sort()
            .reverse()[0] || "";

        return {
          key,
          first,
          profile: first,
          rows,
          totalQty,
          totalAmount,
          cancelCount,
          recentOrderAt,
          isBlocked: phoneKey ? blockedPhones.includes(phoneKey) : false,
          adminMemo: first.memo || "",
          orderCount: new Set(
            rows.map((row) => row.order_group_id || row.order_lookup_code || row.id)
          ).size,
        };
      })
      .filter((customer) => {
        if (!keyword) return true;

        const target = [
          customer.first.youtube_nickname,
          customer.first.customer_name,
          customer.first.customer_phone,
          customer.first.address,
          customer.first.detail_address,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return target.includes(keyword);
      });
  }, [orders, customerKeyword, blockedPhones]);

const selectedCustomerDetail = useMemo(() => {
    if (!selectedCustomerDetailKey) return null;
    return customerRows.find((customer) => customer.key === selectedCustomerDetailKey) || null;
  }, [customerRows, selectedCustomerDetailKey]);

  const dashboardCounts = useMemo(() => {
    const selling = products.filter((p) => p.status === "판매중").length;
    const soldout = products.filter((p) => p.status === "품절").length;
    const hidden = products.filter((p) => p.status === "숨김").length;
    const groupBuy = products.filter((p) => p.product_type === "공구상품").length;

    return { selling, soldout, hidden, groupBuy };
  }, [products]);

  const resetForm = () => {
    setForm({
      ...emptyProduct,
      sort_order: Math.max(1, products.length + 1),
    });
    setEditingId(null);
  };

  const startEdit = (product: Product) => {
    setEditingId(product.id ?? null);
    setForm({
      product_name: product.product_name || "",
      description: product.description || "",
      price: Number(product.price || 0),
      stock: Number(product.stock || 0),
      shipping_type: (product.shipping_type || "일반") as ShippingType,
      combine_shipping: (product.combine_shipping || "Y") as CombineShipping,
      product_type: (product.product_type || "공구상품") as ProductType,
      external_image_url: product.external_image_url || "",
      image_url: product.image_url || "",
      status: (product.status || "판매중") as ProductStatus,
      sort_order: Number(product.sort_order || 1),
    });

    setActiveMenu("products");

    setTimeout(() => {
      document
        .getElementById("product-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const cloneProduct = (product: Product) => {
    setEditingId(null);
    setForm({
      product_name: `${product.product_name || ""} 복사본`,
      description: product.description || "",
      price: Number(product.price || 0),
      stock: Number(product.stock || 0),
      shipping_type: (product.shipping_type || "일반") as ShippingType,
      combine_shipping: (product.combine_shipping || "Y") as CombineShipping,
      product_type: (product.product_type || "공구상품") as ProductType,
      external_image_url: product.external_image_url || "",
      image_url: product.image_url || "",
      status: "숨김",
      sort_order: Math.max(1, products.length + 1),
    });

    setActiveMenu("products");

    setTimeout(() => {
      document
        .getElementById("product-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const validateForm = () => {
    if (!form.product_name.trim()) {
      alert("상품명을 입력해주세요.");
      return false;
    }

    if (Number(form.price || 0) < 0) {
      alert("금액은 0원 이상으로 입력해주세요.");
      return false;
    }

    if (Number(form.stock || 0) < 0) {
      alert("재고는 0개 이상으로 입력해주세요.");
      return false;
    }

    return true;
  };

  const saveProduct = async () => {
    if (!validateForm()) return;

    setSavingProduct(true);

    const payload = {
      product_name: form.product_name.trim(),
      description: form.description.trim(),
      price: Number(form.price || 0),
      stock: Number(form.stock || 0),
      shipping_type: form.shipping_type,
      combine_shipping: form.combine_shipping,
      product_type: form.product_type,
      external_image_url: form.external_image_url.trim(),
      image_url: form.image_url.trim(),
      status: form.status,
      sort_order: Number(form.sort_order || 1),
      updated_at: new Date().toISOString(),
    };

    try {
      if (editingId) {
        const { error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", editingId);

        if (error) throw error;
        alert("상품 수정 완료");
      } else {
        const { error } = await supabase.from("products").insert(payload);

        if (error) throw error;
        alert("상품 등록 완료");
      }

      resetForm();
      await loadProducts();
    } catch (error: any) {
      alert("상품 저장 실패\n\n" + error.message);
    } finally {
      setSavingProduct(false);
    }
  };

  const quickUpdateProduct = async (
    id: string | number | undefined,
    patch: Partial<Product>
  ) => {
    if (!id) return;

    const { error } = await supabase
      .from("products")
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      alert("변경 실패\n\n" + error.message);
      return;
    }

    await loadProducts();
  };

  const toggleSelect = (id: string | number | undefined) => {
    if (!id) return;

    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  };

  const toggleBroadcastProduct = (id: string | number | undefined) => {
    if (!id) return;

    setSelectedBroadcastProductIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  };

  const clearSelected = () => {
    setSelectedIds([]);
  };

  const applyBulkUpdate = async (type: "shipping" | "combine" | "status") => {
    if (selectedIds.length === 0) {
      alert("먼저 변경할 상품을 체크해주세요.");
      return;
    }

    const patch =
      type === "shipping"
        ? { shipping_type: bulkShippingType }
        : type === "combine"
        ? { combine_shipping: bulkCombineShipping }
        : { status: bulkStatus };

    const { error } = await supabase
      .from("products")
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .in("id", selectedIds);

    if (error) {
      alert("일괄 변경 실패\n\n" + error.message);
      return;
    }

    alert("일괄 변경 완료");
    setSelectedIds([]);
    await loadProducts();
  };

  const upsertSetting = async (key: string, value: string) => {
    const { data } = await supabase
      .from("settings")
      .select("id,key")
      .eq("key", key)
      .limit(1);

    const existing = data?.[0];

    if (existing?.id) {
      const { error } = await supabase
        .from("settings")
        .update({ value })
        .eq("id", existing.id);

      if (error) throw error;
      return;
    }

    const { error } = await supabase.from("settings").insert({ key, value });
    if (error) throw error;
  };

  const saveBroadcastProducts = async (broadcastId: string | number) => {
    const { error: deleteError } = await supabase
      .from("broadcast_products")
      .delete()
      .eq("broadcast_id", broadcastId);

    if (deleteError) throw deleteError;

    if (selectedBroadcastProductIds.length === 0) return;

    const rows = selectedBroadcastProductIds.map((productId) => ({
      broadcast_id: broadcastId,
      product_id: productId,
    }));

    const { error: insertError } = await supabase
      .from("broadcast_products")
      .insert(rows);

    if (insertError) throw insertError;
  };

  const startBroadcast = async () => {
    if (!broadcastTitle.trim()) {
      alert("방송 제목을 입력해주세요.");
      return;
    }

    setSavingBroadcast(true);

    try {
      const { data: activeRows } = await supabase
        .from("broadcasts")
        .select("id")
        .eq("status", "ON");

      if ((activeRows || []).length > 0) {
        const { error } = await supabase
          .from("broadcasts")
          .update({
            status: "OFF",
            ended_at: new Date().toISOString(),
          })
          .in(
            "id",
            (activeRows || []).map((row: any) => row.id)
          );

        if (error) throw error;
      }

      const payload = {
        public_title: broadcastTitle.trim(),
        admin_subtitle: broadcastSubtitle.trim(),
        status: "ON",
        started_at: new Date().toISOString(),
        ended_at: null,
        shipping_fee: Number(broadcastShippingFee || 4000),
        card_fee_rate: Number(broadcastCardFeeRate || 10),
        is_combine_shipping_target: isCombineShippingTarget,
      };

      const { data, error } = await supabase
        .from("broadcasts")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      await saveBroadcastProducts(data.id);

      await upsertSetting("broadcast_status", "ON");
      await upsertSetting("current_broadcast_name", broadcastTitle.trim());

      alert("방송 시작 처리 완료");
      await loadBroadcasts();
    } catch (error: any) {
      alert("방송 시작 실패\n\n" + error.message);
    } finally {
      setSavingBroadcast(false);
    }
  };

  const saveActiveBroadcast = async () => {
    if (!activeBroadcast?.id) {
      alert("현재 방송중인 방송이 없습니다.");
      return;
    }

    if (!broadcastTitle.trim()) {
      alert("방송 제목을 입력해주세요.");
      return;
    }

    setSavingBroadcast(true);

    try {
      const { error } = await supabase
        .from("broadcasts")
        .update({
          public_title: broadcastTitle.trim(),
          admin_subtitle: broadcastSubtitle.trim(),
          shipping_fee: Number(broadcastShippingFee || 4000),
          card_fee_rate: Number(broadcastCardFeeRate || 10),
          is_combine_shipping_target: isCombineShippingTarget,
        })
        .eq("id", activeBroadcast.id);

      if (error) throw error;

      await saveBroadcastProducts(activeBroadcast.id);
      await upsertSetting("current_broadcast_name", broadcastTitle.trim());

      alert("방송 설정 저장 완료");
      await loadBroadcasts();
    } catch (error: any) {
      alert("방송 설정 저장 실패\n\n" + error.message);
    } finally {
      setSavingBroadcast(false);
    }
  };

  const endBroadcast = async () => {
    if (!activeBroadcast?.id) {
      alert("현재 방송중인 방송이 없습니다.");
      return;
    }

    const ok = window.confirm(
      "방송을 종료할까요?\n\n종료하면 고객 주문서가 방송 OFF 상태로 바뀝니다."
    );

    if (!ok) return;

    setSavingBroadcast(true);

    try {
      const { error } = await supabase
        .from("broadcasts")
        .update({
          status: "OFF",
          ended_at: new Date().toISOString(),
        })
        .eq("id", activeBroadcast.id);

      if (error) throw error;

      await upsertSetting("broadcast_status", "OFF");
      await upsertSetting("current_broadcast_name", "");

      alert("방송 종료 처리 완료");
      setBroadcastTitle("");
      setBroadcastSubtitle("");
      setSelectedBroadcastProductIds([]);
      await loadBroadcasts();
    } catch (error: any) {
      alert("방송 종료 실패\n\n" + error.message);
    } finally {
      setSavingBroadcast(false);
    }
  };

  const selectAllBroadcastProducts = () => {
    setSelectedBroadcastProductIds(
      broadcastSelectableProducts
        .map((product) => product.id)
        .filter((id): id is string | number => id !== undefined)
    );
  };

  const clearBroadcastProducts = () => {
    setSelectedBroadcastProductIds([]);
  };

  const hideBroadcast = async (broadcastId: string | number | undefined) => {
    if (!broadcastId) return;

    const ok = window.confirm(
      "이 방송기록을 관리자 화면에서 숨길까요?\n\n주문정보는 삭제하지 않습니다."
    );

    if (!ok) return;

    const { error } = await supabase
      .from("broadcasts")
      .update({ is_deleted: true })
      .eq("id", broadcastId);

    if (error) {
      alert("방송기록 숨김 실패\n\n" + error.message);
      return;
    }

    alert("방송기록을 숨김 처리했습니다.");
    await loadBroadcasts();
  };

  const orderItemLabel = (order: AdminOrder) => {
    const color = String(order.color || "").trim();
    const size = String(order.size || "").trim();
    const qty = Number(order.qty || 1);

    return [
      String(order.product_name || "").trim(),
      color && color !== "없음" ? color : "",
      size && size !== "없음" ? size : "",
      `x${qty}`,
    ]
      .filter(Boolean)
      .join(" ");
  };

  const fullAddress = (order: AdminOrder) => {
    return [order.address, order.detail_address].filter(Boolean).join(" ").trim();
  };

  const selectedOrderRowsForExport = () => {
    if (selectedOrderGroupIds.length === 0) return orderGroups;
    return orderGroups.filter((group) => selectedOrderGroupIds.includes(group.groupId));
  };

  const toggleOrderGroup = (groupId: string) => {
    setSelectedOrderGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );
  };


  const hideSelectedOrders = async () => {
    if (selectedOrderGroupIds.length === 0) {
      alert("숨길 주문을 먼저 체크해주세요.");
      return;
    }

    const ok = window.confirm(
      `선택한 주문 ${selectedOrderGroupIds.length}건을 관리자 화면에서 숨길까요?\n\n주문 데이터는 삭제하지 않고 숨김 처리만 합니다.`
    );

    if (!ok) return;

    const targetIds = orderGroups
      .filter((group) => selectedOrderGroupIds.includes(group.groupId))
      .flatMap((group) => group.rows.map((row) => row.id))
      .filter((id): id is string | number => id !== undefined);

    if (targetIds.length === 0) {
      alert("숨길 주문 ID를 찾지 못했습니다.");
      return;
    }

    const { error } = await supabase
      .from("orders")
      .update({ is_deleted: true })
      .in("id", targetIds);

    if (error) {
      alert("주문 숨김 실패\n\n" + error.message);
      return;
    }

    alert("선택 주문을 숨김 처리했습니다.");
    setSelectedOrderGroupIds([]);
    await loadOrders();
  };

  const orderStatusValue = (order: AdminOrder) => {
    return order.admin_order_status || order.order_manage_status || "미설정";
  };

  const orderStatusStyle = (status: string) => {
    if (status === "입금확인") return "border-green-200 bg-green-50 text-green-700";
    if (status === "포장전") return "border-yellow-200 bg-yellow-50 text-yellow-700";
    if (status === "출고완료") return "border-blue-200 bg-blue-50 text-blue-700";
    if (status === "킵") return "border-purple-200 bg-purple-50 text-purple-700";
    if (status === "주문취소") return "border-red-200 bg-red-50 text-red-700 line-through";
    return "border-gray-200 bg-gray-50 text-gray-700";
  };

  const orderSelectStatusStyle = (status: string) => {
    if (status === "입금확인") return "border-green-400 bg-green-50 text-green-700";
    if (status === "포장전") return "border-yellow-400 bg-yellow-50 text-yellow-700";
    if (status === "출고완료") return "border-blue-400 bg-blue-50 text-blue-700";
    if (status === "킵") return "border-purple-400 bg-purple-50 text-purple-700";
    if (status === "주문취소") return "border-red-400 bg-red-50 text-red-700";
    return "border-gray-300 bg-white text-gray-700";
  };

  const orderCardStyle = (status: string) => {
    if (status === "주문취소") return "border-red-200 bg-red-50/70 text-red-600";
    if (status === "입금확인") return "border-green-200 bg-green-50/50";
    if (status === "포장전") return "border-yellow-200 bg-yellow-50/50";
    if (status === "출고완료") return "border-blue-200 bg-blue-50/50";
    if (status === "킵") return "border-purple-200 bg-purple-50/50";
    return "border-gray-950 bg-white";
  };

  const updateOrderGroupStatus = async (groupId: string, nextStatus: string) => {
    const targetRows = orders.filter((order) => {
      const candidateGroupId = String(
        order.order_group_id || order.order_lookup_code || order.id || ""
      );

      return candidateGroupId === String(groupId);
    });

    const ids = targetRows
      .map((order) => order.id)
      .filter((id): id is string | number => id !== undefined && id !== null);

    if (ids.length === 0) return;

    setOrders((prev) =>
      prev.map((order) =>
        order.id !== undefined &&
        order.id !== null &&
        ids.includes(order.id)
          ? {
              ...order,
              order_manage_status: nextStatus,
            }
          : order
      )
    );

    const { error } = await supabase
      .from("orders")
      .update({
        order_manage_status: nextStatus,
      })
      .in("id", ids);

    if (error) {
      alert("주문상태 변경 실패\n\n" + error.message);
      await loadOrders();
    }
  };

  const updateOrderLocalField = (
    rowId: string | number | undefined,
    field: keyof AdminOrder,
    value: any
  ) => {
    if (rowId === undefined) return;

    setOrders((prev) =>
      prev.map((order) =>
        order.id === rowId
          ? {
              ...order,
              [field]: value,
            }
          : order
      )
    );
  };

  const saveOrderMoneyEdits = async () => {
    if (!selectedOrderDetail) return;

    try {
      for (const row of selectedOrderDetail.rows) {
        if (row.id === undefined) continue;

        const qty = getOrderRowQty(row);
        const productPrice = safeMoneyNumber(row.product_price);
        const shippingFee = getOrderRowShippingFee(row);
        const adjustedProductPrice = productPrice * qty;
        const cardFee =
          row.payment_method === "카드결제"
            ? Math.round(adjustedProductPrice * getOrderRowCardRate(row))
            : 0;
        const adjustedTotalPrice = adjustedProductPrice + shippingFee + cardFee;

        const { error } = await supabase
          .from("orders")
          .update({
            product_price: productPrice,
            shipping_fee: shippingFee,
            adjusted_product_price: adjustedProductPrice,
            adjusted_shipping_fee: shippingFee,
            vat_amount: cardFee,
            adjusted_total_price: adjustedTotalPrice,
            total_price: adjustedTotalPrice,
          })
          .eq("id", row.id);

        if (error) throw error;
      }

      alert("금액 수정 저장 완료");
      await loadOrders();
    } catch (error: any) {
      alert("금액 수정 저장 실패\\n\\n" + error.message);
    }
  };

  const toggleCustomerSelect = (key: string) => {
    setSelectedCustomerKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };
  const toggleCustomerBlock = async (target?: any) => {
    const phoneKey = normalizePhoneKey(
      typeof target === "string"
        ? target
        : target?.first?.customer_phone ||
            target?.customer_phone ||
            target?.phone ||
            target?.rows?.[0]?.customer_phone ||
            ""
    );

    if (!phoneKey) {
      alert("전화번호가 없어 차단 처리할 수 없습니다.");
      return;
    }

    const nowBlocked = blockedPhones.includes(phoneKey);
    const nextPhones = nowBlocked
      ? blockedPhones.filter((item) => item !== phoneKey)
      : [...blockedPhones, phoneKey];

    const uniquePhones = Array.from(new Set(nextPhones.filter(Boolean)));

    setBlockedPhones(uniquePhones);

    if (typeof window !== "undefined") {
      localStorage.setItem("ruru_blocked_phones", JSON.stringify(uniquePhones));
    }

    try {
      await supabase
        .from("customers")
        .update({ is_blocked: !nowBlocked })
        .eq("customer_phone", phoneKey);
    } catch {
      // customers 테이블 구조가 달라도 localStorage 기준 차단은 유지됩니다.
    }
  };

  const exportRozenWaybill = () => {
    const groups = selectedOrderRowsForExport();

    if (groups.length === 0) {
      alert("내보낼 주문이 없습니다.");
      return;
    }

    const cleanPhoneForExcel = (phone?: string) => {
      const digits = normalizePhoneKey(phone);
      return digits ? `'${digits}` : "";
    };

    const rows = groups.map((group) => {
      const first = group.first;
      const itemText =
        group.rows.map((row) => orderItemLabel(row)).filter(Boolean).join(" / ") +
        ` + 총 ${group.totalQty}개`;

      const memo = [first.request_memo, first.special_note, first.memo]
        .filter(Boolean)
        .join(" / ");

      return [
        first.youtube_nickname || first.customer_name || "", // A 닉네임
        "", // B 공백
        fullAddress(first), // C 주소
        cleanPhoneForExcel(first.customer_phone), // D 전화번호: 앞 0 보존
        cleanPhoneForExcel(first.customer_phone), // E 전화번호: 앞 0 보존
        "1", // F 숫자 1
        "2750", // G 숫자 2750
        "'010", // H 010: 앞 0 보존
        itemText, // I 구매내역
        "", // J 공백
        memo, // K 구매자요청사항/배송메모
      ];
    });

    const escapeCsv = (value: any) => {
      const text = String(value ?? "");
      return `"${text.replace(/"/g, '""')}"`;
    };

    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    link.href = url;
    link.download = `rozen_waybill_${today}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const enableOrderSound = async () => {
    try {
      const AudioContextClass =
        (window as any).AudioContext || (window as any).webkitAudioContext;

      if (!AudioContextClass) {
        alert("이 브라우저에서는 알림음을 지원하지 않습니다.");
        return;
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }

      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }

      setSoundEnabled(true);
      localStorage.setItem("ruru_admin_order_sound", "ON");
      playOrderSound();
    } catch {
      alert("알림음 켜기에 실패했습니다. 브라우저 소리 권한을 확인해주세요.");
    }
  };

  const playTone = (
    context: any,
    startTime: number,
    frequency: number,
    duration: number,
    gainValue: number
  ) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.03);
  };

  const playOrderSound = () => {
    try {
      if (!soundEnabled && !audioContextRef.current) return;

      const AudioContextClass =
        (window as any).AudioContext || (window as any).webkitAudioContext;

      if (!audioContextRef.current && AudioContextClass) {
        audioContextRef.current = new AudioContextClass();
      }

      const context = audioContextRef.current;
      if (!context || context.state !== "running") return;

      const now = context.currentTime;

      playTone(context, now, 880, 0.18, 0.55);
      playTone(context, now + 0.18, 1320, 0.22, 0.6);
      playTone(context, now + 0.52, 880, 0.18, 0.55);
      playTone(context, now + 0.70, 1320, 0.24, 0.65);
    } catch {
      // 소리 실패해도 팝업은 유지
    }
  };

  const dismissOrderNotice = (id: string) => {
    setOrderNotices((prev) => prev.filter((notice) => notice.id !== id));
  };

  const clearOrderNotices = () => {
    setOrderNotices([]);
  };
  const isPhoneBlocked = (target?: any) => {
    const phoneKey = normalizePhoneKey(
      typeof target === "string"
        ? target
        : target?.first?.customer_phone ||
            target?.customer_phone ||
            target?.phone ||
            target?.rows?.[0]?.customer_phone ||
            ""
    );

    if (!phoneKey) return false;
    return blockedPhones.includes(phoneKey);
  };

  const menuItems = [
    { key: "dashboard", label: "대시보드", icon: "🏠" },
    { key: "products", label: "상품관리", icon: "🛍" },
    { key: "broadcasts", label: "방송관리", icon: "🔴" },
    { key: "orders", label: "주문관리", icon: "📦" },
    { key: "deposits", label: "입금매칭센터", icon: "💳" },
    { key: "customers", label: "고객관리", icon: "👥" },
  ] as const;

  return (
    <main className="min-h-screen bg-[#f7f7f8] text-gray-950">
      <OrderNoticePopups
        notices={orderNotices}
        soundEnabled={soundEnabled}
        compact={noticeCompact}
        opacity={noticeOpacity}
        panelOpen={noticePanelOpen}
        onToggleCompact={() => setNoticeCompact((prev) => !prev)}
        onOpacityChange={setNoticeOpacity}
        onTogglePanel={() => setNoticePanelOpen((prev) => !prev)}
        onEnableSound={enableOrderSound}
        onDismiss={dismissOrderNotice}
        onClear={clearOrderNotices}
      />

      <div className="flex min-h-screen">
        <aside className="hidden md:flex w-72 bg-white border-r border-gray-200 p-5 flex-col">
          <div className="mb-8">
            <div className="text-xs font-black text-rose-500 mb-2 tracking-widest">
              RURU ADMIN
            </div>
            <div className="text-2xl font-black">루루동이 관리자</div>
            <div className="text-sm text-gray-500 mt-2">
              방송 · 주문 · 상품 운영
            </div>
          </div>

          <nav className="grid gap-2">
            {menuItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveMenu(item.key)}
                className={`text-left px-5 py-4 rounded-2xl font-black transition ${
                  activeMenu === item.key
                    ? "bg-gray-950 text-white shadow-sm"
                    : "bg-gray-50 text-gray-800 hover:bg-rose-50"
                }`}
              >
                <span className="mr-3">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-6 text-xs text-gray-400 leading-5">
            고객페이지는 건드리지 않고
            <br />
            관리자만 새로 구성중입니다.
          </div>
        </aside>

        <section className="flex-1 p-4 md:p-8">
          <div className="md:hidden bg-white rounded-3xl p-4 border shadow-sm mb-4">
            <div className="font-black text-xl mb-3">루루동이 관리자</div>
            <div className="grid grid-cols-3 gap-2">
              {menuItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveMenu(item.key)}
                  className={`px-3 py-3 rounded-2xl text-sm font-black ${
                    activeMenu === item.key
                      ? "bg-gray-950 text-white"
                      : "bg-gray-50 text-gray-800"
                  }`}
                >
                  <div>{item.icon}</div>
                  <div>{item.label}</div>
                </button>
              ))}
            </div>
          </div>

          {activeMenu === "dashboard" && (
            <div className="grid gap-5">
              <div className="bg-white rounded-[2rem] p-6 border shadow-sm">
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                  <div>
                    <div className="text-sm font-black text-rose-500 mb-2">
                      ADMIN DASHBOARD
                    </div>
                    <h1 className="text-3xl md:text-5xl font-black">
                      루루동이 운영센터
                    </h1>
                    <p className="text-gray-500 font-bold mt-3">
                      상품관리 + 방송 ON/OFF 1차 연결 단계입니다.
                    </p>
                  </div>

                  <Link
                    href="/"
                    className="inline-flex justify-center px-5 py-4 rounded-2xl bg-gray-950 text-white font-black"
                  >
                    고객페이지 보기
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="bg-white rounded-3xl p-5 border shadow-sm">
                  <div className="text-gray-500 font-bold text-sm">방송상태</div>
                  <div className="text-3xl font-black mt-2">
                    {activeBroadcast ? "ON" : "OFF"}
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-5 border shadow-sm">
                  <div className="text-gray-500 font-bold text-sm">판매중</div>
                  <div className="text-4xl font-black mt-2">
                    {dashboardCounts.selling}
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-5 border shadow-sm">
                  <div className="text-gray-500 font-bold text-sm">품절</div>
                  <div className="text-4xl font-black mt-2">
                    {dashboardCounts.soldout}
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-5 border shadow-sm">
                  <div className="text-gray-500 font-bold text-sm">숨김</div>
                  <div className="text-4xl font-black mt-2">
                    {dashboardCounts.hidden}
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-5 border shadow-sm">
                  <div className="text-gray-500 font-bold text-sm">공구상품</div>
                  <div className="text-4xl font-black mt-2">
                    {dashboardCounts.groupBuy}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[2rem] p-6 border shadow-sm">
                <div className="font-black text-xl mb-4">빠른 작업</div>
                <div className="grid md:grid-cols-4 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMenu("broadcasts");
                    }}
                    className="p-5 rounded-3xl bg-rose-500 text-white font-black text-left active:scale-[0.98]"
                  >
                    방송관리 열기
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveMenu("products");
                      resetForm();
                    }}
                    className="p-5 rounded-3xl bg-gray-950 text-white font-black text-left active:scale-[0.98]"
                  >
                    + 공구상품 등록
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveMenu("products")}
                    className="p-5 rounded-3xl bg-white border font-black text-left active:scale-[0.98]"
                  >
                    상품목록 관리
                  </button>

                  <button
                    type="button"
                    onClick={loadAll}
                    className="p-5 rounded-3xl bg-white border font-black text-left active:scale-[0.98]"
                  >
                    새로고침
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeMenu === "products" && (
            <div className="grid gap-5">
              <div className="bg-white rounded-[2rem] p-6 border shadow-sm">
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                  <div>
                    <div className="text-sm font-black text-rose-500 mb-2">
                      PRODUCT MANAGER
                    </div>
                    <h1 className="text-3xl md:text-5xl font-black">
                      상품관리
                    </h1>
                    <p className="text-gray-500 font-bold mt-3">
                      공구상품 / 방송상품 등록, 재고, 배송유형, 합배송 설정
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-5 py-4 rounded-2xl bg-gray-950 text-white font-black active:scale-[0.98]"
                  >
                    + 새 상품 등록
                  </button>
                </div>
              </div>

              <section
                id="product-form"
                className="bg-white rounded-[2rem] p-5 md:p-6 border shadow-sm"
              >
                <div className="font-black text-2xl mb-5">
                  {editingId ? "상품 수정" : "상품 등록"}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-black mb-2">
                      상품명
                    </label>
                    <input
                      value={form.product_name}
                      onChange={(e) =>
                        setForm({ ...form, product_name: e.target.value })
                      }
                      placeholder="예) 뉴발1906 / 향수 / 메리제인"
                      className="w-full p-4 rounded-2xl bg-gray-50 border font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-black mb-2">
                      판매금액
                    </label>
                    <input
                      value={form.price ? Number(form.price).toLocaleString() : ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          price: Number(onlyNumber(e.target.value) || 0),
                        })
                      }
                      inputMode="numeric"
                      placeholder="0"
                      className="w-full p-4 rounded-2xl bg-gray-50 border font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-black mb-2">
                      재고수량
                    </label>
                    <input
                      value={String(form.stock || "")}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          stock: Number(onlyNumber(e.target.value) || 0),
                        })
                      }
                      inputMode="numeric"
                      placeholder="0"
                      className="w-full p-4 rounded-2xl bg-gray-50 border font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-black mb-2">
                      정렬순서
                    </label>
                    <input
                      value={String(form.sort_order || "")}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          sort_order: Number(onlyNumber(e.target.value) || 1),
                        })
                      }
                      inputMode="numeric"
                      placeholder="1"
                      className="w-full p-4 rounded-2xl bg-gray-50 border font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-black mb-2">
                      상품유형
                    </label>
                    <select
                      value={form.product_type}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          product_type: e.target.value as ProductType,
                        })
                      }
                      className="w-full p-4 rounded-2xl bg-gray-50 border font-bold"
                    >
                      <option value="공구상품">공구상품</option>
                      <option value="방송상품">방송상품</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-black mb-2">
                      상품상태
                    </label>
                    <select
                      value={form.status}
                      onChange={(e) =>
                        setForm({ ...form, status: e.target.value as ProductStatus })
                      }
                      className="w-full p-4 rounded-2xl bg-gray-50 border font-bold"
                    >
                      <option value="판매중">판매중</option>
                      <option value="품절">품절</option>
                      <option value="숨김">숨김</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-black mb-2">
                      배송유형
                    </label>
                    <select
                      value={form.shipping_type}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          shipping_type: e.target.value as ShippingType,
                        })
                      }
                      className="w-full p-4 rounded-2xl bg-gray-50 border font-bold"
                    >
                      <option value="일반">일반</option>
                      <option value="업체">업체</option>
                    </select>
                    <div className="text-xs text-gray-500 font-bold mt-2">
                      일반 = 방송상품 + 합배송 가능한 공구상품 / 업체 = 별도배송
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-black mb-2">
                      합배송 가능
                    </label>
                    <select
                      value={form.combine_shipping}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          combine_shipping: e.target.value as CombineShipping,
                        })
                      }
                      className="w-full p-4 rounded-2xl bg-gray-50 border font-bold"
                    >
                      <option value="Y">Y 가능</option>
                      <option value="N">N 불가</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-black mb-2">
                      사진보러가기 외부링크
                    </label>
                    <input
                      value={form.external_image_url}
                      onChange={(e) =>
                        setForm({ ...form, external_image_url: e.target.value })
                      }
                      placeholder="인포크 / 블로그 / 드라이브 / 밴드 링크"
                      className="w-full p-4 rounded-2xl bg-gray-50 border font-bold"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-black mb-2">
                      대표사진 URL 또는 업로드 후 주소
                    </label>
                    <input
                      value={form.image_url}
                      onChange={(e) =>
                        setForm({ ...form, image_url: e.target.value })
                      }
                      placeholder="초기에는 비워둬도 됨. 나중에 업로드 기능 연결 가능"
                      className="w-full p-4 rounded-2xl bg-gray-50 border font-bold"
                    />
                    <div className="text-xs text-gray-500 font-bold mt-2">
                      현재 1차는 URL 저장 구조입니다. 직접 업로드 버튼은 다음 단계에서 붙이면 됩니다.
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-black mb-2">
                      상품설명
                    </label>
                    <textarea
                      value={form.description}
                      onChange={(e) =>
                        setForm({ ...form, description: e.target.value })
                      }
                      placeholder="배송 안내 / 업체배송 / 합배송 불가 / 주 1~2회 출고 등"
                      className="w-full p-4 rounded-2xl bg-gray-50 border font-bold min-h-[120px]"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-3 mt-5">
                  <button
                    type="button"
                    onClick={saveProduct}
                    disabled={savingProduct}
                    className="p-5 rounded-2xl bg-gray-950 text-white font-black text-lg disabled:opacity-50 active:scale-[0.98]"
                  >
                    {savingProduct
                      ? "저장중..."
                      : editingId
                      ? "수정 저장"
                      : "상품 등록"}
                  </button>

                  <button
                    type="button"
                    onClick={resetForm}
                    className="p-5 rounded-2xl bg-gray-100 text-gray-900 font-black text-lg active:scale-[0.98]"
                  >
                    입력 초기화
                  </button>
                </div>
              </section>

              <section className="bg-white rounded-[2rem] p-5 md:p-6 border shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-5">
                  <div>
                    <div className="font-black text-2xl">상품목록</div>
                    <div className="text-gray-500 font-bold mt-1">
                      체크 후 일괄 설정 가능
                    </div>
                  </div>

                  <div className="grid md:grid-cols-3 gap-2">
                    <input
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="상품 검색"
                      className="p-3 rounded-2xl bg-gray-50 border font-bold"
                    />

                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value as any)}
                      className="p-3 rounded-2xl bg-gray-50 border font-bold"
                    >
                      <option value="전체">전체유형</option>
                      <option value="공구상품">공구상품</option>
                      <option value="방송상품">방송상품</option>
                    </select>

                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as any)}
                      className="p-3 rounded-2xl bg-gray-50 border font-bold"
                    >
                      <option value="전체">전체상태</option>
                      <option value="판매중">판매중</option>
                      <option value="품절">품절</option>
                      <option value="숨김">숨김</option>
                    </select>
                  </div>
                </div>

                <div className="bg-rose-50 border border-rose-100 rounded-3xl p-4 mb-5">
                  <div className="font-black mb-3">
                    선택상품 일괄설정 ({selectedIds.length}개 선택)
                  </div>

                  <div className="grid md:grid-cols-3 gap-3">
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <select
                        value={bulkShippingType}
                        onChange={(e) =>
                          setBulkShippingType(e.target.value as ShippingType)
                        }
                        className="p-3 rounded-2xl bg-white border font-bold"
                      >
                        <option value="일반">일반</option>
                        <option value="업체">업체</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => applyBulkUpdate("shipping")}
                        className="px-4 rounded-2xl bg-gray-950 text-white font-black"
                      >
                        배송변경
                      </button>
                    </div>

                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <select
                        value={bulkCombineShipping}
                        onChange={(e) =>
                          setBulkCombineShipping(e.target.value as CombineShipping)
                        }
                        className="p-3 rounded-2xl bg-white border font-bold"
                      >
                        <option value="Y">합배송 가능</option>
                        <option value="N">합배송 불가</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => applyBulkUpdate("combine")}
                        className="px-4 rounded-2xl bg-gray-950 text-white font-black"
                      >
                        합배송변경
                      </button>
                    </div>

                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <select
                        value={bulkStatus}
                        onChange={(e) =>
                          setBulkStatus(e.target.value as ProductStatus)
                        }
                        className="p-3 rounded-2xl bg-white border font-bold"
                      >
                        <option value="판매중">판매중</option>
                        <option value="품절">품절</option>
                        <option value="숨김">숨김</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => applyBulkUpdate("status")}
                        className="px-4 rounded-2xl bg-gray-950 text-white font-black"
                      >
                        상태변경
                      </button>
                    </div>
                  </div>

                  {selectedIds.length > 0 && (
                    <button
                      type="button"
                      onClick={clearSelected}
                      className="mt-3 text-sm font-black text-gray-500"
                    >
                      선택 해제
                    </button>
                  )}
                </div>

                {loadingProducts ? (
                  <div className="p-10 text-center font-black text-gray-500">
                    상품 불러오는 중...
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="p-10 text-center font-black text-gray-500">
                    등록된 상품이 없습니다.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {filteredProducts.map((product) => (
                      <div
                        key={product.id}
                        className="rounded-3xl border bg-white p-4 shadow-sm"
                      >
                        <div className="grid lg:grid-cols-[auto_1fr_auto] gap-4 lg:items-center">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={product.id !== undefined && selectedIds.includes(product.id)}
                              onChange={() => toggleSelect(product.id)}
                              className="w-5 h-5"
                            />

                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.product_name}
                                className="w-20 h-20 rounded-2xl object-cover bg-gray-100"
                              />
                            ) : (
                              <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center text-2xl">
                                🛍
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className="px-3 py-1 rounded-full bg-gray-950 text-white text-xs font-black">
                                {product.product_type || "공구상품"}
                              </span>

                              <span
                                className={`px-3 py-1 rounded-full text-xs font-black ${
                                  product.status === "판매중"
                                    ? "bg-blue-100 text-blue-700"
                                    : product.status === "품절"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-gray-100 text-gray-500"
                                }`}
                              >
                                {product.status || "판매중"}
                              </span>

                              <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-600 text-xs font-black">
                                {product.shipping_type || "일반"}배송
                              </span>

                              <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-black">
                                합배송 {product.combine_shipping === "N" ? "불가" : "가능"}
                              </span>
                            </div>

                            <div className="text-xl font-black">
                              {product.product_name}
                            </div>

                            <div className="text-gray-500 font-bold mt-1">
                              {money(product.price)} · 재고 {product.stock || 0}개 ·
                              순서 {product.sort_order || 1}
                            </div>

                            {product.description && (
                              <div className="text-sm text-gray-500 mt-2 line-clamp-2">
                                {product.description}
                              </div>
                            )}

                            {product.external_image_url && (
                              <a
                                href={product.external_image_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex mt-3 text-sm font-black text-rose-500"
                              >
                                사진보러가기 링크 확인 →
                              </a>
                            )}
                          </div>

                          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(product)}
                              className="px-4 py-3 rounded-2xl bg-gray-950 text-white font-black active:scale-[0.98]"
                            >
                              수정
                            </button>

                            <button
                              type="button"
                              onClick={() => cloneProduct(product)}
                              className="px-4 py-3 rounded-2xl bg-rose-500 text-white font-black active:scale-[0.98]"
                            >
                              복제
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                quickUpdateProduct(product.id, {
                                  status:
                                    product.status === "숨김" ? "판매중" : "숨김",
                                })
                              }
                              className="px-4 py-3 rounded-2xl bg-gray-100 text-gray-900 font-black active:scale-[0.98]"
                            >
                              {product.status === "숨김" ? "판매중" : "숨김"}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                quickUpdateProduct(product.id, {
                                  status:
                                    product.status === "품절" ? "판매중" : "품절",
                                })
                              }
                              className="px-4 py-3 rounded-2xl bg-red-50 text-red-600 font-black active:scale-[0.98]"
                            >
                              {product.status === "품절" ? "품절해제" : "품절"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeMenu === "broadcasts" && (
            <div className="grid gap-5">
              <section className="bg-white rounded-[2rem] p-6 border shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                  <div>
                    <div className="text-sm font-black text-rose-500 mb-2">
                      BROADCAST MANAGER
                    </div>
                    <h1 className="text-3xl md:text-5xl font-black">
                      방송관리
                    </h1>
                    <p className="text-gray-500 font-bold mt-3">
                      방송 ON/OFF, 오늘 방송상품 선택, 배송비/카드수수료 설정
                    </p>
                  </div>

                  <div
                    className={`px-5 py-4 rounded-2xl font-black ${
                      activeBroadcast
                        ? "bg-red-50 text-red-600"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    현재 방송 {activeBroadcast ? "ON" : "OFF"}
                  </div>
                </div>
              </section>

              <section className="bg-white rounded-[2rem] p-5 md:p-6 border shadow-sm">
                <div className="font-black text-2xl mb-5">
                  {activeBroadcast ? "현재 방송 설정" : "새 방송 시작"}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-black mb-2">
                      방송 제목
                    </label>
                    <input
                      value={broadcastTitle}
                      onChange={(e) => setBroadcastTitle(e.target.value)}
                      placeholder="예) 5월 17일 루루동이 LIVE"
                      className="w-full p-4 rounded-2xl bg-gray-50 border font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-black mb-2">
                      관리자 메모 / 부제
                    </label>
                    <input
                      value={broadcastSubtitle}
                      onChange={(e) => setBroadcastSubtitle(e.target.value)}
                      placeholder="예) 뉴발 / 향수 / 공구"
                      className="w-full p-4 rounded-2xl bg-gray-50 border font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-black mb-2">
                      기본 배송비
                    </label>
                    <input
                      value={Number(broadcastShippingFee || 0).toLocaleString()}
                      onChange={(e) =>
                        setBroadcastShippingFee(
                          Number(onlyNumber(e.target.value) || 0)
                        )
                      }
                      inputMode="numeric"
                      className="w-full p-4 rounded-2xl bg-gray-50 border font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-black mb-2">
                      카드결제 수수료 %
                    </label>
                    <input
                      value={String(broadcastCardFeeRate || "")}
                      onChange={(e) =>
                        setBroadcastCardFeeRate(
                          Number(onlyNumber(e.target.value) || 0)
                        )
                      }
                      inputMode="numeric"
                      className="w-full p-4 rounded-2xl bg-gray-50 border font-bold"
                    />
                  </div>

                  <label className="md:col-span-2 flex items-center gap-3 p-4 rounded-2xl bg-rose-50 border border-rose-100 font-black">
                    <input
                      type="checkbox"
                      checked={isCombineShippingTarget}
                      onChange={(e) => setIsCombineShippingTarget(e.target.checked)}
                      className="w-5 h-5"
                    />
                    이 방송을 합배송 기준 방송으로 사용
                  </label>
                </div>
              </section>

              <section className="bg-white rounded-[2rem] p-5 md:p-6 border shadow-sm">
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-5">
                  <div>
                    <div className="font-black text-2xl">
                      오늘 방송상품 선택
                    </div>
                    <div className="text-gray-500 font-bold mt-1">
                      체크한 상품만 오늘 방송상품으로 연결됩니다.
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-black text-rose-500">
                      {selectedBroadcastProductIds.length}개 선택
                    </div>

                    <button
                      type="button"
                      onClick={selectAllBroadcastProducts}
                      className="rounded-xl bg-gray-950 px-3 py-2 text-xs font-black text-white active:scale-[0.98]"
                    >
                      전체선택
                    </button>

                    <button
                      type="button"
                      onClick={clearBroadcastProducts}
                      className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-black text-gray-700 active:scale-[0.98]"
                    >
                      전체해제
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowOnlyLinkedProducts((prev) => !prev)}
                      className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-600 active:scale-[0.98]"
                    >
                      {showOnlyLinkedProducts ? "전체상품 보기" : "연결상품만 보기"}
                    </button>
                  </div>
                </div>

                {selectedBroadcastProducts.length > 0 && (
                  <div className="mb-4 rounded-3xl bg-blue-50 p-4">
                    <div className="mb-2 text-sm font-black text-blue-700">
                      현재 이 방송에 연결된 상품
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {selectedBroadcastProducts.map((product) => (
                        <button
                          key={String(product.id)}
                          type="button"
                          onClick={() => toggleBroadcastProduct(product.id)}
                          className="rounded-full bg-white px-3 py-2 text-xs font-black text-blue-700 shadow-sm active:scale-[0.98]"
                        >
                          {product.product_name} ×
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {broadcastSelectableProducts.length === 0 ? (
                  <div className="p-8 rounded-3xl bg-gray-50 text-center font-black text-gray-500">
                    먼저 상품관리에서 상품을 등록해주세요.
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {visibleBroadcastSelectableProducts.map((product) => (
                      <label
                        key={product.id}
                        className={`p-4 rounded-3xl border cursor-pointer active:scale-[0.98] ${
                          product.id !== undefined && selectedBroadcastProductIds.includes(product.id)
                            ? "bg-gray-950 text-white border-gray-950"
                            : "bg-white hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={product.id !== undefined && selectedBroadcastProductIds.includes(product.id)}
                            onChange={() => toggleBroadcastProduct(product.id)}
                            className="w-5 h-5 mt-1"
                          />

                          <div>
                            <div className="font-black text-lg">
                              {product.product_name}
                            </div>
                            <div
                              className={`text-sm font-bold mt-1 ${
                                product.id !== undefined && selectedBroadcastProductIds.includes(product.id)
                                  ? "text-gray-200"
                                  : "text-gray-500"
                              }`}
                            >
                              {money(product.price)} · 재고 {product.stock || 0}개
                            </div>
                            <div className="text-xs font-black mt-2">
                              {product.product_type} · {product.shipping_type}배송 ·
                              합배송{" "}
                              {product.combine_shipping === "N" ? "불가" : "가능"}
                            </div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                <div className="grid md:grid-cols-3 gap-3 mt-5">
                  {activeBroadcast ? (
                    <>
                      <button
                        type="button"
                        onClick={saveActiveBroadcast}
                        disabled={savingBroadcast}
                        className="p-5 rounded-2xl bg-gray-950 text-white font-black disabled:opacity-50 active:scale-[0.98]"
                      >
                        {savingBroadcast ? "저장중..." : "방송 설정 저장"}
                      </button>

                      <button
                        type="button"
                        onClick={endBroadcast}
                        disabled={savingBroadcast}
                        className="p-5 rounded-2xl bg-red-500 text-white font-black disabled:opacity-50 active:scale-[0.98]"
                      >
                        방송 종료
                      </button>

                      <button
                        type="button"
                        onClick={loadBroadcasts}
                        className="p-5 rounded-2xl bg-gray-100 text-gray-900 font-black active:scale-[0.98]"
                      >
                        새로고침
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={startBroadcast}
                        disabled={savingBroadcast}
                        className="md:col-span-2 p-5 rounded-2xl bg-rose-500 text-white font-black disabled:opacity-50 active:scale-[0.98]"
                      >
                        {savingBroadcast ? "시작중..." : "방송 시작"}
                      </button>

                      <button
                        type="button"
                        onClick={loadBroadcasts}
                        className="p-5 rounded-2xl bg-gray-100 text-gray-900 font-black active:scale-[0.98]"
                      >
                        새로고침
                      </button>
                    </>
                  )}
                </div>
              </section>

              <section className="bg-white rounded-[2rem] p-5 md:p-6 border shadow-sm">
                <div className="font-black text-2xl mb-5">최근 방송기록</div>

                {loadingBroadcasts ? (
                  <div className="p-8 text-center font-black text-gray-500">
                    방송 목록 불러오는 중...
                  </div>
                ) : broadcasts.length === 0 ? (
                  <div className="p-8 text-center font-black text-gray-500">
                    방송 기록이 없습니다.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {broadcasts.map((broadcast) => (
                      <div
                        key={broadcast.id}
                        className="p-4 rounded-3xl border bg-white flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-black ${
                                broadcast.status === "ON"
                                  ? "bg-red-50 text-red-600"
                                  : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {broadcast.status}
                            </span>

                            {broadcast.is_combine_shipping_target && (
                              <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-600">
                                합배송기준
                              </span>
                            )}
                          </div>

                          <div className="font-black text-lg">
                            {broadcast.public_title || "방송명 없음"}
                          </div>

                          <div className="text-sm text-gray-500 font-bold mt-1">
                            {broadcast.admin_subtitle || "관리자 메모 없음"}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-sm text-gray-500 font-bold">
                            배송비 {money(broadcast.shipping_fee || 0)}
                            <br />
                            카드수수료 {broadcast.card_fee_rate || 0}%
                          </div>

                          <button
                            type="button"
                            onClick={() => hideBroadcast(broadcast.id)}
                            className="rounded-2xl bg-gray-100 px-4 py-3 text-sm font-black text-gray-600 active:scale-[0.98]"
                          >
                            숨김
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeMenu === "orders" && (
            <div className="grid gap-5">
<section className="bg-white rounded-[2rem] p-5 md:p-6 border shadow-sm">
                <div className="grid md:grid-cols-[1fr_auto_auto_auto_auto_auto] gap-3">
                  <input
                    value={orderKeyword}
                    onChange={(event) => setOrderKeyword(event.target.value)}
                    placeholder="닉네임 / 이름 / 전화번호 / 상품명 검색"
                    className="rounded-2xl border bg-gray-50 p-4 font-bold"
                  />

                  <select
                    value={paymentFilter}
                    onChange={(event) => setPaymentFilter(event.target.value as any)}
                    className="rounded-2xl border bg-gray-50 p-4 font-bold"
                  >
                    <option value="전체">전체 결제</option>
                    <option value="무통장입금">무통장입금</option>
                    <option value="카드결제">카드결제</option>
                  </select>

                      <select
                        value={orderPageSize}
                        onChange={(event) => {
                          setOrderPageSize(Number(event.target.value));
                          setOrderPage(1);
                        }}
                        className="rounded-2xl border bg-gray-50 p-4 font-bold"
                      >
                        <option value={10}>10개씩 보기</option>
                        <option value={20}>20개씩 보기</option>
                        <option value={50}>50개씩 보기</option>
                      </select>

                  <button
                    type="button"
                    onClick={() =>
                      setSelectedOrderGroupIds(orderGroups.map((group) => group.groupId))
                    }
                    className="rounded-2xl bg-gray-100 px-5 py-4 font-black text-gray-700 active:scale-[0.98]"
                  >
                    전체선택
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedOrderGroupIds([])}
                    className="rounded-2xl bg-gray-100 px-5 py-4 font-black text-gray-700 active:scale-[0.98]"
                  >
                    선택해제
                  </button>

                  <button
                    type="button"
                    onClick={hideSelectedOrders}
                    className="rounded-2xl bg-red-50 px-5 py-4 font-black text-red-600 active:scale-[0.98]"
                  >
                    선택숨김
                  </button>

                  <button
                    type="button"
                    onClick={exportRozenWaybill}
                    className="rounded-2xl bg-rose-500 px-5 py-4 font-black text-white active:scale-[0.98]"
                  >
                    로젠 엑셀
                  </button>
                </div>

                <div className="mt-3 text-sm font-black text-gray-500">
                  총 {orderGroups.length}건 / {orderPage}페이지 / 선택 {selectedOrderGroupIds.length}건
                </div>
              </section>

              <section className="bg-white rounded-[2rem] p-4 md:p-5 border shadow-sm">
                {loadingOrders ? (
                  <div className="p-10 text-center font-black text-gray-500">
                    주문 불러오는 중...
                  </div>
                ) : paginatedOrderGroups.length === 0 ? (
                  <div className="p-10 text-center font-black text-gray-500">
                    주문이 없습니다.
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {paginatedOrderGroups.map((group) => {
                      const first = group.first;
                      const statusValue = orderStatusValue(first);
                      const canceled = statusValue === "주문취소" || isCanceledOrder(first);
                      const orderCode =
                        first.order_lookup_code ||
                        first.order_group_id ||
                        String(first.id || "").slice(0, 8);

                      return (
                        <div
                          key={group.groupId}
                          className={`rounded-2xl border px-3 py-3 shadow-sm ${
                            canceled
                              ? "border-red-200 bg-red-50/80 opacity-80"
                              : "bg-white"
                          }`}
                        >
                          <div className="grid grid-cols-[auto_110px_1fr_150px_auto] items-center gap-3">
                            <input
                              type="checkbox"
                              checked={selectedOrderGroupIds.includes(group.groupId)}
                              onChange={() => toggleOrderGroup(group.groupId)}
                              className="h-5 w-5"
                            />

                            <button
                              type="button"
                              onClick={() => setSelectedOrderDetailGroupId(group.groupId)}
                              className="rounded-xl bg-gray-950 px-3 py-2 text-xs font-black text-white active:scale-[0.98]"
                            >
                              {orderCode || "상세보기"}
                            </button>

                            <button
                              type="button"
                              onClick={() => setSelectedOrderDetailGroupId(group.groupId)}
                              className="min-w-0 text-left active:scale-[0.99]"
                            >
                              <div
                                className={`truncate text-base font-black ${
                                  canceled ? "text-red-700 line-through decoration-2" : ""
                                }`}
                              >
                                {first.youtube_nickname || "닉네임없음"} / {" "}
                                {first.customer_name || "이름없음"} / {" "}
                                {first.customer_phone || "전화번호없음"}
                              </div>

                              <div
                                className={`mt-1 truncate text-xs font-bold ${
                                  canceled ? "text-red-500 line-through" : "text-gray-500"
                                }`}
                              >
                                {group.rows.map((row) => orderItemLabel(row)).join(" / ")}
                              </div>
                            </button>

                            <select
                              value={statusValue}
                              onChange={(event) =>
                                updateOrderGroupStatus(group.groupId, event.target.value)
                              }
                              className={`rounded-2xl border px-4 py-3 font-black outline-none transition ${orderSelectStatusStyle(orderStatusValue(group.first))}`}
                            >
                              <option value="미설정">미설정</option>
                              <option value="입금확인">입금확인</option>
                              <option value="포장전">포장전</option>
                              <option value="출고완료">출고완료</option>
                              <option value="킵">킵</option>
                              <option value="주문취소">주문취소</option>
                            </select>

                            <div className="text-right">
                              <div className="text-xs font-black text-gray-500">
                                {first.payment_method || "결제없음"} · {group.totalQty}개
                              </div>
                              <div className="text-base font-black text-rose-500">
                                {money(group.totalAmount)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {orderGroups.length > 0 && (
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    aria-label="주문 페이지 이전"
                    onClick={() => setOrderPage((prev) => Math.max(1, prev - 1))}
                    disabled={orderPage <= 1}
                    className="rounded-2xl border bg-white px-4 py-3 text-sm font-black disabled:opacity-30"
                  >
                    이전
                  </button>

                  {orderPage > 3 && (
                    <button
                      type="button"
                      onClick={() => setOrderPage(1)}
                      className="rounded-2xl border bg-white px-4 py-3 text-sm font-black"
                    >
                      1
                    </button>
                  )}

                  {orderPage > 4 && <span className="px-2 font-black text-gray-400">...</span>}

                  {orderPageNumbers.map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setOrderPage(page)}
                      className={`rounded-2xl px-4 py-3 text-sm font-black ${
                        page === orderPage
                          ? "bg-gray-950 text-white"
                          : "border bg-white text-gray-700"
                      }`}
                    >
                      {page}
                    </button>
                  ))}

                  {orderPage < totalOrderPages - 3 && <span className="px-2 font-black text-gray-400">...</span>}

                  {orderPage < totalOrderPages - 2 && (
                    <button
                      type="button"
                      onClick={() => setOrderPage(totalOrderPages)}
                      className="rounded-2xl border bg-white px-4 py-3 text-sm font-black"
                    >
                      {totalOrderPages}
                    </button>
                  )}

                  <button
                    type="button"
                    aria-label="주문 페이지 다음"
                    onClick={() => setOrderPage((prev) => Math.min(totalOrderPages, prev + 1))}
                    disabled={orderPage >= totalOrderPages}
                    className="rounded-2xl border bg-white px-4 py-3 text-sm font-black disabled:opacity-30"
                  >
                    다음
                  </button>
                </div>
              )}

              {selectedOrderDetail && (
                <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4">
                  <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-[2rem] bg-white p-6 shadow-2xl">
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-black text-rose-500">
                          주문 상세내역
                        </div>
                        <h2 className="mt-1 text-3xl font-black">
                          {selectedOrderDetail.first.order_lookup_code ||
                            selectedOrderDetail.first.order_group_id ||
                            selectedOrderDetail.groupId}
                        </h2>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedOrderDetailGroupId(null)}
                        className="rounded-2xl bg-gray-100 px-4 py-3 font-black text-gray-700 active:scale-[0.98]"
                      >
                        닫기
                      </button>
                    </div>

                    <div className="grid md:grid-cols-2 gap-3">
                      <InfoBox label="주문시간" value={selectedOrderDetail.first.created_at || "-"} />
                      <InfoBox label="결제방식" value={selectedOrderDetail.first.payment_method || "-"} />
                      <InfoBox label="유튜브 닉네임" value={selectedOrderDetail.first.youtube_nickname || "-"} />
                      <InfoBox label="주문자명" value={selectedOrderDetail.first.customer_name || "-"} />
                      <InfoBox label="전화번호" value={selectedOrderDetail.first.customer_phone || "-"} />
                      <InfoBox label="주소" value={fullAddress(selectedOrderDetail.first) || "-"} />
                    </div>

                    <div className="mt-5 rounded-3xl bg-gray-50 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="text-lg font-black">상품/금액 수정</div>
                        <button
                          type="button"
                          onClick={saveOrderMoneyEdits}
                          className="rounded-2xl bg-gray-950 px-4 py-3 text-sm font-black text-white active:scale-[0.98]"
                        >
                          금액 수정 저장
                        </button>
                      </div>

                      <div className="grid gap-2">
                        {selectedOrderDetail.rows.map((row) => (
                          <div
                            key={String(row.id)}
                            className="rounded-2xl bg-white p-3"
                          >
                            <div className="font-black">{orderItemLabel(row)}</div>

                            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                              <label className="text-xs font-black text-gray-500">
                                상품금액
                                <input
                                  value={String(row.product_price || "")}
                                  onChange={(event) =>
                                    updateOrderLocalField(
                                      row.id,
                                      "product_price",
                                      Number(onlyNumber(event.target.value) || 0)
                                    )
                                  }
                                  inputMode="numeric"
                                  className="mt-1 w-full rounded-xl border bg-gray-50 p-3 font-black text-gray-900"
                                />
                              </label>

                              <label className="text-xs font-black text-gray-500">
                                배송비
                                <input
                                  value={String(row.shipping_fee ?? row.admin_shipping_fee ?? row.adjusted_shipping_fee ?? 0)}
                                  onChange={(event) =>
                                    updateOrderLocalField(
                                      row.id,
                                      "shipping_fee",
                                      Number(onlyNumber(event.target.value) || 0)
                                    )
                                  }
                                  inputMode="numeric"
                                  className="mt-1 w-full rounded-xl border bg-gray-50 p-3 font-black text-gray-900"
                                />
                              </label>

                              <InfoBox label="수량" value={`${row.qty || 1}개`} />
                              <InfoBox
                                label="예상합계"
                                value={money(calculateOrderRowTotal(row))}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5 grid md:grid-cols-2 gap-3">
                      <InfoBox
                        label="배송메모"
                        value={selectedOrderDetail.first.request_memo || "-"}
                      />
                      <InfoBox
                        label="특이사항"
                        value={
                          selectedOrderDetail.first.special_note ||
                          selectedOrderDetail.first.memo ||
                          "-"
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeMenu === "deposits" && (
            <div className="mx-auto grid max-w-[1280px] gap-5">
              <section className="bg-white rounded-[2rem] p-6 border shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                  <div>
                    <div className="text-sm font-black text-rose-500 mb-2">
                      DEPOSIT REVIEW CENTER
                    </div>
                    <h1 className="text-3xl md:text-5xl font-black">
                      입금매칭센터
                    </h1>
                    <p className="text-gray-500 font-bold mt-3">
                      왼쪽은 사이트 주문, 오른쪽은 복붙 입금내역으로 나란히 비교합니다.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={loadOrders}
                    className="rounded-2xl bg-gray-950 px-5 py-4 font-black text-white active:scale-[0.98]"
                  >
                    주문 새로고침
                  </button>
                </div>
              </section>

              <section className="grid xl:grid-cols-[380px_1fr] gap-5">
                <div className="bg-white rounded-[2rem] p-5 md:p-6 border shadow-sm">
                  <div className="font-black text-2xl mb-3">입금내역 붙여넣기</div>
                  <p className="text-sm font-bold text-gray-500 mb-4">
                    4줄 1세트: 미매칭 / 입금자명 / +금액원 / 시간
                  </p>

                  <textarea
                    value={depositRawText}
                    onChange={(event) => setDepositRawText(event.target.value)}
                    placeholder={`미매칭
이순신
+62,000원
21:09

미매칭
옥수수밭유민영
+29,000원
21:26`}
                    className="min-h-[330px] w-full rounded-3xl border bg-gray-50 p-4 font-bold outline-none focus:border-rose-300"
                  />

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDepositRawText("")}
                      className="rounded-2xl bg-gray-100 p-4 font-black text-gray-700 active:scale-[0.98]"
                    >
                      비우기
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        saveConfirmedDepositReviewKeys([]);
                        alert("확인완료 표시를 초기화했습니다.");
                      }}
                      className="rounded-2xl bg-red-50 p-4 font-black text-red-600 active:scale-[0.98]"
                    >
                      확인초기화
                    </button>
                  </div>

                  <div className="mt-5 rounded-3xl bg-rose-50 p-4">
                    <div className="text-sm font-black text-rose-600">복붙 정리 결과</div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm font-black text-gray-700">
                      <div>입금 {depositEntries.length}건</div>
                      <div>{money(depositTotalSummary.totalDepositAmount)}</div>
                    </div>
                  </div>

                  <div className="mt-5 max-h-[280px] overflow-auto rounded-3xl border bg-white">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-950 text-white">
                        <tr>
                          <th className="px-3 py-2 text-left">입금자명</th>
                          <th className="px-3 py-2 text-right">금액</th>
                          <th className="px-3 py-2 text-left">시간</th>
                        </tr>
                      </thead>
                      <tbody>
                        {depositEntries.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-3 py-8 text-center font-black text-gray-400">
                              붙여넣은 입금내역 없음
                            </td>
                          </tr>
                        ) : (
                          depositEntries.map((entry) => (
                            <tr key={entry.id} className="border-b">
                              <td className="px-3 py-2 font-black">{entry.depositor}</td>
                              <td className="px-3 py-2 text-right font-black text-rose-500">{money(entry.amount)}</td>
                              <td className="px-3 py-2 font-bold text-gray-500">{entry.time || "-"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid gap-5 min-w-0">
                  <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                    <div className="rounded-3xl border bg-white p-5 shadow-sm">
                      <div className="text-sm font-black text-gray-400">총 입금</div>
                      <div className="mt-2 text-2xl font-black">{money(depositTotalSummary.totalDepositAmount)}</div>
                    </div>
                    <div className="rounded-3xl border bg-white p-5 shadow-sm">
                      <div className="text-sm font-black text-gray-400">확인/일치</div>
                      <div className="mt-2 text-2xl font-black text-green-600">{money(depositTotalSummary.matchedDepositAmount)}</div>
                    </div>
                    <div className="rounded-3xl border bg-white p-5 shadow-sm">
                      <div className="text-sm font-black text-gray-400">확인필요</div>
                      <div className="mt-2 text-2xl font-black text-yellow-600">{money(depositTotalSummary.needCheckDepositAmount)}</div>
                    </div>
                    <div className="rounded-3xl border bg-white p-5 shadow-sm">
                      <div className="text-sm font-black text-gray-400">미입금</div>
                      <div className="mt-2 text-2xl font-black text-red-600">{money(depositTotalSummary.unpaidAmount)}</div>
                    </div>
                  </section>

                  <section className="bg-white rounded-[2rem] p-5 border shadow-sm">
                    <div className="grid md:grid-cols-[1fr_auto_auto] gap-3">
                      <input
                        value={depositKeyword}
                        onChange={(event) => setDepositKeyword(event.target.value)}
                        placeholder="닉네임 / 이름 / 입금자명 / 상품 검색"
                        className="rounded-2xl border bg-gray-50 p-4 font-bold"
                      />

                      <select
                        value={depositStatusFilter}
                        onChange={(event) => setDepositStatusFilter(event.target.value as any)}
                        className="rounded-2xl border bg-gray-50 p-4 font-bold"
                      >
                        <option value="전체">전체</option>
                        <option value="완전일치">완전일치</option>
                        <option value="합산일치">합산일치</option>
                        <option value="확인필요">확인필요</option>
                        <option value="부분입금">부분입금</option>
                        <option value="초과입금">초과입금</option>
                        <option value="미입금">미입금</option>
                        <option value="주문없음">주문없음</option>
                        <option value="확인완료">확인완료</option>
                      </select>

                      <div className="rounded-2xl bg-gray-950 px-5 py-4 text-center font-black text-white">
                        {filteredDepositReviewGroups.length}명
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[2rem] border bg-white shadow-sm">
                    <div className="max-h-[760px] overflow-auto p-4">
                      <div className="grid gap-3">
                        {filteredDepositReviewGroups.length === 0 ? (
                          <div className="p-10 text-center font-black text-gray-500">
                            표시할 내역이 없습니다.
                          </div>
                        ) : (
                          filteredDepositReviewGroups.map((group) => {
                            const checked = confirmedDepositReviewKeys.includes(group.reviewKey);
                            const ok = group.difference === 0 && group.deposits.length > 0;

                            return (
                              <div
                                key={group.reviewKey}
                                className={`rounded-3xl border p-4 ${
                                  checked
                                    ? "border-green-300 bg-green-50"
                                    : group.status === "미입금"
                                    ? "border-gray-200 bg-white"
                                    : group.status === "주문없음"
                                    ? "border-pink-200 bg-pink-50"
                                    : ok
                                    ? "border-green-200 bg-green-50/50"
                                    : "border-yellow-200 bg-yellow-50/70"
                                }`}
                              >
                                <div className="grid gap-3 xl:grid-cols-[180px_1fr_1fr_150px] xl:items-stretch">
                                  <div className="rounded-2xl bg-white/80 p-4">
                                    <div className="text-xs font-black text-gray-400">사이트 고객</div>
                                    <div className="mt-2 text-lg font-black">
                                      {group.nickname}
                                    </div>
                                    <div className="text-sm font-bold text-gray-600">
                                      {group.customerName}
                                    </div>
                                    <div className="mt-3">
                                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${depositStatusStyle(group.status)}`}>
                                        {checked ? "확인완료" : group.status}
                                      </span>
                                    </div>
                                    <div className="mt-3 text-xs font-bold text-gray-500">
                                      {group.memo}
                                    </div>
                                  </div>

                                  <div className="rounded-2xl bg-white p-4 border">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="font-black">사이트 주문</div>
                                      <div className="text-xl font-black text-gray-950">{money(group.siteTotal)}</div>
                                    </div>
                                    <div className="mt-3 grid gap-2">
                                      {group.orders.length === 0 ? (
                                        <div className="rounded-2xl bg-gray-50 p-3 text-center font-black text-gray-400">
                                          사이트 주문 없음
                                        </div>
                                      ) : (
                                        group.orders.map((order) => (
                                          <div key={order.groupId} className="rounded-2xl bg-gray-50 p-3">
                                            <div className="flex items-center justify-between gap-3">
                                              <div className="truncate text-sm font-bold text-gray-600">{order.itemText}</div>
                                              <div className="shrink-0 font-black">{money(order.orderAmount)}</div>
                                            </div>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  </div>

                                  <div className="rounded-2xl bg-white p-4 border">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="font-black">복붙 입금</div>
                                      <div className="text-xl font-black text-rose-500">{money(group.depositTotal)}</div>
                                    </div>
                                    <div className="mt-3 grid gap-2">
                                      {group.deposits.length === 0 ? (
                                        <div className="rounded-2xl bg-gray-50 p-3 text-center font-black text-gray-400">
                                          입금 후보 없음
                                        </div>
                                      ) : (
                                        group.deposits.map((entry) => (
                                          <div key={entry.id} className="rounded-2xl bg-gray-50 p-3">
                                            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                                              <div>
                                                <div className="font-black">{entry.depositor}</div>
                                                <div className="text-xs font-bold text-gray-400">
                                                  {entry.matchReason || "후보"}
                                                </div>
                                              </div>
                                              <div className="font-black text-rose-500">{money(entry.amount)}</div>
                                              <div className="text-sm font-bold text-gray-500">{entry.time || "-"}</div>
                                            </div>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  </div>

                                  <div className="rounded-2xl bg-white/80 p-4 grid content-between gap-3">
                                    <div>
                                      <div className="text-xs font-black text-gray-400">차액</div>
                                      <div className={`mt-1 text-2xl font-black ${
                                        group.difference === 0 ? "text-green-600" : "text-red-600"
                                      }`}>
                                        {money(group.difference)}
                                      </div>
                                    </div>

                                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gray-950 px-4 py-3 font-black text-white active:scale-[0.98]">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(event) => {
                                          if (event.target.checked) {
                                            confirmDepositReviewGroup(group);
                                          } else {
                                            undoDepositReviewGroup(group);
                                          }
                                        }}
                                        className="h-5 w-5"
                                      />
                                      확인완료
                                    </label>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              </section>
            </div>
          )}

          {activeMenu === "customers" && (
            <div className="grid gap-5">
              <section className="bg-white rounded-[2rem] p-6 border shadow-sm">
                <div>
                  <div className="text-sm font-black text-rose-500 mb-2">
                    CUSTOMER MANAGER
                  </div>
                  <h1 className="text-3xl md:text-5xl font-black">
                    고객관리
                  </h1>
                  <p className="text-gray-500 font-bold mt-3">
                    회원별 총 구매금액 / 취소횟수 / 차단 관리
                  </p>
                </div>
              </section>

              <section className="bg-white rounded-[2rem] p-5 border shadow-sm">
                <div className="grid md:grid-cols-[1fr_auto_auto] gap-3">
                  <input
                    value={customerKeyword}
                    onChange={(event) => setCustomerKeyword(event.target.value)}
                    placeholder="닉네임 / 이름 / 전화번호 / 주소 검색"
                    className="w-full rounded-2xl border bg-gray-50 p-4 font-bold"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setSelectedCustomerKeys(customerRows.map((customer) => customer.key))
                    }
                    className="rounded-2xl bg-gray-100 px-5 py-4 font-black text-gray-700 active:scale-[0.98]"
                  >
                    전체선택
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedCustomerKeys([])}
                    className="rounded-2xl bg-gray-100 px-5 py-4 font-black text-gray-700 active:scale-[0.98]"
                  >
                    선택해제
                  </button>
                </div>
              </section>

              <section className="bg-white rounded-[2rem] p-5 border shadow-sm">
                {customerRows.length === 0 ? (
                  <div className="p-10 text-center font-black text-gray-500">
                    고객 데이터가 없습니다.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {customerRows.map((customer) => (
                      <div
                        key={customer.key}
                        className="rounded-3xl border bg-white p-4 shadow-sm"
                      >
                        <div className="grid md:grid-cols-[auto_1fr_auto_auto] gap-3 items-center">
                          <input
                            type="checkbox"
                            checked={selectedCustomerKeys.includes(customer.key)}
                            onChange={() => toggleCustomerSelect(customer.key)}
                            className="h-5 w-5"
                          />

                          <button
                            type="button"
                            onClick={() => setSelectedCustomerDetailKey(customer.key)}
                            className="min-w-0 text-left active:scale-[0.99]"
                          >
                            <div className="truncate text-xl font-black">
                              {customer.first.youtube_nickname || "닉네임없음"} / {" "}
                              {customer.first.customer_name || "이름없음"}
                            </div>
                            <div className="mt-1 truncate text-sm font-bold text-gray-500">
                              {customer.first.customer_phone || "-"} · {fullAddress(customer.first) || "주소 없음"}
                            </div>
                          </button>

                          <div className="text-right text-sm font-black text-gray-500">
                            <div>주문 {customer.orderCount}건</div>
                            <div>취소 {customer.cancelCount}건</div>
                            <div>수량 {customer.totalQty}개</div>
                            <div className="text-lg text-rose-500">
                              {money(customer.totalAmount)}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleCustomerBlock(customer)}
                            className={`rounded-2xl border px-4 py-3 text-sm font-black transition active:scale-[0.98] ${
                              isPhoneBlocked(customer)
                                ? "border-red-300 bg-red-100 text-red-700 hover:bg-red-200"
                                : "border-green-300 bg-green-100 text-green-700 hover:bg-green-200"
                            }`}
                          >
                            {isPhoneBlocked(customer) ? "차단" : "정상"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {selectedCustomerDetail && (
                <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4">
                  <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-[2rem] bg-white p-6 shadow-2xl">
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-black text-rose-500">
                          고객 상세정보
                        </div>
                        <h2 className="mt-1 text-3xl font-black">
                          {selectedCustomerDetail.first.youtube_nickname || "닉네임없음"} / {" "}
                          {selectedCustomerDetail.first.customer_name || "이름없음"}
                        </h2>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedCustomerDetailKey(null)}
                        className="rounded-2xl bg-gray-100 px-4 py-3 font-black text-gray-700 active:scale-[0.98]"
                      >
                        닫기
                      </button>
                    </div>

                    <div className="grid md:grid-cols-2 gap-3">
                      <InfoBox label="전화번호" value={selectedCustomerDetail.first.customer_phone || "-"} />
                      <InfoBox label="주소" value={fullAddress(selectedCustomerDetail.first) || "-"} />
                      <InfoBox label="총 주문건수" value={`${selectedCustomerDetail.orderCount}건`} />
                      <InfoBox label="총 구매수량" value={`${selectedCustomerDetail.totalQty}개`} />
                      <InfoBox label="총 구매금액" value={money(selectedCustomerDetail.totalAmount)} />
                      <InfoBox label="취소/환불 횟수" value={`${selectedCustomerDetail.cancelCount}건`} />
                      <InfoBox label="최근 주문일" value={selectedCustomerDetail.recentOrderAt || "-"} />
                      <div className="rounded-3xl bg-gray-50 p-4">
                        <div className="text-xs font-black text-gray-400">고객상태</div>
                        <button
                          type="button"
                          onClick={() => toggleCustomerBlock(selectedCustomerDetail)}
                          className={`mt-2 rounded-2xl border px-4 py-3 text-base font-black transition active:scale-[0.98] ${
                            isPhoneBlocked(selectedCustomerDetail)
                              ? "border-red-300 bg-red-100 text-red-700 hover:bg-red-200"
                              : "border-green-300 bg-green-100 text-green-700 hover:bg-green-200"
                          }`}
                        >
                          {isPhoneBlocked(selectedCustomerDetail) ? "차단" : "정상"}
                        </button>
                        <div className="mt-2 text-xs font-bold text-gray-400">
                          정상은 초록색, 차단은 빨간색으로 표시됩니다. 버튼을 누르면 상태가 전환됩니다.
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 rounded-3xl bg-yellow-50 p-4">
                      <div className="text-lg font-black text-yellow-700">관리자 메모 / 특이사항</div>
                      <div className="mt-2 whitespace-pre-wrap text-sm font-bold text-yellow-700">
                        {selectedCustomerDetail.adminMemo ||
                          selectedCustomerDetail.first.special_note ||
                          selectedCustomerDetail.first.request_memo ||
                          "등록된 메모가 없습니다."}
                      </div>
                    </div>

                    <div className="mt-5 rounded-3xl bg-gray-50 p-4">
                      <div className="mb-3 text-lg font-black">최근 주문내역</div>
                      <div className="grid gap-2">
                        {selectedCustomerDetail.rows.slice(0, 10).map((row) => (
                          <div key={String(row.id)} className="rounded-2xl bg-white p-3">
                            <div className="font-black">{orderItemLabel(row)}</div>
                            <div className="mt-1 text-sm font-bold text-gray-500">
                              {row.created_at || "-"} · {row.payment_method || "결제없음"} · {money(row.total_price || row.adjusted_total_price || 0)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-gray-50 p-4">
      <div className="text-xs font-black text-gray-400">{label}</div>
      <div className="mt-2 whitespace-pre-wrap break-words text-base font-black text-gray-950">
        {value}
      </div>
    </div>
  );
}

function OrderNoticePopups({
  notices,
  soundEnabled,
  compact,
  opacity,
  panelOpen,
  onToggleCompact,
  onOpacityChange,
  onTogglePanel,
  onEnableSound,
  onDismiss,
  onClear,
}: {
  notices: OrderNotice[];
  soundEnabled: boolean;
  compact: boolean;
  opacity: number;
  panelOpen: boolean;
  onToggleCompact: () => void;
  onOpacityChange: (value: number) => void;
  onTogglePanel: () => void;
  onEnableSound: () => void;
  onDismiss: (id: string) => void;
  onClear: () => void;
}) {
  const latestNotice = notices[0];
  const safeOpacity = Math.max(45, Math.min(100, opacity)) / 100;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-[calc(100%-2rem)] max-w-[320px]">
      <div
        className="overflow-hidden rounded-3xl border border-rose-100 bg-white shadow-[0_18px_45px_rgba(30,20,20,0.18)] backdrop-blur"
        style={{ opacity: safeOpacity }}
      >
        <div className="flex items-center justify-between gap-2 bg-gray-950 px-3 py-2 text-white">
          <button
            type="button"
            onClick={onTogglePanel}
            className="min-w-0 flex-1 text-left active:scale-[0.98]"
          >
            <div className="truncate text-[11px] font-black text-rose-300">
              ORDER NOTICE
            </div>
            <div className="truncate text-xs font-black">
              {notices.length > 0
                ? `새 주문 ${notices.length}개`
                : soundEnabled
                ? "알림 대기중"
                : "알림음 꺼짐"}
            </div>
          </button>

          <button
            type="button"
            onClick={onEnableSound}
            className={`shrink-0 rounded-xl px-2 py-1.5 text-[11px] font-black active:scale-[0.98] ${
              soundEnabled ? "bg-green-500 text-white" : "bg-rose-500 text-white"
            }`}
          >
            {soundEnabled ? "🔊" : "🔔"}
          </button>

          <button
            type="button"
            onClick={onTogglePanel}
            className="shrink-0 rounded-xl bg-white/10 px-2 py-1.5 text-[11px] font-black active:scale-[0.98]"
          >
            {panelOpen ? "접기" : "열기"}
          </button>
        </div>

        {panelOpen && (
          <div className="border-b border-gray-100 bg-gray-50 px-3 py-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onToggleCompact}
                className="rounded-2xl bg-white p-2 text-xs font-black text-gray-700 active:scale-[0.98]"
              >
                {compact ? "크게보기" : "작게보기"}
              </button>

              <button
                type="button"
                onClick={onClear}
                className="rounded-2xl bg-white p-2 text-xs font-black text-gray-700 active:scale-[0.98]"
              >
                모두닫기
              </button>
            </div>

            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[11px] font-black text-gray-500">
                <span>투명도</span>
                <span>{opacity}%</span>
              </div>
              <input
                type="range"
                min="45"
                max="100"
                value={opacity}
                onChange={(event) => onOpacityChange(Number(event.target.value))}
                className="w-full"
              />
            </div>
          </div>
        )}

        {latestNotice ? (
          <div className={compact ? "p-3" : "p-4"}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-black text-rose-500">
                  주문서가 새로 들어왔습니다
                </div>
                <div
                  className={
                    compact ? "truncate text-base font-black" : "text-xl font-black"
                  }
                >
                  {latestNotice.customerName}
                  {latestNotice.nickname ? ` / ${latestNotice.nickname}` : ""}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onDismiss(latestNotice.id)}
                className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-black text-gray-500 active:scale-[0.98]"
              >
                ×
              </button>
            </div>

            <div
              className={
                compact
                  ? "mt-2 rounded-2xl bg-gray-50 p-2"
                  : "mt-3 rounded-2xl bg-gray-50 p-3"
              }
            >
              <div className="truncate text-sm font-black text-gray-950">
                {latestNotice.productName}
              </div>
              <div className="mt-1 text-xs font-bold text-gray-500">
                수량 {latestNotice.qty}개 · {money(latestNotice.amount)}
              </div>
            </div>

            {!compact && latestNotice.phone && (
              <div className="mt-2 text-xs font-bold text-gray-400">
                {latestNotice.phone}
              </div>
            )}

            {panelOpen && notices.length > 1 && (
              <div className="mt-3 grid gap-2">
                {notices.slice(1).map((notice) => (
                  <button
                    key={notice.id}
                    type="button"
                    onClick={() => onDismiss(notice.id)}
                    className="rounded-2xl bg-rose-50 p-2 text-left text-xs font-black text-rose-600 active:scale-[0.98]"
                  >
                    {notice.customerName} · {notice.productName} 닫기
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          panelOpen && (
            <div className="p-3 text-xs font-black text-green-700">
              {soundEnabled
                ? "🔊 주문 알림음이 켜져 있습니다."
                : "🔔 알림음 켜기를 눌러주세요."}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="bg-white rounded-[2rem] p-8 border shadow-sm">
      <div className="text-sm font-black text-rose-500 mb-2">NEXT STEP</div>
      <h1 className="text-4xl font-black mb-4">{title}</h1>
      <p className="text-gray-500 font-bold leading-7">{description}</p>
    </section>
  );
}
