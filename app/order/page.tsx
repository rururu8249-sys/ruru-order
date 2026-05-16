// app/order/page.tsx
// 전체 교체용
// 파일 위치: /Users/ruru/Desktop/ruru-order-app/app/order/page.tsx
//
// 최종 UX:
// - 주문서 진입 시 처음에는 기존 고객 / 신규 고객 선택만 보임
// - 자동로그인 저장 고객은 선택 화면 스킵 → 바로 주문서 작성
// - 기존 고객: 전화번호 + PIN → 정보 불러오기 성공 후 주문서 작성
// - 신규 고객: 닉네임/이름/전화번호/PIN/주소 입력 후 주문서 작성
// - 유튜브 LIVE 접기/펼치기 표시
// - 주소검색 1개
// - 카드결제 한줄 안내
// - 상품금액 원 표시
// - 카드부가세 10%

"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import YoutubeLiveBox from "../../components/YoutubeLiveBox";

declare global {
  interface Window {
    daum?: any;
  }
}

type ActiveBroadcast = {
  id: string | number | null;
  public_title?: string;
  broadcast_public_title?: string;
  admin_subtitle?: string;
  broadcast_admin_subtitle?: string;
  shipping_fee?: number;
  card_fee_rate?: number;
  youtube_live_url?: string;
  youtube_live_enabled?: boolean;
  status?: string;
};

type Customer = {
  id?: string | number;
  youtube_nickname?: string;
  member_nickname?: string;
  customer_name?: string;
  name?: string;
  customer_phone?: string;
  phone?: string;
  zipcode?: string;
  address?: string;
  detail_address?: string;
  request_memo?: string;
  pin_hash?: string;
  temp_pin_hash?: string;
  is_blocked?: boolean;
  block_reason?: string;
};

type OrderItem = {
  product_name: string;
  color: string;
  size: string;
  qty: string;
  product_price: string;
};

type EntryMode = "none" | "existing" | "new";

const FOOTER_TEXT = "© since 2024 루루동이 | All Rights Reserved.";

const emptyItem: OrderItem = {
  product_name: "",
  color: "",
  size: "",
  qty: "1",
  product_price: "",
};

const normalizePhone = (value: string) =>
  String(value || "").replace(/[^0-9]/g, "");

const onlyNumber = (value: string) =>
  String(value || "").replace(/[^0-9]/g, "");

const toNumber = (value: string | number | undefined | null) =>
  Number(String(value || "0").replace(/[^0-9]/g, "")) || 0;

const won = (value: number) => `${Number(value || 0).toLocaleString()}원`;

const cleanOption = (value: string) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (["없음", "없슴", "x", "X", "-", "none", "None", "NONE"].includes(text)) {
    return "";
  }
  return text;
};

const buildItemLabel = (item: OrderItem) => {
  return [
    item.product_name.trim(),
    cleanOption(item.color),
    cleanOption(item.size),
    `x${toNumber(item.qty) || 1}`,
  ]
    .filter(Boolean)
    .join(" ");
};

