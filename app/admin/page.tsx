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

  useEffect(() => {
    loadAll();
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

  const loadAll = async () => {
    await Promise.all([loadProducts(), loadBroadcasts()]);
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
                                    ? "bg-green-100 text-green-700"
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

                  <div className="font-black text-rose-500">
                    {selectedBroadcastProductIds.length}개 선택
                  </div>
                </div>

                {broadcastSelectableProducts.length === 0 ? (
                  <div className="p-8 rounded-3xl bg-gray-50 text-center font-black text-gray-500">
                    먼저 상품관리에서 상품을 등록해주세요.
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {broadcastSelectableProducts.map((product) => (
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

                        <div className="text-sm text-gray-500 font-bold">
                          배송비 {money(broadcast.shipping_fee || 0)}
                          <br />
                          카드수수료 {broadcast.card_fee_rate || 0}%
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeMenu === "orders" && (
            <ComingSoon
              title="주문관리"
              description="주문 목록, 입금상태, 배송상태, 메모 수정은 다음 단계에서 연결합니다."
            />
          )}

          {activeMenu === "customers" && (
            <ComingSoon
              title="고객관리"
              description="고객목록, 특이사항, 차단고객 관리는 다음 단계에서 연결합니다."
            />
          )}
        </section>
      </div>
    </main>
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
                    compact
                      ? "truncate text-base font-black"
                      : "text-xl font-black"
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
