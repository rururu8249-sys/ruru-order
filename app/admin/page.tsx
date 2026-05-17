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
    "dashboard" | "products" | "broadcasts" | "orders" | "customers"
  >("dashboard");

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
  const [customerKeyword, setCustomerKeyword] = useState("");
  const [blockedPhones, setBlockedPhones] = useState<string[]>([]);
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [selectedCustomerKeys, setSelectedCustomerKeys] = useState<string[]>([]);
  const [selectedCustomerDetailKey, setSelectedCustomerDetailKey] = useState<string | null>(null);
  const [showOnlyLinkedProducts, setShowOnlyLinkedProducts] = useState(false);

  useEffect(() => {
    loadAll();

    if (typeof window !== "undefined") {
      const savedSound = localStorage.getItem("ruru_admin_order_sound") === "ON";
      if (savedSound) setSoundEnabled(true);
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
            row.adjusted_total_price ||
              row.total_price ||
              Number(row.product_price || 0) * Number(row.qty || 1)
          ),
        0
      ),
    }));
  }, [filteredOrders]);


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

  const updateOrderGroupStatus = async (groupId: string, nextStatus: string) => {
    const group = orderGroups.find((item) => item.groupId === groupId);
    if (!group) return;

    const ids = group.rows.map((row) => row.id).filter((id): id is string | number => id !== undefined);
    if (ids.length === 0) return;

    setOrders((prev) =>
      prev.map((order) =>
        order.id !== undefined && ids.includes(order.id)
          ? {
              ...order,
              admin_order_status: nextStatus,
              order_manage_status: nextStatus,
            }
          : order
      )
    );

    const { error } = await supabase
      .from("orders")
      .update({
        admin_order_status: nextStatus,
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

        const qty = Number(row.qty || 1);
        const productPrice = Number(row.product_price || 0);
        const shippingFee = Number(row.shipping_fee || row.admin_shipping_fee || 0);
        const adjustedProductPrice = productPrice * qty;
        const adjustedTotalPrice = adjustedProductPrice + shippingFee;

        const { error } = await supabase
          .from("orders")
          .update({
            product_price: productPrice,
            shipping_fee: shippingFee,
            adjusted_product_price: adjustedProductPrice,
            adjusted_shipping_fee: shippingFee,
            adjusted_total_price: adjustedTotalPrice,
            total_price: adjustedTotalPrice,
          })
          .eq("id", row.id);

        if (error) throw error;
      }

      alert("금액 수정 저장 완료");
      await loadOrders();
    } catch (error: any) {
      alert("금액 수정 저장 실패\n\n" + error.message);
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
              <section className="bg-white rounded-[2rem] p-6 border shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                  <div>
                    <div className="text-sm font-black text-rose-500 mb-2">
                      ORDER MANAGER
                    </div>
                    <h1 className="text-3xl md:text-5xl font-black">
                      주문관리
                    </h1>
                    <p className="text-gray-500 font-bold mt-3">
                      주문번호 클릭 → 상세내역 / 상태변경 / 금액수정
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
                  총 {orderGroups.length}건 / 선택 {selectedOrderGroupIds.length}건
                </div>
              </section>

              <section className="bg-white rounded-[2rem] p-4 md:p-5 border shadow-sm">
                {loadingOrders ? (
                  <div className="p-10 text-center font-black text-gray-500">
                    주문 불러오는 중...
                  </div>
                ) : orderGroups.length === 0 ? (
                  <div className="p-10 text-center font-black text-gray-500">
                    주문이 없습니다.
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {orderGroups.map((group) => {
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
                              className={`rounded-2xl border p-3 text-sm font-black ${
                                canceled
                                  ? "border-red-200 bg-red-100 text-red-700"
                                  : "bg-gray-50 text-gray-700"
                              }`}
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
                                  value={String(row.shipping_fee || row.admin_shipping_fee || 0)}
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
                                value={money(
                                  Number(row.product_price || 0) * Number(row.qty || 1) +
                                    Number(row.shipping_fee || row.admin_shipping_fee || 0)
                                )}
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
