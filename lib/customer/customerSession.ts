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

export const CUSTOMER_STORAGE_KEYS = [
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
