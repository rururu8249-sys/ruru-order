// lib/order/shippingAddress.ts
// 목적: 고객 주문서 주소 기준 제주/도서/산간 배송비 판단
// 주의: 주문 저장, 금액 저장, Supabase, 입금매칭, 정산 로직 없음.

const REMOTE_AREA_KEYWORDS = [
  "제주",
  "제주도",
  "제주특별자치도",
  "제주시",
  "서귀포",

  "울릉",
  "울릉군",
  "독도",

  "백령",
  "대청",
  "소청",
  "연평",
  "옹진군",

  "흑산",
  "홍도",
  "거문",
  "거문도",
  "추자",
  "추자도",
  "마라",
  "마라도",
  "가파",
  "가파도",
  "비양",
  "비양도",

  "신안군",
  "조도",
  "욕지",
  "욕지도",
  "사량",
  "사량도",
  "한산",
  "한산도",
];

const normalizeAddressText = (value: unknown) =>
  String(value || "")
    .replace(/\s+/g, "")
    .replace(/[(){}\[\],.·ㆍ]/g, "")
    .toLowerCase();

export const isRemoteAreaAddress = (...values: unknown[]) => {
  const text = normalizeAddressText(values.filter(Boolean).join(" "));

  if (!text) return false;

  return REMOTE_AREA_KEYWORDS.some((keyword) =>
    text.includes(normalizeAddressText(keyword))
  );
};