async function sha256(value: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function makePinHash(phone: string, pin: string) {
  return sha256(`ruru:${normalizePhone(phone)}:${pin}`);
}

export default function OrderPage() {
  const [activeBroadcast, setActiveBroadcast] =
    useState<ActiveBroadcast | null>(null);
  const [loadingBroadcast, setLoadingBroadcast] = useState(true);

  const [entryMode, setEntryMode] = useState<EntryMode>("none");
  const [isOrderFormOpen, setIsOrderFormOpen] = useState(false);
  const [autoLoginChecking, setAutoLoginChecking] = useState(true);

  const [youtubeNickname, setYoutubeNickname] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [zipcode, setZipcode] = useState("");
  const [address, setAddress] = useState("");
  const [detailAddress, setDetailAddress] = useState("");
  const [requestMemo, setRequestMemo] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showPinConfirm, setShowPinConfirm] = useState(false);

  const [checkedCustomer, setCheckedCustomer] = useState<Customer | null>(null);
  const [customerStatus, setCustomerStatus] = useState<
    "idle" | "checking" | "existing" | "new" | "blocked"
  >("idle");
  const [showAddressEdit, setShowAddressEdit] = useState(false);
  const [saveLoginInfo, setSaveLoginInfo] = useState(true);
  const [autoLoginEnabled, setAutoLoginEnabled] = useState(true);

  const [paymentMethod, setPaymentMethod] = useState<"무통장입금" | "카드결제">(
    "무통장입금"
  );
  const [items, setItems] = useState<OrderItem[]>([{ ...emptyItem }]);
  const [submitting, setSubmitting] = useState(false);

  const shippingFee = Number(activeBroadcast?.shipping_fee ?? 4000);
  const cardFeeRate = Number(activeBroadcast?.card_fee_rate ?? 10);

  useEffect(() => {
    loadActiveBroadcast();
    tryAutoLogin();
  }, []);

  const loadActiveBroadcast = async () => {
    setLoadingBroadcast(true);

    const { data, error } = await supabase
      .from("broadcasts")
      .select("*")
      .eq("status", "ON")
      .neq("is_deleted", true)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      setActiveBroadcast(data);
    }

    setLoadingBroadcast(false);
  };

  const tryAutoLogin = async () => {
    try {
      const saved = window.localStorage.getItem("ruru_saved_login");

      if (!saved) {
        setAutoLoginChecking(false);
        return;
      }

      const parsed = JSON.parse(saved);

      if (!parsed?.autoLogin || !parsed?.phone || !parsed?.pin) {
        setAutoLoginChecking(false);
        return;
      }

      await loadSavedCustomerWithPin(parsed.phone, parsed.pin, true);
    } catch {
      setAutoLoginChecking(false);
    }
  };

  const loadDaumPostcodeScript = () => {
    return new Promise<void>((resolve, reject) => {
      if (typeof window === "undefined") return reject();

      if (window.daum?.Postcode) {
        resolve();
        return;
      }

      const existing = document.querySelector<HTMLScriptElement>(
        "script[data-daum-postcode='true']"
      );

      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject());
        return;
      }

      const script = document.createElement("script");
      script.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
      script.async = true;
      script.dataset.daumPostcode = "true";
      script.onload = () => resolve();
      script.onerror = () => reject();
      document.body.appendChild(script);
    });
  };

  const openAddressSearch = async () => {
    try {
      await loadDaumPostcodeScript();

      new window.daum.Postcode({
        oncomplete: (data: any) => {
          const roadAddress = data.roadAddress || data.jibunAddress || "";
          setZipcode(data.zonecode || "");
          setAddress(roadAddress);
          setShowAddressEdit(true);

          setTimeout(() => {
            const input = document.getElementById("detailAddressInput");
            input?.focus();
          }, 100);
        },
      }).open();
    } catch {
      alert("주소검색을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
  };

  const fillCustomer = (data: Customer, cleanPhone: string, inputPin: string) => {
    setCheckedCustomer(data);
    setCustomerStatus("existing");
    setEntryMode("existing");
    setIsOrderFormOpen(true);

    setCustomerPhone(cleanPhone);
    setPin(inputPin);
    setPinConfirm("");
    setYoutubeNickname(data.youtube_nickname || data.member_nickname || "");
    setCustomerName(data.customer_name || data.name || "");
    setZipcode(data.zipcode || "");
    setAddress(data.address || "");
    setDetailAddress(data.detail_address || "");
    setRequestMemo(data.request_memo || "");
    setShowAddressEdit(false);
  };

  const loadSavedCustomerWithPin = async (
    phoneValue?: string,
    pinValue?: string,
    silent = false
  ) => {
    const cleanPhone = normalizePhone(phoneValue || customerPhone);
    const inputPin = String(pinValue || pin || "").trim();

    if (cleanPhone.length < 10) {
      if (!silent) alert("전화번호를 입력해주세요.");
      setAutoLoginChecking(false);
      return;
    }

    if (!/^\d{6}$/.test(inputPin)) {
      if (!silent) alert("PIN번호 6자리를 입력해주세요.");
      setAutoLoginChecking(false);
      return;
    }

    setCustomerStatus("checking");

    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("customer_phone", cleanPhone)
      .maybeSingle();

    if (error) {
      setCustomerStatus("idle");
      setAutoLoginChecking(false);
      if (!silent) alert("고객정보 확인 오류: " + error.message);
      return;
    }

    if (!data || !data.pin_hash) {
      setCheckedCustomer(null);
      setCustomerStatus("new");
      setEntryMode(silent ? "none" : "new");
      setIsOrderFormOpen(false);
      setShowAddressEdit(true);
      setAutoLoginChecking(false);

      if (!silent) {
        alert("아직 저장된 고객정보가 없습니다. 신규 고객으로 체크 후 최초 1회 정보를 입력해주세요.");
      }
      return;
    }

    if (data.is_blocked) {
      setCheckedCustomer(data);
      setCustomerStatus("blocked");
      setAutoLoginChecking(false);
      return;
    }

    const pinHash = await makePinHash(cleanPhone, inputPin);

    if (pinHash !== data.pin_hash && pinHash !== data.temp_pin_hash) {
      setCustomerStatus("idle");
      setAutoLoginChecking(false);
      if (!silent) alert("전화번호 또는 PIN번호가 일치하지 않습니다.");
      return;
    }

    fillCustomer(data, cleanPhone, inputPin);

    if (autoLoginEnabled || silent) {
      window.localStorage.setItem(
        "ruru_saved_login",
        JSON.stringify({
          phone: cleanPhone,
          pin: inputPin,
          autoLogin: true,
          savedAt: new Date().toISOString(),
        })
      );
    }

    setAutoLoginChecking(false);
  };

  const saveCustomerImmediately = async () => {
    const cleanPhone = normalizePhone(customerPhone);

    if (!saveLoginInfo) return;
    if (cleanPhone.length < 10 || !customerName.trim()) return;

    const updateData: any = {
      youtube_nickname: youtubeNickname.trim(),
      customer_name: customerName.trim(),
      customer_phone: cleanPhone,
      phone: cleanPhone,
      zipcode: zipcode.trim(),
      address: address.trim(),
      detail_address: detailAddress.trim(),
      request_memo: requestMemo.trim(),
      last_order_at: new Date().toISOString(),
    };

    if (/^\d{6}$/.test(pin) && pin === pinConfirm) {
      updateData.pin_hash = await makePinHash(cleanPhone, pin);
      updateData.pin_updated_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("customers")
      .upsert(updateData, { onConflict: "customer_phone" });

    if (!error && autoLoginEnabled && /^\d{6}$/.test(pin)) {
      window.localStorage.setItem(
        "ruru_saved_login",
        JSON.stringify({
          phone: cleanPhone,
          pin,
          autoLogin: true,
          savedAt: new Date().toISOString(),
        })
      );
    }
  };

  const startNewCustomer = () => {
    setEntryMode("new");
    setIsOrderFormOpen(true);
    setCheckedCustomer(null);
    setCustomerStatus("new");
    setShowAddressEdit(true);
    setYoutubeNickname("");
    setCustomerName("");
    setCustomerPhone("");
    setZipcode("");
    setAddress("");
    setDetailAddress("");
    setRequestMemo("");
    setPin("");
    setPinConfirm("");
  };

  const startExistingCustomer = () => {
    setEntryMode("existing");
    setIsOrderFormOpen(false);
    setCheckedCustomer(null);
    setCustomerStatus("idle");
    setShowAddressEdit(false);
    setYoutubeNickname("");
    setCustomerName("");
    setZipcode("");
    setAddress("");
    setDetailAddress("");
    setRequestMemo("");
    setPinConfirm("");
  };

  const resetSavedLogin = () => {
    window.localStorage.removeItem("ruru_saved_login");
    setEntryMode("none");
    setIsOrderFormOpen(false);
    setCheckedCustomer(null);
    setCustomerStatus("idle");
    setCustomerPhone("");
    setPin("");
    setPinConfirm("");
    setYoutubeNickname("");
    setCustomerName("");
    setZipcode("");
    setAddress("");
    setDetailAddress("");
    setRequestMemo("");
  };

  const totalProductAmount = useMemo(() => {
    return items.reduce((sum, item) => {
      return sum + toNumber(item.product_price) * (toNumber(item.qty) || 1);
    }, 0);
  }, [items]);

  const totalQty = useMemo(() => {
    return items.reduce((sum, item) => sum + (toNumber(item.qty) || 1), 0);
  }, [items]);

  const cardExtraAmount = useMemo(() => {
    if (paymentMethod !== "카드결제") return 0;
    return Math.round(totalProductAmount * (cardFeeRate / 100));
  }, [paymentMethod, totalProductAmount, cardFeeRate]);

  const totalAmount = totalProductAmount + shippingFee + cardExtraAmount;

  const updateItem = (index: number, key: keyof OrderItem, value: string) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [key]: value,
      };
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, { ...emptyItem }]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const validate = () => {
    const cleanPhone = normalizePhone(customerPhone);

    if (customerStatus === "blocked" || checkedCustomer?.is_blocked) {
      alert("주문 진행이 제한된 고객입니다. 카톡채널로 문의해주세요.");
      return false;
    }

    if (!youtubeNickname.trim()) {
      alert("유튜브 닉네임을 입력해주세요.");
      return false;
    }

    if (!customerName.trim()) {
      alert("이름을 입력해주세요.");
      return false;
    }

    if (cleanPhone.length < 10) {
      alert("전화번호를 정확히 입력해주세요.");
      return false;
    }

    if (entryMode === "existing" && !checkedCustomer?.pin_hash) {
      alert("기존 고객은 전화번호 + PIN으로 기존 정보를 먼저 불러와주세요.");
      return false;
    }

    if (entryMode === "new" && !/^\d{6}$/.test(pin)) {
      alert("최초 이용 시 PIN번호 6자리를 입력해주세요.");
      return false;
    }

    if (entryMode === "new" && pin !== pinConfirm) {
      alert("PIN번호 재확인이 일치하지 않습니다.");
      return false;
    }

    if (!address.trim()) {
      alert("주소를 입력해주세요.");
      return false;
    }

    const validItems = items.filter((item) => item.product_name.trim());

    if (validItems.length === 0) {
      alert("상품명을 입력해주세요.");
      return false;
    }

    for (const item of validItems) {
      if (!toNumber(item.qty)) {
        alert("수량을 입력해주세요.");
        return false;
      }

      if (!toNumber(item.product_price)) {
        alert("상품금액을 입력해주세요.");
        return false;
      }

      if (toNumber(item.product_price) < 1000) {
        alert("상품금액을 다시 확인해주세요.");
        return false;
      }
    }

    if (paymentMethod === "카드결제" && totalProductAmount < 100000) {
      alert("카드결제는 10만원 이상 구매 시 가능합니다.");
      return false;
    }

    return true;
  };

  const submitOrder = async () => {
    if (!validate()) return;

    setSubmitting(true);

    try {
      const cleanPhone = normalizePhone(customerPhone);

      await saveCustomerImmediately();

      const validItems = items.filter((item) => item.product_name.trim());
      const orderItems = validItems.map((item) => ({
        product_name: item.product_name.trim(),
        color: cleanOption(item.color),
        size: cleanOption(item.size),
        qty: toNumber(item.qty) || 1,
        product_price: toNumber(item.product_price),
        item_total: toNumber(item.product_price) * (toNumber(item.qty) || 1),
        status: "주문확인전",
      }));

      const orderMemoLabel = orderItems
        .map((item) => {
          return [item.product_name, item.color, item.size, `x${item.qty}`]
            .filter(Boolean)
            .join(" ");
        })
        .join(" / ");

      const firstItem = orderItems[0];
      const pinHash =
        /^\d{6}$/.test(pin) && (entryMode === "existing" || pin === pinConfirm)
          ? await makePinHash(cleanPhone, pin)
          : checkedCustomer?.pin_hash || "";

      if (saveLoginInfo && pinHash) {
        await supabase
          .from("customers")
          .upsert(
            {
              youtube_nickname: youtubeNickname.trim(),
              customer_name: customerName.trim(),
              customer_phone: cleanPhone,
              phone: cleanPhone,
              zipcode: zipcode.trim(),
              address: address.trim(),
              detail_address: detailAddress.trim(),
              request_memo: requestMemo.trim(),
              pin_hash: pinHash,
              pin_updated_at: new Date().toISOString(),
              last_order_at: new Date().toISOString(),
            },
            { onConflict: "customer_phone" }
          );

        if (autoLoginEnabled) {
          window.localStorage.setItem(
            "ruru_saved_login",
            JSON.stringify({
              phone: cleanPhone,
              pin,
              autoLogin: true,
              savedAt: new Date().toISOString(),
            })
          );
        }
      }

      const { error } = await supabase.from("orders").insert({
        broadcast_id: activeBroadcast?.id || null,
        broadcast_name:
          activeBroadcast?.broadcast_public_title ||
          activeBroadcast?.public_title ||
          "현재 방송",
        broadcast_public_title:
          activeBroadcast?.broadcast_public_title ||
          activeBroadcast?.public_title ||
          "현재 방송",
        broadcast_admin_subtitle:
          activeBroadcast?.broadcast_admin_subtitle ||
          activeBroadcast?.admin_subtitle ||
          "",
        youtube_nickname: youtubeNickname.trim(),
        customer_name: customerName.trim(),
        customer_phone: cleanPhone,
        phone: cleanPhone,
        zipcode: zipcode.trim(),
        address: address.trim(),
        detail_address: detailAddress.trim(),
        request_memo: requestMemo.trim(),
        category: "",
        product_name:
          orderItems.length === 1
            ? firstItem.product_name
            : `${firstItem.product_name} 외 ${orderItems.length - 1}건`,
        color: orderItems.length === 1 ? firstItem.color : "",
        size: orderItems.length === 1 ? firstItem.size : "",
        qty: totalQty,
        product_price: totalProductAmount,
        shipping_fee: shippingFee,
        total_price: totalAmount,
        adjusted_product_price: totalProductAmount,
        adjusted_shipping_fee: shippingFee,
        adjusted_total_price: totalAmount,
        payment_method: paymentMethod,
        vat_amount: cardExtraAmount,
        order_status: "주문완료",
        admin_status: "관리자 확인 전",
        order_manage_status: "주문확인전",
        shipping_status: "합배송중",
        memo: orderMemoLabel,
        special_note: requestMemo.trim(),
        order_items: orderItems,
        item_change_history: [],
        pin_verified: Boolean(pinHash),
      });

      if (error) throw error;

      alert("주문서가 정상 접수되었습니다.\n입금 부탁드립니다!");

      setItems([{ ...emptyItem }]);
      setRequestMemo("");
      setPaymentMethod("무통장입금");
    } catch (error: any) {
      alert("주문서 제출 오류: " + error.message);
    }

    setSubmitting(false);
  };

  const renderEntryGate = () => (
    <section className="rounded-[2rem] border border-pink-100 bg-white p-5 shadow-[0_18px_45px_rgba(255,120,160,0.13)]">
      <h2 className="text-xl font-black">고객정보 선택</h2>

      <div className="mt-4 rounded-2xl bg-pink-50 p-3 text-xs font-bold leading-relaxed text-pink-700">
        기존 고객은 전화번호+PIN으로 바로 불러오고,
        <br />
        신규 고객은 최초 1회만 정보를 저장하면 됩니다.
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={startExistingCustomer}
          className={`rounded-2xl p-4 font-black ${
            entryMode === "existing"
              ? "bg-gray-950 text-white"
              : "bg-gray-50 text-gray-700"
          }`}
        >
          기존 고객입니다
        </button>

        <button
          type="button"
          onClick={startNewCustomer}
          className={`rounded-2xl p-4 font-black ${
            entryMode === "new"
              ? "bg-pink-500 text-white"
              : "bg-pink-50 text-pink-700"
          }`}
        >
          신규 고객입니다
        </button>
      </div>

      {entryMode === "existing" && !isOrderFormOpen && (
        <div className="mt-4 grid gap-3 rounded-2xl bg-gray-50 p-3">
          <input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="전화번호"
            inputMode="numeric"
            className="w-full rounded-2xl border border-gray-200 bg-white p-4 font-bold outline-none focus:border-pink-300"
          />

          <div className="relative">
            <input
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))
              }
              placeholder="PIN번호 6자리"
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              className="w-full rounded-2xl border border-gray-200 bg-white p-4 pr-14 font-bold outline-none focus:border-pink-300"
            />
            <button
              type="button"
              onClick={() => setShowPin((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs font-black text-gray-500"
            >
              {showPin ? "숨김" : "보기"}
            </button>
          </div>

          <label className="flex items-start gap-2 rounded-2xl bg-white p-3 text-sm font-bold text-gray-700">
            <input
              type="checkbox"
              checked={autoLoginEnabled}
              onChange={(e) => {
                setAutoLoginEnabled(e.target.checked);

                if (!e.target.checked) {
                  window.localStorage.removeItem("ruru_saved_login");
                }
              }}
              className="mt-1"
            />
            <span>
              자동로그인 사용
              <span className="mt-1 block text-xs text-gray-400">
                다음 주문부터 기존/신규 선택 없이 바로 주문서 작성으로 이동합니다.
              </span>
            </span>
          </label>

          <button
            type="button"
            onClick={() => loadSavedCustomerWithPin()}
            className="rounded-2xl bg-gray-950 p-4 font-black text-white"
          >
            기존 정보 불러오기
          </button>

          {customerStatus === "new" && (
            <div className="rounded-2xl bg-yellow-50 p-3 text-sm font-black text-yellow-700">
              아직 구매이력이 없는 회원입니다. 신규 고객으로 체크 후 진행해주세요.
            </div>
          )}
        </div>
      )}
    </section>
  );

  const renderCustomerInfo = () => (
    <section className="rounded-[2rem] border border-pink-100 bg-white p-5 shadow-[0_18px_45px_rgba(255,120,160,0.13)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black">주문자 정보</h2>

        {entryMode === "existing" && (
          <button
            type="button"
            onClick={resetSavedLogin}
            className="rounded-full bg-gray-100 px-3 py-2 text-xs font-black text-gray-600"
          >
            다른 고객
          </button>
        )}
      </div>

      {entryMode === "existing" && checkedCustomer?.pin_hash && (
        <div className="mt-4 rounded-2xl bg-green-50 p-3 text-sm font-black text-green-700">
          기존 고객정보를 불러왔습니다. 바로 주문서를 작성하시면 됩니다.
        </div>
      )}

      {entryMode === "new" && (
        <div className="mt-4 rounded-2xl bg-pink-50 p-3 text-xs font-bold leading-relaxed text-pink-700">
          🤍 최초 1회만 닉네임·이름·전화번호·PIN·주소를 저장하면 다음 주문부터 자동으로 불러옵니다.
        </div>
      )}

      <div className="mt-4 grid gap-3">
        {entryMode === "new" && (
          <>
            <input
              value={youtubeNickname}
              onChange={(e) => setYoutubeNickname(e.target.value)}
              onBlur={saveCustomerImmediately}
              placeholder="유튜브 닉네임"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 font-bold outline-none focus:border-pink-300"
            />

            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              onBlur={saveCustomerImmediately}
              placeholder="이름"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 font-bold outline-none focus:border-pink-300"
            />

            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              onBlur={saveCustomerImmediately}
              placeholder="전화번호"
              inputMode="numeric"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 font-bold outline-none focus:border-pink-300"
            />

            <div className="grid gap-2 rounded-2xl bg-pink-50 p-3">
              <div className="relative">
                <input
                  value={pin}
                  onChange={(e) =>
                    setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))
                  }
                  onBlur={saveCustomerImmediately}
                  placeholder="PIN번호 6자리"
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  className="w-full rounded-2xl border border-pink-100 bg-white p-4 pr-14 font-bold outline-none focus:border-pink-300"
                />
                <button
                  type="button"
                  onClick={() => setShowPin((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs font-black text-gray-500"
                >
                  {showPin ? "숨김" : "보기"}
                </button>
              </div>

              <div className="relative">
                <input
                  value={pinConfirm}
                  onChange={(e) =>
                    setPinConfirm(
                      e.target.value.replace(/[^0-9]/g, "").slice(0, 6)
                    )
                  }
                  onBlur={saveCustomerImmediately}
                  placeholder="PIN번호 재확인"
                  type={showPinConfirm ? "text" : "password"}
                  inputMode="numeric"
                  className="w-full rounded-2xl border border-pink-100 bg-white p-4 pr-14 font-bold outline-none focus:border-pink-300"
                />
                <button
                  type="button"
                  onClick={() => setShowPinConfirm((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs font-black text-gray-500"
                >
                  {showPinConfirm ? "숨김" : "보기"}
                </button>
              </div>

              <div className="px-1 text-xs font-bold leading-relaxed text-pink-700">
                📌 신규 고객은 최초 1회 PIN번호 재확인이 필요합니다.
                <br />
                주문조회 및 개인정보 보호를 위한 비밀번호이니 꼭 기억해주세요.
              </div>
            </div>
          </>
        )}

        {entryMode === "existing" && checkedCustomer?.pin_hash && (
          <div className="rounded-2xl bg-gray-50 p-4">
            <div className="text-xs font-black text-gray-400">불러온 고객정보</div>
            <div className="mt-1 text-sm font-bold text-gray-800">
              {youtubeNickname || "-"} / {customerName || "-"}
            </div>
          </div>
        )}

        {address && !showAddressEdit ? (
          <div className="rounded-2xl bg-gray-50 p-4">
            <div className="text-xs font-black text-gray-400">기본 배송지</div>
            <div className="mt-1 text-sm font-bold text-gray-800">
              {zipcode && `(${zipcode}) `}
              {address} {detailAddress}
            </div>
            <button
              type="button"
              onClick={() => setShowAddressEdit(true)}
              className="mt-3 rounded-full bg-gray-950 px-4 py-2 text-xs font-black text-white"
            >
              배송지 변경
            </button>
          </div>
        ) : (
          <div className="grid gap-3 rounded-2xl bg-gray-50 p-3">
            <button
              type="button"
              onClick={openAddressSearch}
              className="rounded-2xl bg-gray-950 p-4 font-black text-white"
            >
              주소검색
            </button>

            <input
              value={zipcode}
              onChange={(e) => setZipcode(e.target.value)}
              onBlur={saveCustomerImmediately}
              placeholder="우편번호"
              className="rounded-2xl border border-gray-200 bg-white p-4 font-bold"
            />

            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={saveCustomerImmediately}
              placeholder="주소"
              className="rounded-2xl border border-gray-200 bg-white p-4 font-bold"
            />

            <input
              id="detailAddressInput"
              value={detailAddress}
              onChange={(e) => setDetailAddress(e.target.value)}
              onBlur={saveCustomerImmediately}
              placeholder="상세주소"
              className="rounded-2xl border border-gray-200 bg-white p-4 font-bold"
            />

            <label className="flex items-start gap-2 rounded-2xl bg-white p-3 text-sm font-bold text-gray-700">
              <input
                type="checkbox"
                checked={saveLoginInfo}
                onChange={(e) => setSaveLoginInfo(e.target.checked)}
                className="mt-1"
              />
              <span>
                주문자 정보 저장하기
                <span className="mt-1 block text-xs text-gray-400">
                  닉네임·이름·전화번호·주소를 저장합니다. 자동로그인을 켜면 다음 주문부터 바로 불러옵니다.
                </span>
              </span>
            </label>
          </div>
        )}
      </div>
    </section>
  );

  const renderOrderForm = () => (
    <>
      {renderCustomerInfo()}

      <section className="mt-4 rounded-[2rem] border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black">주문상품</h2>

        <div className="mt-4 grid gap-4">
          {items.map((item, index) => (
            <div
              key={index}
              className="rounded-[1.5rem] border border-gray-100 bg-gray-50 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="font-black">상품 {index + 1}</div>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-600"
                  >
                    삭제
                  </button>
                )}
              </div>

              <div className="grid gap-3">
                <input
                  value={item.product_name}
                  onChange={(e) =>
                    updateItem(index, "product_name", e.target.value)
                  }
                  placeholder="상품명"
                  className="rounded-2xl border border-gray-200 bg-white p-4 font-bold"
                />

                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={item.color}
                    onChange={(e) => updateItem(index, "color", e.target.value)}
                    placeholder="색상 (없으면 비워두기)"
                    className="rounded-2xl border border-gray-200 bg-white p-4 font-bold"
                  />

                  <input
                    value={item.size}
                    onChange={(e) => updateItem(index, "size", e.target.value)}
                    placeholder="사이즈 (없으면 비워두기)"
                    className="rounded-2xl border border-gray-200 bg-white p-4 font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={item.qty}
                    onChange={(e) =>
                      updateItem(index, "qty", onlyNumber(e.target.value))
                    }
                    placeholder="수량"
                    inputMode="numeric"
                    className="rounded-2xl border border-gray-200 bg-white p-4 font-bold"
                  />

                  <div className="relative">
                    <input
                      value={item.product_price}
                      onChange={(e) =>
                        updateItem(index, "product_price", onlyNumber(e.target.value))
                      }
                      placeholder="상품금액"
                      inputMode="numeric"
                      className="w-full rounded-2xl border border-gray-200 bg-white p-4 pr-10 font-bold"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-black text-gray-400">
                      원
                    </span>
                  </div>
                </div>

                {item.product_name && (
                  <div className="rounded-2xl bg-white p-3 text-sm font-black text-gray-600">
                    {buildItemLabel(item)} /{" "}
                    {won(toNumber(item.product_price) * (toNumber(item.qty) || 1))}
                  </div>
                )}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addItem}
            className="rounded-2xl border border-dashed border-pink-200 bg-pink-50 p-4 font-black text-pink-700"
          >
            + 상품 추가하기
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-[2rem] border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black">결제수단</h2>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPaymentMethod("무통장입금")}
            className={`rounded-2xl p-4 font-black ${
              paymentMethod === "무통장입금"
                ? "bg-gray-950 text-white"
                : "bg-gray-50 text-gray-700"
            }`}
          >
            무통장입금
          </button>

          <button
            type="button"
            onClick={() => setPaymentMethod("카드결제")}
            className={`rounded-2xl p-4 font-black ${
              paymentMethod === "카드결제"
                ? "bg-blue-600 text-white"
                : "bg-blue-50 text-blue-700"
            }`}
          >
            카드결제
          </button>
        </div>

        {paymentMethod === "카드결제" && (
          <div className="mt-3 rounded-2xl bg-blue-50 p-3 text-xs font-bold leading-relaxed text-blue-700">
            💳 카드결제는 주문서 작성 후 카톡채널 문의 시 결제링크를 보내드립니다.
          </div>
        )}
      </section>

      <section className="mt-4 rounded-[2rem] border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black">요청사항</h2>

        <textarea
          value={requestMemo}
          onChange={(e) => setRequestMemo(e.target.value)}
          onBlur={saveCustomerImmediately}
          placeholder="배송 요청사항이 있으면 입력해주세요."
          className="mt-4 min-h-[100px] w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 p-4 font-bold outline-none focus:border-pink-300"
        />

        <div className="mt-5 rounded-[1.5rem] bg-gray-950 p-5 text-white">
          <div className="flex items-center justify-between text-sm font-bold text-white/70">
            <span>상품금액</span>
            <span>{won(totalProductAmount)}</span>
          </div>

          <div className="mt-2 flex items-center justify-between text-sm font-bold text-white/70">
            <span>배송비</span>
            <span>{won(shippingFee)}</span>
          </div>

          {paymentMethod === "카드결제" && (
            <div className="mt-2 flex items-center justify-between text-sm font-bold text-blue-200">
              <span>카드부가세 {cardFeeRate}%</span>
              <span>{won(cardExtraAmount)}</span>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-white/15 pt-4">
            <span className="font-black">총 결제금액</span>
            <span className="text-2xl font-black">{won(totalAmount)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={submitOrder}
          disabled={submitting}
          className="mt-4 w-full rounded-2xl bg-pink-500 p-5 text-xl font-black text-white shadow-[0_14px_30px_rgba(236,72,153,0.28)] disabled:opacity-50"
        >
          {submitting ? "제출 중..." : "주문서 제출"}
        </button>
      </section>
    </>
  );

  return (
    <main className="min-h-screen bg-[#fbf7f8] px-4 py-6 text-gray-950">
      <section className="mx-auto w-full max-w-md">
        <header className="mb-5 text-center">
          <div className="text-sm font-black text-pink-400">RURU ORDER</div>
          <h1 className="mt-1 text-4xl font-black tracking-tight">
            주문서 작성
          </h1>
          <p className="mt-2 text-sm font-bold text-gray-500">
            방송 중 구매하신 상품을 작성해주세요.
          </p>
        </header>

        {loadingBroadcast ? (
          <div className="mb-4 rounded-[1.7rem] bg-white p-5 text-center font-black text-gray-500 shadow-sm">
            방송 정보를 불러오는 중...
          </div>
        ) : (
          <section className="mb-4 rounded-[1.7rem] border border-gray-100 bg-white p-5 shadow-sm">
            <div className="text-xs font-black text-gray-400">현재 방송</div>
            <div className="mt-1 text-2xl font-black">
              {activeBroadcast?.broadcast_public_title ||
                activeBroadcast?.public_title ||
                "현재 방송"}
            </div>
          </section>
        )}

        <YoutubeLiveBox youtubeUrl={activeBroadcast?.youtube_live_url || ""} />

        {autoLoginChecking ? (
          <section className="rounded-[2rem] border border-pink-100 bg-white p-5 text-center font-black text-gray-500 shadow-sm">
            자동로그인 확인 중...
          </section>
        ) : isOrderFormOpen ? (
          renderOrderForm()
        ) : (
          renderEntryGate()
        )}

        <footer className="py-8 text-center text-[11px] font-bold text-gray-400">
          {FOOTER_TEXT}
        </footer>
      </section>
    </main>
  );
}
