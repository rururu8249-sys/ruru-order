// lib/customer/customerSession.ts
// 전체 교체
// 위치: /Users/ruru/Desktop/ruru-order-app/lib/customer/customerSession.ts
// 목적: 고객 첫 화면에서 저장된 고객정보만 읽고/삭제합니다.
// 주문 저장, 금액, 카드수수료, 관리자 로직과 연결하지 않습니다.

export type SavedCustomerInfo = {
  youtubeNickname: string;
  customerName: string;
  customerPhone: string;
  zipcode: string;
  address: string;
  detailAddress: string;
};

export const CUSTOMER_SESSION_VERSION_KEY = "ruru_customer_session_version";
export const REQUIRED_CUSTOMER_SESSION_VERSION = "kakao_required_20260524";
export const YOUTUBE_NICKNAME_CONFIRM_VERSION_KEY = "ruru_youtube_nickname_confirm_version";
export const REQUIRED_YOUTUBE_NICKNAME_CONFIRM_VERSION = "youtube_confirmed_20260524";

export const CUSTOMER_STORAGE_KEYS = [
  "ruru_customer_session",
  "ruru_customer_phone",
  "ruru_youtube_nickname",
  "ruru_customer_name",
  "ruru_customer_zipcode",
  "ruru_customer_address",
  "ruru_customer_detail_address",
] as const;

const readStorage = (key: string) => {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(key) || "";
};

export const readSavedCustomerInfo = (): SavedCustomerInfo => {
  return {
    youtubeNickname: readStorage("ruru_youtube_nickname"),
    customerName: readStorage("ruru_customer_name"),
    customerPhone: readStorage("ruru_customer_phone"),
    zipcode: readStorage("ruru_customer_zipcode"),
    address: readStorage("ruru_customer_address"),
    detailAddress: readStorage("ruru_customer_detail_address"),
  };
};

export const hasSavedCustomerInfo = (info: SavedCustomerInfo) => {
  return Boolean(
    info.customerPhone.trim() ||
      info.youtubeNickname.trim() ||
      info.customerName.trim() ||
      info.address.trim()
  );
};

export const getCustomerGreetingName = (info: SavedCustomerInfo) => {
  return (info.youtubeNickname || info.customerName || "").trim();
};

export const clearSavedCustomerInfo = () => {
  if (typeof window === "undefined") return;

  CUSTOMER_STORAGE_KEYS.forEach((key) => {
    window.localStorage.removeItem(key);
  });
};

export const markCustomerSessionVersionCurrent = () => {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(CUSTOMER_SESSION_VERSION_KEY, REQUIRED_CUSTOMER_SESSION_VERSION);
};

export const isCustomerSessionVersionCurrent = () => {
  if (typeof window === "undefined") return true;

  return window.localStorage.getItem(CUSTOMER_SESSION_VERSION_KEY) === REQUIRED_CUSTOMER_SESSION_VERSION;
};

export const hasAnySavedCustomerStorage = () => {
  if (typeof window === "undefined") return false;

  return CUSTOMER_STORAGE_KEYS.some((key) => Boolean(window.localStorage.getItem(key)));
};

export const clearLegacyCustomerSessionIfNeeded = () => {
  if (typeof window === "undefined") return false;

  if (isCustomerSessionVersionCurrent()) return false;
  if (!hasAnySavedCustomerStorage()) return false;

  clearSavedCustomerInfo();
  window.localStorage.removeItem("ruru_kakao_id");
  window.localStorage.removeItem("ruru_kakao_nickname");
  window.localStorage.removeItem(CUSTOMER_SESSION_VERSION_KEY);
  window.localStorage.removeItem(YOUTUBE_NICKNAME_CONFIRM_VERSION_KEY);

  return true;
};

export const markYoutubeNicknameConfirmVersionCurrent = () => {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    YOUTUBE_NICKNAME_CONFIRM_VERSION_KEY,
    REQUIRED_YOUTUBE_NICKNAME_CONFIRM_VERSION,
  );
};

export const isYoutubeNicknameConfirmVersionCurrent = () => {
  if (typeof window === "undefined") return true;

  return (
    window.localStorage.getItem(YOUTUBE_NICKNAME_CONFIRM_VERSION_KEY) ===
    REQUIRED_YOUTUBE_NICKNAME_CONFIRM_VERSION
  );
};
