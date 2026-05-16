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

const KAKAO_CHANNEL_URL = "https://pf.kakao.com/_RMxaqX";
const BAND_URL = "https://band.us";
const YOUTUBE_URL = "https://www.youtube.com";

export default function Home() {
  const [screen, setScreen] = useState<"menu" | "order" | "lookup">("menu");

  const [nickname, setNickname] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerPin, setCustomerPin] = useState("");
  const [isCustomerLoggedIn, setIsCustomerLoggedIn] = useState(false);
  const [isEditingCustomerInfo, setIsEditingCustomerInfo] = useState(false);
  const [loginCustomerId, setLoginCustomerId] = useState<number | null>(null);

  const [zipcode, setZipcode] = useState("");
  const [address, setAddress] = useState("");
  const [detailAddress, setDetailAddress] = useState("");
  const [saveAsDefaultAddress, setSaveAsDefaultAddress] = useState(true);
  const [requestMemo, setRequestMemo] = useState("");

  const [customerCheckStatus, setCustomerCheckStatus] = useState<
    "unchecked" | "existing" | "new"
  >("unchecked");
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
  const [lookupPin, setLookupPin] = useState("");
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
    const savedDetailAddress = localStorage.getItem(
      "ruru_customer_detail_address",
    );
    const savedPin = localStorage.getItem("ruru_customer_pin");
    const savedLogin = localStorage.getItem("ruru_customer_logged_in");
    const savedCustomerId = localStorage.getItem("ruru_customer_id");

    if (savedLogin === "Y" && savedPhone && savedPin) {
      setIsCustomerLoggedIn(true);
      setCustomerCheckStatus("existing");
      setUseSavedAddress(true);
      setShowAddressForm(false);
      if (savedCustomerId) setLoginCustomerId(Number(savedCustomerId));
      setCheckedCustomer({
        id: savedCustomerId ? Number(savedCustomerId) : null,
        youtube_nickname: savedNickname || "",
        customer_name: savedName || "",
        customer_phone: savedPhone || "",
        zipcode: savedZipcode || "",
        address: savedAddress || "",
        detail_address: savedDetailAddress || "",
        pin_code: savedPin || "",
      });
    }

    if (savedNickname) setNickname(savedNickname);
    if (savedName) setCustomerName(savedName);
    if (savedPhone) setCustomerPhone(savedPhone);
    if (savedZipcode) setZipcode(savedZipcode);
    if (savedAddress) setAddress(savedAddress);
    if (savedDetailAddress) setDetailAddress(savedDetailAddress);
    if (savedPin) setCustomerPin(savedPin);

    loadBroadcastSettings();

    const syncScreenFromHash = () => {
      if (window.location.hash === "#order-form") {
        setScreen("order");
        window.setTimeout(() => {
          document.getElementById("order-form")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 100);
      }
    };

    syncScreenFromHash();
    window.addEventListener("hashchange", syncScreenFromHash);

    return () => {
      window.removeEventListener("hashchange", syncScreenFromHash);
    };
  }, []);

  useEffect(() => {
    checkShippingDiscountTargets();
  }, [customerName, customerPhone, activeBroadcast.id, broadcastTitle]);

  useEffect(() => {
    if (isCustomerLoggedIn) return;

    setCustomerCheckStatus("unchecked");
    setCheckedCustomer(null);
    setUseSavedAddress(false);
    setShowAddressForm(false);
  }, [customerName, customerPhone, isCustomerLoggedIn]);

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

  const isValidPin = (value: string) => onlyNumber(value).length === 6;

  const buttonPressClass =
    "transition active:scale-[0.97] disabled:active:scale-100";

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
      11,
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
        full.includes(normalizeKoreanText(keyword)),
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
      full.includes(normalizeKoreanText(keyword)),
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
    targetDetailAddress: string,
  ) => {
    const zip = onlyNumber(targetZipcode);
    const full = normalizeKoreanText(
      `${targetAddress || ""} ${targetDetailAddress || ""}`,
    );

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
        full.includes(normalizeKoreanText(keyword)),
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
        full.includes(normalizeKoreanText(keyword)),
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
    if (hasPreviousOrderInSameBroadcast || hasCombineShippingTargetOrder)
      return 0;
    return baseShippingFee;
  }, [
    hasPreviousOrderInSameBroadcast,
    hasCombineShippingTargetOrder,
    baseShippingFee,
  ]);

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
  }, [
    hasPreviousOrderInSameBroadcast,
    hasCombineShippingTargetOrder,
    zipcode,
    address,
    detailAddress,
  ]);

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
      .select(
        "id,customer_name,customer_phone,broadcast_id,broadcast_name,broadcast_public_title",
      )
      .eq("customer_phone", phone)
      .limit(100);

    const currentBroadcastId = String(activeBroadcast.id || "");
    const currentBroadcastTitle = normalizeKoreanText(
      activeBroadcast.public_title || broadcastTitle || "",
    );

    const matched = (data || []).some((order) => {
      const sameName = normalizeName(order.customer_name || "") === name;

      const sameBroadcastId =
        currentBroadcastId &&
        String(order.broadcast_id || "") === currentBroadcastId;

      const savedBroadcastTitle = normalizeKoreanText(
        order.broadcast_public_title || order.broadcast_name || "",
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
      normalizeKoreanText(broadcast.public_title || ""),
    );

    const { data: previousOrders } = await supabase
      .from("orders")
      .select(
        "id,customer_name,customer_phone,broadcast_id,broadcast_name,broadcast_public_title",
      )
      .eq("customer_phone", phone)
      .limit(200);

    const matched = (previousOrders || []).some((order) => {
      const sameName = normalizeName(order.customer_name || "") === name;

      const orderBroadcastId = Number(order.broadcast_id || 0);
      const orderBroadcastTitle = normalizeKoreanText(
        order.broadcast_public_title || order.broadcast_name || "",
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

  const saveLoginSession = (customer: any, pinValue: string) => {
    const phone = onlyNumber(customer.customer_phone || customerPhone);

    localStorage.setItem("ruru_customer_logged_in", "Y");
    localStorage.setItem("ruru_customer_id", String(customer.id || ""));
    localStorage.setItem(
      "ruru_youtube_nickname",
      customer.youtube_nickname || nickname.trim(),
    );
    localStorage.setItem(
      "ruru_customer_name",
      customer.customer_name || customerName.trim(),
    );
    localStorage.setItem("ruru_customer_phone", phone);
    localStorage.setItem("ruru_customer_pin", onlyNumber(pinValue));
    localStorage.setItem(
      "ruru_customer_zipcode",
      customer.zipcode || zipcode || "",
    );
    localStorage.setItem(
      "ruru_customer_address",
      customer.address || address || "",
    );
    localStorage.setItem(
      "ruru_customer_detail_address",
      customer.detail_address || detailAddress.trim() || "",
    );
  };

  const applyCustomerToForm = (customer: any, pinValue: string) => {
    const phone = onlyNumber(customer.customer_phone || "");

    setLoginCustomerId(customer.id || null);
    setCheckedCustomer(customer);
    setIsCustomerLoggedIn(true);
    setIsEditingCustomerInfo(false);
    setCustomerCheckStatus("existing");
    setUseSavedAddress(true);
    setShowAddressForm(false);

    setNickname(customer.youtube_nickname || "");
    setCustomerName(customer.customer_name || "");
    setCustomerPhone(phone);
    setCustomerPin(onlyNumber(pinValue));
    setZipcode(customer.zipcode || "");
    setAddress(customer.address || "");
    setDetailAddress(customer.detail_address || "");

    saveLoginSession(customer, pinValue);
  };

  const handleLoadCustomerInfo = async () => {
    const phone = onlyNumber(customerPhone);
    const pin = onlyNumber(customerPin);

    if (phone.length < 10) {
      alert("전화번호를 정확히 입력해주세요.\n예) 01012345678");
      return;
    }

    if (!isValidPin(pin)) {
      alert("PIN번호 6자리를 입력해주세요.");
      return;
    }

    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("customer_phone", phone)
      .eq("pin_code", pin)
      .limit(1);

    if (error) {
      alert("개인정보 불러오기 오류\n\n" + error.message);
      return;
    }

    const customer = data?.[0];

    if (!customer) {
      alert(
        "일치하는 고객정보가 없습니다.\n\n신규 주문이면 고객정보를 입력 후 [고객정보 확인]을 눌러주세요.",
      );
      return;
    }

    if (customer?.is_blocked === "Y") {
      alert(
        "⚠️ 주문 제한 안내\n\n주문 접수가 제한된 회원입니다.\n문의가 필요하신 경우 카톡채널로 연락 부탁드립니다.",
      );
      return;
    }

    applyCustomerToForm(customer, pin);
    alert(
      "개인정보를 불러왔습니다.\n로그아웃 전까지 간편 주문 상태가 유지됩니다.",
    );
  };

  const handleLogout = () => {
    localStorage.removeItem("ruru_customer_logged_in");
    localStorage.removeItem("ruru_customer_id");
    localStorage.removeItem("ruru_customer_pin");

    setIsCustomerLoggedIn(false);
    setIsEditingCustomerInfo(false);
    setLoginCustomerId(null);
    setCheckedCustomer(null);
    setCustomerCheckStatus("unchecked");
    setUseSavedAddress(false);
    setShowAddressForm(false);
    setCustomerPin("");

    alert(
      "로그아웃되었습니다.\n다음 주문 시 전화번호 + PIN번호 확인이 필요합니다.",
    );
  };

  const handleStartEditCustomerInfo = () => {
    setIsEditingCustomerInfo(true);
    setUseSavedAddress(false);
    setShowAddressForm(true);
  };

  const handleSaveEditedCustomerInfo = async () => {
    const phone = onlyNumber(customerPhone);
    const pin = onlyNumber(customerPin);

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

    if (!isValidPin(pin)) {
      alert("PIN번호는 숫자 6자리로 입력해주세요.");
      return;
    }

    if (!zipcode || !address || !detailAddress.trim()) {
      alert("주소검색 후 상세주소까지 입력해주세요.");
      return;
    }

    const updateData = {
      youtube_nickname: nickname.trim(),
      customer_name: customerName.trim(),
      customer_phone: phone,
      pin_code: pin,
      zipcode,
      address,
      detail_address: detailAddress.trim(),
      last_order_at: new Date().toISOString(),
      is_default_address: saveAsDefaultAddress,
    };

    const { data, error } = await supabase
      .from("customers")
      .update(updateData)
      .eq("id", loginCustomerId || checkedCustomer?.id)
      .select("*")
      .limit(1);

    if (error) {
      alert("정보변경 저장 실패\n\n" + error.message);
      return;
    }

    const updatedCustomer = data?.[0] || { ...checkedCustomer, ...updateData };
    applyCustomerToForm(updatedCustomer, pin);
    alert("고객정보가 변경되었습니다.");
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
        "⚠️ 주문 제한 안내\n\n주문 접수가 제한된 회원입니다.\n문의가 필요하신 경우 카톡채널로 연락 부탁드립니다.",
      );
      return true;
    }

    return false;
  };

  const handleCustomerCheck = async () => {
    const phone = onlyNumber(customerPhone);
    const pin = onlyNumber(customerPin);

    if (isCustomerLoggedIn && !isEditingCustomerInfo) {
      setCustomerCheckStatus("existing");
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

    if (phone.length < 10) {
      alert("전화번호를 정확히 입력해주세요.\n예) 01012345678");
      return;
    }

    if (!isValidPin(pin)) {
      alert("PIN번호는 숫자 6자리로 입력해주세요.");
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

    if (customer?.is_blocked === "Y") {
      alert(
        "⚠️ 주문 제한 안내\n\n주문 접수가 제한된 회원입니다.\n문의가 필요하신 경우 카톡채널로 연락 부탁드립니다.",
      );
      return;
    }

    if (customer) {
      const sameName =
        normalizeName(customer.customer_name || "") ===
        normalizeName(customerName);
      const savedPin = onlyNumber(customer.pin_code || "");

      if (!sameName) {
        alert(
          "전화번호는 같지만 주문자 이름이 다릅니다.\n\n기존 고객 정보와 다를 수 있어 카톡채널로 문의 부탁드립니다.",
        );
        return;
      }

      if (savedPin && savedPin !== pin) {
        alert("PIN번호가 일치하지 않습니다.");
        return;
      }

      setCheckedCustomer({ ...customer, pin_code: savedPin || pin });
      setCustomerCheckStatus("existing");
      setUseSavedAddress(true);
      setShowAddressForm(false);
      return;
    }

    setCheckedCustomer(null);
    setCustomerCheckStatus("new");
    setUseSavedAddress(false);
    setShowAddressForm(true);
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
      useSavedAddress && checkedCustomer && customerCheckStatus === "existing";

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
      pin_code: onlyNumber(customerPin),
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

    const { data: inserted, error } = await supabase
      .from("customers")
      .insert(customerData)
      .select("*")
      .limit(1);
    if (error) throw error;

    if (inserted?.[0]) {
      setCheckedCustomer(inserted[0]);
      setLoginCustomerId(inserted[0].id || null);
    }

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

    if (!isValidPin(customerPin)) {
      alert("PIN번호 6자리를 입력해주세요.");
      return;
    }

    if (!isCustomerLoggedIn && customerCheckStatus === "unchecked") {
      alert("고객정보 확인 또는 개인정보 불러오기를 먼저 눌러주세요.");
      return;
    }

    if (!useSavedAddress && (!zipcode || !address || !detailAddress.trim())) {
      alert(
        "배송지 정보가 없습니다.\n\n주소검색 후 상세주소까지 입력해주세요.",
      );
      return;
    }

    if (
      useSavedAddress &&
      (!checkedCustomer?.address || !checkedCustomer?.detail_address)
    ) {
      alert(
        "저장된 배송지 정보가 부족합니다.\n\n[주소 직접 입력]을 눌러 주소를 입력해주세요.",
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
        !item.price,
    );

    if (hasEmptyItem) {
      alert(
        "상품명 · 색상 · 사이즈 · 수량 · 금액을 모두 입력해주세요.\n\n색상/사이즈가 없으면 '없음' 이라고 작성해주세요.",
      );
      return;
    }

    const hasNumberInColor = items.some((item) => hasNumber(item.color));

    if (hasNumberInColor) {
      alert(
        "색상칸에는 숫자를 입력할 수 없습니다.\n\n색상이 없으면 '없음'이라고 작성해주세요.",
      );
      return;
    }

    localStorage.setItem("ruru_youtube_nickname", nickname.trim());
    localStorage.setItem("ruru_customer_name", customerName.trim());
    localStorage.setItem("ruru_customer_phone", phone);

    if (!useSavedAddress) {
      localStorage.setItem("ruru_customer_zipcode", zipcode);
      localStorage.setItem("ruru_customer_address", address);
      localStorage.setItem(
        "ruru_customer_detail_address",
        detailAddress.trim(),
      );
    }

    setIsSubmitting(true);

    try {
      const isAdditionalOrder = await getSameBroadcastPreviousOrder();
      const isCombineShippingOrder = await getCombineShippingTargetOrder();

      const customerMatch = await saveCustomerInfo();
      const orderGroupId = crypto.randomUUID();
      const orderLookupCode = generateLookupCode();

      const originalShippingFee = baseShippingFee;
      const appliedShippingFee =
        isAdditionalOrder || isCombineShippingOrder ? 0 : baseShippingFee;
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
                  customerMatch.detail_address || "",
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

      const sessionCustomer = {
        id: loginCustomerId || checkedCustomer?.id || "",
        youtube_nickname: nickname.trim(),
        customer_name: customerName.trim(),
        customer_phone: phone,
        zipcode: customerMatch.zipcode || "",
        address: customerMatch.address || "",
        detail_address: customerMatch.detail_address || "",
        pin_code: onlyNumber(customerPin),
      };
      applyCustomerToForm(sessionCustomer, customerPin);

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
    const pin = onlyNumber(lookupPin);

    if (phone.length < 10) {
      alert("전화번호를 입력해주세요.");
      return;
    }

    if (!isValidPin(pin)) {
      alert("PIN번호 6자리를 입력해주세요.");
      return;
    }

    const { data: customerData, error: customerError } = await supabase
      .from("customers")
      .select("id")
      .eq("customer_phone", phone)
      .eq("pin_code", pin)
      .limit(1);

    if (customerError) {
      alert(customerError.message);
      return;
    }

    if (!customerData || customerData.length === 0) {
      setLookupOrders([]);
      setLookupMessage("전화번호와 PIN번호가 일치하는 고객정보가 없습니다.");
      return;
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data, error } = await supabase
      .from("orders")
      .select("*")
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
          <div className="text-2xl font-bold mb-2">루루동이 집구석LIVE</div>
          <div>주문서 상태 확인중...</div>
        </div>
      </main>
    );
  }

  if (screen === "menu" && !isCompleted) {
    return (
      <main className="min-h-screen bg-[#f7f7f8] px-5 py-7 text-gray-950">
        <section className="mx-auto flex min-h-[calc(100vh-56px)] w-full max-w-[430px] flex-col justify-between rounded-[42px] border border-gray-200 bg-white px-6 py-8 shadow-sm">
          <div>
            <div className="mb-8 flex items-center justify-between">
              <div className="text-4xl leading-none text-gray-950">☰</div>
              <div className="relative text-3xl">
                ♡
                <span className="absolute -right-1 top-0 h-2.5 w-2.5 rounded-full bg-pink-400" />
              </div>
            </div>

            <div className="mb-9 text-center">
              <div className="mb-2 text-4xl">⌂</div>

              <h1 className="text-3xl font-black tracking-[-0.04em]">
                루루동이 집구석LIVE
              </h1>

              <p className="mt-4 text-lg font-bold text-gray-400">
                오늘도 좋은 상품만 🤍
              </p>
            </div>

            <div className="space-y-5">
              <button
                type="button"
                onClick={() => setScreen("order")}
                className="flex min-h-[128px] w-full items-center justify-between rounded-[34px] bg-white px-7 shadow-[0_14px_35px_rgba(236,72,153,0.16)] ring-1 ring-pink-100 active:scale-[0.99]"
              >
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-pink-100 text-4xl">
                  📝
                </span>
                <span className="text-3xl font-black tracking-[-0.04em]">
                  주문서 작성
                </span>
                <span className="text-5xl font-light leading-none">→</span>
              </button>

              <a
                href={KAKAO_CHANNEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[104px] w-full items-center justify-between rounded-[30px] bg-white px-7 shadow-[0_12px_30px_rgba(0,0,0,0.07)] ring-1 ring-yellow-100 active:scale-[0.99]"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100 text-3xl">
                  💬
                </span>
                <span className="text-2xl font-black tracking-[-0.04em]">
                  카톡채널 문의
                </span>
                <span className="text-4xl font-light leading-none">→</span>
              </a>

              <div className="grid grid-cols-2 gap-4 pt-1">
                <a
                  href="/notice"
                  className="flex min-h-[136px] flex-col items-center justify-center rounded-[28px] bg-white shadow-[0_12px_28px_rgba(0,0,0,0.06)] ring-1 ring-gray-100 active:scale-[0.99]"
                >
                  <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-2xl">
                    📢
                  </span>
                  <span className="text-xl font-black">공지</span>
                  <span className="mt-3 text-2xl">→</span>
                </a>

                <button
                  type="button"
                  onClick={() => setScreen("lookup")}
                  className="flex min-h-[136px] flex-col items-center justify-center rounded-[28px] bg-white shadow-[0_12px_28px_rgba(0,0,0,0.06)] ring-1 ring-gray-100 active:scale-[0.99]"
                >
                  <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-2xl">
                    📦
                  </span>
                  <span className="text-xl font-black">주문조회</span>
                  <span className="mt-3 text-2xl">→</span>
                </button>

                <a
                  href={BAND_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[136px] flex-col items-center justify-center rounded-[28px] bg-white shadow-[0_12px_28px_rgba(0,0,0,0.06)] ring-1 ring-gray-100 active:scale-[0.99]"
                >
                  <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-2xl">
                    👥
                  </span>
                  <span className="text-xl font-black">루루동이밴드</span>
                  <span className="mt-3 text-2xl">→</span>
                </a>

                <a
                  href={YOUTUBE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[136px] flex-col items-center justify-center rounded-[28px] bg-white shadow-[0_12px_28px_rgba(0,0,0,0.06)] ring-1 ring-gray-100 active:scale-[0.99]"
                >
                  <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-2xl">
                    ▶️
                  </span>
                  <span className="text-xl font-black">유튜브</span>
                  <span className="mt-3 text-2xl">→</span>
                </a>
              </div>
            </div>
          </div>

          <footer className="pt-8 text-center">
            <div className="text-xl font-semibold italic text-gray-400">
              Thank you 💕
            </div>
            <div className="mt-2 text-xs font-bold tracking-[0.18em] text-gray-400">
              © since 2024 루루동이 | All Rights Reserved.
            </div>
          </footer>
        </section>
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
              inputMode="numeric"
              placeholder="전화번호 01012345678"
              className="w-full p-4 rounded-2xl bg-gray-50 border mb-3"
              value={formatPhone(lookupPhone)}
              onChange={(e) => setLookupPhone(onlyNumber(e.target.value))}
            />

            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="PIN번호 6자리"
              className="w-full p-4 rounded-2xl bg-gray-50 border mb-3"
              value={lookupPin}
              onChange={(e) =>
                setLookupPin(onlyNumber(e.target.value).slice(0, 6))
              }
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
                      {formatWon(
                        order.adjusted_total_price || order.total_price,
                      )}
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
          <div className="text-3xl font-bold mb-4">루루동이 집구석LIVE</div>
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

            <button
              onClick={() => {
                setIsCompleted(false);
                setScreen("menu");
              }}
              className="w-full bg-gray-200 p-4 rounded-2xl font-bold"
            >
              메인으로 돌아가기
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      id="order-form"
      className="min-h-screen bg-gray-50 text-gray-900 p-4 scroll-mt-6"
    >
      <div className="max-w-md mx-auto pb-10">
        <div className="py-4">
          <h1 className="text-3xl font-extrabold tracking-tight">
            루루동이 집구석LIVE
          </h1>
          <p className="text-gray-500 mt-1">라이브 방송 주문 전용</p>
        </div>

        <section className="bg-white rounded-3xl p-5 border shadow-sm mb-4">
          <div className="text-sm text-gray-500 mb-1">현재 방송</div>
          <div className="text-xl font-bold">
            {broadcastTitle ||
              activeBroadcast.public_title ||
              "방송 주문 접수중"}
          </div>
        </section>

        <section className="bg-white rounded-3xl p-5 border shadow-sm mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="font-bold text-lg">고객 정보</div>
            {isCustomerLoggedIn && !isEditingCustomerInfo && (
              <button
                type="button"
                onClick={handleLogout}
                className={`rounded-full bg-gray-100 px-4 py-2 text-sm font-bold text-gray-700 ${buttonPressClass}`}
              >
                로그아웃
              </button>
            )}
          </div>

          {isCustomerLoggedIn && !isEditingCustomerInfo ? (
            <div className="grid gap-3">
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <div className="text-lg font-extrabold text-blue-700">
                  간편 주문 로그인 완료
                </div>
                <div className="mt-2 text-sm font-bold leading-6 text-blue-700">
                  로그아웃 전까지 개인정보 입력 없이 바로 주문 가능합니다.
                </div>
              </div>

              <div className="rounded-2xl border bg-gray-50 p-4 text-sm leading-7">
                <div>
                  <b>닉네임</b> : {nickname || "-"}
                </div>
                <div>
                  <b>주문자</b> : {customerName || "-"}
                </div>
                <div>
                  <b>연락처</b> : {formatPhone(customerPhone) || "-"}
                </div>
                <div>
                  <b>배송지</b> : {address || "-"} {detailAddress || ""}
                </div>
              </div>

              <button
                type="button"
                onClick={handleStartEditCustomerInfo}
                className={`w-full rounded-2xl bg-gray-900 p-4 font-bold text-white ${buttonPressClass}`}
              >
                정보변경
              </button>

              <textarea
                placeholder="요청사항 입력 (선택사항)"
                className="w-full min-h-[100px] rounded-2xl border bg-gray-50 p-4"
                value={requestMemo}
                onChange={(e) => setRequestMemo(e.target.value)}
              />
            </div>
          ) : (
            <>
              <div className="mb-4 rounded-2xl border border-yellow-200 bg-yellow-50 p-4">
                <div className="text-sm font-bold leading-6 text-yellow-700">
                  📌 기존 고객은 전화번호 + PIN번호 6자리로 개인정보를 불러올 수
                  있습니다.
                  <br />
                  신규 고객은 아래 정보를 입력 후 고객정보 확인을 눌러주세요.
                </div>
              </div>

              <p className="mb-4 text-xs text-red-500">
                * 표시는 필수 입력 항목입니다.
              </p>

              <div className="grid gap-3">
                <input
                  type="text"
                  placeholder="* 유튜브 닉네임"
                  className="w-full rounded-2xl border bg-gray-50 p-4"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />

                <input
                  type="text"
                  placeholder="* 주문자 이름"
                  className="w-full rounded-2xl border bg-gray-50 p-4"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />

                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="* 전화번호 01012345678"
                  className="w-full rounded-2xl border bg-gray-50 p-4"
                  value={formatPhone(customerPhone)}
                  onChange={(e) => setCustomerPhone(onlyNumber(e.target.value))}
                />

                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="* PIN번호 6자리"
                  className="w-full rounded-2xl border bg-gray-50 p-4"
                  value={customerPin}
                  onChange={(e) =>
                    setCustomerPin(onlyNumber(e.target.value).slice(0, 6))
                  }
                />

                {!isEditingCustomerInfo && (
                  <button
                    type="button"
                    onClick={handleLoadCustomerInfo}
                    className={`w-full rounded-2xl bg-blue-600 p-4 font-bold text-white ${buttonPressClass}`}
                  >
                    개인정보 불러오기
                  </button>
                )}

                <button
                  type="button"
                  onClick={
                    isEditingCustomerInfo
                      ? handleSaveEditedCustomerInfo
                      : handleCustomerCheck
                  }
                  className={`w-full rounded-2xl bg-gray-900 p-4 font-bold text-white ${buttonPressClass}`}
                >
                  {isEditingCustomerInfo ? "정보변경 확인" : "고객정보 확인"}
                </button>

                {isEditingCustomerInfo && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingCustomerInfo(false);
                      setUseSavedAddress(true);
                      setShowAddressForm(false);
                    }}
                    className={`w-full rounded-2xl bg-gray-200 p-4 font-bold text-gray-900 ${buttonPressClass}`}
                  >
                    변경취소
                  </button>
                )}

                {customerCheckStatus === "existing" &&
                  !isEditingCustomerInfo && (
                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                      <div className="text-lg font-extrabold text-blue-700">
                        확인완료!
                      </div>
                      <div className="mt-2 text-sm font-bold leading-6 text-blue-700">
                        기존 고객으로 확인되었습니다.
                        <br />
                        저장된 배송지로 접수됩니다.
                      </div>
                      <button
                        type="button"
                        onClick={openManualAddressForm}
                        className={`mt-3 w-full rounded-xl border border-blue-300 bg-white p-3 font-bold text-blue-700 ${buttonPressClass}`}
                      >
                        주소 직접 입력
                      </button>
                    </div>
                  )}

                {customerCheckStatus === "new" && (
                  <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4">
                    <div className="text-sm font-bold leading-6 text-yellow-700">
                      신규 고객입니다.
                      <br />
                      주소 입력칸은 모두 필수입니다.
                    </div>
                  </div>
                )}

                {showAddressForm && (
                  <>
                    <button
                      type="button"
                      onClick={openAddressSearch}
                      className={`w-full rounded-2xl bg-black p-4 font-bold text-white ${buttonPressClass}`}
                    >
                      주소검색
                    </button>

                    <input
                      type="text"
                      placeholder="* 기본주소"
                      className="w-full rounded-2xl border bg-gray-50 p-4"
                      value={address}
                      readOnly
                    />

                    <input
                      type="text"
                      placeholder="* 상세주소 예) 101동 1001호"
                      className="w-full rounded-2xl border bg-gray-50 p-4"
                      value={detailAddress}
                      onChange={(e) => setDetailAddress(e.target.value)}
                    />

                    <label className="mt-1 flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={saveAsDefaultAddress}
                        onChange={(e) =>
                          setSaveAsDefaultAddress(e.target.checked)
                        }
                      />
                      이 주소를 기본 배송지로 설정
                    </label>
                  </>
                )}

                <textarea
                  placeholder="요청사항 입력 (선택사항)"
                  className="w-full min-h-[100px] rounded-2xl border bg-gray-50 p-4"
                  value={requestMemo}
                  onChange={(e) => setRequestMemo(e.target.value)}
                />
              </div>
            </>
          )}
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
                placeholder="* 상품명"
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
                placeholder="* 색상 / 없으면 없음"
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
                placeholder="* 사이즈 / 없으면 없음"
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
                placeholder="* 주문수량 숫자만!"
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
                placeholder="* 상품금액(배송비빼고)"
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
