"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";

declare global {
  interface Window {
    daum?: any;
  }
}

type ActiveBroadcast = {
  id: number | null;
  public_title: string;
  admin_subtitle: string;
  shipping_fee: number;
  card_fee_rate: number;
};

export default function Home() {
  const [screen, setScreen] = useState<"menu" | "order" | "lookup">("menu");

  const [nickname, setNickname] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const [zipcode, setZipcode] = useState("");
  const [address, setAddress] = useState("");
  const [detailAddress, setDetailAddress] = useState("");
  const [saveAsDefaultAddress, setSaveAsDefaultAddress] = useState(true);
  const [requestMemo, setRequestMemo] = useState("");

  const [customerCheckStatus, setCustomerCheckStatus] = useState<"unchecked" | "existing" | "new">("unchecked");
  const [checkedCustomer, setCheckedCustomer] = useState<any | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [useSavedAddress, setUseSavedAddress] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("무통장입금");
  const [isCompleted, setIsCompleted] = useState(false);
  const [completedTotal, setCompletedTotal] = useState(0);
  const [completedPaymentMethod, setCompletedPaymentMethod] =
    useState("무통장입금");
  const [completedLookupCode, setCompletedLookupCode] = useState("");

  const [broadcastStatus, setBroadcastStatus] = useState("OFF");
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [activeBroadcast, setActiveBroadcast] = useState<ActiveBroadcast>({
    id: null,
    public_title: "",
    admin_subtitle: "",
    shipping_fee: 4000,
    card_fee_rate: 10,
  });
  const [isLoadingBroadcast, setIsLoadingBroadcast] = useState(true);

  const [hasPreviousOrderInSameBroadcast, setHasPreviousOrderInSameBroadcast] =
    useState(false);
  const [hasCombineShippingTargetOrder, setHasCombineShippingTargetOrder] =
    useState(false);
  const [sameBroadcastShippingChecked, setSameBroadcastShippingChecked] =
    useState(false);

  const [lookupCode, setLookupCode] = useState("");
  const [lookupPhone, setLookupPhone] = useState("");
  const [lookupOrders, setLookupOrders] = useState<any[]>([]);
  const [lookupMessage, setLookupMessage] = useState("");

  const [items, setItems] = useState([
    { product: "", color: "", size: "", qty: "", price: "" },
  ]);

  const bankAccount = "9002186993725";

  useEffect(() => {
    const scriptId = "daum-postcode-script";

    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src =
        "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
      script.async = true;
      document.body.appendChild(script);
    }

    const savedNickname = localStorage.getItem("ruru_youtube_nickname");
    const savedName = localStorage.getItem("ruru_customer_name");
    const savedPhone = localStorage.getItem("ruru_customer_phone");
    const savedZipcode = localStorage.getItem("ruru_customer_zipcode");
    const savedAddress = localStorage.getItem("ruru_customer_address");
    const savedDetailAddress = localStorage.getItem("ruru_customer_detail_address");

    if (savedNickname) setNickname(savedNickname);
    if (savedName) setCustomerName(savedName);
    if (savedPhone) setCustomerPhone(savedPhone);
    if (savedZipcode) setZipcode(savedZipcode);
    if (savedAddress) setAddress(savedAddress);
    if (savedDetailAddress) setDetailAddress(savedDetailAddress);

    loadBroadcastSettings();
  }, []);

  useEffect(() => {
    checkShippingDiscountTargets();
  }, [customerName, customerPhone, activeBroadcast.id, broadcastTitle]);

  useEffect(() => {
    setCustomerCheckStatus("unchecked");
    setCheckedCustomer(null);
    setUseSavedAddress(false);
    setShowAddressForm(false);
  }, [customerName, customerPhone]);



  const loadBroadcastSettings = async () => {
    const { data: settingData } = await supabase.from("settings").select("*");

    const status =
      settingData?.find((v) => v.key === "broadcast_status")?.value || "OFF";
    const title =
      settingData?.find((v) => v.key === "current_broadcast_name")?.value || "";

    setBroadcastStatus(status);
    setBroadcastTitle(title);

    if (status === "ON") {
      const { data: broadcastData } = await supabase
        .from("broadcasts")
        .select("*")
        .eq("status", "ON")
        .order("started_at", { ascending: false })
        .limit(1);

      const active = broadcastData?.[0];

      if (active) {
        setActiveBroadcast({
          id: active.id,
          public_title: active.public_title || title,
          admin_subtitle: active.admin_subtitle || "",
          shipping_fee: Number(active.shipping_fee || 4000),
          card_fee_rate: Number(active.card_fee_rate || 10),
        });
      }
    }

    setIsLoadingBroadcast(false);
  };

  const onlyNumber = (value: string) => value.replace(/[^0-9]/g, "");

  const hasNumber = (value: string) => /[0-9]/.test(String(value || ""));

  const normalizeName = (value: string) => {
    return String(value || "")
      .replace(/\s/g, "")
      .replace(/[(){}\[\],.·ㆍ\-_/]/g, "")
      .toLowerCase();
  };

  const formatPhone = (value: string) => {
    const numbers = onlyNumber(value);
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 7)
      return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(
      7,
      11
    )}`;
  };

  const formatWon = (value: number) =>
    `${Number(value || 0).toLocaleString()}원`;

  const normalizeKoreanText = (value: string) => {
    return String(value || "")
      .replace(/\s/g, "")
      .replace(/[(){}\[\],.·ㆍ\-_/]/g, "")
      .toLowerCase();
  };

  const isJejuAddress = () => {
    const zip = onlyNumber(zipcode);
    const rawFullAddress = `${address || ""} ${detailAddress || ""}`;
    const full = normalizeKoreanText(rawFullAddress);

    if (zip.startsWith("63")) {
      return true;
    }

    const strongJejuKeywords = [
      "제주특별자치도",
      "제주특별",
      "제주도",
      "제주시",
      "서귀포시",
      "서귀포",
    ];

    if (
      strongJejuKeywords.some((keyword) =>
        full.includes(normalizeKoreanText(keyword))
      )
    ) {
      return true;
    }

    const strongJejuLocalKeywords = [
      "애월읍",
      "한림읍",
      "조천읍",
      "구좌읍",
      "성산읍",
      "표선면",
      "남원읍",
      "대정읍",
      "한경면",
      "안덕면",
      "추자면",
      "우도면",
      "노형동",
      "연동",
      "이도일동",
      "이도이동",
      "일도일동",
      "일도이동",
      "삼도일동",
      "삼도이동",
      "용담일동",
      "용담이동",
      "건입동",
      "화북동",
      "삼양동",
      "봉개동",
      "아라동",
      "오라동",
      "외도동",
      "이호동",
      "도두동",
      "중문동",
      "대륜동",
      "대천동",
      "동홍동",
      "서홍동",
      "송산동",
      "영천동",
      "예래동",
      "정방동",
      "중앙동",
      "천지동",
      "효돈동",
    ];

    const hasStrongLocalKeyword = strongJejuLocalKeywords.some((keyword) =>
      full.includes(normalizeKoreanText(keyword))
    );

    if (hasStrongLocalKeyword) {
      return true;
    }

    const englishJejuKeywords = ["jejusi", "jeju", "seogwipo"];

    if (englishJejuKeywords.some((keyword) => full.includes(keyword))) {
      return true;
    }

    return false;
  };

  const isJejuAddressByValues = (
    targetZipcode: string,
    targetAddress: string,
    targetDetailAddress: string
  ) => {
    const zip = onlyNumber(targetZipcode);
    const full = normalizeKoreanText(`${targetAddress || ""} ${targetDetailAddress || ""}`);

    if (zip.startsWith("63")) return true;

    const strongJejuKeywords = [
      "제주특별자치도",
      "제주특별",
      "제주도",
      "제주시",
      "서귀포시",
      "서귀포",
    ];

    if (
      strongJejuKeywords.some((keyword) =>
        full.includes(normalizeKoreanText(keyword))
      )
    ) {
      return true;
    }

    const strongJejuLocalKeywords = [
      "애월읍",
      "한림읍",
      "조천읍",
      "구좌읍",
      "성산읍",
      "표선면",
      "남원읍",
      "대정읍",
      "한경면",
      "안덕면",
      "추자면",
      "우도면",
      "노형동",
      "연동",
      "이도일동",
      "이도이동",
      "일도일동",
      "일도이동",
      "삼도일동",
      "삼도이동",
      "용담일동",
      "용담이동",
      "건입동",
      "화북동",
      "삼양동",
      "봉개동",
      "아라동",
      "오라동",
      "외도동",
      "이호동",
      "도두동",
      "중문동",
      "대륜동",
      "대천동",
      "동홍동",
      "서홍동",
      "송산동",
      "영천동",
      "예래동",
      "정방동",
      "중앙동",
      "천지동",
      "효돈동",
    ];

    if (
      strongJejuLocalKeywords.some((keyword) =>
        full.includes(normalizeKoreanText(keyword))
      )
    ) {
      return true;
    }

    const englishJejuKeywords = ["jejusi", "jeju", "seogwipo"];
    return englishJejuKeywords.some((keyword) => full.includes(keyword));
  };

  const baseShippingFee = useMemo(() => {
    if (isJejuAddress()) return 6000;
    return Number(activeBroadcast.shipping_fee || 4000);
  }, [zipcode, address, detailAddress, activeBroadcast.shipping_fee]);

  const finalShippingFee = useMemo(() => {
    if (hasPreviousOrderInSameBroadcast || hasCombineShippingTargetOrder) return 0;
    return baseShippingFee;
  }, [hasPreviousOrderInSameBroadcast, hasCombineShippingTargetOrder, baseShippingFee]);

  const shippingNotice = useMemo(() => {
    if (hasPreviousOrderInSameBroadcast) {
      return "동일 방송 추가주문으로 배송비 0원 적용";
    }

    if (hasCombineShippingTargetOrder) {
      return "합배송 기준 방송 구매 이력 확인으로 배송비 0원 적용";
    }

    if (isJejuAddress()) {
      return "제주 배송지로 확인되어 배송비 6,000원 적용";
    }

    return "기본 배송비 적용";
  }, [hasPreviousOrderInSameBroadcast, hasCombineShippingTargetOrder, zipcode, address, detailAddress]);

  const productTotal = items.reduce((sum, item) => {
    return sum + Number(item.price || 0) * Number(item.qty || 0);
  }, 0);

  const cashTotal = productTotal + finalShippingFee;
  const cardFeeRate = Number(activeBroadcast.card_fee_rate || 10);
  const vatAmount =
    paymentMethod === "카드결제"
      ? Math.ceil(cashTotal * (cardFeeRate / 100))
      : 0;
  const total = cashTotal + vatAmount;

  const generateLookupCode = () => {
    const date = new Date();
    const yymmdd =
      String(date.getFullYear()).slice(2) +
      String(date.getMonth() + 1).padStart(2, "0") +
      String(date.getDate()).padStart(2, "0");
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `RURU-${yymmdd}-${random}`;
  };

  const getSameBroadcastPreviousOrder = async () => {
    const phone = onlyNumber(customerPhone);
    const name = normalizeName(customerName);

    if (phone.length < 10 || !name) {
      return false;
    }

    const { data } = await supabase
      .from("orders")
      .select("id,customer_name,customer_phone,broadcast_id,broadcast_name,broadcast_public_title")
      .eq("customer_phone", phone)
      .limit(100);

    const currentBroadcastId = String(activeBroadcast.id || "");
    const currentBroadcastTitle = normalizeKoreanText(
      activeBroadcast.public_title || broadcastTitle || ""
    );

    const matched = (data || []).some((order) => {
      const sameName = normalizeName(order.customer_name || "") === name;

      const sameBroadcastId =
        currentBroadcastId &&
        String(order.broadcast_id || "") === currentBroadcastId;

      const savedBroadcastTitle = normalizeKoreanText(
        order.broadcast_public_title || order.broadcast_name || ""
      );

      const sameBroadcastTitle =
        currentBroadcastTitle &&
        savedBroadcastTitle &&
        savedBroadcastTitle === currentBroadcastTitle;

      return sameName && (sameBroadcastId || sameBroadcastTitle);
    });

    return matched;
  };

  const getCombineShippingTargetOrder = async () => {
    const phone = onlyNumber(customerPhone);
    const name = normalizeName(customerName);

    if (phone.length < 10 || !name) {
      return false;
    }

    const { data: targetBroadcasts } = await supabase
      .from("broadcasts")
      .select("id,public_title")
      .eq("is_combine_shipping_target", true);

    if (!targetBroadcasts || targetBroadcasts.length === 0) {
      return false;
    }

    const targetIds = targetBroadcasts.map((broadcast) => Number(broadcast.id));
    const targetTitles = targetBroadcasts.map((broadcast) =>
      normalizeKoreanText(broadcast.public_title || "")
    );

    const { data: previousOrders } = await supabase
      .from("orders")
      .select("id,customer_name,customer_phone,broadcast_id,broadcast_name,broadcast_public_title")
      .eq("customer_phone", phone)
      .limit(200);

    const matched = (previousOrders || []).some((order) => {
      const sameName = normalizeName(order.customer_name || "") === name;

      const orderBroadcastId = Number(order.broadcast_id || 0);
      const orderBroadcastTitle = normalizeKoreanText(
        order.broadcast_public_title || order.broadcast_name || ""
      );

      const matchedById = targetIds.includes(orderBroadcastId);
      const matchedByTitle =
        !!orderBroadcastTitle && targetTitles.includes(orderBroadcastTitle);

      return sameName && (matchedById || matchedByTitle);
    });

    return matched;
  };

  const checkShippingDiscountTargets = async () => {
    setSameBroadcastShippingChecked(false);
    setHasPreviousOrderInSameBroadcast(false);
    setHasCombineShippingTargetOrder(false);

    const sameBroadcastMatched = await getSameBroadcastPreviousOrder();
    const combineTargetMatched = await getCombineShippingTargetOrder();

    setHasPreviousOrderInSameBroadcast(sameBroadcastMatched);
    setHasCombineShippingTargetOrder(combineTargetMatched);
    setSameBroadcastShippingChecked(true);
  };

  const openAddressSearch = () => {
    if (!window.daum?.Postcode) {
      alert("주소검색을 불러오는 중입니다. 잠시 후 다시 눌러주세요.");
      return;
    }

    new window.daum.Postcode({
      oncomplete: function (data: any) {
        setZipcode(data.zonecode);
        setAddress(data.roadAddress || data.jibunAddress);
      },
    }).open();
  };

  const addItem = () => {
    setItems([
      ...items,
      { product: "", color: "", size: "", qty: "", price: "" },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) {
      alert("상품은 최소 1개 이상 작성해야 합니다.");
      return;
    }

    const copy = [...items];
    copy.splice(index, 1);
    setItems(copy);
  };

  const copyAccount = async () => {
    await navigator.clipboard.writeText(bankAccount);
    alert("계좌번호가 복사되었습니다.");
  };

  const copyLookupCode = async () => {
    await navigator.clipboard.writeText(completedLookupCode);
    alert("주문조회번호가 복사되었습니다.");
  };

  const checkBlockedCustomer = async () => {
    const phone = onlyNumber(customerPhone);

    if (phone.length < 10) return false;

    const { data } = await supabase
      .from("customers")
      .select("*")
      .eq("customer_phone", phone)
      .limit(1);

    const customer = data?.[0];

    if (customer?.is_blocked === "Y") {
      alert(
        "⚠️ 주문 제한 안내\n\n주문 접수가 제한된 회원입니다.\n문의가 필요하신 경우 카톡채널로 연락 부탁드립니다."
      );
      return true;
    }

    return false;
  };

  const handleCustomerCheck = async () => {
    const phone = onlyNumber(customerPhone);

    if (!nickname.trim()) {
      alert("유튜브 닉네임을 입력해주세요.");
      return;
    }

    if (!customerName.trim()) {
      alert("주문자 이름을 입력해주세요.");
      return;
    }

    if (phone.length < 10) {
      alert("전화번호를 정확히 입력해주세요.\n예) 01012345678");
      return;
    }

    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("customer_phone", phone)
      .limit(1);

    if (error) {
      alert("고객정보 확인 오류\n\n" + error.message);
      return;
    }

    const customer = data?.[0];

    if (customer && normalizeName(customer.customer_name || "") === normalizeName(customerName)) {
      setCheckedCustomer(customer);
      setCustomerCheckStatus("existing");
      setUseSavedAddress(true);
      setShowAddressForm(false);

      alert(
        "기존 고객 확인 완료\n\n저장된 배송지로 접수됩니다.\n주소 변경이 필요하면 [주소 직접 입력]을 눌러주세요."
      );
      return;
    }

    setCheckedCustomer(null);
    setCustomerCheckStatus("new");
    setUseSavedAddress(false);
    setShowAddressForm(true);

    alert(
      "신규 고객 또는 확인이 필요한 고객입니다.\n\n주소를 최초 1회 입력해주세요."
    );
  };

  const openManualAddressForm = () => {
    setUseSavedAddress(false);
    setShowAddressForm(true);
  };

  const saveCustomerInfo = async () => {
    const phone = onlyNumber(customerPhone);

    const { data: existing } = await supabase
      .from("customers")
      .select("*")
      .eq("customer_phone", phone)
      .limit(1);

    const customer = existing?.[0];

    const shouldUseSavedAddress =
      useSavedAddress &&
      checkedCustomer &&
      customerCheckStatus === "existing";

    const finalZipcode = shouldUseSavedAddress
      ? checkedCustomer.zipcode || customer?.zipcode || ""
      : zipcode;

    const finalAddress = shouldUseSavedAddress
      ? checkedCustomer.address || customer?.address || ""
      : address;

    const finalDetailAddress = shouldUseSavedAddress
      ? checkedCustomer.detail_address || customer?.detail_address || ""
      : detailAddress.trim();

    const customerData = {
      youtube_nickname: nickname.trim(),
      customer_name: customerName.trim(),
      customer_phone: phone,
      zipcode: finalZipcode,
      address: finalAddress,
      detail_address: finalDetailAddress,
      last_order_at: new Date().toISOString(),
      is_default_address: saveAsDefaultAddress,
    };

    if (customer) {
      const previousNames =
        customer.customer_name !== customerName.trim()
          ? `${customer.previous_names || ""} ${customer.customer_name}`.trim()
          : customer.previous_names || "";

      const previousNicknames =
        customer.youtube_nickname !== nickname.trim()
          ? `${customer.previous_nicknames || ""} ${
              customer.youtube_nickname
            }`.trim()
          : customer.previous_nicknames || "";

      const { error } = await supabase
        .from("customers")
        .update({
          ...customerData,
          previous_names: previousNames,
          previous_nicknames: previousNicknames,
        })
        .eq("id", customer.id);

      if (error) throw error;

      return {
        matchStatus:
          customer.customer_name === customerName.trim()
            ? "기존고객 정상"
            : "관리자 확인 필요",
        matchMemo:
          customer.customer_name === customerName.trim()
            ? ""
            : `전화번호 동일 / 이름 다름: 기존(${customer.customer_name}) → 현재(${customerName.trim()})`,
        zipcode: finalZipcode,
        address: finalAddress,
        detail_address: finalDetailAddress,
      };
    }

    const { error } = await supabase.from("customers").insert(customerData);
    if (error) throw error;

    return {
      matchStatus: "신규고객",
      matchMemo: "",
      zipcode: finalZipcode,
      address: finalAddress,
      detail_address: finalDetailAddress,
    };
  };

  const handleSubmit = async () => {
    if (broadcastStatus !== "ON") {
      alert("현재 주문 접수 시간이 아닙니다.\n방송 시작 후 주문해주세요.");
      return;
    }

    if (!nickname.trim()) {
      alert("유튜브 닉네임을 입력해주세요.");
      return;
    }

    if (!customerName.trim()) {
      alert("주문자 이름을 입력해주세요.");
      return;
    }

    const phone = onlyNumber(customerPhone);

    if (phone.length < 10) {
      alert("전화번호를 정확히 입력해주세요.\n예) 01012345678");
      return;
    }

    if (customerCheckStatus === "unchecked") {
      alert("고객정보 확인을 먼저 눌러주세요.");
      return;
    }

    if (!useSavedAddress && (!zipcode || !address || !detailAddress.trim())) {
      alert(
        "배송지 정보가 없습니다.\n\n주소검색 후 상세주소까지 입력해주세요."
      );
      return;
    }

    if (useSavedAddress && (!checkedCustomer?.address || !checkedCustomer?.detail_address)) {
      alert(
        "저장된 배송지 정보가 부족합니다.\n\n[주소 직접 입력]을 눌러 주소를 입력해주세요."
      );
      return;
    }

    const blocked = await checkBlockedCustomer();
    if (blocked) return;

    const hasEmptyItem = items.some(
      (item) =>
        !item.product.trim() ||
        !item.color.trim() ||
        !item.size.trim() ||
        !item.qty ||
        !item.price
    );

    if (hasEmptyItem) {
      alert(
        "상품명 · 색상 · 사이즈 · 수량 · 금액을 모두 입력해주세요.\n\n색상/사이즈가 없으면 '없음' 이라고 작성해주세요."
      );
      return;
    }

    const hasNumberInColor = items.some((item) => hasNumber(item.color));

    if (hasNumberInColor) {
      alert("색상칸에는 숫자를 입력할 수 없습니다.\n\n색상이 없으면 '없음'이라고 작성해주세요.");
      return;
    }

    localStorage.setItem("ruru_youtube_nickname", nickname.trim());
    localStorage.setItem("ruru_customer_name", customerName.trim());
    localStorage.setItem("ruru_customer_phone", phone);

    if (!useSavedAddress) {
      localStorage.setItem("ruru_customer_zipcode", zipcode);
      localStorage.setItem("ruru_customer_address", address);
      localStorage.setItem("ruru_customer_detail_address", detailAddress.trim());
    }

    setIsSubmitting(true);

    try {
      const isAdditionalOrder = await getSameBroadcastPreviousOrder();
      const isCombineShippingOrder = await getCombineShippingTargetOrder();

      const customerMatch = await saveCustomerInfo();
      const orderGroupId = crypto.randomUUID();
      const orderLookupCode = generateLookupCode();

      const originalShippingFee = baseShippingFee;
      const appliedShippingFee = isAdditionalOrder || isCombineShippingOrder ? 0 : baseShippingFee;
      const submitCashTotal = productTotal + appliedShippingFee;
      const submitVatAmount =
        paymentMethod === "카드결제"
          ? Math.ceil(submitCashTotal * (cardFeeRate / 100))
          : 0;
      const submitTotal = submitCashTotal + submitVatAmount;

      const orderRows = items.map((item) => ({
        order_group_id: orderGroupId,
        order_lookup_code: orderLookupCode,

        broadcast_id: activeBroadcast.id,
        broadcast_name:
          broadcastTitle || activeBroadcast.public_title || "방송명 미지정",
        broadcast_public_title:
          activeBroadcast.public_title || broadcastTitle || "방송명 미지정",
        broadcast_admin_subtitle: activeBroadcast.admin_subtitle || "",

        youtube_nickname: nickname.trim(),
        customer_name: customerName.trim(),
        customer_phone: phone,

        zipcode: customerMatch.zipcode || "",
        address: customerMatch.address || "",
        detail_address: customerMatch.detail_address || "",
        address_type: "고객입력",

        customer_match_status: customerMatch.matchStatus,
        customer_match_memo: customerMatch.matchMemo,

        request_memo: requestMemo.trim(),
        save_as_default_address: saveAsDefaultAddress,

        product_name: item.product,
        color: item.color,
        size: item.size,
        qty: Number(item.qty),
        product_price: Number(item.price),

        shipping_fee: appliedShippingFee,
        original_shipping_fee: originalShippingFee,
        final_shipping_fee: appliedShippingFee,
        adjusted_shipping_fee: appliedShippingFee,
        total_price: submitTotal,
        adjusted_total_price: submitTotal,

        combine_shipping_applied: isAdditionalOrder || isCombineShippingOrder,
        combine_shipping_memo: isAdditionalOrder
          ? "동일 방송 추가주문 배송비 0원 자동 적용"
          : isCombineShippingOrder
          ? "합배송 기준 방송 구매 이력으로 배송비 0원 자동 적용"
          : isJejuAddressByValues(
              customerMatch.zipcode || "",
              customerMatch.address || "",
              customerMatch.detail_address || ""
            )
          ? "제주 배송비 6,000원 자동 적용"
          : "기본 배송비 적용",

        shipping_status: "기본배송",
        admin_status: "관리자 확인 전",
        order_status: "주문완료신청",

        payment_method: paymentMethod,
        vat_amount: submitVatAmount,
      }));

      const { error } = await supabase.from("orders").insert(orderRows);
      if (error) throw error;

      setCompletedTotal(submitTotal);
      setCompletedPaymentMethod(paymentMethod);
      setCompletedLookupCode(orderLookupCode);
      setIsCompleted(true);

      setItems([{ product: "", color: "", size: "", qty: "", price: "" }]);
      setRequestMemo("");
    } catch (error: any) {
      alert("주문 저장 실패\n\n" + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLookup = async () => {
    const phone = onlyNumber(lookupPhone);

    if (!lookupCode.trim()) {
      alert("주문조회번호를 입력해주세요.");
      return;
    }

    if (phone.length < 10) {
      alert("전화번호를 입력해주세요.");
      return;
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("order_lookup_code", lookupCode.trim())
      .eq("customer_phone", phone)
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setLookupOrders(data || []);

    if (!data || data.length === 0) {
      setLookupMessage("최근 7일 이내 조회 가능한 주문이 없습니다.");
    } else {
      setLookupMessage("");
    }
  };

  if (isLoadingBroadcast) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center text-gray-700">
          <div className="text-2xl font-bold mb-2">루루동이 주문서</div>
          <div>주문서 상태 확인중...</div>
        </div>
      </main>
    );
  }

  if (screen === "menu" && !isCompleted) {
    return (
      <main className="min-h-screen bg-gray-50 p-5 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl p-6 border shadow-sm">
            <h1 className="text-3xl font-extrabold mb-2">루루동이 주문서</h1>
            <p className="text-gray-500 mb-6">라이브 방송 주문 전용</p>

            <button
              onClick={() => setScreen("order")}
              className="w-full bg-black text-white p-5 rounded-2xl font-bold text-lg mb-3"
            >
              주문서 작성
            </button>

            <button
              onClick={() => setScreen("lookup")}
              className="w-full bg-gray-200 text-gray-900 p-5 rounded-2xl font-bold text-lg"
            >
              주문번호로 주문내역 조회
            </button>

            <div className="text-xs text-gray-500 mt-4 leading-5">
              주문조회는 최근 7일 이내 주문만 가능합니다.
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (screen === "lookup" && !isCompleted) {
    return (
      <main className="min-h-screen bg-gray-50 p-5">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-3xl p-6 border shadow-sm mt-10">
            <h1 className="text-3xl font-extrabold mb-2">주문내역 조회</h1>
            <p className="text-gray-500 mb-5">
              최근 7일 이내 주문만 조회 가능합니다.
            </p>

            <input
              type="text"
              placeholder="주문조회번호"
              className="w-full p-4 rounded-2xl bg-gray-50 border mb-3"
              value={lookupCode}
              onChange={(e) => setLookupCode(e.target.value.toUpperCase())}
            />

            <input
              type="text"
              inputMode="numeric"
              placeholder="전화번호 01012345678"
              className="w-full p-4 rounded-2xl bg-gray-50 border mb-3"
              value={formatPhone(lookupPhone)}
              onChange={(e) => setLookupPhone(onlyNumber(e.target.value))}
            />

            <button
              onClick={handleLookup}
              className="w-full bg-black text-white p-4 rounded-2xl font-bold mb-3"
            >
              조회하기
            </button>

            <button
              onClick={() => setScreen("menu")}
              className="w-full bg-gray-200 text-gray-900 p-4 rounded-2xl font-bold"
            >
              처음으로
            </button>

            {lookupMessage && (
              <div className="mt-5 bg-red-50 text-red-600 rounded-2xl p-4 font-bold">
                {lookupMessage}
              </div>
            )}

            {lookupOrders.length > 0 && (
              <div className="mt-5 grid gap-3">
                {lookupOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-gray-50 rounded-2xl p-4 border"
                  >
                    <div className="font-bold">{order.product_name}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      {order.color} / {order.size} / {order.qty}개
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {order.address} {order.detail_address}
                    </div>
                    <div className="font-bold mt-2">
                      {formatWon(order.adjusted_total_price || order.total_price)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {order.order_status || "주문완료신청"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (broadcastStatus !== "ON" && screen === "order") {
    return (
      <main className="min-h-screen bg-gray-50 p-5 flex items-center justify-center">
        <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-sm border text-center">
          <div className="text-3xl font-bold mb-4">루루동이 주문서</div>
          <div className="bg-red-50 text-red-600 rounded-2xl p-5 text-xl font-bold mb-5">
            현재 주문 접수 시간이 아닙니다
          </div>
          <p className="text-gray-600 leading-7 mb-6">
            방송 시작 후 주문서 작성이 가능합니다.
            <br />
            방송 중 안내에 따라 다시 접속해주세요.
          </p>
          <button
            onClick={loadBroadcastSettings}
            className="w-full bg-black text-white font-bold p-4 rounded-2xl mb-3"
          >
            주문서 다시 확인하기
          </button>
          <button
            onClick={() => setScreen("menu")}
            className="w-full bg-gray-200 text-gray-900 font-bold p-4 rounded-2xl"
          >
            처음으로
          </button>
        </div>
      </main>
    );
  }

  if (isCompleted) {
    return (
      <main className="min-h-screen bg-gray-50 p-5">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-3xl p-6 border shadow-sm mt-10">
            <h1 className="text-3xl font-bold mb-4">주문완료신청 완료</h1>
            <p className="text-gray-600 mb-6">주문서가 정상 접수되었습니다.</p>

            <div className="bg-gray-50 rounded-2xl p-5 mb-5 border">
              <div className="text-gray-500 mb-1">주문조회번호</div>
              <div className="text-2xl font-extrabold mb-4">
                {completedLookupCode}
              </div>
              <button
                onClick={copyLookupCode}
                className="w-full bg-gray-900 text-white font-bold p-4 rounded-2xl"
              >
                주문조회번호 복사하기
              </button>
            </div>

            {completedPaymentMethod === "무통장입금" ? (
              <div className="bg-gray-50 rounded-2xl p-5 mb-5 border">
                <div className="text-red-600 text-xl font-bold mb-3">
                  ⚠️ 10분 이내 입금해주세요
                </div>
                <div className="text-gray-700 mb-4 leading-7">
                  입금 후 카톡채널에
                  <br />
                  <b>[입금내역 캡처 + 유튜브닉네임]</b>
                  <br />
                  남겨주셔야 최종 주문확인 완료됩니다.
                </div>
                <div className="text-gray-500 mb-1">새마을금고</div>
                <div className="text-3xl font-bold mb-1">{bankAccount}</div>
                <div className="text-lg mb-5">예금주 : 유혜원</div>
                <button
                  onClick={copyAccount}
                  className="w-full bg-black text-white font-bold p-4 rounded-2xl text-lg"
                >
                  계좌번호 복사하기
                </button>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-2xl p-5 mb-5 border">
                <div className="text-xl font-bold mb-3">카드결제 신청 완료</div>
                <p className="text-gray-700 leading-7">
                  카드결제는 수수료가 추가됩니다.
                  <br />
                  관리자 확인 후 카톡채널로 결제링크를 보내드립니다.
                </p>
              </div>
            )}

            <div className="bg-black text-white rounded-2xl p-5 mb-6">
              <div className="text-gray-300 mb-1">최종 결제금액</div>
              <div className="text-4xl font-bold">
                {formatWon(completedTotal)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setIsCompleted(false);
                  setScreen("menu");
                }}
                className="w-full bg-gray-200 p-4 rounded-2xl font-bold"
              >
                홈으로
              </button>

              <button
                onClick={() => {
                  setIsCompleted(false);
                  setLookupCode(completedLookupCode);
                  setScreen("lookup");
                }}
                className="w-full bg-gray-200 p-4 rounded-2xl font-bold"
              >
                주문내역조회
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 p-4">
      <div className="max-w-md mx-auto pb-10">
        <div className="py-4">
          <h1 className="text-3xl font-extrabold tracking-tight">
            루루동이 주문서
          </h1>
          <p className="text-gray-500 mt-1">라이브 방송 주문 전용</p>
        </div>

        <section className="bg-white rounded-3xl p-5 border shadow-sm mb-4">
          <div className="text-sm text-gray-500 mb-1">현재 방송</div>
          <div className="text-xl font-bold">
            {broadcastTitle || activeBroadcast.public_title || "방송 주문 접수중"}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 mb-4">
          <button
            onClick={() => setScreen("menu")}
            className="w-full bg-gray-200 text-gray-900 p-4 rounded-2xl font-bold"
          >
            홈으로
          </button>

          <button
            onClick={() => setScreen("lookup")}
            className="w-full bg-gray-200 text-gray-900 p-4 rounded-2xl font-bold"
          >
            주문내역조회
          </button>
        </section>

        <section className="bg-red-50 border border-red-100 rounded-3xl p-5 mb-4">
          <div className="font-bold text-red-600 mb-3">⚠️ 주문 전 필수 확인</div>
          <div className="text-sm text-red-700 leading-7">
            라이브 방송에서 접수되신 분만 주문서 작성해주세요.
            <br />
            공구상품은 별도 안내에 따라 진행됩니다.
            <br />
            주문 접수 후 취소/변경이 어려우니 신중구매 부탁드립니다.
            <br />
            주문 전 상품명 · 색상 · 사이즈 · 수량 · 금액을 꼭 확인해주세요.
          </div>
        </section>

        <section className="bg-white rounded-3xl p-5 border shadow-sm mb-4">
          <div className="font-bold text-lg mb-4">고객 정보</div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mb-4">
            <div className="font-bold text-yellow-700 text-sm leading-6">
              📦 주소는 최초 1회만 입력해주세요.
              <br />
              저장된 주소가 있으면 다음 주문부터 자동 입력됩니다.
            </div>
          </div>

          <p className="text-xs text-red-500 mb-4">* 표시는 필수 입력 항목입니다.</p>

          <div className="grid gap-3">
            <input
              type="text"
              placeholder="* 유튜브 닉네임"
              className="w-full p-4 rounded-2xl bg-gray-50 border"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />

            <input
              type="text"
              placeholder="* 주문자 이름"
              className="w-full p-4 rounded-2xl bg-gray-50 border"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />

            <input
              type="text"
              inputMode="numeric"
              placeholder="* 전화번호 01012345678"
              className="w-full p-4 rounded-2xl bg-gray-50 border"
              value={formatPhone(customerPhone)}
              onChange={(e) => setCustomerPhone(onlyNumber(e.target.value))}
            />

            <button
              onClick={handleCustomerCheck}
              className="w-full bg-gray-900 text-white p-4 rounded-2xl font-bold"
            >
              고객정보 확인
            </button>

            {customerCheckStatus === "existing" && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                <div className="font-bold text-blue-700 text-sm leading-6">
                  기존 고객 확인 완료
                  <br />
                  저장된 배송지로 접수됩니다.
                  <br />
                  주소 변경이 필요하면 아래 버튼을 눌러주세요.
                </div>

                <button
                  onClick={openManualAddressForm}
                  className="w-full bg-white text-blue-700 border border-blue-300 p-3 rounded-xl font-bold mt-3"
                >
                  주소 직접 입력
                </button>
              </div>
            )}

            {customerCheckStatus === "new" && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
                <div className="font-bold text-yellow-700 text-sm leading-6">
                  신규 고객 또는 확인이 필요한 고객입니다.
                  <br />
                  주소를 최초 1회 입력해주세요.
                </div>
              </div>
            )}

            {showAddressForm && (
              <>
                <button
                  onClick={openAddressSearch}
                  className="w-full bg-black text-white p-4 rounded-2xl font-bold"
                >
                  주소검색
                </button>

                <input
                  type="text"
                  placeholder="기본주소"
                  className="w-full p-4 rounded-2xl bg-gray-50 border"
                  value={address}
                  readOnly
                />

                <input
                  type="text"
                  placeholder="상세주소 예) 101동 1001호"
                  className="w-full p-4 rounded-2xl bg-gray-50 border"
                  value={detailAddress}
                  onChange={(e) => setDetailAddress(e.target.value)}
                />

                <label className="flex items-center gap-2 text-sm text-gray-700 mt-1">
                  <input
                    type="checkbox"
                    checked={saveAsDefaultAddress}
                    onChange={(e) => setSaveAsDefaultAddress(e.target.checked)}
                  />
                  이 주소를 기본 배송지로 설정
                </label>
              </>
            )}

            <textarea
              placeholder="요청사항 입력 (선택사항)"
              className="w-full p-4 rounded-2xl bg-gray-50 border min-h-[100px]"
              value={requestMemo}
              onChange={(e) => setRequestMemo(e.target.value)}
            />
          </div>
        </section>

        {items.map((item, index) => (
          <section
            key={index}
            className="bg-white rounded-3xl p-5 border shadow-sm mb-4"
          >
            <div className="flex justify-between items-center mb-4">
              <div className="font-bold text-lg">상품 {index + 1}</div>

              {items.length > 1 && (
                <button
                  onClick={() => removeItem(index)}
                  className="bg-red-500 text-white px-4 py-2 rounded-xl font-bold text-sm"
                >
                  ✕ 삭제
                </button>
              )}
            </div>

            <div className="grid gap-3">
              <input
                type="text"
                placeholder="상품명"
                className="w-full p-4 rounded-2xl bg-gray-50 border"
                value={item.product}
                onChange={(e) => {
                  const copy = [...items];
                  copy[index].product = e.target.value;
                  setItems(copy);
                }}
              />

              <input
                type="text"
                placeholder="색상 / 없으면 없음"
                className="w-full p-4 rounded-2xl bg-gray-50 border"
                value={item.color}
                onChange={(e) => {
                  const nextValue = e.target.value.replace(/[0-9]/g, "");
                  const copy = [...items];
                  copy[index].color = nextValue;
                  setItems(copy);
                }}
              />

              <input
                type="text"
                placeholder="사이즈 / 없으면 없음"
                className="w-full p-4 rounded-2xl bg-gray-50 border"
                value={item.size}
                onChange={(e) => {
                  const copy = [...items];
                  copy[index].size = e.target.value;
                  setItems(copy);
                }}
              />

              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="주문수량 숫자만!"
                className="w-full p-4 rounded-2xl bg-gray-50 border"
                value={item.qty}
                onChange={(e) => {
                  const copy = [...items];
                  copy[index].qty = onlyNumber(e.target.value);
                  setItems(copy);
                }}
              />

              <input
                type="text"
                placeholder="상품금액(배송비빼고)"
                className="w-full p-4 rounded-2xl bg-gray-50 border"
                value={item.price ? formatWon(Number(item.price)) : ""}
                onChange={(e) => {
                  const copy = [...items];
                  copy[index].price = onlyNumber(e.target.value);
                  setItems(copy);
                }}
              />
            </div>
          </section>
        ))}

        <button
          onClick={addItem}
          className="w-full bg-gray-200 text-gray-900 p-5 rounded-2xl mb-4 text-lg font-bold"
        >
          + 다른 상품도 같이 주문하기
        </button>

        <section className="bg-white rounded-3xl p-5 border shadow-sm mb-4">
          <div className="text-lg font-bold mb-4">결제방식 선택</div>

          <label className="block bg-gray-50 rounded-2xl p-4 mb-3 border">
            <input
              type="radio"
              name="payment"
              checked={paymentMethod === "무통장입금"}
              onChange={() => setPaymentMethod("무통장입금")}
              className="mr-2"
            />
            무통장입금
          </label>

          <label className="block bg-gray-50 rounded-2xl p-4 border">
            <input
              type="radio"
              name="payment"
              checked={paymentMethod === "카드결제"}
              onChange={() => setPaymentMethod("카드결제")}
              className="mr-2"
            />
            카드결제 (+수수료 {cardFeeRate}%)
            <div className="text-sm text-gray-500 mt-2">
              관리자 확인 후 카톡으로 결제링크 발송
            </div>
          </label>
        </section>

        <section className="bg-white rounded-3xl p-5 border shadow-sm mb-4">
          <div className="flex justify-between mb-3">
            <span>상품금액 합계</span>
            <span>{formatWon(productTotal)}</span>
          </div>

          <div className="flex justify-between mb-2">
            <span>배송비</span>
            <span>{formatWon(finalShippingFee)}</span>
          </div>

          <div className="text-sm text-blue-600 mb-3">
            {useSavedAddress
              ? "기존 고객은 저장된 배송지 기준으로 최종 배송비가 적용됩니다."
              : shippingNotice}
          </div>

          {paymentMethod === "카드결제" && (
            <div className="flex justify-between mb-3 text-red-600">
              <span>카드결제 수수료 {cardFeeRate}%</span>
              <span>{formatWon(vatAmount)}</span>
            </div>
          )}

          <div className="flex justify-between text-2xl font-extrabold pt-4 border-t">
            <span>최종 결제금액</span>
            <span>{formatWon(total)}</span>
          </div>
        </section>

        <button
          className="w-full bg-black text-white font-bold p-5 rounded-2xl text-xl disabled:opacity-50"
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? "주문 저장중..." : "주문완료신청"}
        </button>
      </div>
    </main>
  );
}
